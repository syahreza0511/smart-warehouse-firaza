// Server-only HTTP helpers shared by the /api/v1 Route Handlers.

// Responses can carry user data or set auth cookies, so they are never cached.
const NO_STORE = { "Cache-Control": "private, no-store" };

export function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

// Error body shape: { error: { code, message, fields? } }. Messages are safe
// for display and never contain SQL, credentials, or stack traces.
export function errorResponse(status, code, message, extra = {}, headers = {}) {
  return jsonResponse({ error: { code, message, ...extra } }, status, headers);
}

export const errors = {
  unauthenticated: () =>
    errorResponse(401, "UNAUTHENTICATED", "Sesi tidak ditemukan atau sudah berakhir. Silakan masuk kembali."),
  sessionNotAuthorized: () =>
    errorResponse(
      403,
      "SESSION_NOT_AUTHORIZED",
      "Akun atau sesi ini tidak memiliki akses aplikasi. Silakan masuk kembali atau hubungi Owner."
    ),
  forbidden: () =>
    errorResponse(403, "FORBIDDEN", "Peran Anda tidak diizinkan melakukan tindakan ini."),
  serviceUnavailable: () =>
    errorResponse(
      503,
      "SERVICE_UNAVAILABLE",
      "Layanan sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.",
      {},
      { "Retry-After": "5" }
    ),
  internal: () =>
    errorResponse(500, "INTERNAL_ERROR", "Terjadi kesalahan pada server. Coba lagi beberapa saat lagi."),
  csrfRejected: () =>
    errorResponse(403, "CSRF_REJECTED", "Permintaan ditolak karena tidak berasal dari aplikasi ini."),
  unsupportedMediaType: () =>
    errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Permintaan harus berformat JSON."),
  invalidJson: () => errorResponse(400, "INVALID_JSON", "Isi permintaan bukan JSON yang valid."),
  validation: (fields) =>
    errorResponse(400, "VALIDATION_ERROR", "Data yang dikirim tidak valid.", { fields }),
};

// Cookie-authenticated mutations accept only same-origin browser requests.
// The Origin header must match the Host the request was sent to; when a
// browser omits Origin, Sec-Fetch-Site must say same-origin. Requests from
// other sites (CSRF) carry neither and are rejected.
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

// Guards every mutation: same-origin, JSON content type, parseable body.
// Returns { body } or { response } with the error to send.
export async function readJsonMutation(request) {
  if (!isSameOrigin(request)) {
    return { response: errors.csrfRejected() };
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { response: errors.unsupportedMediaType() };
  }

  try {
    return { body: await request.json() };
  } catch {
    return { response: errors.invalidJson() };
  }
}

// Supabase Auth errors without an HTTP status, or with a 5xx status, are
// infrastructure failures, not proof that the user or session is invalid.
export function isTransientAuthError(error) {
  return (
    error?.name === "AuthRetryableFetchError" ||
    !error?.status ||
    error.status >= 500
  );
}

// PostgREST read errors: permission errors are authorization failures;
// anything without a PostgreSQL/PostgREST code is a transport failure.
export function readErrorResponse(error) {
  if (error?.code === "42501") {
    return errors.sessionNotAuthorized();
  }

  if (!error?.code) {
    return errors.serviceUnavailable();
  }

  console.error("[api] read failed", error.code);
  return errors.internal();
}
