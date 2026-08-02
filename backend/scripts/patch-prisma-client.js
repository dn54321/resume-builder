/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  WARNING — DO NOT REMOVE THIS SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prisma 7 generates code using `import.meta.url` (ESM-only syntax).
 * NestJS compiles the project as CJS (module: "nodenext" without
 * "type": "module" in package.json). The `import.meta.url` line survives
 * the tsc pass and crashes Node at runtime:
 *
 *   ReferenceError: exports is not defined in ES module scope
 *
 * This has been "fixed" multiple times. The timeline:
 *
 *   RES-12 agent: Added "type": "module" + 80+ .js import extensions.
 *                 Worked but was hugely invasive.
 *   commit 4d48f39: REVERTED "type": "module" — broke too much tooling.
 *   RES-11, RES-6,
 *   RES-13, RES-29: Each agent rediscovered the crash and patched the
 *                    generated file manually. The fix was wiped by every
 *                    `prisma generate`.
 *   commit <this>:   Automated the fix via this script. `pnpm prisma:generate`
 *                    always runs the patch. Docker builds use it too.
 *
 * DO NOT:
 *   - Delete this script
 *   - Run bare `prisma generate` instead of `pnpm prisma:generate`
 *   - Add "type": "module" to package.json (reverted in 4d48f39)
 *   - Change the Prisma output path without updating this script
 *
 * If Node crashes with "exports is not defined in ES module scope",
 * the first thing to check is whether this patch was applied.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Post-generate patch for the Prisma client.
 *
 * Removes `import.meta.url` from the generated client.ts so it compiles
 * to clean CJS (__dirname is already globally available in CJS). Also
 * restores the Jest mock that `prisma generate` wipes.
 *
 * Run automatically via: pnpm prisma:generate
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ---- 1. Patch client.ts ----

const clientPath = join(root, 'src', 'generated', 'prisma', 'client.ts');
let client = readFileSync(clientPath, 'utf8');

const esmLines = [
  "import { fileURLToPath } from 'node:url'",
  "globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))",
];

for (const line of esmLines) {
  if (client.includes(line)) {
    client = client.replace(line + '\n', '');
    console.log(`  ✓ Removed: ${line}`);
  }
}

// CJS fallback: __dirname is already a global, no replacement needed.
const comment = '// __dirname is a CJS global; Prisma uses it to locate the query engine.\n';
client = client.replace(
  "import * as path from 'node:path'\n",
  `import * as path from 'node:path'\n${comment}`,
);

writeFileSync(clientPath, client, 'utf8');
console.log(`  ✓ Patched: src/generated/prisma/client.ts`);

// ---- 2. Restore Jest mock ----

const mockDir = join(root, 'src', 'generated', 'prisma', '__mocks__');
mkdirSync(mockDir, { recursive: true });

const mockContent = `// Mock for generated Prisma client used by Jest unit tests.
// This file is restored by scripts/patch-prisma-client.js after each
// prisma generate run (which wipes the output directory).

export const PrismaClient = jest.fn().mockImplementation(() => ({}));
`;

writeFileSync(join(mockDir, 'client.ts'), mockContent, 'utf8');
console.log(`  ✓ Restored: src/generated/prisma/__mocks__/client.ts`);

console.log('\n  Prisma client patched for CJS compatibility.');
