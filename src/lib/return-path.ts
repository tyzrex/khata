const PLACEHOLDER_ORIGIN = "http://khata.invalid";

/**
 * A post-sign-in destination that is guaranteed to stay on this site. A string
 * check alone is not enough: browsers strip tabs and newlines inside a URL, so
 * "/\t/evil.com" reads as "//evil.com". Parse it the way a browser would and
 * require that it still resolves to our own origin.
 */
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u0020\u007f]/.test(value)) return "/";
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname.startsWith("/login")) return "/";
  return value;
}
