import { type NextApiRequest, type NextApiResponse } from "next";
import { appRouter } from "../../../server/api/root";
import { createTRPCContext } from "../../../server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { type swishCallbackRefundSchema, type swishCallbackPaymentSchema } from "~/utils/zodSchemas";
import { type z } from "zod";

const swishCallback = async (req: NextApiRequest, res: NextApiResponse) => {
  // Create context and caller
  const ctx = await createTRPCContext({ req, res });
  const caller = appRouter.createCaller(ctx);
  try {
    const isRefund = 'originalPaymentReference' in req.body;
    if (isRefund) {
      await caller.payment.swishRefundCallback(req.body as z.infer<typeof swishCallbackRefundSchema>);
    } else {
      // It's a payment
      await caller.payment.swishPaymentCallback(req.body as z.infer<typeof swishCallbackPaymentSchema>);
    }

    res.status(201).json("ok");

  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default swishCallback;