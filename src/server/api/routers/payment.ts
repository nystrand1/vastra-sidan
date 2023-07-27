import { TRPCError } from "@trpc/server";
import { Resend } from 'resend';
import { z } from "zod";
import { env } from "~/env.mjs";
import {
  createTRPCRouter,
  publicProcedure
} from "~/server/api/trpc";
import { participantSchema } from "~/utils/zodSchemas";
import { EventSignUp } from "~/components/emails/EventSignUp";

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

      const participants = await ctx.prisma.$transaction(
        input.participants.map(({ consent: _consent, ...participant }) => (
          ctx.prisma.participant.create({
           data: {
             ...participant,
             eventId: input.eventId,
           }
         })
        ))
      );

      await delay(1000);

      const resend = new Resend(env.RESEND_API_KEY);

      const [ participant ] = participants;

      const cancellationUrl = `${env.CANCELLATION_URL}?token=${participant?.cancellationToken || ''}`;

      await resend.sendEmail({
        from: 'onboarding@resend.dev',
        to: participant?.email || 'filip.nystrand@gmail.com',
        subject: `Anmälan till ${event?.name}`,
        react: EventSignUp({ name: participant?.name || '' , cancellationUrl })
      });
      return {
        status: "ok",
      }
    }),

  cancelBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        })
      }

      await delay(1000);
      return "you can now see this secret message!";
  }),
});
