import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENT_OUTPUT_LOG_FILE } from './config.mjs';
import {
  buildTemplateAdaptationPrompt,
  findDomainPromptJobs,
} from './domain-agent-runner.mjs';

const PROMPT_FILE_NAME = 'promt.txt';
const SKIPPED_TEMPLATE_ENTRIES = new Set([
  '.git',
  'dist',
  'node_modules',
  AGENT_OUTPUT_LOG_FILE,
  PROMPT_FILE_NAME,
]);
const SKIPPED_REFERENCE_DIRECTORIES = new Set([
  '.git',
  'node_modules',
]);
const SKIPPED_REFERENCE_FILES = new Set([
  AGENT_OUTPUT_LOG_FILE,
  PROMPT_FILE_NAME,
]);

export function buildFastTemplateAdaptationPrompt(job, prompt, templateJob) {
  return buildTemplateAdaptationPrompt(job, prompt, {
    templateDomain: templateJob.domain,
  });
}

export async function cleanDomainDirectoryPreservingPrompt(job) {
  const entries = await fs.readdir(job.domainDirectory, { withFileTypes: true });
  const promptPath = path.resolve(job.promptPath);

  for (const entry of entries) {
    const entryPath = path.join(job.domainDirectory, entry.name);

    if (path.resolve(entryPath) === promptPath) {
      continue;
    }

    await fs.rm(entryPath, { recursive: true, force: true });
  }
}

function shouldCopyTemplateEntry(entry, templateJob) {
  if (SKIPPED_TEMPLATE_ENTRIES.has(entry.name)) {
    return false;
  }

  return entry.name !== templateJob.domain;
}

export async function copyTemplateSkeleton(templateJob, targetJob) {
  await cleanDomainDirectoryPreservingPrompt(targetJob);

  const entries = await fs.readdir(templateJob.domainDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!shouldCopyTemplateEntry(entry, templateJob)) {
      continue;
    }

    await fs.cp(
      path.join(templateJob.domainDirectory, entry.name),
      path.join(targetJob.domainDirectory, entry.name),
      {
        errorOnExist: true,
        recursive: true,
      },
    );
  }
}

async function readTextFileIfPossible(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      return null;
    }

    if (error.code === 'ERR_INVALID_ARG_VALUE') {
      return null;
    }

    throw error;
  }
}

async function findTemplateReferencesInDirectory(directory, templateDomain, matches = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED_REFERENCE_DIRECTORIES.has(entry.name)) {
        await findTemplateReferencesInDirectory(path.join(directory, entry.name), templateDomain, matches);
      }

      continue;
    }

    if (!entry.isFile() || SKIPPED_REFERENCE_FILES.has(entry.name)) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const content = await readTextFileIfPossible(filePath);

    if (content?.includes(templateDomain)) {
      matches.push(filePath);
    }
  }

  return matches;
}

export async function findTemplateDomainReferences(jobs, templateJob) {
  const adaptedJobs = jobs.filter((job) => job.domain !== templateJob.domain);
  const matches = [];

  for (const job of adaptedJobs) {
    const filePaths = await findTemplateReferencesInDirectory(job.domainDirectory, templateJob.domain);

    for (const filePath of filePaths) {
      matches.push({
        domain: job.domain,
        filePath,
        templateDomain: templateJob.domain,
      });
    }
  }

  return matches;
}

export async function prepareTemplateSkeletons(outputDirectory, templateJob) {
  const jobs = await findDomainPromptJobs(outputDirectory);
  const targetJobs = jobs.filter((job) => job.domain !== templateJob.domain);

  for (const job of targetJobs) {
    await copyTemplateSkeleton(templateJob, job);
  }

  return targetJobs;
}
