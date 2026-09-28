import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REF_ROOT = process.env.DARKMAP_REF
  ? resolve(process.env.DARKMAP_REF)
  : resolve(PROJECT_ROOT, '..', 'prototype-made', 'darkmap-opus-team-share', 'darkmap-opus');
export const refPath = (...parts) => join(REF_ROOT, ...parts);
