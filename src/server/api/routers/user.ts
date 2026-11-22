import {
  StripePaymentStatus,
  StripeRefundStatus,
  type Prisma
} from "~/generated/prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, userProcedure } from "~/server/api/trpc";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { profileSchema } from "~/utils/zodSchemas";

type UserData = Prisma.UserGetPayload<{
  include: {
    eventParticipations: {
      select: {
        cancellationToken: true;
        cancellationDate: true;
        phone: true;
        event: {
          select: {
            name: true;
            date: true;
          };
        };
        stripePayments: {
          where: {
            status: "SUCCEEDED";
          };
          select: {
            createdAt: true;
            amount: true;
          };
        };
        stripeRefunds: {
          select: {
            status: true;
          };
          where: {
            status: "REFUNDED";
          };
        };
      };
      where: {
        stripePayments: {
          some: {
            status: "SUCCEEDED";
          };
        };
      };
    };
  };
}>;

const eventFormatter = (awayGame: UserData["eventParticipations"][number]) => ({
  id: awayGame.event.name,
  name: awayGame.event.name,
  date: awayGame.event.date,
  payedAt: awayGame?.stripePayments[0]?.createdAt,
  payAmount: awayGame?.stripePayments[0]
    ? awayGame?.stripePayments[0].amount / 100
    : null,
  cancellationToken: awayGame.cancellationToken,
  cancellationDate: awayGame.cancellationDate
    ? formatSwedishTime(awayGame.cancellationDate, "yyyy-MM-dd HH:mm")
    : null,
  isPayer: true // TODO: Implement this maybe
});

export const userRouter = createTRPCRouter({
  getProfile: userProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bad user"
      });
    }
    const user = await ctx.prisma.user.findUnique({
      where: {
        email: ctx.session.user.email
      },
      include: {
        eventParticipations: {
          select: {
            cancellationToken: true,
            cancellationDate: true,
            phone: true,
            event: {
              select: {
                name: true,
                date: true
              }
            },
            stripePayments: {
              select: {
                createdAt: true,
                amount: true
              },
              where: {
                status: StripePaymentStatus.SUCCEEDED
              }
            },
            stripeRefunds: {
              select: {
                status: true
              },
              where: {
                status: StripeRefundStatus.REFUNDED
              }
            }
          },
          where: {
            stripePayments: {
              some: {
                status: StripePaymentStatus.SUCCEEDED
              }
            }
          },
          orderBy: {
            event: {
              date: "desc"
            }
          }
        }
      }
    });

    return {
      upcomingEvents: user?.eventParticipations
        .filter((x) => x.event.date > new Date())
        .map(eventFormatter),
      pastEvents: user?.eventParticipations
        .filter((x) => x.event.date < new Date())
        .map(eventFormatter)
    };
  }),
  updateProfile: userProcedure
    .input(profileSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bad user"
        });
      }
      const user = await ctx.prisma.user.findFirst({
        where: {
          email: ctx.session.user.email
        }
      });
      if (!user) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bad user"
        });
      }
      await ctx.prisma.user.update({
        where: {
          email: ctx.session.user.email
        },
        data: {
          ...input
        }
      });
      return {
        status: 200
      };
    })
});
