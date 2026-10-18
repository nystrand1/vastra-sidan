import { type Membership, MembershipType } from "@prisma/client";

export const friendlyMembershipNames = {
  [MembershipType.FAMILY]: "Familjemedlemskap",
  [MembershipType.REGULAR]: "Ordinarie medlemskap",
  [MembershipType.YOUTH]: "Ungdomsmedlemskap",
  [MembershipType.HONORARY]: "Hedersmedlemskap",
} as const;
/** Same window as the memberships offered for sale: started, and not yet ended. */
export const isMembershipOnSale = (
  membership: Pick<Membership, "startDate" | "endDate">,
  now = new Date()
) => membership.startDate <= now && now < membership.endDate;
