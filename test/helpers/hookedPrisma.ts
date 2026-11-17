import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "~/generated/prisma/client";
import { appRouter } from "~/server/api/root";
import { createCallerFactory, createInnerTRPCContext } from "~/server/api/trpc";

type Hook = (sql: string) => Promise<void>;

/** Runs `hook` before every query and statement, including those inside transactions. */
const withHook = <T extends object>(target: T, hook: Hook): T =>
  new Proxy(target, {
    get(obj, prop, receiver) {
      const value: unknown = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "queryRaw" || prop === "executeRaw") {
        return async (query: { sql: string }) => {
          await hook(query.sql);
          return (value as (q: unknown) => Promise<unknown>).call(obj, query);
        };
      }
      if (prop === "startTransaction") {
        return async (...args: unknown[]) =>
          withHook(
            await (value as (...a: unknown[]) => Promise<object>).apply(
              obj,
              args
            ),
            hook
          );
      }
      return (value as (...a: unknown[]) => unknown).bind(obj);
    }
  });

/**
 * A separate Prisma client that calls `hook` with each SQL statement before running it. A test
 * can use it to make something else commit at an exact point inside a router call, for example
 * between a lookup and the reads that follow it. Disconnect it when the test is done.
 */
export const createHookedPrisma = (hook: Hook) => {
  const factory = new PrismaMariaDb(process.env.DATABASE_URL!);
  const hooked = {
    provider: factory.provider,
    adapterName: factory.adapterName,
    connect: async () => withHook(await factory.connect(), hook)
  };
  return new PrismaClient({ adapter: hooked as unknown as PrismaMariaDb });
};

/** An anonymous visitor whose requests use `client` instead of the app's Prisma client. */
export const publicCallerUsing = (client: PrismaClient) =>
  createCallerFactory(appRouter)({
    ...createInnerTRPCContext({
      session: null,
      cronKey: null,
      apolloClient: null
    }),
    prisma: client
  });
