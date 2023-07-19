import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const paymentRouter = createTRPCRouter({
  submitEventForm: publicProcedure
    .input(z.any())
    .mutation(async () => {
      await delay(1000);
      return {
        status: "ok",
      }
    }),

  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.example.findMany();
  }),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
});
