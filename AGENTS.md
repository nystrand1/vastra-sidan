# AGENTS.md — VSS Event

## Project Overview

This is the website for **Västra Sidan** (a Swedish football supporters association). It is a full-stack Next.js application handling memberships, away-game trip bookings, news/chronicles from WordPress, and admin management. The site is in **Swedish** — all routes, UI copy, and data use Swedish language.

---

## Tech Stack

| Layer      | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Framework  | **Next.js 15** (Pages Router)                                    |
| Language   | **TypeScript** (strict mode)                                     |
| API        | **tRPC v11** (React Query integration)                           |
| Database   | **MySQL** (MariaDB via Docker) with **Prisma ORM**               |
| Auth       | **NextAuth.js v4** (Credentials provider, JWT sessions)          |
| CMS        | **WordPress** (headless) via **Apollo GraphQL** client           |
| Payments   | **Stripe** (checkout + webhooks)                                 |
| Styling    | **Tailwind CSS** + **shadcn/ui** (New York style, CSS variables) |
| Email      | **AWS SES** + **React Email**                                    |
| Monitoring | **Sentry**                                                       |
| Validation | **Zod** (env vars via `@t3-oss/env-nextjs`, tRPC inputs)         |
| Deployment | **Vercel**                                                       |

---

## Repository Structure

```
├── prisma/
│   └── schema.prisma              # Database schema (MySQL)
├── public/                        # Static assets, favicons
├── src/
│   ├── env.mjs                    # Environment variable validation (t3-env)
│   ├── instrumentation.ts         # Sentry instrumentation
│   ├── app/                       # App Router (ONLY for API routes)
│   │   └── api/
│   │       ├── payment/stripeWebhook/  # Stripe webhook handler
│   │       └── proxy/                  # Proxy endpoint
│   ├── components/
│   │   ├── atoms/                 # Reusable atomic components (Accordion, InputField, Modal, etc.)
│   │   ├── common/                # Shared composite components (AwayGameForm, MemberCard, StripeWidget)
│   │   ├── admin/                 # Admin-specific components (tables, member management)
│   │   ├── emails/                # React Email templates
│   │   ├── layouts/               # Layout components (Layout, AdminLayout, Navigation)
│   │   └── ui/                    # shadcn/ui primitives (button, card, dialog, form, etc.)
│   ├── hooks/                     # Custom React hooks
│   ├── lib/
│   │   └── utils.ts               # shadcn utility (cn function)
│   ├── pages/                     # Next.js Pages Router (all site routes)
│   │   ├── _app.tsx               # App entry point
│   │   ├── api/
│   │   │   ├── auth/[...nextauth].ts  # NextAuth API route
│   │   │   └── trpc/[trpc].ts         # tRPC API route
│   │   ├── admin/                 # Admin panel (events, members)
│   │   ├── bli-medlem/            # Membership signup
│   │   ├── bortaguiden/           # Away game guides (WordPress content)
│   │   ├── bortaresor/            # Away game trip bookings
│   │   ├── kronikor/              # Chronicles (WordPress content)
│   │   ├── medlem/                # Member portal (token-based access)
│   │   ├── nyheter/               # News (WordPress content)
│   │   ├── omoss/                 # About us pages
│   │   └── sasongforsasong/       # Season-by-season (WordPress content)
│   ├── server/
│   │   ├── api/
│   │   │   ├── root.ts            # tRPC root router
│   │   │   ├── trpc.ts            # tRPC context, middleware, procedures
│   │   │   └── routers/           # tRPC routers (admin, member, public, etc.)
│   │   ├── auth.ts                # NextAuth configuration
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── stripe.ts              # Stripe client
│   │   ├── resend.ts              # Resend email client
│   │   ├── ses.ts                 # AWS SES email client
│   │   ├── utils/                 # Server-side helpers (payment, email, admin queries)
│   │   └── wpGraphql/             # WordPress GraphQL queries (.gql files)
│   ├── styles/
│   │   └── globals.css            # Global styles + CSS variables
│   ├── types/
│   │   └── wordpresstypes/graphql.ts  # Auto-generated GraphQL types
│   └── utils/                     # Client/shared utilities
│       ├── api.ts                 # tRPC client setup (createTRPCNext)
│       ├── constants.ts           # Shared constants
│       ├── createSSRHelper.ts     # SSR helper for tRPC prefetching
│       ├── featureFlags.ts        # Feature flags from env vars
│       ├── zodSchemas.ts          # Shared Zod validation schemas
│       └── stripeHelpers.ts       # Client-side Stripe utilities
├── codegen.ts                     # GraphQL Codegen configuration
├── apollo.config.js               # Apollo client configuration
├── components.json                # shadcn/ui configuration
└── docker-compose.yaml            # Local MariaDB database
```

---

## Key Architecture Decisions

### Routing: Pages Router (primary) + App Router (API only)

All pages and site routes use the **Pages Router** (`src/pages/`). The App Router (`src/app/`) is used **only** for the Stripe webhook endpoint and a proxy route. Do NOT create new pages in `src/app/`.

### tRPC Routers

All backend logic goes through tRPC routers in `src/server/api/routers/`. The root router in `root.ts` combines:

