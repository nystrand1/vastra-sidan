/** The one stored form of an email address: trimmed and lowercased. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();
