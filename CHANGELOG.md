# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The first skeleton of stage 1: a window with groups (a sidebar that folds to
  a rail), tabs named and coloured by hand or after their program and folder,
  panes split right and down, resized by their borders, zoomed, closed.
- Shells in pseudo-terminals drawn by `@dskripchenko/terminal`; the workspace,
  each pane's folder and its last output come back after a restart.
- Every action a command with an id: keys (chains too, read by the key's place
  so they work on any layout), a palette that finds in either layout.
- `config.toml` in `shell-data/`, read again on save; themes imported from
  iTerm2, Ghostty, Windows Terminal and base16; the drop-down window on a
  global key.
- Portable builds: zip and AppImage with checksums; CI on three systems.
