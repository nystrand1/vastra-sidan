import { z } from "zod";
import { checkPaymentStatus } from "~/server/utils/payment";
import { delay } from "~/utils/helpers";
import { memberSignupSchema } from "~/utils/zodSchemas";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { SwishPaymentStatus } from "@prisma/client";

export const memberPaymentRouter = createTRPCRouter({
  requestSwishPayment: publicProcedure
    .input(memberSignupSchema)
    .mutation(async ({ ctx, input }) => {
      await delay(1000);
      return {
        data: {
          paymentId: "1234"
        }
      }
    }),
  checkPaymentStatus: publicProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await delay(1000);
      return {
        status: SwishPaymentStatus.PAID
      }
      // return checkPaymentStatus(input.paymentId, ctx.prisma);
    }),
});