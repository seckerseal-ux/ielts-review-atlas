const DEFAULT_GEMAI_BASE_URL = "https://api.gemai.cc/v1";
const DEFAULT_ERROR_REVIEW_MODEL = "gpt-5.1-thinking";
const MAX_ERROR_REVIEW_ENTRIES = 40;
const MAX_ERROR_REVIEW_IMAGES = 6;
const MAX_ERROR_REVIEW_IMAGE_DATA_URL_CHARS = 6 * 1024 * 1024;
const AI_DAILY_LIMIT = 10;
const DAILY_LIMIT_UTC_OFFSET_MINUTES = 8 * 60;
const AI_RATE_LIMIT_PREFIX = "limit:error-review";
const AI_RATE_LIMIT_RESET_BUCKET = "2026-04-09";
const AI_RATE_LIMIT_RESET_VERSION = "2026-04-09-debug-reset-1";
const MAX_JSON_REPAIR_SOURCE_CHARS = 26000;
const REVIEW_PAYLOAD_KEYS = [
  "summary",
  "ability_snapshot",
  "recurring_question_types",
  "recurring_error_causes",
  "image_observations",
  "reflection_highlights",
  "next_actions",
  "next_drill_plan",
  "coach_message",
];

const ERROR_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    ability_snapshot: {
      type: "object",
      additionalProperties: false,
      properties: {
        stronger_section: { type: "string" },
        risk_section: { type: "string" },
        accuracy_pattern: { type: "string" },
      },
      required: ["stronger_section", "risk_section", "accuracy_pattern"],
    },
    recurring_question_types: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_type: { type: "string" },
          count: { type: "number" },
          why_wrong: { type: "string" },
          fix: { type: "string" },
        },
        required: ["question_type", "count", "why_wrong", "fix"],
      },
    },
    recurring_error_causes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cause: { type: "string" },
          count: { type: "number" },
          pattern: { type: "string" },
          fix: { type: "string" },
        },
        required: ["cause", "count", "pattern", "fix"],
      },
    },
    image_observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          image_label: { type: "string" },
          observation: { type: "string" },
          implication: { type: "string" },
        },
        required: ["image_label", "observation", "implication"],
      },
    },
    reflection_highlights: { type: "array", items: { type: "string" } },
    next_actions: { type: "array", items: { type: "string" } },
    next_drill_plan: { type: "array", items: { type: "string" } },
    coach_message: { type: "string" },
  },
  required: [
    "summary",
    "ability_snapshot",
    "recurring_question_types",
    "recurring_error_causes",
    "image_observations",
    "reflection_highlights",
    "next_actions",
    "next_drill_plan",
    "coach_message",
  ],
};

const ERROR_REVIEW_INSTRUCTIONS = `
You are a strict but encouraging English exam mistake-review coach.
You will receive:
1. Structured wrong-answer journal entries for IELTS or Chinese postgraduate entrance exam English.
2. Aggregated statistics such as recurring question types, error-cause tags, and recent reflections.
3. Optional user goal notes for this review round.
4. Optional uploaded screenshots related to the wrong questions.

Return feedback in Simplified Chinese.
Ground every judgment in the supplied entries, statistics, and screenshots.
Do not invent details that are not visible in the data.
The main job is to help the candidate see recurring question types, recurring causes, and what to do differently next time.
Supported modules include IELTS Reading, IELTS Listening, Kaoyan Reading, Kaoyan New Question Types, and Kaoyan Cloze.
When screenshots are present, use them to explain likely distraction points, paraphrase traps, layout issues, discourse clues, attitude shifts, or why the candidate may have missed the clue.
Keep the tone concise, actionable, and coach-like.
For recurring_question_types and recurring_error_causes, use counts that stay close to the supplied statistics.
reflection_highlights should extract the most valuable review takeaways already visible in the candidate's own notes.
next_actions should be immediate, concrete moves for the next 3-7 days.
next_drill_plan should describe short drills that directly target the current weak spots.
coach_message should be a short closing paragraph that is motivating but not fluffy.
`.trim();

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export function handleOptions(request) {
  if (request.method !== "OPTIONS") {
    return null;
  }
  return jsonResponse({}, 204);
}

