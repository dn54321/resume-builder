import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL! }),
});

const SECTIONS: { id: string; label: string }[] = [
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

async function main(): Promise<void> {
  console.log('Seeding Section reference rows...');

  for (const section of SECTIONS) {
    await prisma.section.upsert({
      where: { id: section.id },
      update: { label: section.label },
      create: section,
    });
  }

  const count = await prisma.section.count();
  console.log(`Seeded ${count} Section rows.`);

  // Display all seeded sections
  const all = await prisma.section.findMany({ orderBy: { id: 'asc' } });
  for (const s of all) {
    console.log(`  ${s.id} — ${s.label}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
