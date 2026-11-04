// Post-login destinations. Only exact, known app paths are accepted, so
// external URLs, protocol-relative paths ("//host"), backslash variants
// ("/\host"), encoded tricks, and control characters all fall back to the
// default instead of being parsed.
export const DEFAULT_AFTER_LOGIN = "/materials";

const MATERIAL_DETAIL =
  /^\/materials\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeNextPath(value) {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (value === "/materials" || MATERIAL_DETAIL.test(value)) return value;
  return DEFAULT_AFTER_LOGIN;
}
