-- AlterTable
-- The "User" table is created by the init migration. This migration only
-- adds the "updatedAt" column required by schema.prisma (RES-94).
ALTER TABLE "User" ADD COLUMN "updatedAt" DATETIME NOT NULL;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
