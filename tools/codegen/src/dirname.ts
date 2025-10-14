import path from 'path';
import { fileURLToPath } from 'url';

export const DIRNAME =
  // In CJS __dirname exists; in ESM we compute it from import.meta.url
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
