import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAddressBlock } from './address-generator.mjs';
import { CODEX_ARGS } from './config.mjs';
import { DomainAgentRunner } from './domain-agent-runner.mjs';
import { InputSession } from './input-session.mjs';
import {
  buildOutputDirectoryName,
  normalizeCustomerCode,
  normalizeDomains,
  normalizeGeo,
} from './normalizers.mjs';
import { OutputValidator } from './output-validator.mjs';
import { runCommand } from './process-runner.mjs';
import {
  appendPromptUsageLog,
  readFinalPrompt,
  renderTemplate,
} from './template-service.mjs';

export class BazaGeneratorApp {
  constructor(options = {}) {
    this.projectDirectory = options.projectDirectory
      ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    this.output = options.output ?? process.stdout;
    this.inputSession = options.inputSession ?? new InputSession();
    this.agentRunner = options.agentRunner;
    this.outputValidator = options.outputValidator ?? new OutputValidator(this.output);
    this.agentConcurrencyLimit = options.agentConcurrencyLimit;
  }

  runCodex(outputDirectory) {
    return runCommand('codex', CODEX_ARGS, {
      cwd: outputDirectory,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  }

  createAgentRunner() {
    return this.agentRunner ?? new DomainAgentRunner({
      concurrencyLimit: this.agentConcurrencyLimit,
      output: this.output,
    });
  }

  async collectInput() {
    return {
      customerCode: await this.inputSession.promptLine('Customer folder name (2 letters)', normalizeCustomerCode),
      domains: await this.inputSession.promptBlock('Domains', normalizeDomains),
      geo: await this.inputSession.promptLine('Geo country code', normalizeGeo),
      language: await this.inputSession.promptLine('Language'),
      topic: await this.inputSession.promptLine('Topic'),
    };
  }

  async run() {
    const templatePath = path.join(this.projectDirectory, 'scripts', 'baza.txt');
    const outputsDirectory = path.join(this.projectDirectory, 'outputs');
    const template = await fs.readFile(templatePath, 'utf8');
    const { finalPrompt, promptFileName, promptPath } = await readFinalPrompt(this.projectDirectory);

    try {
      const values = await this.collectInput();
      const addressBlock = buildAddressBlock(values.domains, values.geo);
      const outputDirectory = path.join(outputsDirectory, buildOutputDirectoryName(values));
      const outputPath = path.join(outputDirectory, 'baza.txt');
      const rendered = renderTemplate(template, {
        DOMAINS: values.domains.join('\n'),
        GEO: values.geo,
        LANGUAGE: values.language,
        TOPIC: values.topic,
        ADDRESS_BLOCK: addressBlock,
        FINAL_PROMPT: finalPrompt,
      });

      await fs.mkdir(outputDirectory, { recursive: true });
      await fs.writeFile(outputPath, rendered, 'utf8');
      const promptUsageLogPath = await appendPromptUsageLog(this.projectDirectory, {
        domains: values.domains,
        outputDirectory,
        promptFileName,
      });

      this.output.write(`\nGenerated file: ${outputPath}\n`);
      this.output.write(`Prompt file: ${promptPath}\n`);
      this.output.write(`Prompt usage log: ${promptUsageLogPath}\n`);
      this.output.write(`Domains: ${values.domains.length}\n`);
      this.output.write(`Codex command: codex ${CODEX_ARGS.map((arg) => JSON.stringify(arg)).join(' ')}\n`);
      this.output.write('Starting Codex...\n');

      await this.runCodex(outputDirectory);
      this.output.write('Codex completed. Starting domain agent runs.\n');

      const agentSummary = await this.createAgentRunner().run(outputDirectory);
      const validationSummary = await this.outputValidator.validate(outputDirectory);

      if (agentSummary.failures.length > 0 || validationSummary.failures.length > 0) {
        process.exitCode = 1;
        this.output.write('Agent runs or output validation completed with failures. Script finished.\n');
        return;
      }

      this.output.write('All agent runs and output validation completed. Script finished.\n');
    } finally {
      this.inputSession.close();
    }
  }
}
