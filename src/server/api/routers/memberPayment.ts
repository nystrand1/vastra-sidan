import { z } from "zod";
import { checkPaymentStatus } from "~/server/utils/payment";
import { delay } from "~/utils/helpers";
import { memberSignupSchema, swishCallbackPaymentSchema, swishCallbackRefundSchema } from "~/utils/zodSchemas";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { MembershipType, SwishPaymentStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createPaymentIntentPayload } from "~/utils/payment";
import { createPaymentRequest } from "~/utils/swishHelpers";
import { Resend } from "resend";
import { env } from "~/env.mjs";
import MemberSignup from "~/components/emails/MemberSignUp";

const resend = new Resend(env.RESEND_API_KEY);

const friendlyMembershipNames = {
  [MembershipType.FAMILY]: "Familjemedlemskap",
  [MembershipType.REGULAR]: "Ordinarie medlemskap",
  [MembershipType.YOUTH]: "Ungdomsmedlemskap",
}

export const memberPaymentRouter = createTRPCRouter({
  requestSwishPayment: publicProcedure
    .input(memberSignupSchema)
    .mutation(async ({ ctx, input }) => {
      const { membershipId, phone } = input;

      const membership = await ctx.prisma.membership.findUnique({
        where: {
          id: membershipId
        }
      });

      if (!membership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid membership id"
        })
      }

      // Check if user already has a membership

      const paymentIntentData = createPaymentIntentPayload({
        message: `${membership.name}, ${friendlyMembershipNames[membership.type]}`,
        amount: membership.price,
        payerAlias: phone,
        callbackEndPoint: "swishMemberCallback",
      })
      console.log(paymentIntentData);
      try {
        const res = await createPaymentRequest(paymentIntentData);
        const paymentRequestUrl = res.headers.location as string;
        // ID is the last part of the URL
        const paymentRequestId = paymentRequestUrl.split('/').pop() as string;
        // Create payment request in our database
        const paymentIntent = await ctx.prisma.swishPayment.create({
          data: {
            paymentRequestUrl,
            paymentId: paymentRequestId,
            payerAlias: phone,
            payeeAlias: paymentIntentData.payeeAlias,
            amount: membership.price,
            message: paymentIntentData.message,
            status: SwishPaymentStatus.CREATED,
            memberShipId: membershipId,
            // Connect to a user if they are logged in
          }
        })
        return {
          paymentId: paymentIntent.paymentId, 
        };
      } catch (err) {
        console.error('Error creating payment request');
        const error = err as { response: { data: any } };
        console.error(error);
        console.error(error?.response?.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        })
      }
    }),
  checkPaymentStatus: publicProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return checkPaymentStatus(input.paymentId, ctx.prisma);
    }),
  swishPaymentCallback: publicProcedure
    .input(swishCallbackPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Protect this endpoint with a secret
      console.info("SWISH PAYMENT CALLBACK", input);
      const originalPayment = await ctx.prisma.swishPayment.findFirst({
        where: {
          paymentId: input.id,
        },
        include: {
          memberShip: true,
          user: true,
        },
      });
      console.log("originalPayment", originalPayment);
      if (!originalPayment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        })
      }

      if (!originalPayment.memberShip) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Membership not found"
        })
      }

      const newPayment = await ctx.prisma.swishPayment.create({
        include: {
          memberShip: true,
          user: true,
        },
        data: {
          paymentId: input.id,
          payerAlias: input.payerAlias,
          payeeAlias: input.payeeAlias,
          amount: input.amount,
          message: input.message,
          paymentReference: input.paymentReference,
          paymentRequestUrl: originalPayment.paymentRequestUrl,
          createdAt: new Date(input.dateCreated),
          updatedAt: new Date(),
          status: input.status,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          userId: originalPayment.userId,
          memberShipId: originalPayment.memberShipId,
        }
      })

      if (newPayment.status === SwishPaymentStatus.PAID) {
        try {
          // Send confirmation email
          await resend.sendEmail({
            from: env.BOOKING_EMAIL,
            to: newPayment.user?.email || "filip.nystrand@gmail.com",
            subject: "Tack för att du blivit medlem i Västra Sidan",
            react: MemberSignup({ membership: newPayment.memberShip || originalPayment.memberShip })
          })
        } catch(error) {
          console.error("Error sending confirmation email");
          console.error(error);
          // Don't return error to Swish
        }
      }

      console.log("SWISH CALLBACK");
      console.log("input", input);
      return {
        status: 200
      }
    }),
  swishRefundCallback: publicProcedure
    .input(swishCallbackRefundSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("SWISH REFUND CALLBACK", input);
      try {
        const refundIntent = await ctx.prisma.swishRefund.findFirst({
          where: {
            refundId: input.id,
          },
        });

        if (!refundIntent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund not found"
          })
        }

        await ctx.prisma.swishRefund.create({
          include: {
            participant: true,
          },
          data: {
            refundId: input.id,
            paymentId: refundIntent.paymentId,
            payerAlias: input.payerAlias,
            payeeAlias: input.payeeAlias || refundIntent.payeeAlias,
            amount: input.amount,
            message: input.message,
            paymentReference: input.originalPaymentReference,
            createdAt: new Date(input.dateCreated),
            updatedAt: new Date(),
            status: input.status,
          }
        })

      } catch (err) {
        console.error(err);
        throw err
      }
      return "ok";
    }),
});