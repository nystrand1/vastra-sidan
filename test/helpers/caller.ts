import { Role } from "@prisma/client";
import { type Session } from "next-auth";
import { type apolloClient } from "~/server/utils/apolloClient";
import { appRouter } from "~/server/api/root";
import { createCallerFactory, createInnerTRPCContext } from "~/server/api/trpc";

const createCaller = createCallerFactory(appRouter);

const sessionFor = (role: Role): Session => ({
  expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: {
    id: `test-${role.toLowerCase()}`,
    role,
    firstName: "Test",
    lastName: role === Role.ADMIN ? "Admin" : "User",
    isMember: false,
    phone: "0700000000",
    email: `${role.toLowerCase()}@test.vastrasidan.se`
  }
});

const callerWith = (session: Session | null) =>
  createCaller(createInnerTRPCContext({ session, cronKey: null, apolloClient: null }));

/** An anonymous visitor on the public site. */
export const publicCaller = () => callerWith(null);

/** A logged-in user without admin rights. */
export const userCaller = () => callerWith(sessionFor(Role.USER));

/** A logged-in admin. */
export const adminCaller = () => callerWith(sessionFor(Role.ADMIN));

/** The scheduled cron job, authenticated with the cron key. */
export const cronCaller = ({ wordpress = null }: { wordpress?: typeof apolloClient | null } = {}) =>
  createCaller(
    createInnerTRPCContext({ session: null, cronKey: process.env.CRON_KEY ?? null, apolloClient: wordpress })
  );
