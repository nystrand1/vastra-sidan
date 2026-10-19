/**
 * One-off backfill of the refund rows written by the old `charge.refunded` handler (PR #116).
 *
 * The old handler stored the charge id (`ch_…`) as `stripeRefundId` and the full charge
 * amount in an extra REFUNDED row, and left the traveller's own CREATED row (with the real
 * `re_…` id) unchanged. This script compares those rows with Stripe and:
 * - moves CREATED rows to REFUNDED (or ERROR) to match their Stripe refund;
 * - deletes a traveller's `ch_…` row once their own refund row is REFUNDED;
 * - gives a dashboard refund's `ch_…` row the real refund id and amount;
 * - lists everything it can't fix safely, for a human to look at.
 *
 * Dry run (reads only, writes the plan to backfill-output/):
 *   npx jiti scripts/backfill-stripe-refunds.ts
 * Apply a reviewed plan (backs up the rows first, refuses if they changed since the plan):
 *   npx jiti scripts/backfill-stripe-refunds.ts --apply backfill-output/plan-<time>.json
 *
 * Reads DATABASE_URL and STRIPE_API_KEY from the environment or from `.env.backfill.local`.
 * A restricted Stripe key with read access to Charges and Refunds (and PaymentIntents) is enough.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import {
  applyRefundBackfill,
  type BackfillPlan,
  formatPlan,
  planRefundBackfill,
  snapshotRows
} from "./backfillStripeRefunds";

const loadEnv = () => {
  const file = ".env.backfill.local";
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const env = { ...fromFile, ...process.env };
  const databaseUrl = env.DATABASE_URL;
  const stripeKey = env.STRIPE_API_KEY;
  if (!databaseUrl || !stripeKey) {
    throw new Error(`Set DATABASE_URL and STRIPE_API_KEY (in the environment or ${file})`);
  }
  return { databaseUrl, stripeKey };
};

const main = async () => {
  const { databaseUrl, stripeKey } = loadEnv();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });
  const outDir = "backfill-output";
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    const applyIndex = process.argv.indexOf("--apply");
    if (applyIndex === -1) {
      const plan = await planRefundBackfill({ prisma, stripe });
      writeFileSync(`${outDir}/plan-${stamp}.json`, JSON.stringify(plan, null, 2));
      writeFileSync(`${outDir}/plan-${stamp}.md`, formatPlan(plan));
      console.log(formatPlan(plan));
      console.log(`Dry run only. Plan written to ${outDir}/plan-${stamp}.{json,md}`);
      return;
    }
    const planFile = process.argv[applyIndex + 1];
    if (!planFile) throw new Error("--apply needs the plan's .json file");
    const plan = JSON.parse(readFileSync(planFile, "utf8")) as BackfillPlan;
    const backupFile = `${outDir}/backup-${stamp}.json`;
    writeFileSync(backupFile, JSON.stringify(await snapshotRows(prisma, plan), null, 2));
    console.log(`Backed up the affected rows to ${backupFile}`);
    const applied = await applyRefundBackfill({ prisma, plan });
    console.log(`Applied ${applied} changes from ${planFile}`);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
