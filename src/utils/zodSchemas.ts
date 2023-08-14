import { SwishPaymentStatus } from "@prisma/client";
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

export const swishCallbackPaymentSchema = z.object({
  id: z.string(),
  payeePaymentReference: z.string(),
  paymentReference: z.string(),
  callbackUrl: z.string(),
  payerAlias: z.string(),
  payeeAlias: z.string(),
  currency: z.string(),
  message: z.string(),
  errorMessage: z.string().nullable(),
  status: z.literal<SwishPaymentStatus>(
    "CREATED" || "PAID" || "ERROR" || "REFUNDED" || "CANCELLED"
  ),
  amount: z.number(),
  dateCreated: z.string(),
  datePaid: z.string(),
  errorCode: z.string().nullable(),
});

export const swishCallbackRefundSchema = z.object({
    amount: z.number(),
    originalPaymentReference: z.string(),
    dateCreated: z.string(),
    datePaid: z.string(),
    payerPaymentReference: z.string().nullable(),
    payerAlias: z.string(),
    callbackUrl: z.string(),
    currency: z.string(),
    id: z.string(),
    payeeAlias: z.string().nullable(),
    message: z.string(),
    status: z.enum(["VALIDATED", "DEBITED", "PAID", "ERROR"]),
});