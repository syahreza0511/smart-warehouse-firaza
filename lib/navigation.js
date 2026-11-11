// Post-login destinations. Only exact, known app paths are accepted, so
// external URLs, protocol-relative paths ("//host"), backslash variants
// ("/\host"), encoded tricks, and control characters all fall back to the
// default instead of being parsed.
export const DEFAULT_AFTER_LOGIN = "/materials";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MATERIAL_PATH = new RegExp(`^/materials/${UUID}(?:/edit)?$`, "i");
const FIXED_PATHS = new Set(["/materials", "/materials/new"]);

export function safeNextPath(value) {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (FIXED_PATHS.has(value) || MATERIAL_PATH.test(value)) return value;
  return DEFAULT_AFTER_LOGIN;
}
