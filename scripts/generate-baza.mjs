#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { allFakers } from '@faker-js/faker';
import countries from 'world-countries';

const PLACEHOLDERS = {
  DOMAINS: '{{DOMAINS}}',
  GEO: '{{GEO}}',
  LANGUAGE: '{{LANGUAGE}}',
  TOPIC: '{{TOPIC}}',
  ADDRESS_BLOCK: '{{ADDRESS_BLOCK}}',
  FINAL_PROMPT: '{{FINAL_PROMPT}}',
};

const COUNTRY_ALIASES = {
  UK: 'GB',
};

const FAKER_LOCALE_BY_COUNTRY = {
  AE: 'ar',
  AM: 'hy',
  AR: 'es',
  AT: 'de_AT',
  AU: 'en_AU',
  AZ: 'az',
  BD: 'bn_BD',
  BE: 'nl_BE',
  BR: 'pt_BR',
  CA: 'en_CA',
  CH: 'de_CH',
  CN: 'zh_CN',
  CZ: 'cs_CZ',
  DE: 'de',
  DK: 'da',
  ES: 'es',
  FI: 'fi',
  FR: 'fr',
  GB: 'en_GB',
  GE: 'ka_GE',
  GH: 'en_GH',
  GR: 'el',
  HK: 'en_HK',
  HR: 'hr',
  HU: 'hu',
  ID: 'id_ID',
  IE: 'en_IE',
  IL: 'he',
  IN: 'en_IN',
  IT: 'it',
  JP: 'ja',
  KR: 'ko',
  LV: 'lv',
  MK: 'mk',
  MX: 'es_MX',
  NG: 'en_NG',
  NL: 'nl',
  NO: 'nb_NO',
  NZ: 'en_AU',
  PL: 'pl',
  PT: 'pt_PT',
  RO: 'ro',
  RS: 'sr_RS_latin',
  RU: 'ru',
  SE: 'sv',
  SK: 'sk',
  SN: 'fr_SN',
  TH: 'th',
  TR: 'tr',
  TW: 'zh_TW',
  UA: 'uk',
  US: 'en_US',
  UY: 'es',
  UZ: 'uz_UZ_latin',
  VN: 'vi',
  ZA: 'en_ZA',
};

const COUNTRY_OVERRIDES = {
  KR: {
    cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan'],
    areas: ['Seoul', 'Busan', 'Incheon', 'Gyeonggi-do', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan'],
    zipCode: { min: 10000, max: 63999 },
  },
  NZ: {
    cities: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Dunedin', 'Tauranga', 'Rotorua', 'Napier'],
    areas: ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Otago', 'Bay of Plenty', 'Hawke\'s Bay'],
    zipCode: { min: 1000, max: 9999 },
  },
  TH: {
    cities: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Nonthaburi', 'Khon Kaen', 'Hat Yai', 'Nakhon Ratchasima'],
    areas: ['Bangkok', 'Chiang Mai', 'Phuket', 'Chonburi', 'Nonthaburi', 'Khon Kaen', 'Songkhla', 'Nakhon Ratchasima'],
    zipCode: { min: 10000, max: 99999 },
  },
};

const CODEX_PROMPT = 'complete this promt in file baza.txt';
const CODEX_ARGS = [
  '--ask-for-approval',
  'never',
  'exec',
  '--skip-git-repo-check',
  '--sandbox',
  'workspace-write',
  CODEX_PROMPT,
];
const PROMPT_USAGE_LOG_FILE = 'prompt-usage-log.txt';
const AGENT_CONCURRENCY_ENV = 'AGENT_CONCURRENCY';
const DEFAULT_AGENT_CONCURRENCY_LIMIT = 15;
const AGENT_CONCURRENCY_LIMIT = parsePositiveInteger(
  process.env[AGENT_CONCURRENCY_ENV],
  DEFAULT_AGENT_CONCURRENCY_LIMIT,
);
const AGENT_OUTPUT_LOG_FILE = 'agent-output.log';
const AGENT_ARGS_PREFIX = ['--print', '--force', '--trust'];
const REQUIRED_DOMAIN_DIRECTORIES = [
  '<domain>',
  'node_modules',
  'public',
  'src',
];
const REQUIRED_DOMAIN_FILES = [
  'index.html',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'promt.txt',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'vercel.json',
  'vite.config.ts',
];

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${AGENT_CONCURRENCY_ENV} must be a positive integer`);
  }

  return parsed;
}

function sanitizeInput(value) {
  return value
    .replace(/\u001b\[200~/g, '')
    .replace(/\u001b\[201~/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '');
}

function normalizeCustomerCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeGeo(value) {
  const geo = value.trim().toUpperCase();

  return COUNTRY_ALIASES[geo] ?? geo;
}

function normalizeTopicForDirectory(value) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeDomains(input) {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDisplayDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}.${month}`;
}

