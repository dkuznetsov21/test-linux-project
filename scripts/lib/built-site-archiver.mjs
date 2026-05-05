import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const BUILT_SITES_DIRECTORY_NAME = 'built-sites';
export const BUILT_SITES_ARCHIVE_NAME = 'built-sites.zip';

function isDomainLikeDirectoryName(name) {
  return /^[^\s./\\][^\s/\\]*\.[^\s/\\]+$/.test(name);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function readDirectoryEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Outputs directory does not exist: ${directory}`);
    }

    throw error;
  }
}

function sortByDomain(sites) {
  return [...sites].sort((first, second) => first.domain.localeCompare(second.domain));
}

export async function findBuiltSites(outputsDirectory) {
  const outputEntries = await readDirectoryEntries(outputsDirectory);
  const runDirectories = outputEntries.filter((entry) => (
    entry.isDirectory() && entry.name !== BUILT_SITES_DIRECTORY_NAME
  ));
  const sites = [];

  for (const runEntry of runDirectories) {
    const runDirectory = path.join(outputsDirectory, runEntry.name);
    const domainEntries = await fs.readdir(runDirectory, { withFileTypes: true });

    for (const domainEntry of domainEntries) {
      if (!domainEntry.isDirectory() || !isDomainLikeDirectoryName(domainEntry.name)) {
        continue;
      }

      const domainDirectory = path.join(runDirectory, domainEntry.name);
      const builtDirectory = path.join(domainDirectory, domainEntry.name);

      try {
        const stats = await fs.stat(builtDirectory);

        if (stats.isDirectory()) {
          sites.push({
            domain: domainEntry.name,
            runDirectory,
            sourceDirectory: builtDirectory,
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  return sortByDomain(sites);
}

export async function findBuiltSitesInRun(runDirectory) {
  const domainEntries = await readDirectoryEntries(runDirectory);
  const sites = [];

  for (const domainEntry of domainEntries) {
    if (!domainEntry.isDirectory() || !isDomainLikeDirectoryName(domainEntry.name)) {
      continue;
    }

    const domainDirectory = path.join(runDirectory, domainEntry.name);
    const builtDirectory = path.join(domainDirectory, domainEntry.name);

    try {
      const stats = await fs.stat(builtDirectory);

      if (stats.isDirectory()) {
        sites.push({
          domain: domainEntry.name,
          runDirectory,
          sourceDirectory: builtDirectory,
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return sortByDomain(sites);
}

export function findDuplicateDomains(sites) {
  const byDomain = new Map();

  for (const site of sites) {
    const existing = byDomain.get(site.domain) ?? [];
    existing.push(site);
    byDomain.set(site.domain, existing);
  }

  return [...byDomain.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([domain, matches]) => ({ domain, matches }))
    .sort((first, second) => first.domain.localeCompare(second.domain));
}

export async function ensureReadyDestination(destinationDirectory, archivePath, options = {}) {
  const requireArchivePath = options.requireArchivePath ?? true;

  if (requireArchivePath && await pathExists(archivePath)) {
    throw new Error(`Archive already exists: ${archivePath}`);
  }

  if (!(await pathExists(destinationDirectory))) {
    await fs.mkdir(destinationDirectory, { recursive: true });
    return;
  }

  const entries = await fs.readdir(destinationDirectory);

  if (entries.length > 0) {
    throw new Error(`Destination directory is not empty: ${destinationDirectory}`);
  }
}

export async function buildMovePlan(outputsDirectory, sites) {
  const destinationDirectory = path.join(outputsDirectory, BUILT_SITES_DIRECTORY_NAME);

  return Promise.all(sites.map(async (site) => {
    const destinationDirectoryForDomain = path.join(destinationDirectory, site.domain);

    if (await pathExists(destinationDirectoryForDomain)) {
      throw new Error(`Destination domain folder already exists: ${destinationDirectoryForDomain}`);
    }

    return {
      ...site,
      destinationDirectory: destinationDirectoryForDomain,
    };
  }));
}

export async function moveDirectory(sourceDirectory, destinationDirectory) {
  try {
    await fs.rename(sourceDirectory, destinationDirectory);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }

    await fs.cp(sourceDirectory, destinationDirectory, { recursive: true, errorOnExist: true });
    await fs.rm(sourceDirectory, { recursive: true, force: true });
  }
}

export async function createZipArchive(outputsDirectory, output = process.stdout) {
  const archivePath = path.join(outputsDirectory, BUILT_SITES_ARCHIVE_NAME);
  const sourceDirectory = path.join(outputsDirectory, BUILT_SITES_DIRECTORY_NAME);
  const { default: archiver } = await import('archiver');

  await new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });
    const stream = createWriteStream(archivePath);

    stream.on('close', resolve);
    stream.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') {
        reject(error);
        return;
      }

      output.write(`ZIP archive warning: ${error.message}\n`);
    });

    archive.pipe(stream);
    archive.directory(sourceDirectory, BUILT_SITES_DIRECTORY_NAME);
    archive.finalize();
  }).catch((error) => {
    throw new Error(`Failed to create ZIP archive: ${error.message}`);
  });

  output.write(`Archive created: ${archivePath}\n`);

  return archivePath;
}

export class BuiltSiteArchiver {
  constructor(options = {}) {
    this.projectDirectory = options.projectDirectory ?? process.cwd();
    this.currentRunDirectory = options.currentRunDirectory ?? null;
    this.createArchive = options.createArchive ?? true;
    this.output = options.output ?? process.stdout;
    this.zipArchive = options.zipArchive ?? createZipArchive;
  }

  get outputsDirectory() {
    return path.join(this.projectDirectory, 'outputs');
  }

  get destinationDirectory() {
    return path.join(this.outputsDirectory, BUILT_SITES_DIRECTORY_NAME);
  }

  get archivePath() {
    return path.join(this.outputsDirectory, BUILT_SITES_ARCHIVE_NAME);
  }

  async run(options = {}) {
    const currentRunDirectory = options.currentRunDirectory ?? this.currentRunDirectory;
    const createArchive = options.createArchive ?? this.createArchive;
    const sites = currentRunDirectory
      ? await findBuiltSitesInRun(currentRunDirectory)
      : await findBuiltSites(this.outputsDirectory);

    if (sites.length === 0) {
      throw new Error(`No built site folders found in ${currentRunDirectory ?? this.outputsDirectory}`);
    }

    const duplicates = findDuplicateDomains(sites);

    if (duplicates.length > 0) {
      const details = duplicates.map((duplicate) => (
        `${duplicate.domain}: ${duplicate.matches.map((match) => match.sourceDirectory).join(', ')}`
      ));

      throw new Error(`Duplicate built site domains found:\n${details.join('\n')}`);
    }

    await ensureReadyDestination(this.destinationDirectory, this.archivePath, {
      requireArchivePath: createArchive,
    });

    const movePlan = await buildMovePlan(this.outputsDirectory, sites);

    for (const item of movePlan) {
      await moveDirectory(item.sourceDirectory, item.destinationDirectory);
      this.output.write(`Moved ${item.domain}\n`);
    }

    const archivePath = createArchive
      ? await this.zipArchive(this.outputsDirectory, this.output)
      : null;

    if (!createArchive) {
      this.output.write('Archive creation skipped.\n');
    }

    this.output.write(`Built sites moved: ${movePlan.length}\n`);
    this.output.write(`Destination: ${this.destinationDirectory}\n`);

    return {
      archivePath,
      destinationDirectory: this.destinationDirectory,
      moved: movePlan,
    };
  }
}
