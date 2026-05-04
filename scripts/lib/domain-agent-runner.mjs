import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_ARGS_PREFIX,
  AGENT_OUTPUT_LOG_FILE,
} from './config.mjs';
import { formatDuration } from './normalizers.mjs';
import { runWithConcurrency } from './process-runner.mjs';

export async function findDomainPromptJobs(outputDirectory) {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  const jobs = await Promise.all(directories.map(async (entry) => {
    const domainDirectory = path.join(outputDirectory, entry.name);
    const domainEntries = await fs.readdir(domainDirectory, { withFileTypes: true });
    const promptEntry = domainEntries.find((domainEntry) => (
      domainEntry.isFile() && domainEntry.name.toLowerCase() === 'promt.txt'
    ));

    if (!promptEntry) {
      return null;
    }

    return {
      domain: entry.name,
      domainDirectory,
      promptPath: path.join(domainDirectory, promptEntry.name),
      logPath: path.join(domainDirectory, AGENT_OUTPUT_LOG_FILE),
    };
  }));

  return jobs
    .filter(Boolean)
    .sort((first, second) => first.domain.localeCompare(second.domain));
}

export class ProgressReporter {
  constructor(total, output = process.stdout, intervalMilliseconds = 30000) {
    this.total = total;
    this.output = output;
    this.intervalMilliseconds = intervalMilliseconds;
    this.startedAt = Date.now();
    this.timer = null;
    this.active = 0;
    this.completed = 0;
    this.failed = 0;
    this.succeeded = 0;
  }

  start() {
    this.timer = setInterval(() => this.write(), this.intervalMilliseconds);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  markStarted() {
    this.active += 1;
  }

  markFinished(result) {
    this.active -= 1;
    this.completed += 1;

    if (result.ok) {
      this.succeeded += 1;
    } else {
      this.failed += 1;
    }
  }

  write() {
    const queued = Math.max(this.total - this.completed - this.active, 0);
    this.output.write(
      `[agent] Progress: ${this.completed}/${this.total} completed ` +
      `(${this.succeeded} ok, ${this.failed} failed), ` +
      `${this.active} active, ${queued} queued, elapsed ${formatDuration(Date.now() - this.startedAt)}\n`,
    );
  }
}

export class DomainAgentRunner {
  constructor(options) {
    this.concurrencyLimit = options.concurrencyLimit;
    this.output = options.output ?? process.stdout;
  }

  runAgentJob(job) {
    return new Promise(async (resolve) => {
      let prompt;

      try {
        prompt = await fs.readFile(job.promptPath, 'utf8');

        if (prompt.trim() === '') {
          resolve({
            ...job,
            ok: false,
            error: 'promt.txt is empty',
          });
          return;
        }
      } catch (error) {
        resolve({
          ...job,
          ok: false,
          error: error.message,
        });
        return;
      }

      const startedAt = new Date().toISOString();
      const args = [...AGENT_ARGS_PREFIX, prompt];

      try {
        await fs.writeFile(job.logPath, [
          `Date: ${startedAt}`,
          `Domain: ${job.domain}`,
          `Working directory: ${job.domainDirectory}`,
          `Command: agent ${AGENT_ARGS_PREFIX.map((arg) => JSON.stringify(arg)).join(' ')} "<content of promt.txt>"`,
          '',
          'Output:',
          '',
        ].join('\n'), 'utf8');
      } catch (error) {
        resolve({
          ...job,
          ok: false,
          error: error.message,
        });
        return;
      }

      const logStream = createWriteStream(job.logPath, { flags: 'a' });
      const child = spawn('agent', args, {
        cwd: job.domainDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let settled = false;
      let logStreamError = null;

      const settle = (result, logSuffix) => {
        if (settled) {
          return;
        }

        settled = true;
        if (logStreamError || logStream.destroyed) {
          resolve(logStreamError ? {
            ...result,
            ok: false,
            error: logStreamError.message,
          } : result);
          return;
        }

        logStream.end(logSuffix, () => resolve(result));
      };

      logStream.on('error', (error) => {
        logStreamError = error;
      });

      child.stdout.on('data', (chunk) => {
        if (!logStreamError) {
          logStream.write(chunk);
        }
      });

      child.stderr.on('data', (chunk) => {
        if (!logStreamError) {
          logStream.write(chunk);
        }
      });

      child.on('error', (error) => {
        settle({
          ...job,
          ok: false,
          error: error.message,
        }, `\nAgent process error: ${error.message}\n`);
      });

      child.on('close', (code) => {
        settle({
          ...job,
          ok: code === 0,
          error: code === 0 ? null : `agent exited with code ${code}`,
        }, `\nExit code: ${code}\n`);
      });
    });
  }

  async run(outputDirectory) {
    const jobs = await findDomainPromptJobs(outputDirectory);

    if (jobs.length === 0) {
      throw new Error(`No domain promt.txt files found in ${outputDirectory}`);
    }

    this.output.write(`Found domain prompt files: ${jobs.length}\n`);
    this.output.write(`Starting Cursor Agent runs with max concurrency ${this.concurrencyLimit}...\n`);

    const progressReporter = new ProgressReporter(jobs.length, this.output);
    progressReporter.start();

    const results = await (async () => {
      try {
        return await runWithConcurrency(jobs, this.concurrencyLimit, async (job) => {
          progressReporter.markStarted();
          this.output.write(`[agent] Starting ${job.domain}\n`);
          const result = await this.runAgentJob(job);
          progressReporter.markFinished(result);

          this.output.write(`[agent] ${result.ok ? 'Completed' : 'Failed'} ${job.domain}\n`);
          progressReporter.write();

          return result;
        });
      } finally {
        progressReporter.stop();
      }
    })();

    progressReporter.write();

    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    this.output.write(`\nAgent summary: ${successes.length} succeeded, ${failures.length} failed.\n`);

    if (failures.length > 0) {
      this.output.write('Failed domains:\n');

      for (const failure of failures) {
        this.output.write(`- ${failure.domain}: ${failure.error}. Log: ${failure.logPath}\n`);
      }
    }

    return {
      failures,
      successes,
    };
  }
}
