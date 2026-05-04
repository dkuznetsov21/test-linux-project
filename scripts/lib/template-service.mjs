import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OUTPUT_PROMPT_USAGE_FILE,
  PLACEHOLDERS,
  PROMPT_DOMAIN_BATCH_SIZE,
  PROMPT_USAGE_LOG_FILE,
} from './config.mjs';

export function renderTemplate(template, values) {
  let rendered = template;

  for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
    const value = values[key];

    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${key} cannot be empty`);
    }

    rendered = rendered.split(placeholder).join(value);
  }

  return rendered;
}

export function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function pickRandomItem(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

export async function readPromptFiles(projectDirectory) {
  const promptsDirectory = path.join(projectDirectory, 'prompts');
  let entries;

  try {
    entries = await fs.readdir(promptsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Prompts folder was not found: ${promptsDirectory}`);
    }

    throw error;
  }

  const promptFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => entry.name)
    .sort();

  if (promptFiles.length === 0) {
    throw new Error(`No .txt prompt files found in ${promptsDirectory}`);
  }

  return Promise.all(promptFiles.map(async (promptFileName) => {
    const promptPath = path.join(promptsDirectory, promptFileName);
    const finalPrompt = await fs.readFile(promptPath, 'utf8');

    if (finalPrompt.trim() === '') {
      throw new Error(`Prompt file cannot be empty: ${promptPath}`);
    }

    return {
      finalPrompt,
      promptFileName,
      promptPath,
    };
  }));
}

export async function readFinalPrompt(projectDirectory) {
  const promptFiles = await readPromptFiles(projectDirectory);

  return pickRandomItem(promptFiles);
}

export function assignPromptBatches(domains, promptFiles, options = {}) {
  const batchSize = options.batchSize ?? PROMPT_DOMAIN_BATCH_SIZE;
  const random = options.random ?? Math.random;
  const domainBatches = chunkArray(domains, batchSize);

  if (domainBatches.length > 1 && promptFiles.length < 2) {
    throw new Error('At least 2 prompt .txt files are required when domains need more than one prompt batch.');
  }

  let previousPromptFileName = null;

  return domainBatches.map((batchDomains, index) => {
    const candidates = promptFiles.filter((promptFile) => (
      promptFile.promptFileName !== previousPromptFileName
    ));
    const promptFile = pickRandomItem(candidates, random);
    previousPromptFileName = promptFile.promptFileName;

    return {
      batchNumber: index + 1,
      domains: batchDomains,
      ...promptFile,
    };
  });
}

export function renderBatchedTemplate(template, values, promptBatches) {
  return promptBatches
    .map((batch) => renderTemplate(template, {
      DOMAINS: batch.domains.join('\n'),
      GEO: values.geo,
      LANGUAGE: values.language,
      TOPIC: values.topic,
      ADDRESS_BLOCK: values.addressBlockByBatch.get(batch.batchNumber),
      FINAL_PROMPT: batch.finalPrompt,
    }))
    .join('\n\n');
}

function buildPromptUsageLines(values) {
  return [
    `Date: ${new Date().toISOString()}`,
    `Output folder: ${values.outputDirectory}`,
    `Prompt batch size: ${values.batchSize}`,
    'Prompt batches:',
    ...values.promptBatches.flatMap((batch) => [
      `Batch ${batch.batchNumber}: ${batch.promptFileName}`,
      ...batch.domains.map((domain) => `- ${domain}`),
    ]),
    '',
  ];
}

export async function writeOutputPromptUsage(outputDirectory, values) {
  const usagePath = path.join(outputDirectory, OUTPUT_PROMPT_USAGE_FILE);
  const lines = buildPromptUsageLines(values);

  await fs.writeFile(usagePath, `${lines.join('\n')}\n`, 'utf8');

  return usagePath;
}

export async function appendPromptUsageLog(projectDirectory, values) {
  const logPath = path.join(projectDirectory, PROMPT_USAGE_LOG_FILE);
  const lines = values.promptBatches
    ? buildPromptUsageLines(values)
    : [
      `Date: ${new Date().toISOString()}`,
      `Output folder: ${values.outputDirectory}`,
      `Prompt file: ${values.promptFileName}`,
      'Domains:',
      ...values.domains.map((domain) => `- ${domain}`),
      '',
    ];

  await fs.appendFile(logPath, `${lines.join('\n')}\n`, 'utf8');

  return logPath;
}
