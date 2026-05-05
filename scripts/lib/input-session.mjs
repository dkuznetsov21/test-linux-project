import readline from 'node:readline';
import { sanitizeInput } from './normalizers.mjs';

export class InputSession {
  constructor(input = process.stdin, output = process.stdout) {
    this.input = input;
    this.output = output;
    this.isTerminal = Boolean(input.isTTY && output.isTTY);
    this.rl = readline.createInterface({
      input,
      output,
      terminal: this.isTerminal,
      crlfDelay: Infinity,
    });
    this.iterator = this.rl[Symbol.asyncIterator]();
  }

  async promptLine(label, transform = (value) => value) {
    this.output.write(`${label}: `);

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
    this.output.write(`${label}: paste text, then press Enter on an empty line.\n`);

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

  async promptChoice(label, choices, formatChoice = (choice) => String(choice)) {
    if (choices.length === 0) {
      throw new Error(`${label} has no choices`);
    }

    if (choices.length === 1) {
      this.output.write(`${label}: ${formatChoice(choices[0])}\n`);
      return choices[0];
    }

    if (!this.isTerminal || typeof this.input.setRawMode !== 'function') {
      return this.promptNumberedChoice(label, choices, formatChoice);
    }

    return this.promptInteractiveChoice(label, choices, formatChoice);
  }

  async promptNumberedChoice(label, choices, formatChoice) {
    this.output.write(`${label}:\n`);

    choices.forEach((choice, index) => {
      this.output.write(`${index + 1}. ${formatChoice(choice)}\n`);
    });

    const selectedNumber = await this.promptLine(`${label} number`, (value) => {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
        throw new Error(`${label} number must be between 1 and ${choices.length}`);
      }

      return parsed;
    });

    return choices[selectedNumber - 1];
  }

  promptInteractiveChoice(label, choices, formatChoice) {
    return new Promise((resolve, reject) => {
      let selectedIndex = 0;
      const wasRaw = this.input.isRaw;

      const render = () => {
        this.output.write('\x1B[2K\x1B[0G');
        this.output.write(`${label}:\n`);

        choices.forEach((choice, index) => {
          this.output.write(`${index === selectedIndex ? '> ' : '  '}${formatChoice(choice)}\n`);
        });

        this.output.write(`\x1B[${choices.length}A`);
      };

      const cleanup = () => {
        this.input.off('keypress', onKeypress);
        this.input.setRawMode(Boolean(wasRaw));
        this.rl.resume();
      };

      const finish = () => {
        this.output.write(`\x1B[${choices.length - selectedIndex}B`);
        cleanup();
        resolve(choices[selectedIndex]);
      };

      const cancel = () => {
        cleanup();
        reject(new Error(`${label} was not selected`));
      };

      const onKeypress = (value, key = {}) => {
        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
          render();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % choices.length;
          render();
          return;
        }

        if (key.name === 'return' || key.name === 'enter') {
          finish();
          return;
        }

        if (key.ctrl && key.name === 'c') {
          cancel();
        }
      };

      this.rl.pause();
      readline.emitKeypressEvents(this.input, this.rl);
      this.input.setRawMode(true);
      this.input.on('keypress', onKeypress);
      render();
    });
  }

  close() {
    this.rl.close();
  }
}
