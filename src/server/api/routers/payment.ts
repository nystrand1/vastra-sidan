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
import { PAYMENT_STATUS, createPaymentRequest, getPaymentStatus } from "~/utils/swishHelpers";
import { PrismaClient, VastraEvent } from "@prisma/client";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

type ParticipantInput = z.infer<typeof participantSchema>;

const calculateCost = (participants: ParticipantInput[], event: VastraEvent) => {
  const youthMember = participants.filter(p => p.youth && p.member).length;
  const member = participants.filter(p => p.member && !p.youth).length;
  const youth = participants.filter(p => p.youth && !p.member).length;
  const nonMember = participants.length - member - youth - youthMember;
  return member * event.memberPrice
    + youth * event.youthPrice
    + nonMember * event.defaultPrice
    + youthMember * event.youthMemberPrice;

}

const pollPaymentStatus = async (id: string, url: string, prisma: PrismaClient, attempt = 0) => {
  if (attempt > 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment timed out"
    })
  }
  const status = await getPaymentStatus(url) as { data: { status: string }};
  if (status.data.status === PAYMENT_STATUS.PAID) {
    const payment = await prisma.swishPayment.findFirst({
      where: {
        id
      }
    });
    if (!payment) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Participant not found"
      })
    }
    await prisma.swishPayment.update({
      where: {
        id: payment.id
      },
      data: {
        status: PAYMENT_STATUS.PAID
      }
    });
  } else {
    await delay(1000);
    await pollPaymentStatus(id, url, prisma, attempt + 1);
  }
};

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
    .input(z.object({
      participants: participantSchema.array().min(1),
      eventId: z.string(),
    }))
    .mutation(async({ input, ctx }) => {
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
      await delay(1000);


      const cost = calculateCost(input.participants, event);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const payer = input.participants[0]!
      // Setup the data object for the payment
      const message = `${event.name}. ${input.participants.length} resenärer`.slice(0, 50).replaceAll('/', '-');
      const data = {
        "payeePaymentReference" : "0123456789",
        "callbackUrl" : `${env.API_URL}/payment.swishCallback`,
        "payerAlias" : payer.phone,
        "payeeAlias" : "1234679304",
        "amount" : cost,
        "currency" : "SEK",
        "message" : message
      };

      try {
        const res = await createPaymentRequest(data);
        const paymentRequestUrl = res.headers.location as string;

        const swishPayment = await ctx.prisma.swishPayment.create({
          data: {
            paymentRequestUrl,
            payerAlias: payer.phone,
            payeeAlias: "1234679304",
            amount: cost,
            message: message,
            status: PAYMENT_STATUS.CREATED,
          }
        });

        const paymentRequestId = paymentRequestUrl.split('/').pop() as string;

        const paymentStatus = await pollPaymentStatus(swishPayment.id, paymentRequestId, ctx.prisma);
        console.log("paymentStatus", paymentStatus);
        console.info('Payment request created');
        return {
          status: 201
        };
      } catch (err) {
        console.error('Error creating payment request');
        const error = err as { response: { data: any } };
        console.error(error?.response?.data);
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
