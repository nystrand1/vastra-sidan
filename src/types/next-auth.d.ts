import { type DefaultSession } from "next-auth";
import { type AppSession } from "~/server/auth";

// The browser code still reads the session through `next-auth/react` until it moves
// to the Better Auth client. Delete this file together with the `next-auth` package.
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: AppSession["user"] & DefaultSession["user"];
  }
}
