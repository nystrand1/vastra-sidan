import { exampleRouter } from "~/server/api/routers/example";
import { createTRPCRouter } from "~/server/api/trpc";
import { wordpressRouter } from "./routers/wordpress";
import { paymentRouter } from "./routers/payment";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  wordpress: wordpressRouter,
  payment: paymentRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
