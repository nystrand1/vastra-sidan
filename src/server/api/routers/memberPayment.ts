import { StripePaymentStatus } from "@prisma/client";
import { captureException, captureMessage } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createPaymentIntent } from "~/utils/stripeHelpers";
import { memberSignupSchema } from "~/utils/zodSchemas";
import { createTRPCRouter, membershipProcedure } from "../trpc";

export const memberPaymentRouter = createTRPCRouter({
  requestPayment: membershipProcedure
    .input(memberSignupSchema)
    .mutation(async ({ input, ctx }) => {
      const { membershipId } = input;

      const membership = await ctx.prisma.membership.findUnique({
        where: {
          id: membershipId
        }
      });

      if (!membership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid membership id"
        });
      }

      // Check if we have member(s) with this mail
      const member = await ctx.prisma.member.findFirst({
        where: {
          email: input.email
        },
        include: {
          memberships: true
        }
      });
      

      // Check if member already has this membership
      if (
        member?.memberships.find((x) => x.wordpressId === membership.wordpressId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Member already has this membership"
        });
      }

      try {
        const customerName = `${input.firstName} ${input.lastName}`;
        const paymentIntentData = await createPaymentIntent({
          amount: membership.price,
          payee: {
            email: input.email,
            name: `${input.firstName} ${input.lastName}`
          },
          description: `${membership.name} - ${customerName}`,
          metadata: {
            type: 'MEMBERSHIP'
          }
        });

        // Create payment request in our database
        await ctx.prisma.stripePayment.create({
          data: {
            stripePaymentId: paymentIntentData.id,
            amount: membership.price,
            status: StripePaymentStatus.CREATED,
            members: member ? {
              connect: {
                id: member.id
              }
            } : undefined,
          }
        });
        
        return {
          clientId: paymentIntentData.client_secret,
        };
      } catch (err) {
        console.error("Error creating payment request");
        const error = err as { response: { data: any } };
        console.error(error);
        console.error(error?.response?.data);
        captureMessage("Error creating payment request");
        captureException(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    }),
  checkPaymentStatus: membershipProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.prisma.stripePayment.findFirst({
        where: {
          stripePaymentId: input.paymentId,
          status: StripePaymentStatus.SUCCEEDED
        }
      });
      
      if (!payment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }
      return "ok";
    }),
  // swishPaymentCallback: membershipProcedure
  //   .input(swishCallbackPaymentSchema)
  //   .mutation(async ({ input, ctx }) => {
  //     // TODO: Protect this endpoint with a secret
  //     console.info("SWISH PAYMENT CALLBACK", input);
  //     const originalPayment = await ctx.prisma.swishPayment.findFirst({
  //       where: {
  //         paymentId: input.id,
  //       },
  //       include: {
  //         memberShip: true,
  //         user: true
  //       }
  //     });
  //     console.log("originalPayment", originalPayment);
  //     if (!originalPayment) {
  //       throw new TRPCError({
  //         code: "BAD_REQUEST",
  //         message: "Payment not found"
  //       });
  //     }

  //     if (!originalPayment.memberShip) {
  //       throw new TRPCError({
  //         code: "INTERNAL_SERVER_ERROR",
  //         message: "Membership not found"
  //       });
  //     }

  //     const newPayment = await ctx.prisma.swishPayment.create({
  //       include: {
  //         memberShip: true,
  //         user: true
  //       },
  //       data: {
  //         paymentId: input.id,
  //         payerAlias: input.payerAlias,
  //         payeeAlias: input.payeeAlias,
  //         amount: input.amount,
  //         message: input.message,
  //         paymentReference: input.paymentReference,
  //         paymentRequestUrl: originalPayment.paymentRequestUrl,
  //         createdAt: new Date(input.dateCreated),
  //         updatedAt: new Date(),
  //         status: input.status,
  //         errorCode: input.errorCode,
  //         errorMessage: input.errorMessage,
  //         userId: originalPayment.userId,
  //         memberShipId: originalPayment.memberShipId
  //       },
  //     });

  //     if (newPayment.status === SwishPaymentStatus.PAID) {
  //       try {
  //         if (newPayment.user && newPayment.memberShipId) {
  //           await ctx.prisma.user.update({
  //             where: {
  //               id: newPayment.user.id
  //             },
  //             data: {
  //               memberShips: {
  //                 connect: {
  //                   id: newPayment.memberShipId
  //                 }
  //               },
  //               phone: input.payerAlias
  //             }
  //           });
  //         }

  //         if (!newPayment.user?.email) {
  //           throw new TRPCError({
  //             code: "INTERNAL_SERVER_ERROR",
  //             message: "User email not found for payment id " + newPayment.id
  //           })
  //         }

  //         // Send confirmation email
  //         await resend.emails.send({
  //           from: env.BOOKING_EMAIL,
  //           to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : newPayment.user.email,
  //           subject: "Tack för att du blivit medlem i Västra Sidan",
  //           react: MemberSignup({
  //             membership: newPayment.memberShip || originalPayment.memberShip
  //           })
  //         });
  //       } catch (error) {
  //         console.error("Error sending confirmation email");
  //         console.error(error);
  //         // Don't return error to Swish
  //       }
  //     }

  //     console.log("SWISH CALLBACK");
  //     console.log("input", input);
  //     return {
  //       status: 200
  //     };
  //   }),
  // swishRefundCallback: membershipProcedure
  //   .input(swishCallbackRefundSchema)
  //   .mutation(async ({ input, ctx }) => {
  //     console.log("SWISH REFUND CALLBACK", input);
  //     try {
  //       const refundIntent = await ctx.prisma.swishRefund.findFirst({
  //         where: {
  //           refundId: input.id
  //         }
  //       });

  //       if (!refundIntent) {
  //         throw new TRPCError({
  //           code: "BAD_REQUEST",
  //           message: "Refund not found"
  //         });
  //       }

  //       await ctx.prisma.swishRefund.create({
  //         include: {
  //           participant: true
  //         },
  //         data: {
  //           refundId: input.id,
  //           paymentId: refundIntent.paymentId,
  //           payerAlias: input.payerAlias,
  //           payeeAlias: input.payeeAlias || refundIntent.payeeAlias,
  //           amount: input.amount,
  //           message: input.message,
  //           paymentReference: input.originalPaymentReference,
  //           createdAt: new Date(input.dateCreated),
  //           updatedAt: new Date(),
  //           status: input.status
  //         }
  //       });
  //     } catch (err) {
  //       console.error(err);
  //       throw err;
  //     }
  //     return "ok";
  //   })
});
