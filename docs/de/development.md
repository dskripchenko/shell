# Entwicklung

Node 20 oder neuer, pnpm 10; eine C++-Toolchain nur dort, wo node-pty keine
fertige Binärdatei hat.

```sh
pnpm install
pnpm start                 # bauen und starten (Daten in .shell-data/ hier)
pnpm test                  # Unit-Tests (vitest)
pnpm test:e2e              # bauen, die App starten und steuern (Playwright)
pnpm lint && pnpm typecheck
pnpm dist                  # portable Archive nach release/
pnpm readme:shots          # die Screenshots in docs/images (braucht ImageMagick)
```

`SHELL_DATA` legt die Daten woanders ab; `SHELL_E2E=1` lässt das Fenster den
Fokus nicht nehmen.

## Wie es gebaut ist

- Electron mit node-pty; das Fenster ist Vue 3, läuft in einer Sandbox und
  spricht mit dem Hauptprozess nur über die Preload-Brücke.
- Der Emulator ist [`@dskripchenko/terminal`](https://github.com/dskripchenko/terminal),
  im DOM gezeichnet: VT/xterm-Sequenzen, Scrollback, Shell-Marken, Bilder,
  das kitty-Tastaturprotokoll.
- `src/common/` — Logik ohne Electron und DOM, durch Unit-Tests abgedeckt:
  der Arbeitsbereich (Gruppen → Tabs → Teilungen, unveränderlich), Tasten,
  die Konfiguration, Themes, Zustände der Agenten, Trigger, Projekte, Pfade in
  Archiven.
- `src/main/` — Fenster und IPC, die Shells (`pty.ts`), die Sitzung,
  Einstellungen, git, Dateien, Archive, SSH und SFTP, das Schema des
  Betrachters, die lokale API für folio, Updates.
- `src/renderer/` — das Fenster: Bereiche, Palette, Dateibereiche, Betrachter.
- `packages/shell-integration` — [`@dskripchenko/shell-integration`](https://www.npmjs.com/package/@dskripchenko/shell-integration)
  auf npm: die Marken der Shells, ihr Leser, das Journal der Bearbeitungen von
  Agenten; veröffentlicht über einen Tag `shell-integration-v<Version>`.

Ein Release: die Version in `package.json` und ein Abschnitt in
`CHANGELOG.md`, dann ein Tag `v<Version>` — der Workflow baut die Archive auf
drei Systemen und veröffentlicht sie mit dem Text aus dem Changelog.
