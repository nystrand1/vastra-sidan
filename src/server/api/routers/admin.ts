import { MembershipType, StripePaymentStatus, type Prisma } from "~/generated/prisma/client";
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
import {
  releaseExpiredSeatHolds,
  withFreeSeat
} from "~/server/utils/busCapacity";
import { sendEventConfirmationEmail } from "~/server/utils/email/sendEventConfirmationEmail";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";
import { findOrCreateMember } from "~/server/utils/member/findOrCreateMember";
import { findOrCreateFamilyMembers, linkFamilyMembers } from "~/server/utils/member/findOrCreateFamilyMembers";
import { awayGamePaths, revalidatePages } from "~/server/utils/revalidate";
import { parseForMembershipType } from "~/server/utils/member/parseForMembershipType";
import { isMembershipOnSale } from "~/server/utils/membership";
import {
  addFamilyMemberSchema,
  adminAddMemberSchema,
  adminAddParticipantSchema,
  updateMemberSchema,
  updateParticipantSchema
} from "~/utils/zodSchemas";

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

      if (participant.busId === input.busId) {
        return "ok";
      }

      await releaseExpiredSeatHolds(ctx.prisma, ctx.stripe, participant.eventId);

      await withFreeSeat(ctx.prisma, participant.eventId, input.busId, (tx) =>
        tx.participant.update({
          where: {
            id: participant.id
          },
          data: {
            busId: input.busId
          }
        })
      );
      await revalidatePages(awayGamePaths([participant.eventId]));

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

      await releaseExpiredSeatHolds(ctx.prisma, ctx.stripe, eventId);

      const participant = await withFreeSeat(
        ctx.prisma,
        eventId,
        rest.busId,
        async (tx) => {
          const created = await tx.participant.create({
            data: {
              ...rest,
              name: `${firstName} ${lastName}`,
              userEmail: rest.email,
              payAmount: 0,
              eventId
            }
          });

          await tx.stripePayment.create({
            data: {
              stripePaymentId: `admin-comp-${created.id}`,
              amount: 0,
              status: StripePaymentStatus.SUCCEEDED,
              participants: {
                connect: [{ id: created.id }]
              }
            }
          });
          return created;
        }
      );
      await revalidatePages(awayGamePaths([eventId]));

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

      if (!isMembershipOnSale(membership)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Medlemskapet går inte att lägga till just nu"
        });
      }

      const memberInput = {
        ...parseForMembershipType(adminAddMemberSchema, input, membership.type),
        acceptedTerms: true as const
      };

      const members =
        membership.type === MembershipType.FAMILY
          ? await findOrCreateFamilyMembers(memberInput)
          : [await findOrCreateMember(memberInput)];

      // Same rule as the public signup: one membership per season
      const memberWithExistingMembership = members.find((member) =>
        member.memberships.some((x) => x.wordpressId === membership.wordpressId)
      );

      if (memberWithExistingMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Har redan detta medlemskap"
        });
      }

      const [membershipOwner] = members;
      const memberIds = members.map((member) => member.id);

      await ctx.prisma.$transaction(async (tx) => {
        if (membership.type === MembershipType.FAMILY) {
          await linkFamilyMembers(membershipOwner!.id, memberIds, tx);
        }

        await tx.stripePayment.create({
          data: {
            stripePaymentId: `admin-comp-${membershipOwner!.id}`,
            amount: 0,
            status: StripePaymentStatus.SUCCEEDED,
            members: {
              connect: memberIds.map((id) => ({ id }))
            }
          }
        });

        await tx.membership.update({
          where: { id: membership.id },
          data: {
            members: {
              connect: memberIds.map((id) => ({ id }))
            }
          }
        });
      });

      await Promise.all(
        members.map((member) => sendMemberConfirmationEmail(member, membership))
      );
    })
});
