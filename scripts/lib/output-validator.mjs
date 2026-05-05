import fs from 'node:fs/promises';
import path from 'node:path';
import { findDomainPromptJobs } from './domain-agent-runner.mjs';

async function directoryExistsAndIsNotEmpty(targetPath) {
  try {
    const stats = await fs.stat(targetPath);

    if (!stats.isDirectory()) {
      return false;
    }

    const entries = await fs.readdir(targetPath);

    return entries.length > 0;
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
    const builtSiteDirectory = path.join(job.domainDirectory, job.domain);
    const hasBuiltSiteDirectory = await directoryExistsAndIsNotEmpty(builtSiteDirectory);
    const missing = hasBuiltSiteDirectory ? [] : [`${job.domain}/`];

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
