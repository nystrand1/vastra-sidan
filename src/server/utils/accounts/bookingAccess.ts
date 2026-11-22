import { normaliseEmail } from "~/utils/email";

/** Whether `email` is the payer of a booking. A booking without a recorded payer has none. */
export const isPayer = (email: string, payerEmail: string | null): boolean =>
  payerEmail !== null && normaliseEmail(email) === normaliseEmail(payerEmail);
