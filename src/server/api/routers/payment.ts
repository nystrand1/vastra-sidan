import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { participantSchema } from "~/utils/zodSchemas";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const paymentRouter = createTRPCRouter({
  submitEventForm: publicProcedure
    .input(z.object({
      eventId: z.string(),
      participants: z.array(participantSchema),
    }))
    .mutation(async ({ input, ctx }) => {
      const event = await ctx.prisma.vastraEvent.findFirst({
        where: {
          id: input.eventId
        }
      });
      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event not found"
        })
      }
      await ctx.prisma.participant.createMany({
        data: input.participants.map(({ consent: _consent, ...participant }) => ({
          ...participant,
          eventId: input.eventId,
        }))
      });
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
