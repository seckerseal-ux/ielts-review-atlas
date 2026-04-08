import {
  getSessionToken,
  handleCloudSyncError,
  jsonResponse,
  loginCloudAccount,
  logoutCloudSession,
  optionsResponse,
  registerCloudAccount,
} from "../../_shared/cloud-sync";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return optionsResponse();
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, { Allow: "OPTIONS, POST" });
  }

  try {
    const payload = await context.request.json().catch(() => ({}));
    const action = String(payload?.action || "").trim();

    if (action === "register") {
      const session = await registerCloudAccount(context.env, payload.accountId, payload.password);
      return jsonResponse({
        ok: true,
        accountId: session.accountId,
        token: session.token,
        expiresAt: session.expiresAt,
      });
    }

    if (action === "login") {
      const session = await loginCloudAccount(context.env, payload.accountId, payload.password);
      return jsonResponse({
        ok: true,
        accountId: session.accountId,
        token: session.token,
        expiresAt: session.expiresAt,
      });
    }

    if (action === "logout") {
      await logoutCloudSession(context.env, payload.token || getSessionToken(context.request, payload));
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Unsupported action." }, 400);
  } catch (error) {
    return handleCloudSyncError(error);
  }
}
