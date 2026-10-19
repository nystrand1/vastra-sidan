import { inject } from "vitest";

const databaseUrl = inject("databaseUrl");
const { hostname } = new URL(databaseUrl);

// Safety net: the suite truncates every table between tests, so refuse to run
// against anything that is not the local test container.
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
  throw new Error(`Refusing to run integration tests against non-local database host "${hostname}"`);
}

process.env.DATABASE_URL = databaseUrl;
