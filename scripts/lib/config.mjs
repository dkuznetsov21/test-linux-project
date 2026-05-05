export const PLACEHOLDERS = {
  DOMAINS: '{{DOMAINS}}',
  GEO: '{{GEO}}',
  LANGUAGE: '{{LANGUAGE}}',
  TOPIC: '{{TOPIC}}',
  ADDRESS_BLOCK: '{{ADDRESS_BLOCK}}',
  FINAL_PROMPT: '{{FINAL_PROMPT}}',
};

export const CODEX_PROMPT = 'complete this promt in file baza.txt';
export const CODEX_ARGS = [
  '--ask-for-approval',
  'never',
  'exec',
  '--skip-git-repo-check',
  '--sandbox',
  'workspace-write',
  CODEX_PROMPT,
];

export const PROMPT_USAGE_LOG_FILE = 'prompt-usage-log.txt';
export const OUTPUT_PROMPT_USAGE_FILE = 'prompt-usage.txt';
export const PROMPT_DOMAIN_BATCH_SIZE = 30;
export const AGENT_CONCURRENCY_ENV = 'AGENT_CONCURRENCY';
export const DEFAULT_AGENT_CONCURRENCY_LIMIT = 15;
export const AGENT_OUTPUT_LOG_FILE = 'agent-output.log';
export const AGENT_ARGS_PREFIX = ['--print', '--force', '--trust'];
export const TELEGRAM_BOT_TOKEN = '8648217212:AAFXZfiV02NfaD7l3-0WNLU47M4aufL4GkA';
export const TELEGRAM_CONFIG_FILE = 'telegram-config.json';

export function parsePositiveInteger(value, fallback, name = AGENT_CONCURRENCY_ENV) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function loadRuntimeConfig(env = process.env) {
  return {
    agentConcurrencyLimit: parsePositiveInteger(
      env[AGENT_CONCURRENCY_ENV],
      DEFAULT_AGENT_CONCURRENCY_LIMIT,
    ),
  };
}
