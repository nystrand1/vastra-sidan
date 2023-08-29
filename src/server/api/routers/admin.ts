import { SwishPaymentStatus, SwishRefundStatus } from "@prisma/client";
import { z } from "zod";
import {
  createTRPCRouter,
  adminProcedure,
} from "~/server/api/trpc";

const busesWithPaidPassengers = {
  buses: {
    include: {
      passengers: {
        where: {
          swishPayments: {
            some: {
              status: SwishPaymentStatus.PAID,
            }
          },
          swishRefunds: {
            none: {
              status: SwishRefundStatus.PAID,
            }
          }
        }
      }
    }
  }
}

export const adminRouter = createTRPCRouter({
  getEvents: adminProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: busesWithPaidPassengers,
    });
    return res;
  }),
  getEvent: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
    const res = await ctx.prisma.vastraEvent.findFirst({
      where: {
        id: input.id,
      },
      include: busesWithPaidPassengers,
    });
    return res;
  }),
  checkInParticipant: adminProcedure
    .input(z.object({ id: z.string(), checkedIn: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.prisma.participant.update({
        where: {
          id: input.id,
        },
        data: {
          checkedIn: input.checkedIn
        }
      });
      return res.checkedIn;
    })
});
