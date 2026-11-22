import { createTRPCRouter, userProcedure } from "~/server/api/trpc";
import { getProfilePrefill } from "~/server/utils/user/getProfilePrefill";
import { profileSchema } from "~/utils/zodSchemas";

export const userRouter = createTRPCRouter({
  getProfilePrefill: userProcedure.query(({ ctx }) =>
    getProfilePrefill(ctx.prisma, ctx.session.user.email)
  ),
  updateProfile: userProcedure.input(profileSchema).mutation(async ({ ctx, input }) => {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    await ctx.prisma.user.update({
      where: { id: ctx.session.user.id },
      data: {
        firstName,
        lastName,
        phone: input.phone.trim(),
        name: `${firstName} ${lastName}`
      }
    });
    return { status: 200 as const };
  }),
  deleteAccount: userProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    // Bookings, payments, refunds and memberships stay; they are matched by email.
    await ctx.prisma.$transaction([
      ctx.prisma.session.deleteMany({ where: { userId } }),
      ctx.prisma.account.deleteMany({ where: { userId } }),
      ctx.prisma.passkey.deleteMany({ where: { userId } }),
      ctx.prisma.user.deleteMany({ where: { id: userId } })
    ]);
    return { status: 200 as const };
  })
});
