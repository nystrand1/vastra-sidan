const HOUR = 60 * 60 * 1000;

/**
 * Counts events per email in fixed one-hour windows. In memory, so it resets on restart;
 * that is fine on the single production box.
 */
const createEmailCounter = (max: number) => {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const current = (email: string, now: number) => {
    const window = windows.get(email);
    return window && window.resetAt > now ? window : undefined;
  };

  const pruneExpired = (now: number) => {
    for (const [email, window] of windows) {
      if (window.resetAt <= now) windows.delete(email);
    }
  };

  return {
    isOver: (email: string) => (current(email, Date.now())?.count ?? 0) >= max,
    add: (email: string) => {
      const now = Date.now();
      const window = current(email, now);
      if (window) {
        window.count += 1;
        return;
      }
      if (windows.size >= 10_000) pruneExpired(now);
      windows.set(email, { count: 1, resetAt: now + HOUR });
    },
    clear: () => windows.clear()
  };
};

/** Sign-in codes sent to one email per hour. */
export const loginCodeSends = createEmailCounter(5);

/** Failed sign-ins with a code for one email per hour. */
export const failedLoginCodes = createEmailCounter(15);

/** Forgets every count (tests start from a clean slate). */
export const resetEmailLimits = () => {
  loginCodeSends.clear();
  failedLoginCodes.clear();
};
