-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'standard',
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ResumeSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resumeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "column" TEXT NOT NULL DEFAULT 'right',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ResumeSection_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResumeSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resumeSectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "SectionEntry_resumeSectionId_fkey" FOREIGN KEY ("resumeSectionId") REFERENCES "ResumeSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SectionEntry_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SectionEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionEntryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "SectionField_sectionEntryId_fkey" FOREIGN KEY ("sectionEntryId") REFERENCES "SectionEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeSection_resumeId_sectionId_key" ON "ResumeSection"("resumeId", "sectionId");
