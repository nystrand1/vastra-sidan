import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { StripePaymentStatus, type Role } from "@prisma/client";
import { createHash } from "crypto";
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    token?: string;
    error?: string;
    user: {
      id: string;
      role: Role;
      firstName: string;
      lastName: string;
      isMember: boolean;
      phone: string;
      email: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    firstName: string;
    lastName: string;
    isMember: boolean;
    phone?: string;
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
    firstName?: string;
    lastName?: string;
    phone?: string;
  }
}

export const sha256 = (content: string) => {
  return createHash("sha256").update(content).digest("hex");
};

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  callbacks: {
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.role = token.role as Role;
        session.user.firstName = token.firstName ?? "";
        session.user.lastName = token.lastName ?? "";
        session.user.name = `${session.user.firstName} ${session.user.lastName}`;
        session.user.isMember = !!token.isMember;
        session.user.phone = token.phone ?? "";
      }
      return session;
    },
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.isMember = user.isMember;
        token.phone = user.phone;
      }
      if (trigger === "update") {
        const { user: sessionUser } = session as { user: typeof user };
        token = {
          ...token,
          ...sessionUser,
        } as typeof token
      }
      return token;
    }
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Email", type: "text", placeholder: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.username
          },
          include: {
            memberShips: {
              where: {
                endDate: {
                  gte: new Date()
                },
                stripePayments: {
                  some: {
                    status: StripePaymentStatus.SUCCEEDED
                  }
                }
              }
            }
          }
        });
        if (!user) return null;
        if (user.password !== sha256(credentials.password)) return null;
        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isMember: !!user.memberShips.length,
          ...(user.phone && { phone: user.phone })
        };
      }
    })
  ],
  pages: {
    signIn: "/loggain"
  }
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