| Router          | Purpose                                       |
| --------------- | --------------------------------------------- |
| `public`        | Unauthenticated queries (start page, events)  |
| `wordpress`     | WordPress content fetching via Apollo GraphQL |
| `member`        | Member-facing operations (token-based)        |
| `memberPayment` | Membership payment flows (Stripe)             |
| `eventPayment`  | Event/trip payment flows (Stripe)             |
| `user`          | Authenticated user operations                 |
| `admin`         | Admin-only operations (requires `Role.ADMIN`) |
| `cron`          | Cron job endpoints (key-authenticated)        |

### Procedure Types

Defined in `src/server/api/trpc.ts`:

- **`publicProcedure`** — No auth required
- **`protectedProcedure`** — Requires logged-in session
- **`adminProcedure`** — Requires `Role.ADMIN`
- **`cronProcedure`** — Requires matching `CRON_KEY`
- **`membershipProcedure`** — Only available when memberships feature flag is enabled
- **`userProcedure`** — Requires logged-in user

### WordPress Integration

WordPress is used as a headless CMS for editorial content. The Apollo GraphQL client (`src/server/utils/apolloClient.ts`) connects to the WordPress GraphQL endpoint. GraphQL queries live in `src/server/wpGraphql/*.gql` and types are auto-generated to `src/types/wordpresstypes/graphql.ts` via `graphql-codegen`.

To regenerate WordPress types after changing `.gql` files:

```bash
npm run compile
```

### Feature Flags

Feature flags are controlled via `NEXT_PUBLIC_*` environment variables and accessed through `src/utils/featureFlags.ts`:

- `ENABLE_MEMBERSHIPS` — Membership signup/management
- `ENABLE_LOGIN` — User login functionality
- `ENABLE_AWAYGAMES` — Away game trip bookings
- `ENABLE_ANALYTICS` — Google Analytics

### SSR Data Prefetching

Use `createSSRHelper` from `src/utils/createSSRHelper.ts` to prefetch tRPC data in `getServerSideProps` / `getStaticProps`. This creates a server-side tRPC caller with the full context.

---

## Path Aliases

Configured in `tsconfig.json`:

- `~/*` → `./src/*`
- `~/atoms/*` → `./src/components/atoms/*`

Always use `~/` imports for project files.

---

## Database

- **MySQL** (MariaDB) running via Docker Compose locally
- Prisma schema: `prisma/schema.prisma`
- Prisma uses `relationMode = "prisma"` (no foreign key constraints at DB level)
- Key models: `User`, `Member`, `Membership`, `VastraEvent`, `Bus`, `Participant`, `StripePayment`, `StripeRefund`, `FotballGame`, `TicketSalesRecord`
- After schema changes: `npx prisma db push` (dev) or `npx prisma migrate dev`
- Generate client: `npx prisma generate` (runs automatically on `postinstall`)

---

## Coding Guidelines

### General

- Use **TypeScript** strictly. No `any` types unless unavoidable.
- Validate all inputs with **Zod** schemas in tRPC procedures.
- Use the `~/` path alias for all imports.
- Environment variables must be declared in `src/env.mjs` with Zod validation.

### Components

- **shadcn/ui** components live in `src/components/ui/`. Do not modify them directly unless necessary; customize via Tailwind classes or wrapper components.
- Custom reusable components go in `src/components/atoms/` (simple) or `src/components/common/` (composite).
- Admin-specific components go in `src/components/admin/`.
- Use **Tailwind CSS** for all styling. Follow the existing CSS variable system for theming.
- Use `cn()` from `~/lib/utils` for conditional class merging.

### Server / API

- New tRPC procedures go in the appropriate router under `src/server/api/routers/`.
- Use the correct procedure type (`publicProcedure`, `adminProcedure`, etc.) based on auth requirements.
- Server-side helpers and business logic go in `src/server/utils/`.
- The tRPC context provides: `prisma`, `stripe`, `session`, `apolloClient`, `cronKey`.

### WordPress / GraphQL

- Add new GraphQL queries as `.gql` files in `src/server/wpGraphql/`.
- Run `npm run compile` to regenerate TypeScript types.
- Use the `apolloClient` from the tRPC context to execute queries in routers.

### Payments

- Stripe checkout and payment intents are handled in `eventPayment` and `memberPayment` routers.
- Stripe webhooks are handled in `src/app/api/payment/stripeWebhook/route.ts` (App Router).
- Payment status tracking uses the `StripePayment` and `StripeRefund` models.

### Forms

- Use **react-hook-form** with **@hookform/resolvers** (Zod) for form validation.
- Shared Zod schemas live in `src/utils/zodSchemas.ts`.

---

## Commands

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Start development server                 |
| `npm run build`       | Production build                         |
| `npm run lint`        | Run ESLint                               |
| `npm run compile`     | Generate GraphQL types from `.gql` files |
| `npm run watch`       | Watch mode for GraphQL codegen           |
| `npm run dev:email`   | Preview email templates on port 3001     |
| `npx prisma studio`   | Open Prisma Studio (database GUI)        |
| `npx prisma db push`  | Push schema changes to database          |
| `npx prisma generate` | Regenerate Prisma client                 |

---

## Locale

The application locale is **Swedish** (`sv-SE`). All date formatting uses `date-fns` with the Swedish locale set globally in `_app.tsx`. Routes and UI text are in Swedish.
