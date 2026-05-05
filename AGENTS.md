# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a small Node.js CLI utility centered in `scripts/`.

- `scripts/generate-baza.mjs`: interactive generator that reads template input, prompts for values, and writes a dated `.txt` output file.
- `scripts/baza.txt`: source template containing required placeholders such as `{{DOMAINS}}` and `{{FINAL_PROMPT}}`.

Keep new automation code in `scripts/`. Keep reusable prompt templates as plain text files next to the generator unless a larger structure becomes necessary.

## Build, Test, and Development Commands

- `node scripts/generate-baza.mjs`: run the generator locally.
- `node --check scripts/generate-baza.mjs`: validate JavaScript syntax without executing prompts.

Example:

```bash
node scripts/generate-baza.mjs
```

The script writes output files into `scripts/` using the pattern `YYYY-MM-DD_geo_language_topic.txt`.

## Coding Style & Naming Conventions

Use modern ESM JavaScript with Node built-ins only unless there is a clear reason to add dependencies. Follow the existing file style in `scripts/generate-baza.mjs`:

- 2-space indentation
- semicolons enabled
- `camelCase` for functions and variables
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for constants and placeholder maps

Prefer small, single-purpose helpers such as `normalizeDomains()` and `buildOutputFileName()`.

## Testing Guidelines

For changes to generator logic:

- run `node --check scripts/generate-baza.mjs`
- run the focused `node --test ...` test file when one exists
- run `npm test` for broad behavioral changes
- execute `node scripts/generate-baza.mjs` with sample input when interactive behavior changes
- verify placeholder replacement, output naming, and error handling for empty required values

Write or update unit tests for critical generator behavior, validation rules, notification formatting, concurrency helpers, and parsing/normalization logic. Documentation-only changes do not need tests when no runtime behavior changes.

Place tests under `tests/` or alongside the script with a clear `*.test.*` naming scheme.

## Multi-Agent Development Workflow

Use a multi-agent workflow for non-trivial implementation work when the tool environment supports it.

- Developer agent: acts first and implements the change. Treat this role as a senior JavaScript/TypeScript architect who specializes in Node.js automation scripts and keeps changes aligned with this repository's ESM style.
- Tester agent: acts after the developer implementation. It reviews risks, edge cases, regressions, and test coverage, then runs or recommends the focused verification commands.

The main agent remains responsible for integrating results, resolving conflicts, preserving user changes, running final checks, and updating memory. For small docs-only edits, it is acceptable to perform the roles locally without spawning separate agents.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use a simple imperative commit style such as `Add domain validation for generator output`. Keep commits focused on one change.

For pull requests, include:

- a short summary of behavior changes
- sample input/output when generator behavior changes
- any template contract updates, especially added or removed placeholders

## Configuration Notes

Do not rename placeholders in `scripts/baza.txt` without updating `PLACEHOLDERS` and renderer validation in `scripts/generate-baza.mjs`.

## Long-Term Project Memory

This project may contain a local Obsidian-compatible memory vault in `memory/`. The folder is intentionally ignored by git.

When `memory/00 Index.md` exists, read it at the start of non-trivial work to recover durable project context. Update the memory when a conversation changes durable knowledge, including architecture, data flow, validation rules, scripts, operational workflow, user preferences, important decisions, or unresolved follow-ups.

Use Obsidian wiki links such as `[[02 Architecture]]` and `[[04 Decisions]]`. Keep updates concise and durable. Do not paste full chat transcripts, secrets, transient command output, generated logs, or one-off implementation noise.

At the end of substantial work, append a dated bullet to `memory/05 Work Log.md` and update any affected topic note. If the memory folder does not exist, do not create it unless the user asks for long-term memory.
