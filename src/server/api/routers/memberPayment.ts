import { StripePaymentStatus } from "@prisma/client";
import { captureException, captureMessage } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { findOrCreateMember } from "~/server/utils/member/findOrCreateMember";
import { createPaymentIntent } from "~/utils/stripeHelpers";
import { memberSignupSchema } from "~/utils/zodSchemas";
import { createTRPCRouter, membershipProcedure } from "../trpc";
import { findOrCreateFamilyMembers } from "~/server/utils/member/findOrCreateFamilyMembers";

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
          message: "Felaktigt medlemskap"
        });
      }

      let members = [] as Awaited<ReturnType<typeof findOrCreateMember>>[];

      if (membership.type === "FAMILY") {
        members = await findOrCreateFamilyMembers(input);
      } else {
        const member = await findOrCreateMember(input)
        members = [member];
      }

      const memberWithExistingMembership = members.find((member) => {
        return member.memberships.find((x) => x.wordpressId === membership.wordpressId);
      });
      // Check if member already has this membership
      if (memberWithExistingMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Du har redan detta medlemskap"
        });
      }

      try {
        const [membershipOwner] = members;
        const customerName = `${input.firstName} ${input.lastName}`;
        const paymentIntentData = await createPaymentIntent({
          amount: membership.price,
          payee: {
            email: input.email,
            name: `${input.firstName} ${input.lastName}`
          },
          description: `${membership.name} - ${customerName}`,
          metadata: {
            type: 'MEMBERSHIP',
            membershipId: membership.id,
            membershipOwnerId: membershipOwner?.id || ''
          }
        });


        // Create payment request in our database
        await ctx.prisma.stripePayment.create({
          data: {
            stripePaymentId: paymentIntentData.id,
            amount: membership.price,
            status: StripePaymentStatus.CREATED,
            members: {
              connect: members.map((member) => ({ id: member.id }))
            }
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
});
