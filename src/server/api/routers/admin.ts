import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
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
import { formatEventParticipant, getEventParticipantById } from "~/server/utils/admin/getEventParticipantById";
import { adminEventFormatter, getEvents } from "~/server/utils/admin/getEvents";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";
import { updateMemberSchema, updateParticipantSchema } from "~/utils/zodSchemas";

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
        data: { email: input.email ?? undefined, phone: input.phone ?? undefined }
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
    })
});
