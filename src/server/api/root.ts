import { exampleRouter } from "~/server/api/routers/example";
import { createTRPCRouter } from "~/server/api/trpc";
import { wordpressRouter } from "./routers/wordpress";
import { paymentRouter } from "./routers/payment";
import { cronRouter } from "./routers/cron";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  wordpress: wordpressRouter,
  payment: paymentRouter,
  cron: cronRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
