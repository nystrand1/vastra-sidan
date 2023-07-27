import { z } from "zod";
import {
  createTRPCRouter,
  adminProcedure,
} from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  getEvents: adminProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: {
        buses: {
          include: {
            passengers: true,
          }
        }
      }
    });
    return res;
  }),
  getEvent: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
    const res = await ctx.prisma.vastraEvent.findFirst({
      where: {
        id: input.id,
      },
      include: {
        buses: {
          include: {
            passengers: true,
          }
        }
      }
    });
    return res;
  })
});
