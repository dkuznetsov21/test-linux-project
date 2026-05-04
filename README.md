# Baza Prompt Generator

This project contains an interactive Node.js script that creates a ready-to-use `baza.txt` file and then starts Codex in the generated folder.

## Requirements

- Node.js 20 or newer.
- npm.

Install dependencies once:

```bash
npm install
```

The script uses `@faker-js/faker` to generate addresses and `world-countries` to support most ISO country codes.

## Run

From the project root:

```bash
npm run generate:baza
```

Or directly:

```bash
node scripts/generate-baza.mjs
```

## What The Script Asks

The generator asks for:

1. `Customer code` - the first letters for the output folder, for example `DA`.
2. `Domains` - one or more domains, separated by new lines or commas.
3. `Geo country code` - ISO country code, for example `US`, `NZ`, `DE`.
4. `Language` - language value written into `baza.txt`.
5. `Topic` - topic value written into `baza.txt`.

For multi-line inputs, paste the text and press `Enter` on an empty line to finish that section.

The final prompt is not entered in the terminal. The script randomly selects one `.txt` file from `prompts/`, reads the full text from that file, and inserts it into `baza.txt`.

Example prompt file:

```text
prompts/v58fin-acid-pop.txt
```

You can keep several `.txt` prompt files in `prompts/`. For one generator run, all domains use the same selected prompt file.

If the folder has zero `.txt` files, the script stops with an error.

## Domain Input Example

```text
Domains: paste text, then press Enter on an empty line.
example-alpha.com
example-beta.com

```

Comma-separated input also works:

```text
example-alpha.com, example-beta.com

```

## Geo And Addresses

`Geo country code` must be an ISO 3166-1 alpha-2 country code. The script generates one address per domain, and the generated address country matches the selected `Geo`.

Examples:

- `US` - United States
- `AU` - Australia
- `TH` - Thailand
- `NZ` - New Zealand
- `DE` - Germany
- `GB` - United Kingdom
- `FR` - France
- `KR` - South Korea
- `PL` - Poland
- `UA` - Ukraine

Most country codes are supported through the country database. If Faker has a matching locale, the address data is localized. If Faker does not have that locale, the script still uses the correct country name and phone calling code, with English fallback address fields.

`UK` is accepted as an alias and is normalized to `GB`.

## Output

The script creates a folder inside `outputs/`:

```text
outputs/XX DD.MM GEO (TOPIC)/
```

Example:

```text
outputs/LG 05.04 KR (IT Marketing course)/
```

Inside that folder it creates:

```text
baza.txt
```

The `baza.txt` file is rendered from `scripts/baza.txt`.

The script also appends a run record in the project root:

```text
prompt-usage-log.txt
```

Each record contains the generated output folder, selected prompt file, and all domains from that run.

## Codex And Domain Agent Steps

After `baza.txt` is created, the script automatically runs Codex in the generated output folder.

```text
codex --ask-for-approval never exec --skip-git-repo-check --sandbox workspace-write "complete this promt in file baza.txt"
```

The Codex task text is:

```text
complete this promt in file baza.txt
```

The script waits until Codex finishes. Codex is expected to create one folder per domain inside the generated output folder, with a `promt.txt` file inside each domain folder.

After Codex finishes, the script automatically runs Cursor Agent for every domain folder that contains `promt.txt`:

```text
agent --print --force --trust "<content of promt.txt>"
```

The script runs up to 15 domain agents at the same time by default. When one finishes, the next queued domain starts.

You can override the parallel agent limit for one run:

```bash
AGENT_CONCURRENCY=30 npm run generate:baza
```

For every domain, agent output is written to:

```text
agent-output.log
```

inside that domain folder.

While domain agents are running, the script prints progress every 30 seconds and after each completed domain. The progress line includes completed domains, succeeded/failed counts, active runs, queued domains, and elapsed time.

The script continues running the remaining domains even if one domain agent fails. At the end it prints a summary. If every domain succeeds, it prints `All agent runs completed. Script finished.`. If any domain fails, it prints the failed domains and exits with code `1`.

After all domain agents finish, the script validates every domain folder. Each domain folder must contain:

```text
<domain>/
node_modules/
public/
src/
index.html
package.json
package-lock.json
postcss.config.js
promt.txt
tailwind.config.js
tsconfig.json
tsconfig.node.json
vercel.json
vite.config.ts
```

Extra files, such as `agent-output.log`, are allowed. If any required folder or file is missing, the script prints the missing items and exits with code `1`.

## Template Placeholders

The template file `scripts/baza.txt` contains these placeholders:

| Placeholder | Value |
| --- | --- |
| `{{DOMAINS}}` | Normalized domain list |
| `{{GEO}}` | Geo country code |
| `{{LANGUAGE}}` | Language |
| `{{TOPIC}}` | Topic |
| `{{ADDRESS_BLOCK}}` | Auto-generated address block |
| `{{FINAL_PROMPT}}` | Full text from one selected `.txt` file in `prompts/` |

Do not rename placeholders in `scripts/baza.txt` unless you also update `PLACEHOLDERS` in `scripts/generate-baza.mjs`.

## Debug Example

Use 1-2 test domains:

```text
Customer code: DA
Domains: paste text, then press Enter on an empty line.
example-alpha.com
example-beta.com

Geo country code: NZ
Language: English
Topic: Test topic
```

Expected result:

```text
outputs/DA DD.MM NZ (Test topic)/baza.txt
```

## Check Syntax

```bash
npm run check
```
