import {
  StripePaymentStatus,
  StripeRefundStatus,
  type Prisma
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { formatActiveMember, getActiveMember } from "~/server/utils/admin/getActiveMember";
import {
  adminMemberFormatter,
  getActiveMembers
} from "~/server/utils/admin/getActiveMembers";

const busesWithPaidPassengers = {
  buses: {
    include: {
      passengers: {
        where: {
          stripePayments: {
            some: {
              status: StripePaymentStatus.SUCCEEDED
            }
          },
          stripeRefunds: {
            none: {
              status: StripeRefundStatus.REFUNDED
            }
          }
        }
      }
    }
  }
};

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
  getEvents: adminProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: busesWithPaidPassengers
    });
    return {
      upcomingEvents: res
        .filter((event) => event.date > new Date())
        .map((event) => ({
          ...event,
          amountYouthNonMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => passenger.youth && !passenger.member
              ).length,
            0
          ),
          amountAdultNonMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => !passenger.youth && !passenger.member
              ).length,
            0
          ),
          amountYouthMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => passenger.youth && passenger.member
              ).length,
            0
          ),
          amountAdultMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => !passenger.youth && passenger.member
              ).length,
            0
          )
        })),
      pastEvents: res
        .filter((event) => event.date <= new Date())
        .map((event) => ({
          ...event,
          amountYouthNonMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => passenger.youth && !passenger.member
              ).length,
            0
          ),
          amountAdultNonMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => !passenger.youth && !passenger.member
              ).length,
            0
          ),
          amountYouthMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => passenger.youth && passenger.member
              ).length,
            0
          ),
          amountAdultMember: event.buses.reduce(
            (acc, bus) =>
              acc +
              bus.passengers.filter(
                (passenger) => !passenger.youth && passenger.member
              ).length,
            0
          )
        }))
    };
  }),
  getEvent: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const res = await ctx.prisma.vastraEvent.findFirst({
        where: {
          id: input.id
        },
        include: busesWithPaidPassengers
      });
      return res;
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
      const member = await getActiveMember(input.id)
      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        })
      }
      return {
        ...formatActiveMember(member),
      };
    })
});
