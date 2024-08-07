import { prisma } from "../server/db";
import { getSession } from "next-auth/react";
import { appRouter } from "../server/api/root";
import superjson from "superjson";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { apolloClient } from "~/server/utils/apolloClient";
import { stripe } from "~/server/stripe";

export const createSSRHelper = async () =>
  createServerSideHelpers({
    router: appRouter,
    ctx: {
      session: await getSession(),
      prisma: prisma,
      stripe: stripe,
      cronKey: "",
      apolloClient,
    },
    transformer: superjson // optional - adds superjson serialization
  });
