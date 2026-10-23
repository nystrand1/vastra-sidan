import {
  MembershipType,
  Role,
  StripePaymentStatus,
  type Membership
} from "@prisma/client";
import { addDays, addMonths, subMonths } from "date-fns";
import { type z } from "zod";
import { sha256 } from "~/server/auth";
import {
  type adminAddMemberSchema,
  type memberSignupSchema,
  type participantSchema
} from "~/utils/zodSchemas";
import { prisma } from "./db";

let seq = 0;
const next = () => ++seq;

/**
 * Creates the FAMILY, REGULAR and YOUTH memberships for one season, the same
 * way the WordPress cron sync does (they share a `wordpressId`).
 */
export const createSeason = async ({
  wordpressId = `wp-season-${next()}`,
  name = "Medlemskap 2026",
  startDate = subMonths(new Date(), 1),
  endDate = addMonths(new Date(), 6),
  prices = { FAMILY: 40000, REGULAR: 25000, YOUTH: 10000 }
}: {
  wordpressId?: string;
  name?: string;
  startDate?: Date;
  endDate?: Date;
  prices?: Record<"FAMILY" | "REGULAR" | "YOUTH", number>;
} = {}) => {
  const create = (type: "FAMILY" | "REGULAR" | "YOUTH") =>
    prisma.membership.create({
      data: {
        wordpressId,
        name,
        type: MembershipType[type],
        price: prices[type],
        imageUrl: "https://wordpress.test/card.webp",
        startDate,
        endDate
      }
    });
  const [family, regular, youth] = await Promise.all([
    create("FAMILY"),
    create("REGULAR"),
    create("YOUTH")
  ]);
  return { family, regular, youth };
};

export const createExpiredSeason = () =>
  createSeason({
    name: "Medlemskap 2025",
    startDate: subMonths(new Date(), 14),
    endDate: subMonths(new Date(), 2)
  });

/**
 * Moves a season into the past. Memberships are only sold while they're
 * current, so sign up for "last season" first and end it afterwards.
 */
export const endSeason = async ({ family }: { family: Membership }) => {
  await prisma.membership.updateMany({
    where: { wordpressId: family.wordpressId },
    data: { startDate: subMonths(new Date(), 14), endDate: subMonths(new Date(), 2) }
  });
};

type MemberSignupInput = z.infer<typeof memberSignupSchema>;
type AdminAddMemberInput = z.infer<typeof adminAddMemberSchema>;
type AdditionalMember = NonNullable<MemberSignupInput["additionalMembers"]>[number];

export const familyMember = (overrides: Partial<AdditionalMember> = {}): AdditionalMember => {
  const n = next();
  return {
    firstName: `Barn${n}`,
    lastName: "Svensson",
    email: `barn${n}@test.se`,
    ...overrides
  };
};

export const memberSignupInput = (
  membership: Membership,
  overrides: Partial<MemberSignupInput> = {}
): MemberSignupInput => ({
  firstName: "Anna",
  lastName: "Svensson",
  email: `anna${next()}@test.se`,
  phone: "0701234567",
  acceptedTerms: true,
  membershipId: membership.id,
  membershipType: membership.type,
  additionalMembers:
    membership.type === MembershipType.FAMILY ? [familyMember()] : undefined,
  ...overrides
});

export const adminAddMemberInput = (
  membership: Membership,
  overrides: Partial<AdminAddMemberInput> = {}
): AdminAddMemberInput => {
  const { acceptedTerms: _acceptedTerms, ...input } = memberSignupInput(membership);
  return { ...input, ...overrides };
};

export const createEvent = async ({
  departure = addDays(new Date(), 7),
  buses = [{ name: "Buss 1", seats: 50 }],
  prices = { defaultPrice: 400, memberPrice: 300, youthPrice: 200, youthMemberPrice: 100 },
  active = true,
  refundable = true
}: {
  departure?: Date;
  buses?: { name: string; seats: number }[];
  prices?: { defaultPrice: number; memberPrice: number; youthPrice: number; youthMemberPrice: number };
  active?: boolean;
  refundable?: boolean;
} = {}) => {
  const n = next();
  return prisma.vastraEvent.create({
    data: {
      id: `event-${n}`,
      name: `Bortamatch ${n}`,
      description: "Avgång från Studenternas",
      date: departure,
      active,
      refundable,
      ...prices,
      buses: {
        create: buses.map((bus, i) => ({ id: `event-${n}-bus-${i + 1}`, ...bus }))
      }
    },
    include: { buses: { orderBy: { name: "asc" } } }
  });
};

type ParticipantInput = z.infer<typeof participantSchema>;

export const participantInput = (
  busId: string,
  overrides: Partial<ParticipantInput> = {}
): ParticipantInput => {
  const n = next();
  return {
    firstName: `Resenär${n}`,
    lastName: "Andersson",
    email: `resenar${n}@test.se`,
    phone: "0709876543",
    consent: true,
    busId,
    member: false,
    youth: false,
    ...overrides
  };
};

/**
 * Inserts a participant directly in the DB, bypassing Stripe. Use it to fill
 * up buses. `payment` controls the mirrored StripePayment status.
 */
export const createParticipant = async ({
  eventId,
  busId,
  payment = "paid"
}: {
  eventId: string;
  busId: string;
  payment?: "paid" | "pending" | "none";
}) => {
  const n = next();
  const participant = await prisma.participant.create({
    data: {
      name: `Passagerare ${n}`,
      email: `passagerare${n}@test.se`,
      phone: "0700000000",
      eventId,
      busId,
      payAmount: 400
    }
  });
  if (payment !== "none") {
    await prisma.stripePayment.create({
      data: {
        stripePaymentId: `pi_seed_${n}`,
        amount: 40000,
        status:
          payment === "paid" ? StripePaymentStatus.SUCCEEDED : StripePaymentStatus.CREATED,
        participants: { connect: { id: participant.id } }
      }
    });
  }
  return participant;
};

/** Fills `count` seats on a bus with paid passengers. */
export const fillSeats = async (eventId: string, busId: string, count: number) => {
  for (let i = 0; i < count; i++) {
    await createParticipant({ eventId, busId });
  }
};

/** A site account that can log in with `password`. */
export const createUser = async ({
  role = Role.USER,
  password = "hemligt-lösenord"
}: { role?: Role; password?: string } = {}) => {
  const n = next();
  const user = await prisma.user.create({
    data: {
      email: `user${n}@test.se`,
      firstName: "Anna",
      lastName: `Användare ${n}`,
      phone: "0700000000",
      password: sha256(password),
      role
    }
  });
  return { user, password };
};
