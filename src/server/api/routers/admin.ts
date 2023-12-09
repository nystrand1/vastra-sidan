import { type Prisma, SwishPaymentStatus, SwishRefundStatus } from "@prisma/client";
import { format } from "date-fns";
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { friendlyMembershipNames } from "~/server/utils/membership";

const busesWithPaidPassengers = {
  buses: {
    include: {
      passengers: {
        where: {
          swishPayments: {
            some: {
              status: SwishPaymentStatus.PAID
            }
          },
          swishRefunds: {
            none: {
              status: SwishRefundStatus.PAID
            }
          }
        }
      }
    }
  }
};

export type User = Prisma.UserGetPayload<{
  select: {
    id: true,
    firstName: true,
    lastName: true,
    memberShips: {
      select: {
        type: true,
        swishPayments: {
          select: {
            createdAt: true
          }
        }
      }
    }
  },
  where: {
    memberShips: {
      some: {
        endDate: {
          gte: true,
        },
        swishPayments: {
          some: {
            status: "PAID"
          }
        }
      }
    }
  }
}>;

const userFormatter = (user: User) => ({
  name: `${user.firstName} ${user.lastName}`,
  id: user.id,
  activeMembershipType: user.memberShips[0] ? friendlyMembershipNames[user.memberShips[0].type] : "Inget medlemskap",
  datePaid: user.memberShips[0]?.swishPayments[0] ? format(user.memberShips[0].swishPayments[0].createdAt, "yyyy-MM-dd hh:mm") : "Inget medlemskap",
})

export const adminRouter = createTRPCRouter({
  getEvents: adminProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: busesWithPaidPassengers
    });
    return {
      upcomingEvents: res.filter((event) => event.date > new Date()),
      pastEvents: res.filter((event) => event.date <= new Date())
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
  getActiveMembers: adminProcedure
    .query(async ({ ctx }) => {
      const res = await ctx.prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberShips: {
            select: {
              type: true,
              swishPayments: {
                select: {
                  createdAt: true
                }
              }
            }
          }
        },
        where: {
          memberShips: {
            some: {
              endDate: {
                gte: new Date()
              },
              swishPayments: {
                some: {
                  status: "PAID"
                }
              }
            }
          }
        }
      });
      return [...res, ...res, ...res, ...res].map(userFormatter);
    })
});
