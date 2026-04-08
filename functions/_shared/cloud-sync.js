const ACCOUNT_PATTERN = /^[a-z0-9](?:[a-z0-9._@-]{1,46}[a-z0-9])?$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 120000;

export class CloudSyncError extends Error {
  constructor(message, status = 400, code = "cloud_sync_error") {
    super(message);
    this.name = "CloudSyncError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Accept, X-Cloud-Session",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...headers,
    },
  });
}

export function optionsResponse() {
  return jsonResponse({}, 204);
}

function getStore(env) {
  if (!env.REVIEW_ATLAS_SYNC) {
    throw new CloudSyncError("缺少 REVIEW_ATLAS_SYNC KV 绑定。", 503, "cloud_sync_unconfigured");
  }
  return env.REVIEW_ATLAS_SYNC;
}

function normalizeAccountId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function accountKey(normalizedId) {
  return `user:${encodeURIComponent(normalizedId)}`;
}

function sessionKey(token) {
  return `session:${token}`;
}

function progressKey(normalizedId) {
  return `progress:${encodeURIComponent(normalizedId)}`;
}

function validateAccountId(accountId) {
  const normalized = normalizeAccountId(accountId);
  if (!ACCOUNT_PATTERN.test(normalized)) {
    throw new CloudSyncError("同步账号只能包含小写字母、数字、点、下划线、连字符或 @，长度需在 3 到 48 个字符之间。", 400, "account_invalid");
  }
  return normalized;
}

function validatePassword(password) {
  const raw = String(password || "");
  if (raw.length < MIN_PASSWORD_LENGTH) {
    throw new CloudSyncError("同步口令至少需要 6 位。", 400, "password_too_short");
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    throw new CloudSyncError("同步口令过长，请控制在 72 位以内。", 400, "password_too_long");
  }
  return raw;
}

function encodeHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(hex) {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left, right) {
  const leftBytes = decodeHex(left);
  const rightBytes = decodeHex(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeHex(bytes);
}

async function hashPassword(password, saltHex) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeHex(saltHex),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return encodeHex(new Uint8Array(bits));
}

function createSession(accountId, normalizedId) {
  const issuedAt = Date.now();
  return {
    token: randomHex(24),
    accountId,
    normalizedId,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_MS,
    lastActiveAt: issuedAt,
  };
}

async function readJson(store, key) {
  const value = await store.get(key, { type: "json" });
  return value || null;
}

async function writeJson(store, key, value) {
  await store.put(key, JSON.stringify(value));
}

export function getSessionToken(request, payload = null) {
  return request.headers.get("X-Cloud-Session") || payload?.token || "";
}

export async function registerCloudAccount(env, accountId, password) {
  const store = getStore(env);
  const normalizedId = validateAccountId(accountId);
  const passwordText = validatePassword(password);
  const existing = await readJson(store, accountKey(normalizedId));
  if (existing) {
    throw new CloudSyncError("这个同步账号已经存在，请直接登录。", 409, "account_exists");
  }

  const salt = randomHex(16);
  const now = Date.now();
  const user = {
    accountId: normalizedId,
    normalizedId,
    salt,
    passwordHash: await hashPassword(passwordText, salt),
    createdAt: now,
    updatedAt: now,
  };
  const session = createSession(normalizedId, normalizedId);
  await writeJson(store, accountKey(normalizedId), user);
  await writeJson(store, sessionKey(session.token), session);
  return session;
}

export async function loginCloudAccount(env, accountId, password) {
  const store = getStore(env);
  const normalizedId = validateAccountId(accountId);
  const passwordText = validatePassword(password);
  const user = await readJson(store, accountKey(normalizedId));
  if (!user) {
    throw new CloudSyncError("这个同步账号还不存在，请先注册。", 404, "account_missing");
  }

  const candidateHash = await hashPassword(passwordText, String(user.salt || ""));
  if (!constantTimeEqual(String(user.passwordHash || ""), candidateHash)) {
    throw new CloudSyncError("同步口令不正确。", 401, "password_invalid");
  }

  const session = createSession(String(user.accountId || normalizedId), normalizedId);
  await writeJson(store, sessionKey(session.token), session);
  return session;
}

export async function logoutCloudSession(env, token) {
  const store = getStore(env);
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    throw new CloudSyncError("缺少云端同步会话。", 401, "missing_session");
  }
  await store.delete(sessionKey(normalizedToken));
}

export async function requireCloudSession(env, token) {
  const store = getStore(env);
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    throw new CloudSyncError("缺少云端同步会话。", 401, "missing_session");
  }

  const session = await readJson(store, sessionKey(normalizedToken));
  if (!session) {
    throw new CloudSyncError("云端同步登录状态无效，请重新登录。", 401, "session_invalid");
  }
  if (Number(session.expiresAt || 0) <= Date.now()) {
    await store.delete(sessionKey(normalizedToken));
    throw new CloudSyncError("云端同步登录状态已过期，请重新登录。", 401, "session_expired");
  }

  session.lastActiveAt = Date.now();
  await writeJson(store, sessionKey(normalizedToken), session);
  return session;
}

export async function readCloudProgress(env, token) {
  const store = getStore(env);
  const session = await requireCloudSession(env, token);
  const snapshot = await readJson(store, progressKey(session.normalizedId));
  return {
    session,
    snapshot: snapshot || {
      accountId: session.accountId,
      updatedAt: 0,
      state: null,
      savedAt: 0,
    },
  };
}

export async function writeCloudProgress(env, token, statePayload, updatedAt) {
  if (statePayload !== null && typeof statePayload !== "object") {
    throw new CloudSyncError("云端同步请求里缺少有效的 state 对象。", 400, "state_invalid");
  }

  const store = getStore(env);
  const session = await requireCloudSession(env, token);
  const normalizedUpdatedAt = Math.max(0, Number(updatedAt || Date.now()) || Date.now());
  const existing = await readJson(store, progressKey(session.normalizedId));

  if (existing?.state && Number(existing.updatedAt || 0) > normalizedUpdatedAt) {
    return {
      accountId: session.accountId,
      updatedAt: Number(existing.updatedAt || 0),
      state: existing.state,
      conflict: true,
    };
  }

  const snapshot = {
    accountId: session.accountId,
    updatedAt: normalizedUpdatedAt,
    state: statePayload,
    savedAt: Date.now(),
  };

  await writeJson(store, progressKey(session.normalizedId), snapshot);
  return {
    accountId: session.accountId,
    updatedAt: normalizedUpdatedAt,
    state: statePayload,
    conflict: false,
  };
}

export function handleCloudSyncError(error) {
  if (error instanceof CloudSyncError) {
    return jsonResponse(
      {
        ok: false,
        error: error.message,
        code: error.code,
      },
      error.status,
    );
  }

  return jsonResponse(
    {
      ok: false,
      error: `服务内部错误：${error?.message || error}`,
      code: "internal_error",
    },
    500,
  );
}
