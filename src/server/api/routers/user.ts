import { Role, SwishPaymentStatus, SwishRefundStatus, type Membership, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { format } from "date-fns";
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
import { isSamePhoneNumber } from "~/server/utils/helpers";
import { friendlyMembershipNames } from "~/server/utils/membership";
import { profileSchema, signupSchema } from "~/utils/zodSchemas";

const membershipFormatter = (membership: Membership) => ({
  id: membership.id,
  name: membership.name,
  imageUrl: membership.imageUrl,
  type: friendlyMembershipNames[membership.type]
});



type UserData = Prisma.UserGetPayload<{
  include: {
    memberShips: {
      where: {
        swishPayments: {
          some: {
            status: "PAID"
          }
        }
      }
    },
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
        swishPayments: {
          where: {
            status: "PAID"
          },
          select: {
            createdAt: true,
            amount: true,
            payerAlias: true,
          }
        },
        swishRefunds: {
          select: {
            status: true,
          },
          where: {
            status: "PAID",
          },
        }
      },
      where: {
        swishPayments: {
          some: {
            status: "PAID"
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
  payedAt: awayGame?.swishPayments[0]?.createdAt,
  payAmount: awayGame?.swishPayments[0]?.amount,
  cancellationToken: awayGame.cancellationToken,
  cancellationDate: awayGame.cancellationDate ? format(awayGame.cancellationDate, "yyyy-MM-dd HH:mm") : null,
  isPayer: isSamePhoneNumber(awayGame.phone, awayGame.swishPayments[0]?.payerAlias || ''),
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
        memberShips: {
          where: {
            swishPayments: {
              some: {
                status: "PAID"
              }
            }
          }
        },
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
            swishPayments: {
              select: {
                createdAt: true,
                amount: true,
                payerAlias: true,
              },
              where: {
                status: SwishPaymentStatus.PAID
              },
            },
            swishRefunds: {
              select: {
                status: true,
              },
              where: {
                status: SwishRefundStatus.PAID
              },
            }
          },
          where: {
            swishPayments: {
              some: {
                status: "PAID"
              }
            },
          },
        }
      }
    });

    return {
      memberShips: user?.memberShips.map(membershipFormatter),
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
