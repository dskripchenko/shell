# Development

Node 20 or later, pnpm 10; a C++ toolchain only where node-pty has no prebuilt
binary.

```sh
pnpm install
pnpm start                 # build and run (data in .shell-data/ here)
pnpm test                  # unit tests (vitest)
pnpm test:e2e              # build, start the app and drive it (Playwright)
pnpm lint && pnpm typecheck
pnpm dist                  # portable archives into release/
pnpm readme:shots          # the screenshots in docs/images (needs ImageMagick)
```

`SHELL_DATA` puts the data elsewhere; `SHELL_E2E=1` keeps the window from
taking focus.

## How it is made

- Electron with node-pty; the window is Vue 3, run sandboxed with a preload
  bridge as its only way to the main process.
- The emulator is [`@dskripchenko/terminal`](https://github.com/dskripchenko/terminal),
  drawn in the DOM: VT/xterm sequences, scrollback, shell marks, pictures,
  the kitty keyboard protocol.
- `src/common/` — logic without Electron or the DOM, covered by unit tests:
  the workspace (groups → tabs → splits, immutable), keys, the config,
  themes, agents' states, triggers, projects, archives' paths.
- `src/main/` — the windows and IPC, the shells (`pty.ts`), the session,
  settings, git, files, archives, SSH and SFTP, the viewer's scheme, the local
  API for folio, updates.
- `src/renderer/` — the window: panes, palette, panels, viewer.
- `src/locales/` — the interface's words in English, Russian, German and
  Chinese; a new string goes into all four (a unit test checks).
- `packages/shell-integration` — [`@dskripchenko/shell-integration`](https://www.npmjs.com/package/@dskripchenko/shell-integration)
  on npm: the shells' marks, their reader, the journal of agents' edits;
  published by a tag `shell-integration-v<version>`.

A release: the version in `package.json` and a section in `CHANGELOG.md`, then
a tag `v<version>` — the workflow builds the archives on three systems and
publishes them with the changelog's text.
