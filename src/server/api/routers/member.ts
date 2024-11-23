import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const memberRouter = createTRPCRouter({
  getMember: publicProcedure
    .input(z.object({ memberToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.prisma.member.findUnique({
        where: {
          memberToken: input.memberToken
        },
        include: {
          memberships: true
        }
      });
      console.log(member);
      if (!member) {
        return null;
      }

      return member;
    }),

});