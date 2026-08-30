# Västra Sidan

The website for **Västra Sidan**, a Swedish football supporters association. It's a full-stack Next.js app handling memberships, away-game trip bookings, news/chronicles sourced from WordPress, and an admin panel for managing members and events. The site and all its content are in **Swedish**.

## Tech stack

| Layer      | Technology                                               |
| ---------- | --------------------------------------------------------- |
| Framework  | [Next.js](https://nextjs.org) 16 (Pages Router)            |
| Language   | TypeScript (strict mode)                                   |
| API        | [tRPC](https://trpc.io) v11 + [TanStack Query](https://tanstack.com/query)                          |
| Database   | MySQL (MariaDB) via [Prisma](https://prisma.io) ORM                        |
| Auth       | [NextAuth.js](https://next-auth.js.org) v4 (credentials provider, JWT sessions) |
| Styling    | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (Radix primitives) |
| Forms      | react-hook-form + Zod validation                            |
| 3D/graphics| react-three-fiber, drei, rapier                             |
| Validation | Zod, with env vars validated via `@t3-oss/env-nextjs`      |
| Deployment | Vercel                                                      |

This project started from the [T3 Stack](https://create.t3.gg/) scaffold and has since grown well beyond it.

## Integrations

- **WordPress (headless CMS)** — editorial content (news, chronicles, away-game guides, season history) is fetched from a WordPress GraphQL endpoint via [Apollo Client](https://www.apollographql.com/docs/react). GraphQL documents live in `src/server/wpGraphql/*.gql`, with types generated into `src/types/wordpresstypes/graphql.ts` via [GraphQL Code Generator](https://the-guild.dev/graphql/codegen).
- **Stripe** — handles checkout and payments for memberships and away-game trips, including webhook-driven payment/refund tracking (`StripePayment`, `StripeRefund` models).
- **AWS SES** — transactional email delivery, with templates authored using [React Email](https://react.email).
- **Sentry** — error monitoring and performance tracing (client, server, and edge configs).
- **Google Analytics** — optional, toggled via a feature flag.

## Feature flags

Several features are gated behind `NEXT_PUBLIC_*` environment flags (see `src/utils/featureFlags.ts`):

- `NEXT_PUBLIC_ENABLE_MEMBERSHIPS` — membership signup/management
- `NEXT_PUBLIC_ENABLE_LOGIN` — user login
- `NEXT_PUBLIC_ENABLE_AWAYGAMES` — away-game trip bookings
- `NEXT_PUBLIC_ENABLE_ANALYTICS` — Google Analytics

## Getting started

### Prerequisites

- Node.js and [Yarn](https://yarnpkg.com)
- [Docker](https://www.docker.com) (for the local MySQL database)

### 1. Install dependencies

```bash
yarn install
```

This also runs `prisma generate` automatically via the `postinstall` hook.

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values. The full schema (and which variables are required) is defined in `src/env.mjs`; at minimum you'll need credentials/keys for:

- Prisma (`DATABASE_URL`)
- NextAuth (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`)
- WordPress (`WORDPRESS_API_KEY`, `NEXT_PUBLIC_WORDPRESS_URL`)
- Stripe (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_API_KEY`)
- AWS SES (`AWS_CLIENT_ID`, `AWS_CLIENT_SECRET`, `ENABLE_AWS_SES_EMAILS`)
- Misc (`CRON_KEY`, `CANCELLATION_URL`, `MEMBERSHIP_URL`, `API_URL`, `BOOKING_EMAIL`, `WEBSITE_URL`)

Set `SKIP_ENV_VALIDATION=true` if you need to build without all variables present (e.g. for Docker builds).

### 3. Start the local database

```bash
docker-compose up -d
```

This starts a MariaDB container matching the `DATABASE_URL` expected in development.

### 4. Push the database schema

```bash
npx prisma db push
```

### 5. Run the dev server

```bash
yarn dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Other useful commands

| Command               | Purpose                                        |
| --------------------- | ----------------------------------------------- |
| `yarn build`          | Production build                                |
| `yarn lint`           | Run ESLint                                      |
| `yarn compile`        | Generate TypeScript types from WordPress `.gql` files |
| `yarn watch`          | Watch mode for GraphQL codegen                  |
| `yarn dev:email`      | Preview React Email templates on port 3001      |
| `npx prisma studio`   | Open Prisma Studio (database GUI)               |
| `npx prisma generate` | Regenerate the Prisma client                    |

## Deployment

The app is deployed on [Vercel](https://vercel.com). See the [T3 Stack deployment guides](https://create.t3.gg/en/deployment/vercel) for general Next.js/Vercel deployment guidance, and make sure all required environment variables (see above) are configured in the Vercel project settings.

## More details

For a deeper look at the architecture, repository structure, and coding conventions, see [`AGENTS.md`](./AGENTS.md).
