import { MembershipType } from "@prisma/client";

export const friendlyMembershipNames = {
  [MembershipType.FAMILY]: "Familjemedlemskap",
  [MembershipType.REGULAR]: "Ordinarie medlemskap",
  [MembershipType.YOUTH]: "Ungdomsmedlemskap",
  [MembershipType.HONORARY]: "Hedersmedlemskap",
} as const;