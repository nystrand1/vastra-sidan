import type * as Sentry from "@sentry/nextjs";
import { captureException, captureMessage } from "@sentry/nextjs";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { resetSentEmails } from "../mocks/ses";
import { server } from "../mocks/server";
import { resetFakeStripe } from "../mocks/stripe";

// Mocked here, before anything imports the app, so tests can check what was reported to Sentry.
vi.mock("@sentry/nextjs", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
  captureMessage: vi.fn()
}));

beforeAll(() => {
  // Any request we haven't mocked (Stripe, SES, WordPress, ...) fails the test.
  server.listen({ onUnhandledFrame: "error" });
});

beforeEach(async () => {
  await resetDatabase();
  resetFakeStripe();
  resetSentEmails();
  vi.mocked(captureException).mockClear();
  vi.mocked(captureMessage).mockClear();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});
