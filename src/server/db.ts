import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "~/generated/prisma/client";
import { env } from "~/env.mjs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () => {
  const databaseUrl = new URL(env.DATABASE_URL);
  // The mariadb driver defaults to a pool of 10 per instance; keep it small on serverless
  if (!databaseUrl.searchParams.has("connectionLimit")) {
    databaseUrl.searchParams.set("connectionLimit", "5");
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl.toString()),
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
