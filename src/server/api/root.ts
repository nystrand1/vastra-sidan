import { createTRPCRouter } from "~/server/api/trpc";
import { eventPaymentRouter } from "./routers/eventPayment";
import { cronRouter } from "./routers/cron";
import { adminRouter } from "./routers/admin";
import { publicRouter } from "./routers/public";
import { userRouter } from "./routers/user";
import { memberPaymentRouter } from "./routers/memberPayment";
import { wordpressRouter } from "./routers/wordpress";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  public: publicRouter,
  eventPayment: eventPaymentRouter,
  memberPayment: memberPaymentRouter,
  cron: cronRouter,
  admin: adminRouter,
  user: userRouter,
  wordpress: wordpressRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;
