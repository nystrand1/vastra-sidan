import {
  MembershipType,
  StripePaymentStatus,
  StripeRefundStatus
} from "@prisma/client";
import { z } from "zod";

export const participantSchema = z.object({
  firstName: z.string({ required_error: "Ange förnamn" }).min(1, { message: "Ange förnamn" }),
  lastName: z.string({ required_error: "Ange efternamn" }).min(1, { message: "Ange efternamn" }),
  email: z.string({ required_error: "Ange email" }).email({ message: "Felaktig email" }),
  phone: z.string({ required_error: "Ange telefonnummer" }).min(1, { message: "Ange telefonnummer" }),
  consent: z
    .boolean()
    .default(false)
    .refine((x) => x, { message: "Du måste godkänna villkoren" }),
  note: z.string().optional(),
  busId: z.string({ required_error: "Välj buss" }).min(1, { message: "Välj buss" }),
  member: z.boolean(),
  youth: z.boolean()
});

export const eventSignupSchema = z.object({
  participants: participantSchema.array()
});

const StripePaymentStatuses: [StripePaymentStatus, ...StripePaymentStatus[]] = [
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  Object.values(StripePaymentStatus)[0]!,
  ...Object.values(StripePaymentStatus).slice(1)
];

const StripeRefundStatuses: [StripeRefundStatus, ...StripeRefundStatus[]] = [
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  Object.values(StripeRefundStatus)[0]!,
  ...Object.values(StripeRefundStatus).slice(1)
];

export const StripeCallbackPaymentSchema = z.object({
  id: z.string(),
  payeePaymentReference: z.string(),
  paymentReference: z.string(),
  callbackUrl: z.string(),
  payerAlias: z.string(),
  payeeAlias: z.string(),
  currency: z.string(),
  message: z.string(),
  errorMessage: z.string().nullable(),
  status: z.enum(StripePaymentStatuses),
  amount: z.number(),
  dateCreated: z.string(),
  datePaid: z.string().nullable(),
  errorCode: z.string().nullable()
});

export const StripeCallbackRefundSchema = z.object({
  amount: z.preprocess((val) => Number(val), z.number()),
  originalPaymentReference: z.string(),
  dateCreated: z.string(),
  datePaid: z.string().optional(),
  payerPaymentReference: z.string().nullable(),
  payerAlias: z.string(),
  callbackUrl: z.string(),
  currency: z.string(),
  id: z.string(),
  payeeAlias: z.string().nullable(),
  message: z.string(),
  status: z.enum(StripeRefundStatuses)
});

export const signupSchema = z
  .object({
    email: z.string().email({ message: "Felaktig email" }),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(1),
    password: z
      .string()
      .min(8, { message: "Lösenordet måste vara minst 8 tecken" })
      .max(64, { message: "Lösenordet får inte vara mer än 64 tecken" }),
    confirmPassword: z
      .string()
      .min(8, { message: "Lösenordet måste vara minst 8 tecken" })
      .max(64, { message: "Lösenordet får inte vara mer än 64 tecken" })
  })
  .refine((x) => x.confirmPassword === x.password, {
    message: "Lösenorden matchar inte"
  });

export const loginSchema = z.object({
  email: z.string().email({ message: "Felaktig email" }),
  password: z
    .string()
    .min(8, { message: "Lösenordet måste vara minst 8 tecken" })
    .max(64, { message: "Lösenordet får inte vara mer än 64 tecken" })
});

export const memberSignupSchema = z
  .object({
    firstName: z
      .string({ required_error: "Ange förnamn" })
      .min(1, { message: "Ange förnamn" }),
    lastName: z
      .string({ required_error: "Ange efternamn" })
      .min(1, { message: "Ange efternamn" }),
    email: z
      .string({ required_error: "Ange email" })
      .email({ message: "Felaktig email" }),
    acceptedTerms: z.literal<boolean>(true, {
      message: "Du måste acceptera villkoren",
      required_error: "Du måste acceptera villkoren",      
    }),
    membershipType: z.nativeEnum(MembershipType),
    membershipId: z.string({ required_error: "Välj medlemskap" }).min(1),
    phone: z
      .string({ required_error: "Ange telefonnummer" })
      .min(1, { message: "Ange telefonnummer" }),
    additionalMembers: z
      .array(
        z.object({
          firstName: z
            .string({ required_error: "Ange förnamn" })
            .min(1, { message: "Ange förnamn" }),
          lastName: z
            .string({ required_error: "Ange efternamn" })
            .min(1, { message: "Ange efternamn" }),
          phone: z.string().optional(),
          email: z
            .string({ required_error: "Ange email" })
            .email({ message: "Felaktig email" })
        })
      )
      .optional()
  })
  .refine(
    (x) => {
      // Require additional members if membership type is family
      if (x.membershipType === MembershipType.FAMILY) {
        return x.additionalMembers && x.additionalMembers.length > 0;
      }
      return true;
    },
    { message: "Familjemedlemskap kräver minst en familjemedlem" }
  );

export const profileSchema = z.object({
  firstName: z
    .string()
    .min(1, { message: "Förnamn måste vara minst 1 tecken" }),
  lastName: z
    .string()
    .min(1, { message: "Efternamn måste vara minst 1 tecken" }),
  email: z.string().email({ message: "Felaktig email" }),
  phone: z.string().min(1, { message: "Felaktigt nummer" })
});

export const updatePasswordSchema = z
  .object({
    oldPassword: z.string().min(8).max(64),
    newPassword: z.string().min(8).max(64),
    confirmPassword: z.string().min(8).max(64)
  })
  .refine((x) => x.newPassword === x.confirmPassword, {
    message: "Lösenorden matchar inte"
  });

export const updateMemberSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional()
});