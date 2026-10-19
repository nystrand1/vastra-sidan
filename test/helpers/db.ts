import { prisma } from "~/server/db";

export { prisma };

let tables: string[] | undefined;

/** Empties every table. The schema uses relationMode "prisma", so there are no FKs to respect. */
export const resetDatabase = async () => {
  tables ??= (
    await prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
    )
  ).map((t) => t.name);

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
};
