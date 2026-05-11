Run on Debian/Linux x64:

chmod +x ./dasha
./dasha

The executable expects the agent CLI to be installed and authenticated on this computer.
The first run asks for an access code. Send the displayed Machine ID to the owner to receive a 7-day code.
If telegram-config.json existed during build, it is copied here and used automatically.
Put the downloaded prompt ZIP in outputs/. "Run Prompt ZIP Workflow" extracts it, creates summary.txt from extracted summary.csv, then starts agents.
You can still put summary.csv next to ./dasha and choose "Build Summary TXT from CSV" for a manual summary-only run.
Runtime files such as outputs/, site-inputs/, summary.txt, access-license.json, and script-settings.json are created in this folder.
