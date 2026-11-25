/**
 * Where to go after sign-in: only somewhere on this site, as a path, so a link can't
 * send someone to another site. `origin` is this site's (`window.location.origin`).
 */
export const safeCallbackUrl = (value: unknown, origin: string): string | null => {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    // Resolved the way the browser would, so tricks like `/\evil.com` show their real origin
    url = new URL(value, origin);
  } catch {
    return null;
  }
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
};
