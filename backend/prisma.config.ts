// Prisma config — selects the migration directory + datasource by DATABASE_URL
// scheme so ONE codebase serves both SQLite (dev/tests) and PostgreSQL (prod).
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env["DATABASE_URL"] ?? "file:./prisma/db/dev.db";
const isPostgres = /^postgres(ql)?:\/\//.test(url);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // SQLite chain lives in prisma/migrations; the Postgres chain lives in
    // prisma/migrations-postgresql (SQLite-flavoured SQL is NOT valid on
    // Postgres). `prisma migrate deploy` applies whichever chain matches
    // the active DATABASE_URL.
    path: isPostgres ? "prisma/migrations-postgresql" : "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
