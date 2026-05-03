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

There is no automated test suite yet. For changes to generator logic:

- run `node --check scripts/generate-baza.mjs`
- execute `node scripts/generate-baza.mjs` with sample input
- verify placeholder replacement, output naming, and error handling for empty required values

If tests are added later, place them under `tests/` or alongside the script with a clear `*.test.*` naming scheme.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use a simple imperative commit style such as `Add domain validation for generator output`. Keep commits focused on one change.

For pull requests, include:

- a short summary of behavior changes
- sample input/output when generator behavior changes
- any template contract updates, especially added or removed placeholders

## Configuration Notes

Do not rename placeholders in `scripts/baza.txt` without updating `PLACEHOLDERS` and renderer validation in `scripts/generate-baza.mjs`.
