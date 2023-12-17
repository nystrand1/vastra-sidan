import { type Prisma, SwishPaymentStatus, SwishRefundStatus } from "@prisma/client";
import { format } from "date-fns";
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { isEventCancelable } from "~/server/utils/event";
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
    phone: true,
    email: true,
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

export type AdminUserProfile = Prisma.UserGetPayload<{
  select: {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    eventParticipations: {
      include: {
        event: true,
        swishPayments: true,
        swishRefunds: true,
      }
    },
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
    id: true
  }
}>

const adminUserFormatter = (user: User) => ({
  name: `${user.firstName} ${user.lastName}`,
  id: user.id,
  activeMembershipType: user.memberShips[0] ? friendlyMembershipNames[user.memberShips[0].type] : "Inget medlemskap",
  datePaid: user.memberShips[0]?.swishPayments[0] ? format(user.memberShips[0].swishPayments[0].createdAt, "yyyy-MM-dd HH:mm") : "Inget medlemskap",
  phone: user.phone,
  email: user.email,
});

const adminEventFormatter = (awayGame: AdminUserProfile['eventParticipations'][number]) => ({
  id: awayGame.event.name,
  name: awayGame.event.name,
  date: awayGame.event.date,
  payedAt: awayGame?.swishPayments[0]?.createdAt ? format(awayGame?.swishPayments[0]?.createdAt, "yyyy-MM-dd HH:mm") : null,
  payAmount: awayGame?.swishPayments[0]?.amount,
  hasCancelled: awayGame?.swishRefunds.length > 0,
  isCancelable: isEventCancelable(awayGame.event.date),
  cancellationToken: awayGame.cancellationToken,
  cancellationDate: awayGame.cancellationDate ? format(awayGame.cancellationDate, "yyyy-MM-dd HH:mm") : null,
});

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
          phone: true,
          email: true,
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
      return [...res, ...res, ...res, ...res].map(adminUserFormatter);
    }),
    getMemberById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const res = await ctx.prisma.user.findFirst({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          eventParticipations: {
            include: {
              event: true,
              swishPayments: true,
              swishRefunds: true,
            }
          },
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
          id: input.id
        }
      });

      if (!res) {
        return null;
      }
      return {
        ...adminUserFormatter(res),
        ...res,
        upcomingEvents: res.eventParticipations.filter((x) => x.event.date > new Date()).map(adminEventFormatter),
        pastEvents: res.eventParticipations.filter((x) => x.event.date < new Date()).map(adminEventFormatter),
      };
    }),
});
