import fs from 'node:fs/promises';
import path from 'node:path';
import { PLACEHOLDERS, PROMPT_USAGE_LOG_FILE } from './config.mjs';

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

export async function readFinalPrompt(projectDirectory) {
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

  const selectedPromptFile = promptFiles[Math.floor(Math.random() * promptFiles.length)];
  const promptPath = path.join(promptsDirectory, selectedPromptFile);
  const finalPrompt = await fs.readFile(promptPath, 'utf8');

  if (finalPrompt.trim() === '') {
    throw new Error(`Prompt file cannot be empty: ${promptPath}`);
  }

  return {
    finalPrompt,
    promptFileName: selectedPromptFile,
    promptPath,
  };
}

export async function appendPromptUsageLog(projectDirectory, values) {
  const logPath = path.join(projectDirectory, PROMPT_USAGE_LOG_FILE);
  const lines = [
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
