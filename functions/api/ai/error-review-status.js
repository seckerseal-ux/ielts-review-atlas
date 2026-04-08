import { getStatus, handleOptions, jsonResponse } from "../../_shared/error-review";

export async function onRequest(context) {
  const preflight = handleOptions(context.request);
  if (preflight) {
    return preflight;
  }

  if (context.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return jsonResponse(getStatus(context.env));
}
