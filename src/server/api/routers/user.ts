import { Role, StripePaymentStatus, StripeRefundStatus, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { z } from "zod";
import UserSignup from "~/components/emails/UserSignup";
import { env } from "~/env.mjs";
import {
  createTRPCRouter,
  publicProcedure,
  userProcedure
} from "~/server/api/trpc";
import { sha256 } from "~/server/auth";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { profileSchema, signupSchema } from "~/utils/zodSchemas";


type UserData = Prisma.UserGetPayload<{
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
          where: {
            status: "SUCCEEDED"
          },
          select: {
            createdAt: true,
            amount: true,
          }
        },
        stripeRefunds: {
          select: {
            status: true,
          },
          where: {
            status: "REFUNDED",
          },
        }
      },
      where: {
        stripePayments: {
          some: {
            status: "SUCCEEDED"
          }
        }
      },
    }
  }
}>

const eventFormatter = (awayGame: UserData['eventParticipations'][number]) => ({
  id: awayGame.event.name,
  name: awayGame.event.name,
  date: awayGame.event.date,
  payedAt: awayGame?.stripePayments[0]?.createdAt,
  payAmount: awayGame?.stripePayments[0] ? awayGame?.stripePayments[0].amount / 100 : null,
  cancellationToken: awayGame.cancellationToken,
  cancellationDate: awayGame.cancellationDate ? formatSwedishTime(awayGame.cancellationDate, "yyyy-MM-dd HH:mm") : null,
  isPayer: true, // TODO: Implement this maybe
})

const resend = new Resend(env.RESEND_API_KEY);

export const userRouter = createTRPCRouter({
  createNewUser: publicProcedure
    .input(signupSchema)
    .mutation(async ({ ctx, input }) => {
      const { phone, email, password, firstName, lastName } = input;

      const existingUser = await ctx.prisma.user.findFirst({
        where: {
          email
        }
      });

      if (existingUser) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email används redan"
        });
      }

      const user = await ctx.prisma.user.create({
        data: {
          email,
          phone,
          firstName,
          lastName,
          password: sha256(password),
          role: Role.USER
        }
      });

      await resend.emails.send({
        from: env.BOOKING_EMAIL,
        to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : email,
        subject: "Bekräfta email din email",
        react: UserSignup({ token: user.id })
      });
      return {
        status: 201
      };
    }),
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
                date: true,
              }
            },
            stripePayments: {
              select: {
                createdAt: true,
                amount: true,
              },
              where: {
                status: StripePaymentStatus.SUCCEEDED
              },
            },
            stripeRefunds: {
              select: {
                status: true,
              },
              where: {
                status: StripeRefundStatus.REFUNDED
              },
            }
          },
          where: {
            stripePayments: {
              some: {
                status: StripePaymentStatus.SUCCEEDED
              }
            },
          },
          orderBy: {
            event: {
              date: 'desc'
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
        .map(eventFormatter),
    };
  }),
  verifyEmail: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: input.id
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
          id: input.id
        },
        data: {
          emailVerified: new Date()
        }
      });
      return {
        status: 200
      };
    }),
  updateProfile: userProcedure
    .input(profileSchema)
    .mutation(async ({ ctx, input }) => {
      console.log('test', ctx.session.user);
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
      })
      console.log('user', ctx.session.user.email);
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
