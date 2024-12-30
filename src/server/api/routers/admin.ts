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
import { adminEventFormatter, getEvents } from "~/server/utils/admin/getEvents";

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
    })
});
