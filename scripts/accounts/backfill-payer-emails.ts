// One-off: store the payer of every event booking made before payerEmail existed.
// Usage: pnpm script scripts/accounts/backfill-payer-emails.ts
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";
import { backfillPayerEmails } from "~/server/utils/accounts/backfillPayerEmails";

backfillPayerEmails(prisma, stripe)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
