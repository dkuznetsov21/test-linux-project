#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './lib/process-runner.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(projectDirectory, 'dist');
const bundlePath = path.join(distDirectory, 'experimental-cli.cjs');
const releaseDirectory = path.join(projectDirectory, 'experiments', 'dasha-linux-x64');
const releaseBinaryPath = path.join(releaseDirectory, 'dasha');
const binDirectory = path.join(projectDirectory, 'node_modules', '.bin');
const executableSuffix = process.platform === 'win32' ? '.cmd' : '';
const esbuildPath = path.join(binDirectory, `esbuild${executableSuffix}`);
const pkgPath = path.join(binDirectory, `pkg${executableSuffix}`);

async function copyIfExists(sourcePath, destinationPath, options = {}) {
  try {
    await fs.cp(sourcePath, destinationPath, {
      recursive: options.recursive ?? false,
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function copyReleaseFiles() {
  await copyIfExists(path.join(projectDirectory, 'prompts'), path.join(releaseDirectory, 'prompts'), {
    recursive: true,
  });
  await fs.mkdir(path.join(releaseDirectory, 'scripts'), { recursive: true });
  await copyIfExists(
    path.join(projectDirectory, 'scripts', 'baza.txt'),
    path.join(releaseDirectory, 'scripts', 'baza.txt'),
  );
  await fs.writeFile(path.join(releaseDirectory, 'README-RUN.txt'), [
    'Experimental Dasha fast template build for Debian/Linux x64:',
    '',
    'chmod +x ./dasha',
    './dasha',
    '',
    'This experimental binary includes two modes:',
    '1. Run Standard Workflow - generate every domain from its full prompt.',
    '2. Run Prompt ZIP Fast Template Workflow - generate the first domain fully, then adapt remaining domains from its skeleton.',
    '',
    'The executable expects codex and agent CLIs to be installed and authenticated on this computer.',
    'Keep prompts/ and scripts/baza.txt next to ./dasha if you want to edit them without rebuilding.',
    'Runtime files such as outputs/ and telegram-config.json are created in this folder.',
    '',
  ].join('\n'), 'utf8');
}

await fs.rm(releaseDirectory, { recursive: true, force: true });
await fs.mkdir(distDirectory, { recursive: true });
await fs.mkdir(releaseDirectory, { recursive: true });

await runCommand(esbuildPath, [
  'scripts/generate-baza.mjs',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  `--outfile=${bundlePath}`,
], {
  cwd: projectDirectory,
  stdio: ['ignore', 'inherit', 'inherit'],
});

await runCommand(pkgPath, [
  bundlePath,
  '--targets',
  'node20-linux-x64',
  '--output',
  releaseBinaryPath,
  '--compress',
  'GZip',
], {
  cwd: projectDirectory,
  stdio: ['ignore', 'inherit', 'inherit'],
});

await fs.chmod(releaseBinaryPath, 0o755);
await copyReleaseFiles();

process.stdout.write(`Experimental Linux release created: ${releaseDirectory}\n`);
