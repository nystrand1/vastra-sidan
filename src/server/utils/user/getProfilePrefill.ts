import { type PrismaClient } from "~/generated/prisma/client";

export type ProfilePrefill = { firstName: string; lastName: string; phone: string };

/**
 * Name and phone for a profile, from what was given for this exact (verified)
 * email: the membership (one per email), else the latest booking. Never from another email.
 */
export const getProfilePrefill = async (
  prisma: PrismaClient,
  email: string
): Promise<ProfilePrefill | null> => {
  const member = await prisma.member.findUnique({
    where: { email },
    select: { firstName: true, lastName: true, phone: true }
  });
  if (member) return member;

  const participant = await prisma.participant.findFirst({
    where: { email },
    orderBy: { event: { date: "desc" } },
    select: { name: true, phone: true }
  });
  if (!participant) return null;

  const name = participant.name.trim();
  const space = name.indexOf(" ");
  return {
    firstName: space === -1 ? name : name.slice(0, space),
    lastName: space === -1 ? "" : name.slice(space + 1).trim(),
    phone: participant.phone
  };
};
