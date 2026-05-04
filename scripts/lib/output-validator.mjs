import fs from 'node:fs/promises';
import path from 'node:path';
import {
  REQUIRED_DOMAIN_DIRECTORIES,
  REQUIRED_DOMAIN_FILES,
} from './config.mjs';
import { findDomainPromptJobs } from './domain-agent-runner.mjs';

async function pathExistsAsType(targetPath, expectedType) {
  try {
    const stats = await fs.stat(targetPath);

    if (expectedType === 'directory') {
      return stats.isDirectory();
    }

    return stats.isFile();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function sortValues(values) {
  return [...values].sort((first, second) => first.localeCompare(second));
}

function isDomainLikeDirectoryName(name) {
  return /^[^\s./\\][^\s/\\]*\.[^\s/\\]+$/.test(name);
}

export class OutputValidator {
  constructor(output = process.stdout) {
    this.output = output;
  }

  async validatePromptFolders(outputDirectory, expectedDomains) {
    const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
    const topLevelDirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const jobs = await findDomainPromptJobs(outputDirectory);
    const actualPromptDomains = new Set(jobs.map((job) => job.domain));
    const expectedDomainSet = new Set(expectedDomains);
    const missingDirectories = sortValues(expectedDomains.filter((domain) => !topLevelDirectories.includes(domain)));
    const missingPrompts = sortValues(expectedDomains.filter((domain) => (
      topLevelDirectories.includes(domain) && !actualPromptDomains.has(domain)
    )));
    const unexpectedDirectories = sortValues(topLevelDirectories.filter((domain) => !expectedDomainSet.has(domain)));
    const ok = missingDirectories.length === 0
      && missingPrompts.length === 0
      && unexpectedDirectories.length === 0;

    if (!ok) {
      this.output.write('\nDomain prompt folder validation failed:\n');

      if (missingDirectories.length > 0) {
        this.output.write(`Missing domain folders: ${missingDirectories.join(', ')}\n`);
      }

      if (missingPrompts.length > 0) {
        this.output.write(`Missing promt.txt files: ${missingPrompts.join(', ')}\n`);
      }

      if (unexpectedDirectories.length > 0) {
        this.output.write(`Unexpected domain folders: ${unexpectedDirectories.join(', ')}\n`);
      }
    }

    return {
      missingDirectories,
      missingPrompts,
      ok,
      unexpectedDirectories,
    };
  }

  async validateDomainOutput(job) {
    const directoryChecks = REQUIRED_DOMAIN_DIRECTORIES.map(async (directoryName) => {
      const expectedDirectoryName = directoryName === '<domain>' ? job.domain : directoryName;
      const expectedPath = path.join(job.domainDirectory, expectedDirectoryName);
      const exists = await pathExistsAsType(expectedPath, 'directory');

      return exists ? null : `${expectedDirectoryName}/`;
    });

    const fileChecks = REQUIRED_DOMAIN_FILES.map(async (fileName) => {
      const expectedPath = path.join(job.domainDirectory, fileName);
      const exists = await pathExistsAsType(expectedPath, 'file');

      return exists ? null : fileName;
    });

    const nestedEntries = await fs.readdir(job.domainDirectory, { withFileTypes: true });
    const unexpectedNestedDomainFolders = nestedEntries
      .filter((entry) => (
        entry.isDirectory()
        && entry.name !== job.domain
        && isDomainLikeDirectoryName(entry.name)
      ))
      .map((entry) => `unexpected ${entry.name}/`);
    const missing = [
      ...(await Promise.all([...directoryChecks, ...fileChecks])).filter(Boolean),
      ...unexpectedNestedDomainFolders,
    ];

    return {
      ...job,
      missing,
      ok: missing.length === 0,
    };
  }

  async validate(outputDirectory) {
    const jobs = await findDomainPromptJobs(outputDirectory);

    if (jobs.length === 0) {
      throw new Error(`No domain promt.txt files found for validation in ${outputDirectory}`);
    }

    const results = await Promise.all(jobs.map((job) => this.validateDomainOutput(job)));
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    this.output.write(`\nOutput validation summary: ${successes.length} valid, ${failures.length} invalid.\n`);

    if (failures.length > 0) {
      this.output.write('Invalid domain folders:\n');

      for (const failure of failures) {
        this.output.write(`- ${failure.domain}: missing ${failure.missing.join(', ')}\n`);
      }
    }

    return {
      failures,
      successes,
    };
  }
}
