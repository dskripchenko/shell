# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-14

The first release: stage 1 of the plan — a terminal to use instead of the
system one.

### Added

- Groups of tabs in a sidebar that folds to a rail (Cmd/Ctrl+B); tabs named
  and coloured by hand or after their program and folder, dragged within their
  group or onto another; panes split right and down, resized by their borders,
  zoomed, closed; the unfocused panes dimmed.
- Shells in pseudo-terminals drawn by `@dskripchenko/terminal`; each pane's
  folder followed (asked of the system on macOS and Linux, said by PowerShell
  on Windows) with its git branch in the status bar.
- The workspace, each pane's folder and its last output back after a restart.
- Every action a command with an id: keys read by the key's place, so they
  work on any layout; chains (`ctrl+a>c`); defaults for each system (Cmd on a
  Mac, Ctrl+Shift elsewhere); a palette that finds in either keyboard layout.
- `config.toml` in `shell-data/`, read again on save, its mistakes in the
  status bar; profiles (`[profiles.<name>]`: program, arguments, environment,
  folder, theme) given to a group or opened from the palette; themes imported
  from iTerm2, Ghostty, Windows Terminal and base16; a drop-down window on a
  global key.
- Find in the output, copy and paste, font size, clear.
- Updates: once a day at start the latest release is fetched, checked against
  its `.sha256` and put in the program's place on leaving.
- Portable builds — zip for macOS and Windows, AppImage for Linux — with
  checksums and build provenance.
