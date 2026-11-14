# shell

A terminal for macOS, Windows and Linux, made to replace the system one:
groups of tabs, tabs named and coloured, panes split every way, every action
on keys of your own — and, later, AI agents in their panes, files the Midnight
Commander way, and documents with live diagrams. Portable and offline: no
installer, no account, no telemetry.

> Status: **stage 1, a skeleton.** What works now: groups (a sidebar that folds
> to a rail), tabs, splits, the palette, keys of your own (chains too, on any
> keyboard layout), `config.toml` read again on save, themes imported from
> iTerm2, Ghostty, Windows Terminal and base16, the drop-down window on a
> global key, and the workspace with each pane's output back after a restart.
> The plan is in [FEATURES.md](FEATURES.md) (in Russian).

## Development

```sh
pnpm install
pnpm start          # build and run
pnpm test           # unit tests
pnpm test:e2e       # build, start the app and drive it
pnpm dist           # portable archives into release/
```

Settings, themes and the last session live in `shell-data/` beside the program
(`.shell-data/` in the working folder while developing; `SHELL_DATA` points
elsewhere).

## License

MIT — see [LICENSE](LICENSE).
