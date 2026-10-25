// parseApiError — normalize backend error payloads into { code, message }.
//
// Why this exists (prod bug 25/10/2026):
//   ASP.NET serializes `ErrorResponse(Code, Message)` with PascalCase keys
//   ({"Code":"invalid_code","Message":"..."}), while the old roomsApi parser
//   only read lowercase `body.code` / `body.message`. Both lookups missed,
//   so every domain error (bad name, bad code, room full) surfaced to the
//   player as the raw string "HTTP 400" on the landing page.
//   The TestController test endpoints additionally return { error: "..." }.
//
// This helper accepts every casing the backend can send so the UI always
// shows the real message and the real domain code.

export function parseApiError(body, status) {
  const fallbackCode = `http_${status}`;
  const fallbackMessage = `HTTP ${status}`;
  if (!body || typeof body !== "object") {
    return { code: fallbackCode, message: fallbackMessage };
  }
  const code = body.code ?? body.Code ?? body.errorCode ?? body.ErrorCode ?? fallbackCode;
  // `error` may be a string (TestController) or an object — only use strings.
  const rawError = body.error ?? body.Error;
  const message =
    body.message ??
    body.Message ??
    (typeof rawError === "string" ? rawError : undefined) ??
    (typeof code === "string" && code !== fallbackCode ? code : fallbackMessage);
  return { code: String(code), message: String(message) };
}
