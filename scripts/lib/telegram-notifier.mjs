import fs from 'node:fs/promises';
import path from 'node:path';
import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CONFIG_FILE,
} from './config.mjs';

function buildTelegramApiUrl(method, token = TELEGRAM_BOT_TOKEN) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function requireFetch(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Telegram notifications require Node.js 20 or newer with fetch support');
  }

  return fetchImpl;
}

function getTelegramConfigPath(projectDirectory) {
  return path.join(projectDirectory, TELEGRAM_CONFIG_FILE);
}

function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null || chatId === '') {
    throw new Error('Telegram chat_id cannot be empty');
  }

  return String(chatId);
}

function getChatDisplayName(chat) {
  return chat.title
    || [chat.first_name, chat.last_name].filter(Boolean).join(' ')
    || chat.username
    || String(chat.id);
}

function addChatCandidate(candidates, chat) {
  if (!chat || chat.id === undefined || chat.id === null) {
    return;
  }

  const chatId = normalizeChatId(chat.id);

  candidates.set(chatId, {
    chatId,
    title: getChatDisplayName(chat),
    type: chat.type ?? 'unknown',
  });
}

export function extractChatCandidates(updates) {
  const candidates = new Map();

  for (const update of updates) {
    addChatCandidate(candidates, update.message?.chat);
    addChatCandidate(candidates, update.edited_message?.chat);
    addChatCandidate(candidates, update.channel_post?.chat);
    addChatCandidate(candidates, update.edited_channel_post?.chat);
    addChatCandidate(candidates, update.my_chat_member?.chat);
    addChatCandidate(candidates, update.chat_member?.chat);
  }

  return [...candidates.values()]
    .sort((first, second) => first.title.localeCompare(second.title));
}

export async function loadTelegramConfig(projectDirectory) {
  const configPath = getTelegramConfigPath(projectDirectory);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      chatId: normalizeChatId(parsed.chatId),
      chatTitle: parsed.chatTitle ?? null,
      chatType: parsed.chatType ?? null,
      configPath,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw new Error(`Failed to read Telegram config: ${error.message}`);
  }
}

export async function saveTelegramConfig(projectDirectory, chat) {
  const configPath = getTelegramConfigPath(projectDirectory);
  const config = {
    chatId: normalizeChatId(chat.chatId),
    chatTitle: chat.title ?? null,
    chatType: chat.type ?? null,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return {
    ...config,
    configPath,
  };
}

export async function fetchTelegramChatCandidates(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl);
  const response = await fetchImpl(buildTelegramApiUrl('getUpdates', options.token), {
    method: 'GET',
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram getUpdates failed with HTTP ${response.status}`);
  }

  return extractChatCandidates(data.result ?? []);
}

export async function sendTelegramMessage(options) {
  const fetchImpl = requireFetch(options.fetchImpl);
  const response = await fetchImpl(buildTelegramApiUrl('sendMessage', options.token), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: normalizeChatId(options.chatId),
      disable_web_page_preview: true,
      text: options.text,
    }),
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram sendMessage failed with HTTP ${response.status}`);
  }

  return data.result;
}

export async function notifyTelegram(projectDirectory, text, options = {}) {
  const output = options.output ?? process.stdout;

  try {
    const config = await loadTelegramConfig(projectDirectory);

    if (!config) {
      output.write('Telegram notification skipped: run npm run telegram:setup first.\n');
      return {
        ok: false,
        skipped: true,
      };
    }

    await sendTelegramMessage({
      chatId: config.chatId,
      fetchImpl: options.fetchImpl,
      text,
      token: options.token,
    });

    return {
      ok: true,
      skipped: false,
    };
  } catch (error) {
    output.write(`Telegram notification failed: ${error.message}\n`);

    return {
      error,
      ok: false,
      skipped: false,
    };
  }
}
