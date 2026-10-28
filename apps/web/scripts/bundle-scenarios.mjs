// Validates every apps/web/scenarios/*/scenario.yaml against contracts/scenario.schema.json
// and bundles them for the cockpit's mock engine. Fails (exit 1) on any contract violation.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const schema = JSON.parse(readFileSync(join(root, 'contracts', 'scenario.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const dir = join(root, 'apps', 'web', 'scenarios');
const packs = [];
let failed = false;
for (const name of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort()) {
  const file = join(dir, name, 'scenario.yaml');
  if (!existsSync(file)) continue;
  const pack = YAML.parse(readFileSync(file, 'utf8'));
  const errs = [];
  if (!validate(pack)) errs.push(...validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`));
  if (pack.id !== name) errs.push(`id "${pack.id}" must match folder "${name}"`);
  const sum = Object.values(pack.debrief?.rubric ?? {}).reduce((a, b) => a + b, 0);
  if (sum !== 100) errs.push(`debrief.rubric must sum to 100 (got ${sum})`);
  for (const step of [...(pack.setup ?? []), ...(pack.cleanup ?? []), ...(pack.checks ?? [])]) {
    if (!existsSync(join(dir, name, step.run.split(' ')[0]))) errs.push(`missing script ${step.run}`);
  }
  if (errs.length) {
    failed = true;
    console.error(`✗ ${name}\n  - ${errs.join('\n  - ')}`);
  } else {
    console.log(`✓ ${name}`);
  }
  packs.push(pack);
}
const out = join(here, '..', 'src', 'mock', 'scenarios.generated.json');
writeFileSync(out, JSON.stringify(packs, null, 2) + '\n');
console.log(`bundled ${packs.length} scenario packs -> src/mock/scenarios.generated.json`);
if (failed && !process.argv.includes('--allow-missing-scripts')) process.exit(1);
