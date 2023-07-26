import { createTRPCRouter } from "~/server/api/trpc";
import { paymentRouter } from "./routers/payment";
import { cronRouter } from "./routers/cron";
import { adminRouter } from "./routers/admin";
import { publicRouter } from "./routers/public";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  public: publicRouter,
  payment: paymentRouter,
  cron: cronRouter,
  admin: adminRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;
