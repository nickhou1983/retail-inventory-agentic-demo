import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const requiredFiles = [
  '.github/copilot-instructions.md',
  'AGENTS.md',
  '.github/instructions/inventory-db.instructions.md',
  '.github/instructions/testing.instructions.md',
  '.github/agents/inventory-impl.agent.md',
  '.github/agents/chaos-qa.agent.md',
  '.github/agents/sre-observability.agent.md',
];

for (const rel of requiredFiles) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`[Guardrail Error] Missing required Standards-as-Code file: ${rel}`);
    process.exit(1);
  }
}

console.log('[Guardrail Check] All 4-tier Standards-as-Code & Custom Agent definitions verified.');
