const KEY = "vss-login-email";

/** Remembers which email this browser asked a code for (best effort). */
export const rememberRequestedEmail = (email: string) => {
  try {
    sessionStorage.setItem(KEY, email.trim().toLowerCase());
  } catch {
    // Storage can be blocked; the link then needs a click.
  }
};

export const forgetRequestedEmail = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
};

export const readRequestedEmail = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * A code in a link may only be submitted without a click when this browser
 * asked for it. Otherwise someone could sign the visitor in to their account.
 */
export const shouldAutoSubmitCode = (requestedEmail: string | null, linkEmail: string): boolean =>
  requestedEmail !== null && requestedEmail === linkEmail.trim().toLowerCase();
