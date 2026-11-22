import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { splitMemberships } from "~/server/utils/membership";
import { getActiveMember } from "~/server/utils/admin/getActiveMember";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";

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
      if (!member) {
        return null;
      }

      const { active, expired } = splitMemberships(member.memberships);
      return {
        name: `${member.firstName} ${member.lastName}`,
        activeMemberships: active,
        expiredMemberships: expired
      };
    }),
  sendMembershipLink: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.member.findUnique({
        select: {
          id: true
        },
        where: {
          email: input.email
        }
      });
      if (!member) {
        return null;
      }

      const activeMember = await getActiveMember(member.id);
      if (!activeMember || !activeMember.memberships[0]) {
        return null;
      }

      await sendMemberConfirmationEmail(
        activeMember,
        activeMember.memberships[0]
      );

      return "ok";
    })
});