export function getBaseUrl(env) {
  return String(env.OPENAI_ERROR_REVIEW_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_GEMAI_BASE_URL).trim();
}

export function getModel(env) {
  return String(env.OPENAI_ERROR_REVIEW_MODEL || DEFAULT_ERROR_REVIEW_MODEL).trim();
}

export function getApiKey(env) {
  return String(env.OPENAI_API_KEY || "").trim();
}

export function getProviderLabel(baseUrl) {
  const normalized = String(baseUrl || "").trim().toLowerCase();
  if (normalized.includes("api.gemai.cc")) {
    return "GemAI";
  }
  if (normalized.includes("aihubmix.com")) {
    return "AIHubMix";
  }
  return "OpenAI";
}

export function getStatus(env) {
  const baseUrl = getBaseUrl(env);
  return {
    available: Boolean(getApiKey(env)),
    provider: "openai",
    provider_label: getProviderLabel(baseUrl),
    base_url: baseUrl,
    review_model: getModel(env),
  };
}

function sanitizeShortText(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function sanitizeStringList(values, limit = 8, itemLimit = 80) {
  if (!Array.isArray(values)) {
    return [];
  }
  const cleaned = [];
  values.forEach((value) => {
    const text = sanitizeShortText(value, itemLimit);
    if (text && !cleaned.includes(text) && cleaned.length < limit) {
      cleaned.push(text);
    }
  });
  return cleaned;
}

function getRateLimitStore(env) {
  return env.REVIEW_ATLAS_SYNC || null;
}

function getClientIp(request) {
  const direct = String(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Real-IP") || "").trim();
  if (direct) {
    return direct.slice(0, 80);
  }
  const forwarded = String(request.headers.get("X-Forwarded-For") || "").trim();
  if (!forwarded) {
    return "";
  }
  return forwarded.split(",")[0].trim().slice(0, 80);
}

function getDailyLimitBucket(now = Date.now()) {
  const shifted = now + DAILY_LIMIT_UTC_OFFSET_MINUTES * 60 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

function getDailyLimitTtl(now = Date.now()) {
  const offsetMs = DAILY_LIMIT_UTC_OFFSET_MINUTES * 60 * 1000;
  const shifted = new Date(now + offsetMs);
  const nextDayShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  const nextReset = nextDayShifted - offsetMs;
  return Math.max(3600, Math.ceil((nextReset - now) / 1000) + 3600);
}

function getDailyLimitKey(ip, bucket) {
  return `${AI_RATE_LIMIT_PREFIX}:${bucket}:${encodeURIComponent(ip)}`;
}

function shouldResetQuotaRecord(record, bucket) {
  return bucket === AI_RATE_LIMIT_RESET_BUCKET && record?.reset_version !== AI_RATE_LIMIT_RESET_VERSION;
}

async function getDailyAiQuotaContext(env, request) {
  const store = getRateLimitStore(env);
  const ip = getClientIp(request);
  if (!store || !ip) {
    return null;
  }

  const now = Date.now();
  const bucket = getDailyLimitBucket(now);
  const key = getDailyLimitKey(ip, bucket);
  let record = (await store.get(key, { type: "json" })) || {
    ip,
    bucket,
    count: 0,
  };

  if (shouldResetQuotaRecord(record, bucket)) {
    record = {
      ip,
      bucket,
      count: 0,
      updatedAt: now,
      reset_version: AI_RATE_LIMIT_RESET_VERSION,
    };
    await store.put(key, JSON.stringify(record), {
      expirationTtl: getDailyLimitTtl(now),
    });
  }

  return { store, ip, now, bucket, key, record };
}

function assertDailyAiQuotaAvailable(quotaContext) {
  if (!quotaContext) {
    return;
  }
  if (Number(quotaContext.record?.count || 0) >= AI_DAILY_LIMIT) {
    throw new ApiError(`当前 IP 今日 AI 复盘次数已达 ${AI_DAILY_LIMIT} 次，请明天再试。`, 429);
  }
}

async function consumeDailyAiQuota(quotaContext) {
  if (!quotaContext) {
    return null;
  }

  const {
    store,
    ip,
    bucket,
    key,
    now,
    record,
  } = quotaContext;
  const nextRecord = {
    ip,
    bucket,
    count: Number(record.count || 0) + 1,
    updatedAt: now,
    reset_version: record.reset_version || "",
  };
  await store.put(key, JSON.stringify(nextRecord), {
    expirationTtl: getDailyLimitTtl(now),
  });

  return {
    daily_limit: AI_DAILY_LIMIT,
    daily_used: nextRecord.count,
    daily_remaining: Math.max(0, AI_DAILY_LIMIT - nextRecord.count),
  };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new ApiError("错题条目格式不正确。", 400);
  }

  const exam = sanitizeShortText(entry.exam, 20).toLowerCase() === "kaoyan" ? "kaoyan" : "ielts";
  const rawSection = sanitizeShortText(entry.section, 20).toLowerCase();
  const section = exam === "ielts"
    ? (rawSection === "listening" ? "listening" : "reading")
    : (["reading", "new_question", "cloze"].includes(rawSection) ? rawSection : "reading");
  const source = sanitizeShortText(entry.source, 120);
  const questionNumber = sanitizeShortText(entry.question_number, 40);
  const questionType = sanitizeShortText(entry.question_type, 80);

  if (!source || !questionNumber || !questionType) {
    throw new ApiError("每条错题至少需要包含题目来源、题号和题型。", 400);
  }

  return {
    id: sanitizeShortText(entry.id, 80),
    exam,
    section,
    source,
    question_number: questionNumber,
    question_type: questionType,
    wrong_answer: sanitizeShortText(entry.wrong_answer, 160),
    correct_answer: sanitizeShortText(entry.correct_answer, 160),
    cause_tags: sanitizeStringList(entry.cause_tags, 8, 60),
    error_reason: sanitizeShortText(entry.error_reason, 1200),
    text_location: sanitizeShortText(entry.text_location, 1200),
    paraphrase: sanitizeShortText(entry.paraphrase, 1200),
    review_note: sanitizeShortText(entry.review_note, 1200),
    difficulty: Math.max(1, Math.min(5, Number(entry.difficulty || 3) || 3)),
    tags: sanitizeStringList(entry.tags, 8, 60),
    ai_priority: sanitizeShortText(entry.ai_priority, 20) || "normal",
  };
}

function normalizeImage(image) {
  if (!image || typeof image !== "object") {
    throw new ApiError("图片条目格式不正确。", 400);
  }

  const dataUrl = String(image.data_url || "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    throw new ApiError("图片必须以 data:image/... 的 data URL 形式提交。", 400);
  }
  if (dataUrl.length > MAX_ERROR_REVIEW_IMAGE_DATA_URL_CHARS) {
    throw new ApiError("单张图片过大，请压缩后再上传。", 400);
  }

  return {
    entry_id: sanitizeShortText(image.entry_id, 80),
    image_label: sanitizeShortText(image.image_label, 120) || "题目截图",
    name: sanitizeShortText(image.name, 120) || "screenshot.png",
    data_url: dataUrl,
  };
}

function buildUserContent(entries, stats, focusGoal, note, images) {
  const userContent = [
    {
      type: "text",
      text: [
        "请基于以下英语考试错题档案做结构化复盘。",
        "这些条目可能来自雅思阅读、雅思听力、考研英语阅读、考研英语新题型或考研英语完型填空。",
        "",
        "本轮目标:",
        focusGoal || "未提供",
        "",
        "用户补充:",
        note || "未提供",
        "",
        "错题条目:",
        JSON.stringify(entries, null, 2),
        "",
        "统计汇总:",
        JSON.stringify(stats, null, 2),
        "",
        "请务必输出一个合法 JSON 对象，不要添加 markdown、解释、代码块或思考过程。",
        `JSON Schema:\n${JSON.stringify(ERROR_REVIEW_SCHEMA)}`,
      ].join("\n"),
    },
  ];

  images.forEach((image) => {
    userContent.push({
      type: "text",
      text: `下面这张图对应：${image.image_label}。请结合它判断题干布局、干扰项、定位线索或同义替换陷阱。`,
    });
    userContent.push({
      type: "image_url",
      image_url: {
        url: image.data_url,
      },
    });
  });

  return userContent;
}

async function requestStructuredReview({ baseUrl, apiKey, providerLabel, model, entries, stats, focusGoal, note, images }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: ERROR_REVIEW_INSTRUCTIONS },
        { role: "user", content: buildUserContent(entries, stats, focusGoal, note, images) },
      ],
      temperature: 0.2,
      stream: false,
    }),
  });

  const rawText = await response.text();
  let parsedResponse = null;
  try {
    parsedResponse = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsedResponse = null;
  }

  if (!response.ok) {
    const message = parsedResponse?.error?.message || rawText || "未知错误";
    const error = new ApiError(`${providerLabel} 接口返回错误：${message}`, response.status);
    error.upstreamMessage = String(message || "").trim();
    throw error;
  }

  const completionText = extractCompletionText(parsedResponse || {}, providerLabel);
  try {
    const finalized = finalizeReviewPayload(parseJsonTextResponse(completionText, providerLabel), { entries, stats, images });
    return {
      ...finalized,
      jsonRepairUsed: false,
    };
  } catch (error) {
    const repairedPayload = await requestJsonRepair({
      baseUrl,
      apiKey,
      providerLabel,
      model,
      sourceText: completionText,
    });
    const finalized = finalizeReviewPayload(repairedPayload, { entries, stats, images });
    return {
      ...finalized,
      jsonRepairUsed: true,
    };
  }
}

