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
    const previousPrompt = this.rl.getPrompt();

    if (this.isTerminal) {
      this.rl.setPrompt(`${label}: `);
      this.rl.prompt();
    } else {
      this.output.write(`${label}: `);
    }

    const { value: raw, done } = await this.iterator.next();

    if (this.isTerminal) {
      this.rl.setPrompt(previousPrompt);
    }

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
    const previousPrompt = this.rl.getPrompt();

    if (this.isTerminal) {
      this.rl.setPrompt(`${label}> `);
    }

    while (true) {
      if (this.isTerminal) {
        this.rl.prompt();
      } else {
        this.output.write(`${label}> `);
      }

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

    if (this.isTerminal) {
      this.rl.setPrompt(previousPrompt);
    }

    const value = transform(lines.join('\n').trim());

    if (!value || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`${label} cannot be empty`);
    }

    return value;
  }

  async promptChoice(label, choices, formatChoice = (choice) => String(choice), options = {}) {
    if (choices.length === 0) {
      throw new Error(`${label} has no choices`);
    }

    const defaultIndex = options.defaultIndex ?? 0;

    if (!Number.isInteger(defaultIndex) || defaultIndex < 0 || defaultIndex >= choices.length) {
      throw new Error(`${label} default choice must be between 1 and ${choices.length}`);
    }

    if (choices.length === 1) {
      this.output.write(`${label}: ${formatChoice(choices[0])}\n`);
      return choices[0];
    }

    if (!this.isTerminal || typeof this.input.setRawMode !== 'function') {
      return this.promptNumberedChoice(label, choices, formatChoice, {
        allowDefault: options.allowDefault ?? false,
        defaultIndex,
      });
    }

    return this.promptInteractiveChoice(label, choices, formatChoice, { defaultIndex });
  }

  async promptNumberedChoice(label, choices, formatChoice, options = {}) {
    this.output.write(`${label}:\n`);

    choices.forEach((choice, index) => {
      const defaultMarker = options.allowDefault && index === options.defaultIndex ? ' (default)' : '';
      this.output.write(`${index + 1}. ${formatChoice(choice)}${defaultMarker}\n`);
    });

    this.output.write(`${label} number: `);

    const { value: raw, done } = await this.iterator.next();

    if (done) {
      throw new Error(`${label} number was not provided`);
    }

    const selectedNumber = ((value) => {
      if (options.allowDefault && value === '') {
        return options.defaultIndex + 1;
      }

      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
        throw new Error(`${label} number must be between 1 and ${choices.length}`);
      }

      return parsed;
    })(sanitizeInput(raw).trim());

    return choices[selectedNumber - 1];
  }

  promptInteractiveChoice(label, choices, formatChoice, options = {}) {
    return new Promise((resolve, reject) => {
      let selectedIndex = options.defaultIndex ?? 0;
      let rendered = false;
      const wasRaw = this.input.isRaw;

      const render = () => {
        if (rendered) {
          readline.moveCursor(this.output, 0, -(choices.length + 1));
        }

        readline.cursorTo(this.output, 0);
        readline.clearScreenDown(this.output);
        this.output.write(`${label}:\n`);

        choices.forEach((choice, index) => {
          this.output.write(`${index === selectedIndex ? '> ' : '  '}${formatChoice(choice)}\n`);
        });

        rendered = true;
      };

      const cleanup = () => {
        this.input.off('keypress', onKeypress);
        this.input.off('end', onEnd);
        this.input.setRawMode(Boolean(wasRaw));
        this.rl.resume();
      };

      const finish = () => {
        cleanup();
        resolve(choices[selectedIndex]);
      };

      const cancel = () => {
        cleanup();
        reject(new Error(`${label} was not selected`));
      };

      const onEnd = () => {
        cleanup();
        reject(new Error(`${label} input closed before selection`));
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
      this.input.resume();
      this.input.on('keypress', onKeypress);
      this.input.on('end', onEnd);
      render();
    });
  }

  promptYesNo(label, defaultValue = false) {
    if (!this.isTerminal || typeof this.input.setRawMode !== 'function') {
      const defaultLabel = defaultValue ? 'yes' : 'no';

      this.output.write(`${label} (yes/no, default ${defaultLabel}): `);

      return this.iterator.next().then(({ value: raw, done }) => {
        if (done) {
          throw new Error(`${label} was not provided`);
        }

        const value = sanitizeInput(raw).trim().toLowerCase();

        if (value === '') {
          return defaultValue;
        }

        if (value === 'yes' || value === 'y') {
          return true;
        }

        if (value === 'no' || value === 'n') {
          return false;
        }

        throw new Error(`${label} must be yes or no`);
      });
    }

    return this.promptChoice(
      label,
      defaultValue ? [true, false] : [false, true],
      (choice) => (choice ? 'Yes' : 'No'),
      {
        allowDefault: true,
        defaultIndex: 0,
      },
    );
  }

  close() {
    this.rl.close();
  }
}
