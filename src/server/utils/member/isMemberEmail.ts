import { type PrismaClient } from "~/generated/prisma/client";
import { normaliseEmail } from "~/utils/email";

/** Whether the member with this email has a membership that hasn't ended yet. */
export const isMemberEmail = async (db: PrismaClient, email: string): Promise<boolean> => {
  const member = await db.member.findFirst({
    where: {
      email: normaliseEmail(email),
      memberships: { some: { endDate: { gte: new Date() } } }
    },
    select: { id: true }
  });
  return member !== null;
};