function buildOutputDirectoryName(values) {
  return `${values.customerCode} ${formatDisplayDate()} ${values.geo} (${normalizeTopicForDirectory(values.topic)})`;
}

function getCallingCode(country) {
  const suffix = country.idd.suffixes?.[0];

  if (!country.idd.root) {
    return '+000';
  }

  if (!suffix || country.idd.suffixes.length > 1) {
    return country.idd.root;
  }

  return `${country.idd.root}${suffix}`;
}

function getCountryConfig(geo) {
  const country = countries.find((item) => item.cca2 === geo);

  if (!country) {
    throw new Error(`Unsupported Geo "${geo}". Use a valid ISO 3166-1 alpha-2 country code, for example US, GB, AU, TH, KR, DE.`);
  }

  return {
    locale: FAKER_LOCALE_BY_COUNTRY[geo] ?? 'en',
    country: country.name.common,
    callingCode: getCallingCode(country),
    ...(COUNTRY_OVERRIDES[geo] ?? {}),
  };
}

function getFakerForCountry(config) {
  const faker = allFakers[config.locale] ?? allFakers.en;

  if (!faker) {
    throw new Error(`Faker locale "${config.locale}" is not available`);
  }

  return faker;
}

function safeFake(getValue, fallback) {
  try {
    const value = getValue();

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  } catch {
    // Some localized faker datasets do not provide every location field.
  }

  return fallback;
}

function randomDigits(faker, length) {
  return Array.from({ length }, () => faker.number.int({ min: 0, max: 9 })).join('');
}

function randomNumber(faker, range) {
  return String(faker.number.int(range)).padStart(String(range.max).length, '0');
}

function pickConfiguredValue(faker, values, fallback) {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return faker.helpers.arrayElement(values);
}

function buildPhoneNumber(faker, config) {
  return `${config.callingCode} ${randomDigits(faker, 3)} ${randomDigits(faker, 3)} ${randomDigits(faker, 3)}`;
}

function buildZipCode(faker, config) {
  if (config.zipCode) {
    return randomNumber(faker, config.zipCode);
  }

  return safeFake(() => faker.location.zipCode(), '00000');
}

function buildAddress(faker, config) {
  const city = pickConfiguredValue(faker, config.cities, safeFake(() => faker.location.city(), 'Unknown city'));

  return [
    `Street: ${safeFake(() => faker.location.streetAddress(), 'Unknown street')}`,
    `City: ${city}`,
    `State/province/area: ${pickConfiguredValue(faker, config.areas, safeFake(() => faker.location.state(), city))}`,
    `Phone number: ${buildPhoneNumber(faker, config)}`,
    `Zip code: ${buildZipCode(faker, config)}`,
    `Country calling code: ${config.callingCode}`,
    `Country: ${config.country}`,
  ].join('; ');
}

function buildAddressBlock(domains, geo) {
  const config = getCountryConfig(geo);
  const faker = getFakerForCountry(config);

  return domains
    .map(() => buildAddress(faker, config))
    .join('; ');
}