async function requestJsonRepair({ baseUrl, apiKey, providerLabel, model, sourceText }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You repair imperfect JSON-like model output.",
            "Return only one valid JSON object in Simplified Chinese.",
            "Do not add markdown, explanation, code fences, or surrounding text.",
            "If a field is missing, fill it with a concise safe default that matches the schema.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "把下面这段复盘回复整理成一个严格合法的 JSON 对象。",
            `必须满足这个 JSON Schema:\n${JSON.stringify(ERROR_REVIEW_SCHEMA)}`,
            "",
            "待修复内容:",
            String(sourceText || "").slice(0, MAX_JSON_REPAIR_SOURCE_CHARS),
          ].join("\n"),
        },
      ],
      temperature: 0,
      stream: false,
    }),
  });

  const rawText = await response.text();
  let parsedResponse = null;
  try {
    parsedResponse = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsedResponse = null;
  }

  if (!response.ok) {
    const message = parsedResponse?.error?.message || rawText || "未知错误";
    throw new ApiError(`${providerLabel} 返回的结果格式有点乱，自动整理时也没有成功：${message}`, response.status);
  }

  return parseJsonTextResponse(extractCompletionText(parsedResponse || {}, providerLabel), providerLabel);
}

function shouldRetryWithoutImages(error, images) {
  if (!images.length || !(error instanceof ApiError)) {
    return false;
  }

  if (Number(error.status || 0) >= 500) {
    return true;
  }

  const message = String(error.upstreamMessage || error.message || "").toLowerCase();
  return [
    "image",
    "vision",
    "data url",
    "payload",
    "too large",
    "too long",
    "invalid image",
    "unsupported image",
  ].some((token) => message.includes(token));
}

