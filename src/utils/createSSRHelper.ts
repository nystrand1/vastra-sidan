import { prisma } from "../server/db";
import { appRouter } from "../server/api/root";
import superjson from "superjson";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { TRPCError } from "@trpc/server";
import { apolloClient } from "~/server/utils/apolloClient";
import { stripe } from "~/server/stripe";

export const createSSRHelper = () =>
  createServerSideHelpers({
    router: appRouter,
    ctx: {
      // Static generation has no request, so there is never a session here
      session: null,
      prisma: prisma,
      stripe: stripe,
      cronKey: "",
      apolloClient,
    },
    transformer: superjson // optional - adds superjson serialization
  });

/** How long a 404 for an unknown slug is cached, so bots and old links don't regenerate it on every hit. */
export const NOT_FOUND_REVALIDATE = 3600;

/** Whether a procedure called through the SSR helper threw NOT_FOUND. */
export const isNotFoundError = (err: unknown) =>
  err instanceof TRPCError && err.code === "NOT_FOUND";
