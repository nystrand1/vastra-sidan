import { z } from "zod";

export const participantSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  consent: z.literal("on"),
  note: z.string().optional(),
  busId: z.string(),
  member: z.boolean(),
  youth: z.boolean(),
});

export const swishCallbackSchema = z.object({
  id: z.string(),
  payeePaymentReference: z.string(),
  paymentReference: z.string(),
  callbackUrl: z.string(),
  payerAlias: z.string(),
  payeeAlias: z.string(),
  currency: z.string(),
  message: z.string(),
  errorMessage: z.string().nullable(),
  status: z.string(),
  amount: z.number(),
  dateCreated: z.string(),
  datePaid: z.string(),
  errorCode: z.string().nullable(),
})