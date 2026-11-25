// One-off: lowercase and trim every stored email.
// Usage: pnpm script scripts/accounts/normalise-emails.ts [--dry-run]
import { prisma } from "~/server/db";
import { normaliseStoredEmails } from "~/server/utils/accounts/normaliseStoredEmails";

const dryRun = process.argv.includes("--dry-run");

normaliseStoredEmails(prisma, { dryRun })
  .then((result) => {
    console.log(JSON.stringify({ dryRun, ...result }, null, 2));
    if (result.collisions.length > 0) {
      console.error("Collisions found, nothing was written. Merge the duplicates and run again.");
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
