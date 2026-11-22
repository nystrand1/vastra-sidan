import { type PrismaClient } from "~/generated/prisma/client";

type Table = "User" | "Member" | "Participant" | "ParticipantTransfer" | "StripePayment";

// Table and column names come from this list only, never from input.
const COLUMNS: { table: Table; column: string }[] = [
  { table: "User", column: "email" },
  { table: "Member", column: "email" },
  { table: "Participant", column: "email" },
  { table: "Participant", column: "userEmail" },
  { table: "ParticipantTransfer", column: "fromEmail" },
  { table: "ParticipantTransfer", column: "toEmail" }
];

const UNIQUE_TABLES = ["User", "Member"] as const;

export type EmailCollision = { table: "User" | "Member"; email: string; ids: string[] };

/**
 * Lowercases and trims every stored email. If two users, or two members, would
 * end up with the same email nothing is written and the collisions are returned.
 * With `dryRun` it only counts the rows that would change.
 */
export const normaliseStoredEmails = async (
  db: PrismaClient,
  { dryRun = false }: { dryRun?: boolean } = {}
) => {
  const updated: Record<Table, number> = {
    User: 0,
    Member: 0,
    Participant: 0,
    ParticipantTransfer: 0,
    StripePayment: 0
  };

  const collisions: EmailCollision[] = [];
  for (const table of UNIQUE_TABLES) {
    const rows = await db.$queryRawUnsafe<{ email: string; ids: string }[]>(
      `SELECT LOWER(TRIM(email)) AS email, GROUP_CONCAT(id ORDER BY id) AS ids
       FROM \`${table}\` WHERE email IS NOT NULL
       GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1`
    );
    for (const row of rows) {
      collisions.push({ table, email: row.email, ids: row.ids.split(",") });
    }
  }
  if (collisions.length > 0) return { collisions, updated };

  for (const { table, column } of COLUMNS) {
    // `<>` uses the column collation, which ignores case; compare bytes instead.
    const needsChange = `BINARY \`${column}\` <> BINARY LOWER(TRIM(\`${column}\`))`;
    if (dryRun) {
      const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${needsChange}`
      );
      updated[table] += Number(row?.n ?? 0);
    } else {
      updated[table] += await db.$executeRawUnsafe(
        `UPDATE \`${table}\` SET \`${column}\` = LOWER(TRIM(\`${column}\`)) WHERE ${needsChange}`
      );
    }
  }
  return { collisions, updated };
};
