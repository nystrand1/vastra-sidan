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

const membershipFormatter = (membership: Membership) => ({
  id: membership.id,
  name: membership.name,
  imageUrl: membership.imageUrl,
  type: friendlyMembershipNames[membership.type],
})


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

    await ctx.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: sha256(password),
        role: Role.USER
      }
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
      memberShips: user?.memberShips.map(membershipFormatter)
    }
  })
});
