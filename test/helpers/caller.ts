import { Role } from "~/generated/prisma/client";
import { type apolloClient } from "~/server/utils/apolloClient";
import { appRouter } from "~/server/api/root";
import { type AppSession } from "~/server/auth";
import { createCallerFactory, createInnerTRPCContext } from "~/server/api/trpc";

const createCaller = createCallerFactory(appRouter);

const sessionFor = (role: Role, user: Partial<AppSession["user"]> = {}): AppSession => ({
  user: {
    id: `test-${role.toLowerCase()}`,
    role,
    firstName: "Test",
    lastName: role === Role.ADMIN ? "Admin" : "User",
    name: role === Role.ADMIN ? "Test Admin" : "Test User",
    isMember: false,
    phone: "0700000000",
    email: `${role.toLowerCase()}@test.vastrasidan.se`,
    ...user
  }
});

const callerWith = (session: AppSession | null) =>
  createCaller(createInnerTRPCContext({ session, cronKey: null, apolloClient: null }));

/** An anonymous visitor on the public site. */
export const publicCaller = () => callerWith(null);

/** A logged-in user without admin rights. */
export const userCaller = (user?: Partial<AppSession["user"]>) => callerWith(sessionFor(Role.USER, user));

/** A logged-in admin. */
export const adminCaller = (user?: Partial<AppSession["user"]>) => callerWith(sessionFor(Role.ADMIN, user));

/** The scheduled cron job, authenticated with the cron key. */
export const cronCaller = ({ wordpress = null }: { wordpress?: typeof apolloClient | null } = {}) =>
  createCaller(
    createInnerTRPCContext({ session: null, cronKey: process.env.CRON_KEY ?? null, apolloClient: wordpress })
  );
