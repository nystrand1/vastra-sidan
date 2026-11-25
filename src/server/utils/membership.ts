import { type Membership, MembershipType } from "~/generated/prisma/browser";

export const friendlyMembershipNames = {
  [MembershipType.FAMILY]: "Familjemedlemskap",
  [MembershipType.REGULAR]: "Ordinarie medlemskap",
  [MembershipType.YOUTH]: "Ungdomsmedlemskap",
  [MembershipType.HONORARY]: "Hedersmedlemskap",
} as const;
export type MembershipCard = {
  id: string;
  name: string;
  imageUrl: string;
  textureUrl: string | null;
  type: string;
  expiresAt: Date;
};

export const toMembershipCard = (m: Membership): MembershipCard => ({
  id: m.id,
  name: m.name,
  imageUrl: m.imageUrl,
  textureUrl: m.textureUrl,
  type: friendlyMembershipNames[m.type],
  expiresAt: m.endDate
});

/** Splits memberships into active and expired, newest end date first. */
export const splitMemberships = (memberships: Membership[], now = new Date()) => {
  const newestFirst = [...memberships].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  return {
    active: newestFirst.filter((m) => now < m.endDate).map(toMembershipCard),
    expired: newestFirst.filter((m) => now >= m.endDate).map(toMembershipCard)
  };
};

/** Same window as the memberships offered for sale: started, and not yet ended. */
export const isMembershipOnSale = (
  membership: Pick<Membership, "startDate" | "endDate">,
  now = new Date()
) => membership.startDate <= now && now < membership.endDate;
