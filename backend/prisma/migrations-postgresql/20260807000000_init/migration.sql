-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "layout" TEXT NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeSection" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "column" TEXT NOT NULL DEFAULT 'right',
    "order" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ResumeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionEntry" (
    "id" TEXT NOT NULL,
    "resumeSectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "parentId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SectionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionField" (
    "id" TEXT NOT NULL,
    "sectionEntryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SectionField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeSection_resumeId_sectionId_key" ON "ResumeSection"("resumeId", "sectionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeSection" ADD CONSTRAINT "ResumeSection_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeSection" ADD CONSTRAINT "ResumeSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionEntry" ADD CONSTRAINT "SectionEntry_resumeSectionId_fkey" FOREIGN KEY ("resumeSectionId") REFERENCES "ResumeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionEntry" ADD CONSTRAINT "SectionEntry_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SectionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionField" ADD CONSTRAINT "SectionField_sectionEntryId_fkey" FOREIGN KEY ("sectionEntryId") REFERENCES "SectionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