function renderTemplate(template, values) {
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

async function readFinalPrompt(projectDirectory) {
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

async function appendPromptUsageLog(projectDirectory, values) {
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

function runCodex(outputDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', CODEX_ARGS, {
      cwd: outputDirectory,
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Codex exited with code ${code}`));
    });
  });
}

async function findDomainPromptJobs(outputDirectory) {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const jobs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const domainDirectory = path.join(outputDirectory, entry.name);
    const domainEntries = await fs.readdir(domainDirectory, { withFileTypes: true });
    const promptEntry = domainEntries.find((domainEntry) => (
      domainEntry.isFile() && domainEntry.name.toLowerCase() === 'promt.txt'
    ));

    if (!promptEntry) {
      continue;
    }

    jobs.push({
      domain: entry.name,
      domainDirectory,
      promptPath: path.join(domainDirectory, promptEntry.name),
      logPath: path.join(domainDirectory, AGENT_OUTPUT_LOG_FILE),
    });
  }

  return jobs.sort((first, second) => first.domain.localeCompare(second.domain));
}

function runAgentJob(job) {
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

    await fs.writeFile(job.logPath, [
      `Date: ${startedAt}`,
      `Domain: ${job.domain}`,
      `Working directory: ${job.domainDirectory}`,
      `Command: agent ${AGENT_ARGS_PREFIX.map((arg) => JSON.stringify(arg)).join(' ')} "<content of promt.txt>"`,
      '',
      'Output:',
      '',
    ].join('\n'), 'utf8');

    const logStream = createWriteStream(job.logPath, { flags: 'a' });
    const child = spawn('agent', args, {
      cwd: job.domainDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;

    child.stdout.on('data', (chunk) => {
      logStream.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      logStream.write(chunk);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      logStream.end(`\nAgent process error: ${error.message}\n`, () => {
        resolve({
          ...job,
          ok: false,
          error: error.message,
        });
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      logStream.end(`\nExit code: ${code}\n`, () => {
        resolve({
          ...job,
          ok: code === 0,
          error: code === 0 ? null : `agent exited with code ${code}`,
        });
      });
    });
  });
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return results;
}

async function runDomainAgents(outputDirectory) {
  const jobs = await findDomainPromptJobs(outputDirectory);

  if (jobs.length === 0) {
    throw new Error(`No domain promt.txt files found in ${outputDirectory}`);
  }

  process.stdout.write(`Found domain prompt files: ${jobs.length}\n`);
  process.stdout.write(`Starting Cursor Agent runs with max concurrency ${AGENT_CONCURRENCY_LIMIT}...\n`);

  const startedAt = Date.now();
  const progress = {
    active: 0,
    completed: 0,
    failed: 0,
    succeeded: 0,
  };

  function writeProgress() {
    const queued = Math.max(jobs.length - progress.completed - progress.active, 0);
    process.stdout.write(
      `[agent] Progress: ${progress.completed}/${jobs.length} completed ` +
      `(${progress.succeeded} ok, ${progress.failed} failed), ` +
      `${progress.active} active, ${queued} queued, elapsed ${formatDuration(Date.now() - startedAt)}\n`,
    );
  }

  const progressTimer = setInterval(writeProgress, 30000);

  const results = await (async () => {
    try {
      return await runWithConcurrency(jobs, AGENT_CONCURRENCY_LIMIT, async (job) => {
        progress.active += 1;
        process.stdout.write(`[agent] Starting ${job.domain}\n`);
        const result = await runAgentJob(job);
        progress.active -= 1;
        progress.completed += 1;

        if (result.ok) {
          progress.succeeded += 1;
        } else {
          progress.failed += 1;
        }

        process.stdout.write(`[agent] ${result.ok ? 'Completed' : 'Failed'} ${job.domain}\n`);
        writeProgress();

        return result;
      });
    } finally {
      clearInterval(progressTimer);
    }
  })();

  writeProgress();

  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);

  process.stdout.write(`\nAgent summary: ${successes.length} succeeded, ${failures.length} failed.\n`);

  if (failures.length > 0) {
    process.stdout.write('Failed domains:\n');

    for (const failure of failures) {
      process.stdout.write(`- ${failure.domain}: ${failure.error}. Log: ${failure.logPath}\n`);
    }
  }

  return {
    failures,
    successes,
  };
}

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

async function validateDomainOutput(job) {
  const missing = [];

  for (const directoryName of REQUIRED_DOMAIN_DIRECTORIES) {
    const expectedDirectoryName = directoryName === '<domain>' ? job.domain : directoryName;
    const expectedPath = path.join(job.domainDirectory, expectedDirectoryName);
    const exists = await pathExistsAsType(expectedPath, 'directory');

    if (!exists) {
      missing.push(`${expectedDirectoryName}/`);
    }
  }

  for (const fileName of REQUIRED_DOMAIN_FILES) {
    const expectedPath = path.join(job.domainDirectory, fileName);
    const exists = await pathExistsAsType(expectedPath, 'file');

    if (!exists) {
      missing.push(fileName);
    }
  }

  return {
    ...job,
    missing,
    ok: missing.length === 0,
  };
}

async function validateDomainOutputs(outputDirectory) {
  const jobs = await findDomainPromptJobs(outputDirectory);

  if (jobs.length === 0) {
    throw new Error(`No domain promt.txt files found for validation in ${outputDirectory}`);
  }

  const results = [];

  for (const job of jobs) {
    results.push(await validateDomainOutput(job));
  }

  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);

  process.stdout.write(`\nOutput validation summary: ${successes.length} valid, ${failures.length} invalid.\n`);

  if (failures.length > 0) {
    process.stdout.write('Invalid domain folders:\n');

    for (const failure of failures) {
      process.stdout.write(`- ${failure.domain}: missing ${failure.missing.join(', ')}\n`);
    }
  }

  return {
    failures,
    successes,
  };
}

class InputSession {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      crlfDelay: Infinity,
    });
    this.iterator = this.rl[Symbol.asyncIterator]();
  }

  async promptLine(label, transform = (value) => value) {
    process.stdout.write(`${label}: `);

    const { value: raw, done } = await this.iterator.next();

    if (done) {
      throw new Error(`${label} was not provided`);
    }

    const value = transform(sanitizeInput(raw).trim());

    if (!value) {
      throw new Error(`${label} cannot be empty`);
    }

    return value;
  }

  async promptBlock(label, transform = (value) => value) {
    process.stdout.write(`${label}: paste text, then press Enter on an empty line.\n`);

    const lines = [];

    while (true) {
      const { value: raw, done } = await this.iterator.next();

      if (done) {
        break;
      }

      const line = sanitizeInput(raw);

      if (line.trim() === '') {
        break;
      }

      lines.push(line);
    }

    const value = transform(lines.join('\n').trim());

    if (!value || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`${label} cannot be empty`);
    }

    return value;
  }

  close() {
    this.rl.close();
  }
}

async function main() {
  const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const templatePath = path.join(projectDirectory, 'scripts', 'baza.txt');
  const outputsDirectory = path.join(projectDirectory, 'outputs');
  const template = await fs.readFile(templatePath, 'utf8');
  const { finalPrompt, promptFileName, promptPath } = await readFinalPrompt(projectDirectory);

  const inputSession = new InputSession();

  try {
    const customerCode = await inputSession.promptLine('Customer folder name (2 letters)', normalizeCustomerCode);
    const domains = await inputSession.promptBlock('Domains', normalizeDomains);
    const geo = await inputSession.promptLine('Geo country code', normalizeGeo);
    const language = await inputSession.promptLine('Language');
    const topic = await inputSession.promptLine('Topic');

    const addressBlock = buildAddressBlock(domains, geo);
    const outputDirectory = path.join(outputsDirectory, buildOutputDirectoryName({ customerCode, geo, topic }));
    const outputPath = path.join(outputDirectory, 'baza.txt');
    const rendered = renderTemplate(template, {
      DOMAINS: domains.join('\n'),
      GEO: geo,
      LANGUAGE: language,
      TOPIC: topic,
      ADDRESS_BLOCK: addressBlock,
      FINAL_PROMPT: finalPrompt,
    });

    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, rendered, 'utf8');
    const promptUsageLogPath = await appendPromptUsageLog(projectDirectory, {
      domains,
      outputDirectory,
      promptFileName,
    });

    process.stdout.write(`\nGenerated file: ${outputPath}\n`);
    process.stdout.write(`Prompt file: ${promptPath}\n`);
    process.stdout.write(`Prompt usage log: ${promptUsageLogPath}\n`);
    process.stdout.write(`Domains: ${domains.length}\n`);
    process.stdout.write(`Codex command: codex ${CODEX_ARGS.map((arg) => JSON.stringify(arg)).join(' ')}\n`);
    process.stdout.write('Starting Codex...\n');

    await runCodex(outputDirectory);
    process.stdout.write('Codex completed. Starting domain agent runs.\n');

    const agentSummary = await runDomainAgents(outputDirectory);
    const validationSummary = await validateDomainOutputs(outputDirectory);

    if (agentSummary.failures.length > 0 || validationSummary.failures.length > 0) {
      process.exitCode = 1;
      process.stdout.write('Agent runs or output validation completed with failures. Script finished.\n');
      return;
    }

    process.stdout.write('All agent runs and output validation completed. Script finished.\n');
  } finally {
    inputSession.close();
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
