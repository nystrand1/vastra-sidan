import { execFileSync } from "node:child_process";
import { MariaDbContainer, type StartedMariaDbContainer } from "@testcontainers/mariadb";
import type { TestProject } from "vitest/node";

// Same image as docker-compose.yaml, so tests run against the engine we develop on.
const MARIADB_IMAGE = "mariadb:10.6.4-focal";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedMariaDbContainer | undefined;

export async function setup(project: TestProject) {
  container = await new MariaDbContainer(MARIADB_IMAGE)
    .withDatabase("vssevent_test")
    .withUsername("vssevent")
    .withUserPassword("vssevent")
    .start();

  // Prisma talks to the DB as root so `db push` can create tables freely.
  const databaseUrl = container
    .getConnectionUri(true)
    .replace(/^mariadb:/, "mysql:");

  // The container is always fresh, so no `--accept-data-loss`: Prisma 7 refuses that flag
  // when run by an AI agent, and a push that would lose data should fail here anyway.
  execFileSync(
    "node_modules/.bin/prisma",
    ["db", "push"],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe"
    }
  );

  project.provide("databaseUrl", databaseUrl);
}

export async function teardown() {
  await container?.stop();
}
