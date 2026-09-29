import { MembershipType, StripePaymentStatus, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { addFamilyMember } from "~/server/utils/admin/addFamilyMember";
import {
  formatActiveMember,
  getActiveMember
} from "~/server/utils/admin/getActiveMember";
import {
  adminMemberFormatter,
  getActiveMembers
} from "~/server/utils/admin/getActiveMembers";
import {
  adminSingleEventFormatter,
  getEvent
} from "~/server/utils/admin/getEvent";
import {
  formatEventParticipant,
  getEventParticipantById
} from "~/server/utils/admin/getEventParticipantById";
import { adminEventFormatter, getEvents } from "~/server/utils/admin/getEvents";
import { sendEventConfirmationEmail } from "~/server/utils/email/sendEventConfirmationEmail";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";
import { findOrCreateMember } from "~/server/utils/member/findOrCreateMember";
import { findOrCreateFamilyMembers } from "~/server/utils/member/findOrCreateFamilyMembers";
import {
  addFamilyMemberSchema,
  adminAddMemberSchema,
  adminAddParticipantSchema,
  updateMemberSchema,
  updateParticipantSchema
} from "~/utils/zodSchemas";
import { busesWithPaidPassengers } from "./public";
import { captureMessage } from "@sentry/nextjs";

export type AdminUserProfile = Prisma.UserGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    phone: true;
    email: true;
    eventParticipations: {
      include: {
        event: true;
        stripePayments: true;
        stripeRefunds: true;
      };
    };
    memberShips: {
      select: {
        type: true;
        stripePayments: {
          select: {
            createdAt: true;
          };
        };
      };
    };
  };
  where: {
    id: true;
  };
}>;

export const adminRouter = createTRPCRouter({
  getEvents: adminProcedure.query(async () => {
    const events = await getEvents();
    return events.map(adminEventFormatter);
  }),
  getEvent: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const event = await getEvent(input.id);
      return adminSingleEventFormatter(event);
    }),
  checkInParticipant: adminProcedure
    .input(z.object({ id: z.string(), checkedIn: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.prisma.participant.update({
        where: {
          id: input.id
        },
        data: {
          checkedIn: input.checkedIn
        }
      });
      return res.checkedIn;
    }),
  getActiveMembers: adminProcedure.query(async () => {
    const activeMembers = await getActiveMembers();
    return activeMembers.map(adminMemberFormatter);
  }),
  getEventParticipantById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const participant = await getEventParticipantById(input.id);
      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Participant not found"
        });
      }
      return formatEventParticipant(participant);
    }),
  changeBus: adminProcedure
    .input(z.object({ busId: z.string(), participantId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findUnique({
        where: {
          id: input.participantId
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      const bus = await ctx.prisma.bus.findFirst({
        where: {
          id: input.busId
        },
        include: busesWithPaidPassengers.buses.include
      });

      if (!bus) {
        captureMessage("Bus not found");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bus not found"
        });
      }

      const availableSeats = bus.seats - bus._count.passengers;

      if (!availableSeats) {
        captureMessage("Bus is full");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bus is full"
        });
      }

      await ctx.prisma.participant.update({
        where: {
          id: participant.id
        },
        data: {
          busId: input.busId
        }
      });

      return "ok";
    }),
  updateEventParticipant: adminProcedure
    .input(updateParticipantSchema)
    .mutation(async ({ input, ctx }) => {
      const participant = await getEventParticipantById(input.id);
      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Participant not found"
        });
      }
      await ctx.prisma.participant.update({
        where: { id: input.id },
        data: {
          email: input.email ?? undefined,
          phone: input.phone ?? undefined
        }
      });
    }),
  getMemberById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const member = await getActiveMember(input.id);
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found"
        });
      }
      return {
        ...formatActiveMember(member)
      };
    }),
  sendMemberLink: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const member = await getActiveMember(input.id);
      if (!member || !member.memberships[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found"
        });
      }
      await sendMemberConfirmationEmail(member, member.memberships[0]);
    }),
  sendParticipantEmail: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const participant = await getEventParticipantById(input.id);
      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Participant not found"
        });
      }
      await sendEventConfirmationEmail(participant);
    }),
  updateMember: adminProcedure
    .input(updateMemberSchema)
    .mutation(async ({ input, ctx }) => {
      await ctx.prisma.member.update({
        where: { id: input.id },
        data: {
          email: input.email ?? undefined,
          phone: input.phone ?? undefined
        }
      });
    }),
  addFamilyMember: adminProcedure
    .input(addFamilyMemberSchema)
    .mutation(async ({ input }) => {
      await addFamilyMember(input);
    }),
  addParticipant: adminProcedure
    .input(adminAddParticipantSchema)
    .mutation(async ({ input, ctx }) => {
      const { firstName, lastName, eventId, ...rest } = input;

      const bus = await ctx.prisma.bus.findFirst({
        where: {
          id: rest.busId
        },
        include: busesWithPaidPassengers.buses.include
      });

      if (!bus) {
        captureMessage("Bus not found");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bus not found"
        });
      }

      const availableSeats = bus.seats - bus._count.passengers;

      if (!availableSeats) {
        captureMessage("Bus is full");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bus is full"
        });
      }

      const participant = await ctx.prisma.participant.create({
        data: {
          ...rest,
          name: `${firstName} ${lastName}`,
          userEmail: rest.email,
          payAmount: 0,
          eventId
        }
      });

      await ctx.prisma.stripePayment.create({
        data: {
          stripePaymentId: `admin-comp-${participant.id}`,
          amount: 0,
          status: StripePaymentStatus.SUCCEEDED,
          participants: {
            connect: [{ id: participant.id }]
          }
        }
      });

      const participantWithRelations = await ctx.prisma.participant.findUniqueOrThrow({
        where: { id: participant.id },
        include: {
          event: true,
          bus: true
        }
      });

      await sendEventConfirmationEmail(participantWithRelations);
    }),
  getAvailableMemberships: adminProcedure.query(async ({ ctx }) => {
    const today = new Date();
    return ctx.prisma.membership.findMany({
      where: {
        endDate: { gt: today },
        startDate: { lte: today }
      },
      select: {
        id: true,
        name: true,
        type: true,
        price: true,
        imageUrl: true
      },
      orderBy: {
        endDate: "desc"
      }
    });
  }),
  addMember: adminProcedure
    .input(adminAddMemberSchema)
    .mutation(async ({ input, ctx }) => {
      const membership = await ctx.prisma.membership.findUnique({
        where: { id: input.membershipId }
      });

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Medlemskap hittades inte"
        });
      }

      const memberInput = { ...input, acceptedTerms: true as const };

      const members =
        membership.type === MembershipType.FAMILY
          ? await findOrCreateFamilyMembers(memberInput)
          : [await findOrCreateMember(memberInput)];

      const memberWithExistingMembership = members.find((member) =>
        member.memberships.some((x) => x.id === membership.id)
      );

      if (memberWithExistingMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Har redan detta medlemskap"
        });
      }

      await ctx.prisma.stripePayment.create({
        data: {
          stripePaymentId: `admin-comp-${members[0]!.id}`,
          amount: 0,
          status: StripePaymentStatus.SUCCEEDED,
          members: {
            connect: members.map((member) => ({ id: member.id }))
          }
        }
      });

      await ctx.prisma.membership.update({
        where: { id: membership.id },
        data: {
          members: {
            connect: members.map((member) => ({ id: member.id }))
          }
        }
      });

      await Promise.all(
        members.map((member) => sendMemberConfirmationEmail(member, membership))
      );
    })
});
