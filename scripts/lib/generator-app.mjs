import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAddressBlock } from './address-generator.mjs';
import {
  CODEX_ARGS,
  PROMPT_DOMAIN_BATCH_SIZE,
} from './config.mjs';
import { BuiltSiteArchiver } from './built-site-archiver.mjs';
import { DomainAgentRunner } from './domain-agent-runner.mjs';
import { InputSession } from './input-session.mjs';
import {
  buildOutputDirectoryName,
  formatDuration,
  normalizeCustomerCode,
  normalizeDomains,
  normalizeGeo,
} from './normalizers.mjs';
import { OutputValidator } from './output-validator.mjs';
import { runCommand } from './process-runner.mjs';
import {
  appendPromptUsageLog,
  assignPromptBatches,
  readPromptFiles,
  renderBatchedTemplate,
  writeOutputPromptUsage,
} from './template-service.mjs';
import { notifyTelegram } from './telegram-notifier.mjs';

export function buildGeneratorTelegramMessage(summary) {
  return [
    `Baza generator: ${summary.status}`,
    `Duration: ${formatDuration(summary.durationMilliseconds)}`,
    `Domains: ${summary.domainCount ?? 'unknown'}`,
    `Prompt batches: ${summary.promptBatchCount ?? 'unknown'}`,
    `Agents total: ${summary.totalAgentCount ?? 'unknown'}`,
    `Agents succeeded: ${summary.agentSucceededCount ?? 'unknown'}`,
    `Agents failed: ${summary.agentFailedCount ?? 'unknown'}`,
    `Validation valid: ${summary.validationSucceededCount ?? 'unknown'}`,
    `Validation invalid: ${summary.validationFailedCount ?? 'unknown'}`,
    `Prompt: ${summary.promptFileName ?? 'unknown'}`,
    `Output: ${summary.outputDirectory ?? 'unknown'}`,
    ...(summary.error ? [`Error: ${summary.error}`] : []),
  ].join('\n');
}

export function buildDomainAgentsStartedTelegramMessage(summary) {
  return [
    'Baza generator: starting domain agents',
    `Domains: ${summary.domainCount ?? 'unknown'}`,
    `Prompt batches: ${summary.promptBatchCount ?? 'unknown'}`,
    `Agent concurrency: ${summary.agentConcurrencyLimit ?? 'unknown'}`,
    `Prompt: ${summary.promptFileName ?? 'unknown'}`,
    `Output: ${summary.outputDirectory ?? 'unknown'}`,
  ].join('\n');
}

