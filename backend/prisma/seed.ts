import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaLibSql({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

const sections = [
  { id: 'name_contact', label: 'Name & Contact' },
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'hard_skills', label: 'Hard Skills' },
  { id: 'soft_skills', label: 'Soft Skills' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'projects', label: 'Projects' },
  { id: 'languages', label: 'Languages' },
  { id: 'hobbies', label: 'Hobbies' },
];

async function main() {
  for (const section of sections) {
    await prisma.section.upsert({
      where: { id: section.id },
      update: { label: section.label },
      create: section,
    });
  }

  const count = await prisma.section.count();
  console.log(`Seeded ${count} sections`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
