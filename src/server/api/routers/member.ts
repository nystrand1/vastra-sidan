import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { isBefore } from "date-fns";
import { friendlyMembershipNames } from "~/server/utils/membership";
import { getActiveMember } from "~/server/utils/admin/getActiveMember";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";

const sortByDateDesc = <T extends { endDate: Date }>(a: T, b: T) => {
  return b.endDate.getTime() - a.endDate.getTime();
};

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

      const fullName = `${member.firstName} ${member.lastName}`;
      const activeMemberships = member.memberships
        .filter((m) => isBefore(new Date(), m.endDate))
        .sort(sortByDateDesc);
      const expiredMemberships = member.memberships
        .filter((m) => !isBefore(new Date(), m.endDate))
        .sort(sortByDateDesc);
      return {
        name: fullName,
        activeMemberships: activeMemberships.map((m) => ({
          id: m.id,
          name: m.name,
          imageUrl: m.imageUrl,
          textureUrl: m.textureUrl,
          type: friendlyMembershipNames[m.type],
          expiresAt: m.endDate
        })),
        expiredMemberships: expiredMemberships.map((m) => ({
          id: m.id,
          name: m.name,
          imageUrl: m.imageUrl,
          textureUrl: m.textureUrl,
          type: friendlyMembershipNames[m.type],
          expiresAt: m.endDate
        }))
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
