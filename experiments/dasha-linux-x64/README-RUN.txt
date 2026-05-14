Experimental Dasha fast template build for Debian/Linux x64:

chmod +x ./dasha
./dasha

This experimental binary includes two modes:
1. Run Standard Workflow - generate every domain from its full prompt.
2. Run Prompt ZIP Fast Template Workflow - generate the first domain fully, then adapt remaining domains from its skeleton.

The executable expects codex and agent CLIs to be installed and authenticated on this computer.
Keep prompts/ and scripts/baza.txt next to ./dasha if you want to edit them without rebuilding.
Runtime files such as outputs/ and telegram-config.json are created in this folder.
