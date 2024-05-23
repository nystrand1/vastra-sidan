import { z } from "zod";
import { createTRPCRouter, membershipProcedure } from "../trpc";

export const memberPaymentRouter = createTRPCRouter({
  requestSwishPayment: membershipProcedure
    .mutation(({ ctx, input }) => {
      return {
        paymentId: '1234',
      };
      // const { membershipId, phone } = input;

      // const membership = await ctx.prisma.membership.findUnique({
      //   where: {
      //     id: membershipId
      //   }
      // });

      // if (!membership) {
      //   throw new TRPCError({
      //     code: "BAD_REQUEST",
      //     message: "Invalid membership id"
      //   });
      // }

      // // Check if we have user(s) with this mail
      // const user = await ctx.prisma.user.findUnique({
      //   where: {
      //     email: input.email
      //   },
      //   include: {
      //     memberShips: {
      //       include: {
      //         swishPayments: {
      //           where: {
      //             status: SwishPaymentStatus.PAID
      //           }
      //         }
      //       }
      //     }
      //   }
      // });

      // // Check if user already has a membership
      // if (
      //   user?.memberShips.find((x) => x.wordpressId === membership.wordpressId)
      // ) {
      //   throw new TRPCError({
      //     code: "BAD_REQUEST",
      //     message: "User already has this membership"
      //   });
      // }

      // const paymentIntentData = createPaymentIntentPayload({
      //   message: `${membership.name}, ${
      //     friendlyMembershipNames[membership.type]
      //   }`,
      //   amount: membership.price,
      //   payerAlias: phone,
      //   callbackEndPoint: "swishMemberCallback"
      // });

      // try {
      //   const res = await createPaymentRequest(paymentIntentData);
      //   const paymentRequestUrl = res.headers.location as string;
      //   // ID is the last part of the URL
      //   const paymentRequestId = paymentRequestUrl.split("/").pop() as string;
      //   // Create payment request in our database
      //   const paymentIntent = await ctx.prisma.swishPayment.create({
      //     data: {
      //       paymentRequestUrl,
      //       paymentId: paymentRequestId,
      //       payerAlias: phone,
      //       payeeAlias: paymentIntentData.payeeAlias,
      //       amount: membership.price,
      //       message: paymentIntentData.message,
      //       status: SwishPaymentStatus.CREATED,
      //       memberShipId: membershipId,
      //       userId: user?.id
      //       // Connect to a user if they are logged in
      //     }
      //   });
      //   return {
      //     paymentId: paymentIntent.paymentId
      //   };
      // } catch (err) {
      //   console.error("Error creating payment request");
      //   const error = err as { response: { data: any } };
      //   console.error(error);
      //   console.error(error?.response?.data);
      //   throw new TRPCError({
      //     code: "INTERNAL_SERVER_ERROR"
      //   });
      // }
    }),
  checkPaymentStatus: membershipProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(({ ctx, input }) => {
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
