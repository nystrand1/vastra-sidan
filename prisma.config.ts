import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Not env("DATABASE_URL"): that throws when the variable is missing, which breaks
    // `prisma generate` in postinstall on CI and Vercel installs that don't set it
    url: process.env.DATABASE_URL ?? ""
  }
});
