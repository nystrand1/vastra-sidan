import { type Membership, Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  userProcedure
} from "~/server/api/trpc";
import { sha256 } from "~/server/auth";
import { signupSchema } from "~/utils/zodSchemas";
import { friendlyMembershipNames } from "./memberPayment";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "~/env.mjs";
import UserSignup from "~/components/emails/UserSignup";

const membershipFormatter = (membership: Membership) => ({
  id: membership.id,
  name: membership.name,
  imageUrl: membership.imageUrl,
  type: friendlyMembershipNames[membership.type],
})

const resend = new Resend(env.RESEND_API_KEY);

export const userRouter = createTRPCRouter({
  createNewUser: publicProcedure
  .input(signupSchema)
  .mutation(async ({ ctx, input }) => {
    const { email, password, firstName, lastName } = input;

    const existingUser = await ctx.prisma.user.findFirst({
      where: {
        email
      }
    })

    if (existingUser) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Email används redan'
      })
    }

    const user = await ctx.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: sha256(password),
        role: Role.USER
      }
    })

    await resend.sendEmail({
      from: env.BOOKING_EMAIL,
      to: email,
      subject: 'Bekräfta email din email',
      react: UserSignup({ token: user.id })
    })
    return {
      status: 201
    }
  }),
  getProfile: userProcedure
  .query(async ({ ctx }) => {
    if (!ctx.session.user.email) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Bad user'
      })
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
                status: 'PAID'
              }
            }
          }
        }
      }
    })

    return {
      memberShips: user?.memberShips.map(membershipFormatter),
    }
  }),
  verifyEmail: publicProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: {
        id: input.id
      }
    })
    if (!user) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Bad user'
      })
    }
    await ctx.prisma.user.update({
      where: {
        id: input.id
      },
      data: {
        emailVerified: new Date()
      }
    })
    return {
      status: 200
    }
  }),
});