function extractCompletionText(payload, providerLabel) {
  const choice = payload?.choices?.[0];
  if (!choice) {
    throw new ApiError(`${providerLabel} 返回了空响应。`, 502);
  }

  const content = choice.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const parts = content
      .filter((item) => item?.type === "text" || item?.type === "output_text")
      .map((item) => item.text?.value || item.text || "")
      .filter(Boolean);
    if (parts.length) {
      return parts.join("\n").trim();
    }
  }

  throw new ApiError(`${providerLabel} 返回了无法识别的响应格式。`, 502);
}

function parseJsonTextResponse(text, providerLabel) {
  const rawText = String(text || "").trim();
  if (!rawText) {
    throw new ApiError(`${providerLabel} 返回了空的 JSON 文本。`, 502);
  }

  const candidates = [rawText];
  if (rawText.startsWith("```")) {
    const lines = rawText.split("\n");
    if (lines.length >= 3 && lines.at(-1)?.startsWith("```")) {
      candidates.push(lines.slice(1, -1).join("\n").trim());
    }
  }
  const fencedMatches = rawText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    candidates.push(String(match[1] || "").trim());
  }
  candidates.push(...extractBalancedJsonObjects(rawText));
  const firstCurly = rawText.indexOf("{");
  const lastCurly = rawText.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    candidates.push(rawText.slice(firstCurly, lastCurly + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new ApiError(`${providerLabel} 返回了无法解析的 JSON 结果。`, 502);
}

function finalizeReviewPayload(payload, context) {
  const review = clampPayload(unwrapReviewPayload(payload));
  const fallback = buildFallbackReview(context.entries, context.stats, context.images);
  return {
    review: mergeReviewWithFallback(review, fallback),
    fallbackUsed: !isUsefulReview(review),
  };
}

function unwrapReviewPayload(payload) {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if (hasReviewShape(root)) {
    return root;
  }

  for (const key of ["review", "result", "data", "output", "content"]) {
    const value = root[key];
    if (value && typeof value === "object" && !Array.isArray(value) && hasReviewShape(value)) {
      return value;
    }
  }

  return root;
}

function hasReviewShape(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  return REVIEW_PAYLOAD_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function isUsefulReview(review) {
  if (!review || typeof review !== "object") {
    return false;
  }

  const snapshot = review.ability_snapshot || {};
  const textSignals = [
    review.summary,
    snapshot.stronger_section,
    snapshot.risk_section,
    snapshot.accuracy_pattern,
    review.coach_message,
    ...(review.reflection_highlights || []),
    ...(review.next_actions || []),
    ...(review.next_drill_plan || []),
  ].map((item) => String(item || "").trim()).filter(Boolean);

  const structuredSignals = [
    ...(review.recurring_question_types || []),
    ...(review.recurring_error_causes || []),
    ...(review.image_observations || []),
  ];

  return textSignals.join("").length >= 24 || structuredSignals.length > 0;
}

function mergeReviewWithFallback(review, fallback) {
  return {
    summary: review.summary || fallback.summary,
    ability_snapshot: {
      stronger_section: review.ability_snapshot.stronger_section || fallback.ability_snapshot.stronger_section,
      risk_section: review.ability_snapshot.risk_section || fallback.ability_snapshot.risk_section,
      accuracy_pattern: review.ability_snapshot.accuracy_pattern || fallback.ability_snapshot.accuracy_pattern,
    },
    recurring_question_types: review.recurring_question_types.length
      ? review.recurring_question_types
      : fallback.recurring_question_types,
    recurring_error_causes: review.recurring_error_causes.length
      ? review.recurring_error_causes
      : fallback.recurring_error_causes,
    image_observations: review.image_observations.length
      ? review.image_observations
      : fallback.image_observations,
    reflection_highlights: review.reflection_highlights.length
      ? review.reflection_highlights
      : fallback.reflection_highlights,
    next_actions: review.next_actions.length ? review.next_actions : fallback.next_actions,
    next_drill_plan: review.next_drill_plan.length ? review.next_drill_plan : fallback.next_drill_plan,
    coach_message: review.coach_message || fallback.coach_message,
  };
}

function buildFallbackReview(entries = [], stats = {}, images = []) {
  const totalEntries = Number(stats.total_entries || entries.length || 0);
  const topAreas = normalizeRanking(stats.top_areas, countRanking(entries.map((entry) => getEntryAreaLabel(entry))));
  const topTypes = normalizeRanking(stats.top_question_types, countRanking(entries.map((entry) => entry.question_type)));
  const topCauses = normalizeRanking(stats.top_causes, countRanking(entries.flatMap((entry) => entry.cause_tags || [])));
  const latestReflections = Array.isArray(stats.latest_reflections) ? stats.latest_reflections : [];
  const topArea = topAreas[0]?.label || "当前记录的模块";
  const topType = topTypes[0]?.label || entries[0]?.question_type || "当前错题型";
  const topCause = topCauses[0]?.label || "定位、审题或同义替换";
  const examSummary = summarizeExamMix(entries);

  return {
    summary: totalEntries
      ? `这轮共复盘 ${totalEntries} 条错题，主要集中在“${topArea}”和“${topType}”。目前模型返回内容不够完整，我先根据已记录的题型、错因标签和心得整理一版基础复盘，后续记录越完整，分析会越具体。`
      : "这轮记录信息还比较少，我先给出一版基础复盘框架。建议至少补充题目来源、题号、题型、正确答案、原文定位和自己的错因。", 
    ability_snapshot: {
      stronger_section: examSummary || "当前样本还不够判断稳定优势，先把每次做对但犹豫的题也一起记录下来。",
      risk_section: `${topArea}里的“${topType}”需要优先关注。`,
      accuracy_pattern: `本轮最值得先抓的是“${topCause}”，下一轮复盘要把证据句、题干关键词和正确选项之间的关系写清楚。`,
    },
    recurring_question_types: buildQuestionTypeFallback(topTypes, entries),
    recurring_error_causes: buildCauseFallback(topCauses),
    image_observations: buildImageFallback(images),
    reflection_highlights: buildReflectionFallback(latestReflections, entries),
    next_actions: [
      "把本轮每道错题的原文定位句补完整，至少写出题干关键词、定位依据和正确选项依据。",
      `优先复盘“${topType}”：不要只记答案，要写清楚自己当时为什么会被错误选项带走。`,
      `下一次做题时专门盯住“${topCause}”，做完后马上给错题打标签，避免只凭感觉复盘。`,
    ],
    next_drill_plan: [
      `用 20 分钟集中复盘本轮“${topType}”题，把正确项和干扰项各写一句判断依据。`,
      "每天选 2 道错题重做，不看答案先重新定位，再对照原记录看思路有没有变化。",
      "每累计 5 条错题，就按题型和错因做一次小结，找出最该先改的一个动作。",
    ],
    coach_message: "这轮不是白做，至少已经把薄弱题型和错因线索留下来了。下一步重点不是多刷，而是把每道错题的证据链补清楚：题干问什么、原文哪句话支持、错误选项偷换了哪里。",
  };
}

function normalizeRanking(primary, fallback) {
  const source = Array.isArray(primary) && primary.length ? primary : fallback;
  return source
    .map((item) => ({
      label: String(item?.label || item?.question_type || item?.cause || item || "").trim(),
      count: Number(item?.count || 1) || 1,
    }))
    .filter((item) => item.label)
    .slice(0, 5);
}

function countRanking(labels) {
  const counts = new Map();
  labels.filter(Boolean).forEach((label) => {
    const normalized = String(label || "").trim();
    if (normalized) {
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

function getEntryAreaLabel(entry) {
  const exam = entry.exam === "kaoyan" ? "考研英语" : "雅思";
  const sectionLabels = {
    reading: "阅读",
    listening: "听力",
    new_question: "新题型",
    cloze: "完型填空",
  };
  return `${exam}${sectionLabels[entry.section] || ""}`;
}

function summarizeExamMix(entries) {
  const ranking = countRanking(entries.map((entry) => getEntryAreaLabel(entry)));
  if (!ranking.length) {
    return "";
  }
  return `本轮已记录 ${ranking.map((item) => `${item.label} ${item.count} 条`).join("、")}，暂时先按这些模块观察。`;
}

function buildQuestionTypeFallback(topTypes, entries) {
  const source = topTypes.length ? topTypes : normalizeRanking([], countRanking(entries.map((entry) => entry.question_type)));
  return (source.length ? source : [{ label: "当前错题型", count: entries.length || 1 }]).slice(0, 5).map((item) => ({
    question_type: item.label,
    count: item.count,
    why_wrong: `这类题在本轮出现了 ${item.count} 次，需要回看题干、定位句和选项之间的对应关系，确认是定位慢、审题偏差，还是同义替换没有识别。`,
    fix: "复盘时固定写三行：题干关键词、原文证据句、正确项为什么比错误项更精确。",
  }));
}

function buildCauseFallback(topCauses) {
  const source = topCauses.length ? topCauses : [{ label: "定位、审题或同义替换", count: 1 }];
  return source.slice(0, 5).map((item) => ({
    cause: item.label,
    count: item.count,
    pattern: `本轮“${item.label}”出现频率较高，说明做题时可能还没有形成稳定的证据链检查动作。`,
    fix: "下次遇到相似题，先停 10 秒确认题干限定词，再回到原文找能直接支撑答案的句子。",
  }));
}

function buildImageFallback(images) {
  if (!images.length) {
    return [];
  }
  return images.slice(0, 4).map((image) => ({
    image_label: image.image_label || "题目截图",
    observation: "已收到这张截图，但模型这轮没有返回具体图片观察。",
    implication: "建议在错题记录里补一句截图对应的题干、原文定位或选项差异，这样下一轮图片分析会更具体。",
  }));
}

function buildReflectionFallback(latestReflections, entries) {
  const reflections = latestReflections
    .map((item) => String(item?.review_note || "").trim())
    .filter(Boolean);
  if (reflections.length) {
    return reflections.slice(0, 5);
  }

  const notes = entries
    .map((entry) => String(entry.review_note || entry.error_reason || "").trim())
    .filter(Boolean);
  if (notes.length) {
    return notes.slice(0, 5);
  }

  return [
    "目前心得记录还偏少，建议每条错题至少补一句“我当时为什么会选错”。",
    "复盘时优先补证据链，而不是只记正确答案。",
  ];
}

function extractBalancedJsonObjects(text) {
  const source = String(text || "");
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(source.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return objects;
}

function clampPayload(payload) {
  const normalizedPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const snapshot = normalizedPayload.ability_snapshot || {};
  return {
    summary: String(normalizedPayload.summary || "").trim(),
    ability_snapshot: {
      stronger_section: String(snapshot.stronger_section || "").trim(),
      risk_section: String(snapshot.risk_section || "").trim(),
      accuracy_pattern: String(snapshot.accuracy_pattern || "").trim(),
    },
    recurring_question_types: Array.isArray(normalizedPayload.recurring_question_types) ? normalizedPayload.recurring_question_types.slice(0, 5) : [],
    recurring_error_causes: Array.isArray(normalizedPayload.recurring_error_causes) ? normalizedPayload.recurring_error_causes.slice(0, 5) : [],
    image_observations: Array.isArray(normalizedPayload.image_observations) ? normalizedPayload.image_observations.slice(0, 4) : [],
    reflection_highlights: Array.isArray(normalizedPayload.reflection_highlights) ? normalizedPayload.reflection_highlights.slice(0, 5).map(String) : [],
    next_actions: Array.isArray(normalizedPayload.next_actions) ? normalizedPayload.next_actions.slice(0, 5).map(String) : [],
    next_drill_plan: Array.isArray(normalizedPayload.next_drill_plan) ? normalizedPayload.next_drill_plan.slice(0, 5).map(String) : [],
    coach_message: String(normalizedPayload.coach_message || "").trim(),
  };
}

export async function requestErrorReview(payload, env, request) {
  const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
  const rawImages = Array.isArray(payload?.images) ? payload.images : [];
  if (!rawEntries.length) {
    throw new ApiError("请求里缺少可复盘的错题条目。", 400);
  }
  if (rawEntries.length > MAX_ERROR_REVIEW_ENTRIES) {
    throw new ApiError("单次 AI 复盘的错题数量过多，请控制在 40 条以内。", 400);
  }
  if (rawImages.length > MAX_ERROR_REVIEW_IMAGES) {
    throw new ApiError("单次 AI 复盘最多附带 6 张图片。", 400);
  }

  const baseUrl = getBaseUrl(env);
  const apiKey = getApiKey(env);
  const providerLabel = getProviderLabel(baseUrl);
  const model = getModel(env);
  if (!apiKey) {
    throw new ApiError("缺少 OPENAI_API_KEY，请先在 Cloudflare 环境变量里设置 GemAI / OpenAI 兼容接口所需的 Key。", 503);
  }

  const entries = rawEntries.map(normalizeEntry);
  const images = rawImages.map(normalizeImage);
  const focusGoal = sanitizeShortText(payload?.focus_goal, 160);
  const note = sanitizeShortText(payload?.note, 500);
  const stats = payload?.stats && typeof payload.stats === "object" ? payload.stats : {};
  const quotaContext = await getDailyAiQuotaContext(env, request);
  assertDailyAiQuotaAvailable(quotaContext);
  let review = null;
  let jsonRepairUsed = false;
  let reviewFallbackUsed = false;
  let imageFallbackUsed = false;
  let imageFallbackMessage = "";

  try {
    const structuredReview = await requestStructuredReview({
      baseUrl,
      apiKey,
      providerLabel,
      model,
      entries,
      stats,
      focusGoal,
      note,
      images,
    });
    review = structuredReview.review;
    jsonRepairUsed = structuredReview.jsonRepairUsed;
    reviewFallbackUsed = structuredReview.fallbackUsed;
  } catch (error) {
    if (!shouldRetryWithoutImages(error, images)) {
      throw error;
    }

    const structuredReview = await requestStructuredReview({
      baseUrl,
      apiKey,
      providerLabel,
      model,
      entries,
      stats,
      focusGoal,
      note,
      images: [],
    });
    review = structuredReview.review;
    jsonRepairUsed = structuredReview.jsonRepairUsed;
    reviewFallbackUsed = structuredReview.fallbackUsed;
    imageFallbackUsed = true;
    imageFallbackMessage = "这轮截图没能顺利带进在线分析，我先按文字记录把总结整理出来了。要是想让截图也一起参与，下次可以少传几张，或换更小一点的图再试。";
  }
  const quota = await consumeDailyAiQuota(quotaContext);

  return {
    provider: "openai",
    provider_label: providerLabel,
    review_model: model,
    review,
    images_requested: images.length,
    images_analyzed: imageFallbackUsed ? 0 : images.length,
    image_fallback_used: imageFallbackUsed,
    image_fallback_message: imageFallbackMessage,
    json_repair_used: jsonRepairUsed,
    review_fallback_used: reviewFallbackUsed,
    review_fallback_message: reviewFallbackUsed
      ? "这轮模型返回的信息太少，我按你已记录的错题、统计和标签先整理了一版基础总结。"
      : "",
    ...quota,
  };
}
