import fs from 'node:fs/promises';
import path from 'node:path';
import { buildAddressBlock } from './address-generator.mjs';
import {
  CODEX_ARGS,
  PROMPT_DOMAIN_BATCH_SIZE,
} from './config.mjs';
import { findDomainPromptJobs } from './domain-agent-runner.mjs';
import {
  BazaGeneratorApp,
  buildDomainAgentsStartedTelegramMessage,
  buildGeneratorTelegramMessage,
} from './generator-app.mjs';
import {
  buildOutputDirectoryName,
  formatDuration,
} from './normalizers.mjs';
import {
  appendPromptUsageLog,
  assignPromptBatches,
  readPromptFiles,
  renderBatchedTemplate,
  writeOutputPromptUsage,
} from './template-service.mjs';
import {
  buildFastTemplateAdaptationPrompt,
  findTemplateDomainReferences,
  prepareTemplateSkeletons,
} from './fast-template-workflow.mjs';

export function buildFastTemplateTelegramMessage(summary) {
  return [
    `Baza fast template generator: ${summary.status}`,
    `Duration: ${formatDuration(summary.durationMilliseconds)}`,
    `Domains: ${summary.domainCount ?? 'unknown'}`,
    `Template domain: ${summary.templateDomain ?? 'unknown'}`,
    `Adapted domains: ${summary.adaptedDomainCount ?? 'unknown'}`,
    `Agents succeeded: ${summary.agentSucceededCount ?? 'unknown'}`,
    `Agents failed: ${summary.agentFailedCount ?? 'unknown'}`,
    `Validation valid: ${summary.validationSucceededCount ?? 'unknown'}`,
    `Validation invalid: ${summary.validationFailedCount ?? 'unknown'}`,
    `Template leaks: ${summary.templateLeakCount ?? 'unknown'}`,
    `Prompt: ${summary.promptFileName ?? 'unknown'}`,
    `Output: ${summary.outputDirectory ?? 'unknown'}`,
    ...(summary.error ? [`Error: ${summary.error}`] : []),
  ].join('\n');
}

export class FastTemplateGeneratorApp extends BazaGeneratorApp {
  async run() {
    const startedAt = Date.now();
    const notificationSummary = {
      adaptedDomainCount: null,
      agentConcurrencyLimit: this.agentConcurrencyLimit ?? null,
      agentFailedCount: null,
      agentSucceededCount: null,
      domainCount: null,
      error: null,
      outputDirectory: null,
      promptBatchCount: null,
      promptFileName: null,
      status: 'failed',
      templateDomain: null,
      templateLeakCount: null,
      totalAgentCount: null,
      validationFailedCount: null,
      validationSucceededCount: null,
    };
    const templatePath = path.join(this.projectDirectory, 'scripts', 'baza.txt');
    const outputsDirectory = path.join(this.projectDirectory, 'outputs');

    try {
      await this.ensureTelegramConfig(this.projectDirectory, this.inputSession, this.output);
      const template = await fs.readFile(templatePath, 'utf8');
      const values = await this.collectInput();
      notificationSummary.domainCount = values.domains.length;

      if (values.domains.length > PROMPT_DOMAIN_BATCH_SIZE) {
        throw new Error(`Domains cannot contain more than ${PROMPT_DOMAIN_BATCH_SIZE} entries`);
      }

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

      const jobs = await findDomainPromptJobs(outputDirectory);
      const templateJob = jobs[0];
      const agentRunner = this.createAgentRunner();

      notificationSummary.templateDomain = templateJob.domain;
      notificationSummary.adaptedDomainCount = Math.max(jobs.length - 1, 0);
      this.output.write(`Fast template mode: generating ${templateJob.domain} from scratch first.\n`);
      await this.notifyTelegram(this.projectDirectory, buildDomainAgentsStartedTelegramMessage(notificationSummary), {
        output: this.output,
      });

      const templateAgentSummary = await agentRunner.runJobs([templateJob]);
      const templateValidation = await this.outputValidator.validateDomainOutput(templateJob);

      if (templateAgentSummary.failures.length > 0 || !templateValidation.ok) {
        notificationSummary.agentSucceededCount = templateAgentSummary.successes.length;
        notificationSummary.agentFailedCount = templateAgentSummary.failures.length;
        notificationSummary.validationSucceededCount = templateValidation.ok ? 1 : 0;
        notificationSummary.validationFailedCount = templateValidation.ok ? 0 : 1;
        notificationSummary.error = 'Template domain generation failed';
        process.exitCode = 1;
        this.output.write('Template domain generation failed. Fast template workflow stopped.\n');
        return;
      }

      const adaptedJobs = await prepareTemplateSkeletons(outputDirectory, templateJob);
      let adaptedAgentSummary = {
        failures: [],
        successes: [],
      };

      if (adaptedJobs.length > 0) {
        this.output.write(`Fast template mode: adapting ${adaptedJobs.length} domains from ${templateJob.domain}.\n`);
        adaptedAgentSummary = await agentRunner.runJobs(adaptedJobs, {
          promptBuilder: (job, prompt) => buildFastTemplateAdaptationPrompt(job, prompt, templateJob),
        });
      }

      const validationSummary = await this.outputValidator.validate(outputDirectory);
      const templateReferenceMatches = await findTemplateDomainReferences(jobs, templateJob);
      const allAgentFailures = [
        ...templateAgentSummary.failures,
        ...adaptedAgentSummary.failures,
      ];
      const allAgentSuccesses = [
        ...templateAgentSummary.successes,
        ...adaptedAgentSummary.successes,
      ];

      notificationSummary.agentSucceededCount = allAgentSuccesses.length;
      notificationSummary.agentFailedCount = allAgentFailures.length;
      notificationSummary.totalAgentCount = allAgentSuccesses.length + allAgentFailures.length;
      notificationSummary.validationSucceededCount = validationSummary.successes.length;
      notificationSummary.validationFailedCount = validationSummary.failures.length;
      notificationSummary.templateLeakCount = templateReferenceMatches.length;

      if (allAgentFailures.length > 0 || validationSummary.failures.length > 0 || templateReferenceMatches.length > 0) {
        notificationSummary.error = templateReferenceMatches.length > 0
          ? 'Template domain references remained in adapted sites'
          : 'Agent runs or output validation completed with failures';
        process.exitCode = 1;

        if (templateReferenceMatches.length > 0) {
          this.output.write('Template domain references remained in adapted sites:\n');

          for (const match of templateReferenceMatches) {
            this.output.write(`- ${match.domain}: ${match.filePath}\n`);
          }
        }

        this.output.write('Fast template workflow completed with failures. Script finished.\n');
        return;
      }

      if (startupChoices.collectBuiltSites) {
        this.output.write('Collecting built sites for current run.\n');
        await this.createBuiltSiteArchiver(outputDirectory, startupChoices.createBuiltSitesZip).run();
      } else {
        this.output.write('Built site collection skipped.\n');
      }

      notificationSummary.status = 'success';
      this.output.write('Fast template workflow completed. Script finished.\n');
    } catch (error) {
      notificationSummary.error = error.message;
      throw error;
    } finally {
      this.inputSession.close();
      await this.notifyTelegram(this.projectDirectory, buildFastTemplateTelegramMessage({
        ...notificationSummary,
        durationMilliseconds: Date.now() - startedAt,
      }), {
        output: this.output,
      });
    }
  }
}
