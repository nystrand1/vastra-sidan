import { type MembershipType } from "~/generated/prisma/client";
import { TRPCError } from "@trpc/server";
import { type z } from "zod";

type SignupSchema = z.ZodType<{ membershipType: MembershipType }, z.ZodTypeDef, unknown>;

/**
 * The signup schemas validate family rules against the client-supplied
 * `membershipType`. Re-validate the input against the membership's real type
 * from the database, so a client can't skip the family rules.
 */
export const parseForMembershipType = <T extends SignupSchema>(
  schema: T,
  input: z.output<T>,
  membershipType: MembershipType
): z.output<T> => {
  const result = schema.safeParse({ ...input, membershipType });

  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: result.error.issues[0]?.message ?? "Felaktiga uppgifter"
    });
  }

  return result.data;
};
