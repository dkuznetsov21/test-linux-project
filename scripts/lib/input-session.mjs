import readline from 'node:readline';
import { sanitizeInput } from './normalizers.mjs';

export class InputSession {
  constructor(input = process.stdin, output = process.stdout) {
    this.rl = readline.createInterface({
      input,
      output,
      terminal: Boolean(input.isTTY && output.isTTY),
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
