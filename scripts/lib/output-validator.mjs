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

export class OutputValidator {
  constructor(output = process.stdout) {
    this.output = output;
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

    const missing = (await Promise.all([...directoryChecks, ...fileChecks])).filter(Boolean);

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
