#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BuiltSiteArchiver } from './lib/built-site-archiver.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archiver = new BuiltSiteArchiver({ projectDirectory });

archiver.run().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
