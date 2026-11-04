// Browser HTTP client for the app's own REST API (OD-18 Option C, ADR-15).
// Client Components never call Supabase; auth travels in HttpOnly cookies.
import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Normalizes an Axios error to { status, code, message, fields, retryable }.
// retryable means the outcome is unknown (network failure, timeout, 5xx), so
// a mutation may be resent only with the same idempotency key and payload.
export function toApiError(error) {
  const response = error?.response;

  if (!response) {
    return {
      status: 0,
      code: "NETWORK_ERROR",
      message: "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.",
      fields: null,
      retryable: true,
    };
  }

  const body = response.data?.error ?? {};
  return {
    status: response.status,
    code: body.code ?? "HTTP_ERROR",
    message: body.message ?? "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
    fields: body.fields ?? null,
    retryable: response.status >= 500,
  };
}

// 401: no valid Auth session. 403 SESSION_NOT_AUTHORIZED: the session exists
// but the database no longer authorizes it (deactivated account, G1 cutoff).
// Both mean the user has to sign in again. Network errors and 5xx do not.
export function requiresLogin(apiError) {
  return apiError.status === 401 || apiError.code === "SESSION_NOT_AUTHORIZED";
}
