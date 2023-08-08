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
import { createPaymentRequest, getPaymentStatus } from "~/utils/swishHelpers";

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
        from: env.BOOKING_EMAIL,
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
  requestSwishPayment: publicProcedure
    .mutation(async() => {
      await delay(1000);
      // Setup the data object for the payment
      console.info('API URL', env.API_URL);
      const data = {
        "payeePaymentReference" : "0123456789",
        "callbackUrl" : `${env.API_URL}/payment.swishCallback`,
        "payerAlias" : "4671234768",
        "payeeAlias" : "1234679304",
        "amount" : "100",
        "currency" : "SEK",
        "message" : "Kingston USB Flash Drive 8 GB"
      };

      try {
        const res = await createPaymentRequest(data);

        console.info('Payment request created');
        console.info('location', res.headers.location);
        return "ok";
      } catch (err) {
        console.error('Error creating payment request');
        const error = err as { response: { data: any } };
        console.error(error.response);
        console.error(error.response.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        })
      }


    }),
  swishCallback: publicProcedure
    .mutation(({ input }) => {
      console.log("SWISH CALLBACK");
      console.log("input", input);
    }),
  getSwishPaymentStatus: publicProcedure
    .query(async () => {
      const id = "F4DB8C8DA9BB41238459A50015154AF3"
      try {
        const res = await getPaymentStatus(id);
        console.log("res", res.data);
      } catch (err) {
        console.error(err)
      }
    })
});
