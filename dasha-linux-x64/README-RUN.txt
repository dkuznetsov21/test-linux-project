Run on Debian/Linux x64:

chmod +x ./dasha
./dasha

The executable expects the agent CLI to be installed and authenticated on this computer.
The first run asks for an access code. Send the displayed Machine ID to the owner to receive a 7-day code.
If telegram-config.json existed during build, it is copied here and used automatically.
Put summary.csv next to ./dasha and choose "Generate CSV summary TXT" to create summary.txt.
Runtime files such as outputs/, site-inputs/, summary.txt, access-license.json, and script-settings.json are created in this folder.
