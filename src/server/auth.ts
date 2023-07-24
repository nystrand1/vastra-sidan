import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { createHash } from "crypto";
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type NextAuthOptions,
  type DefaultSession,
  CookiesOptions,
  Session,
} from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "~/server/db";

type UserRole = "ADMIN" | "BUS_HOST" | "USER";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    refreshTokenExpires?: number;
    accessTokenExpires?: string;
    refreshToken?: string;
    token?: string;
    error?: string;
    user: {
      id: string;
      role: User;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    refreshTokenExpires?: number;
    accessTokenExpires?: number;
    refreshToken?: string;
    token: string;
    exp?: number;
    iat?: number;
    jti?: string;
  }
}

const cookies: Partial<CookiesOptions> = {
  sessionToken: {
      name: `next-auth.session-token`,
      options: {
          httpOnly: true,
          sameSite: "none",
          path: "/",
          domain: process.env.NEXT_PUBLIC_DOMAIN,
          secure: true,
      },
  },
  callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
          httpOnly: true,
          sameSite: "none",
          path: "/",
          domain: process.env.NEXT_PUBLIC_DOMAIN,
          secure: true,
      },
  },
  csrfToken: {
      name: "next-auth.csrf-token",
      options: {
      httpOnly: true,
          sameSite: "none",
          path: "/",
          domain: process.env.NEXT_PUBLIC_DOMAIN,
          secure: true,
      },
  },
};

const sha256 = (content: string) => {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  // callbacks: {
  //   session,
  //   jwt
  // },
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Email", type: "text", placeholder: "email" },
        password: {  label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.username,
          },
        });
        if (!user) return null;

        if (user.password !== sha256(credentials.password)) return null;

        return user;
      },
    }),
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
