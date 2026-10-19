import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Load ONLY .env.test, never .env (which may point at a real database or Stripe account).
const testEnv = parseEnv(readFileSync(".env.test", "utf8")) as Record<string, string>;

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: testEnv,
    globalSetup: ["test/setup/globalSetup.ts"],
    // Order matters: `env.ts` must set DATABASE_URL before anything imports ~/server/db.
    setupFiles: ["test/setup/env.ts", "test/setup/hooks.ts"],
    // All test files share one database, so run files one at a time.
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 30_000
  }
});
