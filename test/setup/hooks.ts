import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { resetSentEmails } from "../mocks/ses";
import { server } from "../mocks/server";
import { resetFakeStripe } from "../mocks/stripe";

beforeAll(() => {
  // Any request we haven't mocked (Stripe, SES, WordPress, ...) fails the test.
  server.listen({ onUnhandledFrame: "error" });
});

beforeEach(async () => {
  await resetDatabase();
  resetFakeStripe();
  resetSentEmails();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});
