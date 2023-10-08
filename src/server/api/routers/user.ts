import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure
} from "~/server/api/trpc";
import { sha256 } from "~/server/auth";
import { signupSchema } from "~/utils/zodSchemas";


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
});
