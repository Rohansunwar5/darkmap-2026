import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './ref.js';

export const golden = name => JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests', 'golden', `${name}.json`), 'utf8'));
