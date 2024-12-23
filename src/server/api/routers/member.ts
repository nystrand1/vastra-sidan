import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { isBefore } from "date-fns";
import { friendlyMembershipNames } from "~/server/utils/membership";

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
      const activeMemberships = member.memberships.filter((m) => isBefore(new Date(), m.endDate));
      const expiredMemberships = member.memberships.filter((m) => !isBefore(new Date(), m.endDate));
      return {
        name: fullName,
        activeMemberships: activeMemberships.map((m) => ({
          id: m.id,
          name: m.name,
          imageUrl: m.imageUrl,
          textureUrl: m.textureUrl,
          type: friendlyMembershipNames[m.type],
          expiresAt: m.endDate,
        })),
        expiredMemberships: expiredMemberships.map((m) => ({
          id: m.id,
          name: m.name,
          imageUrl: m.imageUrl,
          textureUrl: m.textureUrl,
          type: friendlyMembershipNames[m.type],
          expiresAt: m.endDate,
        })),
      };
    }),

});