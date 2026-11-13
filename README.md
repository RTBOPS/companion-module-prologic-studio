# companion-module-prologic-studio

Bitfocus Companion module for [PRO-LOGIC Studio](https://pro-logic.studio): run Live Graphics, Stage Timer, Presenter PRO, Teleprompter PRO, Take Board PRO and Intercom PRO from a Stream Deck, with lit keys (Broadcast look) and variables.

See [companion/HELP.md](companion/HELP.md) for setup and the list of keys.

## Development

```bash
npm install
npm run check   # companion-module-check
npm run build   # companion-module-build → prologic-studio-<version>.tgz
```

`skin.js` holds the key images (PNG, base64). They are generated from the PRO-LOGIC app repository (`integrations/companion-module-prologic/skin/build.mjs`) and copied here.

The module talks to `/api/control` on the PRO-LOGIC app with the account's output token and control key; no credentials are stored in this repository.

## License

MIT