export class BazaGeneratorApp {
  constructor(options = {}) {
    this.projectDirectory = options.projectDirectory
      ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    this.output = options.output ?? process.stdout;
    this.inputSession = options.inputSession ?? new InputSession();
    this.agentRunner = options.agentRunner;
    this.outputValidator = options.outputValidator ?? new OutputValidator(this.output);
    this.agentConcurrencyLimit = options.agentConcurrencyLimit;
    this.builtSiteArchiver = options.builtSiteArchiver;
    this.notifyTelegram = options.notifyTelegram ?? notifyTelegram;
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

  createBuiltSiteArchiver(currentRunDirectory, createArchive) {
    return this.builtSiteArchiver ?? new BuiltSiteArchiver({
      createArchive,
      currentRunDirectory,
      output: this.output,
      projectDirectory: this.projectDirectory,
    });
  }

  async collectStartupChoices() {
    const collectBuiltSites = await this.inputSession.promptYesNo('Collect built sites after successful run?', false);
    const createBuiltSitesZip = await this.inputSession.promptYesNo(
      'Create ZIP after collecting built sites?',
      false,
    );

    return {
      collectBuiltSites,
      createBuiltSitesZip,
    };
  }

  async collectInput() {
    const customerCode = await this.inputSession.promptLine('Customer folder name (2 letters)', normalizeCustomerCode);
    const domains = await this.inputSession.promptBlock('Domains', normalizeDomains);

    if (domains.length > PROMPT_DOMAIN_BATCH_SIZE) {
      throw new Error(`Domains cannot contain more than ${PROMPT_DOMAIN_BATCH_SIZE} entries`);
    }

    return {
      customerCode,
      domains,
      geo: await this.inputSession.promptLine('Geo country code', normalizeGeo),
      language: await this.inputSession.promptLine('Language'),
      topic: await this.inputSession.promptLine('Topic'),
    };
  }

  async run() {
    const startedAt = Date.now();
    const notificationSummary = {
      agentConcurrencyLimit: this.agentConcurrencyLimit ?? null,
      domainCount: null,
      error: null,
      agentFailedCount: null,
      agentSucceededCount: null,
      outputDirectory: null,
      promptBatchCount: null,
      promptFileName: null,
      status: 'failed',
      totalAgentCount: null,
      validationFailedCount: null,
      validationSucceededCount: null,
    };
    const templatePath = path.join(this.projectDirectory, 'scripts', 'baza.txt');
    const outputsDirectory = path.join(this.projectDirectory, 'outputs');

    try {
      const template = await fs.readFile(templatePath, 'utf8');
      const values = await this.collectInput();
      notificationSummary.domainCount = values.domains.length;
      const promptFiles = await readPromptFiles(this.projectDirectory);
      const promptFile = await this.inputSession.promptChoice(
        'Select prompt file',
        promptFiles,
        (item) => item.promptFileName,
      );
      notificationSummary.promptFileName = promptFile.promptFileName;
      this.output.write(`Selected prompt file: ${promptFile.promptFileName}\n`);
      const startupChoices = await this.collectStartupChoices();
      const promptBatches = assignPromptBatches(values.domains, promptFile);
      notificationSummary.promptBatchCount = promptBatches.length;
      const addressBlockByBatch = new Map(promptBatches.map((batch) => [
        batch.batchNumber,
        buildAddressBlock(batch.domains, values.geo),
      ]));
      const outputDirectory = path.join(outputsDirectory, buildOutputDirectoryName(values));
      notificationSummary.outputDirectory = outputDirectory;
      const outputPath = path.join(outputDirectory, 'baza.txt');
      const rendered = renderBatchedTemplate(template, {
        ...values,
        addressBlockByBatch,
      }, promptBatches);

      const promptUsageValues = {
        batchSize: PROMPT_DOMAIN_BATCH_SIZE,
        outputDirectory,
        promptBatches,
      };

      await fs.mkdir(outputDirectory, { recursive: true });
      await fs.writeFile(outputPath, rendered, 'utf8');
      const outputPromptUsagePath = await writeOutputPromptUsage(outputDirectory, promptUsageValues);
      const promptUsageLogPath = await appendPromptUsageLog(this.projectDirectory, promptUsageValues);

      this.output.write(`\nGenerated file: ${outputPath}\n`);
      this.output.write(`Prompt batches: ${promptBatches.length}\n`);
      this.output.write(`Prompt usage file: ${outputPromptUsagePath}\n`);
      this.output.write(`Prompt usage log: ${promptUsageLogPath}\n`);
      this.output.write(`Domains: ${values.domains.length}\n`);
      this.output.write(`Codex command: codex ${CODEX_ARGS.map((arg) => JSON.stringify(arg)).join(' ')}\n`);
      this.output.write('Starting Codex...\n');

      await this.runCodex(outputDirectory);
      this.output.write('Codex completed. Validating domain prompt folders.\n');

      const promptFolderSummary = await this.outputValidator.validatePromptFolders(outputDirectory, values.domains);

      if (!promptFolderSummary.ok) {
        notificationSummary.error = 'Codex output folder validation failed';
        process.exitCode = 1;
        this.output.write('Codex output folder validation failed. Script finished.\n');
        return;
      }

      this.output.write('Domain prompt folders valid. Starting domain agent runs.\n');
      await this.notifyTelegram(this.projectDirectory, buildDomainAgentsStartedTelegramMessage(notificationSummary), {
        output: this.output,
      });

      const agentSummary = await this.createAgentRunner().run(outputDirectory);
      const validationSummary = await this.outputValidator.validate(outputDirectory);
      notificationSummary.agentSucceededCount = agentSummary.successes.length;
      notificationSummary.agentFailedCount = agentSummary.failures.length;
      notificationSummary.totalAgentCount = agentSummary.successes.length + agentSummary.failures.length;
      notificationSummary.validationSucceededCount = validationSummary.successes.length;
      notificationSummary.validationFailedCount = validationSummary.failures.length;

      if (agentSummary.failures.length > 0 || validationSummary.failures.length > 0) {
        notificationSummary.error = 'Agent runs or output validation completed with failures';
        process.exitCode = 1;
        this.output.write('Agent runs or output validation completed with failures. Script finished.\n');
        return;
      }

      if (startupChoices.collectBuiltSites) {
        this.output.write('Collecting built sites for current run.\n');
        await this.createBuiltSiteArchiver(outputDirectory, startupChoices.createBuiltSitesZip).run();
      } else {
        this.output.write('Built site collection skipped.\n');
      }

      notificationSummary.status = 'success';
      this.output.write('All agent runs and output validation completed. Script finished.\n');
    } catch (error) {
      notificationSummary.error = error.message;
      throw error;
    } finally {
      this.inputSession.close();
      await this.notifyTelegram(this.projectDirectory, buildGeneratorTelegramMessage({
        ...notificationSummary,
        durationMilliseconds: Date.now() - startedAt,
      }), {
        output: this.output,
      });
    }
  }
}
