import {
  ApiError,
  handleOptions,
  jsonResponse,
  requestErrorReview,
} from "../../_shared/error-review";

export async function onRequest(context) {
  const preflight = handleOptions(context.request);
  if (preflight) {
    return preflight;
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await context.request.json();
    const result = await requestErrorReview(payload, context.env, context.request);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: `服务内部错误：${error.message || error}` }, 500);
  }
}
