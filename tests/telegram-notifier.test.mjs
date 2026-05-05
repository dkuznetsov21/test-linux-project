import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ensureTelegramConfig,
  extractChatCandidates,
  fetchTelegramChatCandidates,
  formatTelegramChat,
  notifyTelegram,
  saveTelegramConfig,
  sendTelegramMessage,
  setupTelegramConfig,
} from '../scripts/lib/telegram-notifier.mjs';

function createJsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('extractChatCandidates finds unique Telegram chats', () => {
  const candidates = extractChatCandidates([
    { message: { chat: { id: -1001, title: 'Build Alerts', type: 'group' } } },
    { channel_post: { chat: { id: -1002, title: 'Deploy Channel', type: 'channel' } } },
    { edited_message: { chat: { id: -1001, title: 'Build Alerts', type: 'group' } } },
  ]);

  assert.deepEqual(candidates, [
    { chatId: '-1001', title: 'Build Alerts', type: 'group' },
    { chatId: '-1002', title: 'Deploy Channel', type: 'channel' },
  ]);
});

test('fetchTelegramChatCandidates calls getUpdates and parses chats', async () => {
  const calls = [];
  const candidates = await fetchTelegramChatCandidates({
    fetchImpl: async (url, options) => {
      calls.push({ options, url });

      return createJsonResponse({
        ok: true,
        result: [
          { message: { chat: { id: 123, first_name: 'Dmytro', type: 'private' } } },
        ],
      });
    },
    token: 'token',
  });

  assert.match(calls[0].url, /bottoken\/getUpdates$/);
  assert.equal(calls[0].options.method, 'GET');
  assert.deepEqual(candidates, [
    { chatId: '123', title: 'Dmytro', type: 'private' },
  ]);
});

test('formatTelegramChat formats chat title, type, and id', () => {
  assert.equal(formatTelegramChat({
    chatId: '-1001',
    title: 'Build Alerts',
    type: 'group',
  }), 'Build Alerts (group, -1001)');
});

test('ensureTelegramConfig returns existing config without fetching updates', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-notifier-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  await saveTelegramConfig(projectDirectory, {
    chatId: '-1001',
    title: 'Build Alerts',
    type: 'group',
  });
  const config = await ensureTelegramConfig(projectDirectory, {
    promptChoice: async () => {
      throw new Error('promptChoice should not be called');
    },
  }, { write: () => {} }, {
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
    token: 'token',
  });

  assert.equal(config.chatId, '-1001');
  assert.equal(config.chatTitle, 'Build Alerts');
  assert.equal(config.chatType, 'group');
});

test('ensureTelegramConfig runs setup when config is missing', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-notifier-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  const writes = [];
  const choices = [];
  const config = await ensureTelegramConfig(projectDirectory, {
    promptChoice: async (label, candidates) => {
      choices.push({ candidates, label });
      return candidates[0];
    },
  }, { write: (value) => writes.push(value) }, {
    fetchImpl: async () => createJsonResponse({
      ok: true,
      result: [
        { message: { chat: { id: -1001, title: 'Build Alerts', type: 'group' } } },
      ],
    }),
    token: 'token',
  });

  assert.equal(config.chatId, '-1001');
  assert.equal(choices[0].label, 'Select Telegram chat');
  assert.equal(choices[0].candidates[0].title, 'Build Alerts');
  assert.match(writes.join(''), /Telegram config not found. Starting Telegram setup./);
  assert.match(writes.join(''), /Telegram chat saved: Build Alerts \(group, -1001\)/);

  const saved = JSON.parse(await fs.readFile(path.join(projectDirectory, 'telegram-config.json'), 'utf8'));
  assert.equal(saved.chatId, '-1001');
});

test('setupTelegramConfig rejects empty Telegram chat candidates', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-notifier-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));

  await assert.rejects(
    () => setupTelegramConfig(projectDirectory, {
      promptChoice: async () => {
        throw new Error('promptChoice should not be called');
      },
    }, { write: () => {} }, {
      fetchImpl: async () => createJsonResponse({
        ok: true,
        result: [],
      }),
      token: 'token',
    }),
    /No Telegram chats found/,
  );
});

test('sendTelegramMessage posts Telegram sendMessage request', async () => {
  const calls = [];

  await sendTelegramMessage({
    chatId: '-1001',
    fetchImpl: async (url, options) => {
      calls.push({ options, url });

      return createJsonResponse({
        ok: true,
        result: { message_id: 1 },
      });
    },
    text: 'Hello',
    token: 'token',
  });

  assert.match(calls[0].url, /bottoken\/sendMessage$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    chat_id: '-1001',
    disable_web_page_preview: true,
    text: 'Hello',
  });
});

test('notifyTelegram sends configured Telegram message', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-notifier-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  await saveTelegramConfig(projectDirectory, {
    chatId: '-1001',
    title: 'Build Alerts',
    type: 'group',
  });

  const calls = [];
  const result = await notifyTelegram(projectDirectory, 'Done', {
    fetchImpl: async (url, options) => {
      calls.push({ options, url });

      return createJsonResponse({
        ok: true,
        result: { message_id: 1 },
      });
    },
    output: { write: () => {} },
    token: 'token',
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(calls[0].options.body).chat_id, '-1001');
});

test('notifyTelegram reports Telegram send failure without throwing', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-notifier-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  await saveTelegramConfig(projectDirectory, {
    chatId: '-1001',
    title: 'Build Alerts',
    type: 'group',
  });
  const writes = [];
  const result = await notifyTelegram(projectDirectory, 'Done', {
    fetchImpl: async () => createJsonResponse({
      description: 'Bad Request',
      ok: false,
    }, false, 400),
    output: { write: (value) => writes.push(value) },
    token: 'token',
  });

  assert.equal(result.ok, false);
  assert.match(writes.join(''), /Telegram notification failed: Bad Request/);
});
