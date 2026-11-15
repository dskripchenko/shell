# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-11-15

Updates from the settings, as in folio; agents' marks only for real work.

### Added

- Updates in the settings, as in folio: the version, a *Check now* button that becomes *Restart and update to …* once the update is downloaded, the download's progress, and the daily check switch. A check asked for (from the settings or the palette) says its outcome: the latest version, an update ready, or why it failed.

### Fixed

- An agent started with no task shows no "working" mark: its output counts as work only after the person gives it a task (Enter, an answer to its question, or a prompt on its command line). Typing a prompt, redrawing on resize, or showing its tab no longer starts the spinner.
- On macOS the first tab no longer sits right against the window buttons.
- Archives made on a Mac no longer show macOS's attribute files in the file panels: `._name` beside `name` (tar) and the `__MACOSX` folder (zip); they are not extracted either.

## [0.8.0] - 2026-11-14

The interface in four languages: English, Russian, German, Chinese.

### Added

- The interface in English, Russian, German and Chinese: `[ui] language`
  in config.toml (`auto` — the system's language) or the language in the
  settings, applied at once. The first config.toml is written with comments
  in that language; messages of the main process, the menu, notifications,
  file sizes and dates follow it too.

### Changed

- The built-in themes are called `UID Dark` and `UID Light`; the old Russian
  names still work in config.toml and profiles.

## [0.7.0] - 2026-11-14

The «later» list done: input to every pane, triggers, prompts, blocks, pictures, archives, finding and comparing files, the project's tree, previews.

### Added

- Previews in the viewer: a PDF in Chromium's own viewer (pages, zoom,
  search, printing); an HTML page as a page — sandboxed, its folder's files
  only, no network, nothing of the window — or as code on request.
- The project's tree beside the panes (Cmd+Shift+E, Ctrl+Shift+X
  elsewhere): the focused pane's repository (or its folder), folders opened
  as they are clicked, the files git sees changed — and the folders they are
  in — marked. Enter or a double click shows a file in the viewer;
  Cmd/Ctrl+Enter on a folder takes the pane there.
- Finding files in the file panels (Alt+F7, as in MC): a name mask
  (`*.ts;*.vue`) and a text inside if wanted, from the panel's folder down
  (`.git` and `node_modules` passed over); Enter on a result takes the panel
  to it. Two folders compared (Ctrl+X D): in each panel, the files the other
  lacks, differs in size, or has older — marked, ready for F5.
- Archives as folders in the file panels: zip (and jar, docx, whl…), tar,
  tar.gz — Enter goes in, `..` out to beside it; F3 and Enter show a file,
  F5 copies files and folders out (nothing written over). Read only; read by
  shell itself, no program needed; a name that would leave the folder it is
  copied to is passed over.
- Pictures in the terminal (`@dskripchenko/terminal` 0.8.0): sixel and the
  kitty graphics protocol — what chafa, timg, yazi, matplotlib's backends
  draw — shown over their cells, scrolled with the text, cleared with the
  screen. Only what comes in the output is shown, never a file a program
  names. Pictures are not brought back after a restart (the text is).
- Commands as blocks (`@dskripchenko/terminal` 0.7.0): a command's mark, or
  a right click in its output, opens its menu — copy the command, its output,
  or both as Markdown; run it again (when the shell waits at its prompt).
- A prompt library: texts for agents as files in `shell-data/prompts/*.md`
  (three examples to start with). Cmd+Shift+L (Ctrl+Shift+L elsewhere) picks
  one and pastes it into the focused pane without Enter, its places filled
  in: `{selection}`, `{file}` (the viewer's), `{cwd}`, `{branch}`,
  `{clipboard}`. The palette saves a selection as a new prompt and opens the
  folder.
- Triggers (`[[triggers]]` in config.toml): a pattern in the output and what
  a line with it does — highlighted in a colour, said (a notification when
  the pane is out of sight, the status bar when in it), a dot on the tab
  until it is looked at, or a text typed in (an answer to `[y/N]`). With the
  shell's marks only a command's output is read, never the line typed at
  the prompt; a line fires once, a prompt not ended by a newline too.
- Input to every pane at once (Broadcast Input): Cmd+Alt+I (Ctrl+Shift+Alt+I
  elsewhere) sends what is typed in a pane to every pane of its tab; the
  palette has it for the whole group too. The panes it reaches are outlined,
  the status bar says it is on and turns it off. Only what the person types
  or pastes goes — not the terminal's answers to a program, not the mouse.

### Changed

- A change of settings makes the panes' views again only when what they
  draw with changed (font, theme, triggers, profiles): a selection is no
  longer lost when the file is saved for something else.

## [0.6.0] - 2026-11-14

Stage 3 closes: the rest shared with folio.

### Added

- folio's projects in the project switcher (Cmd/Ctrl+Shift+O), after shell's
  own: a running folio lists them in its presence file, shell keeps the last
  list for when folio is closed; one opens as a group in its folder.
- The local API says the terminal's look (`/api/look`: the themes by day and
  by night, the font) and shell's projects (`/api/projects`): folio's
  consoles take the same colours, its palette lists shell's projects.

### Changed

- Group and tab colours are the same nine as folio's tab groups (blue,
  green, orange, purple, pink, teal, red, yellow, grey); colours chosen
  before stay as they were.
- The drop-down window's key by default is Ctrl+Alt+\`: Ctrl+\`, taken by it
  system-wide, is the console's in folio and VS Code. A key set in
  `config.toml` stays as set.

## [0.5.0] - 2026-11-14

Agents' edits told apart; documents edited in folio.

### Added

- A journal of agents' edits shared with folio: Claude Code's hook (added
  with the others by the palette's Claude Code command) appends each edit to
  `.git/agent-edits.jsonl` of the repository — the same for its worktrees,
  never committed — with the shell pane the agent runs in. The changes panel
  says who edited each file: this pane's agent, another tab's, or one outside
  shell; and shows only this agent's edits on request.

- Documents are edited in folio, shell's viewer only reads: Edit in folio in
  the viewer's header, and a double click on a paragraph, a heading, an item
  or a line of code opens the file in folio at that line (found by the
  block's text in the source). Without folio, the system's program opens it.

## [0.4.0] - 2026-11-14

Stage 3 begins: projects, git on the tabs, folio both ways, settings with fields.

### Added

- Projects: a group saved as a project (Save group as project in the
  palette) keeps its tabs, splits, each pane's folder — by its place in the
  repository — and profile, and the agent that ran in it. The switcher
  (Cmd+Shift+O, Ctrl+Shift+O elsewhere) opens a project — its group back, its
  agents started again — or shows its group when it is open. Kept in
  `shell-data/projects.json`.
- git on the tabs: each tab of the group shows its folder's branch, with a
  mark when files are changed (ahead, behind and the count on hover); looked
  at with git's optional locks off, never in an agent's way.
- A local API for folio (and other programs of the user): a tab opened in a
  folder (in its project's or folder's group), a text pasted into the agent's
  pane of a repository — without Enter, the person sends it — and a review
  waiting in folio shown on the repository's tabs. On 127.0.0.1 under a
  token of its own (not the panes'), found through `shell-presence.json` in
  the user's runtime or temporary folder, removed on exit.
- Settings with fields (Cmd/Ctrl+,): font, theme, scrollback, the drop-down
  window, notifications, folio, updates — each change written into
  `config.toml` at once, its comments and the person's own lines kept, and
  applied as from any edit of the file. Profiles, keys and agents' commands
  stay in the file (a button opens it).
- Secure Keyboard Entry on macOS (settings, palette, `[security]
  secure-keyboard`): while shell is in front, other programs cannot read the
  keys typed; the status bar says when it is on.
- The kitty keyboard protocol (`@dskripchenko/terminal` 0.5.0): a program
  that asks for it — Claude Code, neovim, helix, fish — gets Shift+Enter, Esc
  and keys with Ctrl or Alt of their own. Flags a program left behind are
  dropped at the shell's prompt, so Ctrl+C still reaches the shell.
- A new worktree in a group of its own (palette): a new or existing branch,
  the folder beside the repository (`app-feature-x`), an agent started there
  if chosen.

## [0.3.0] - 2026-11-14

Stage 2 closes: a viewer with live blocks, SSH hosts and sftp, folio.

### Added

- folio, when it is on the machine (a running one, the config's `[folio]
  path`, PATH, /Applications, ~/Applications or beside shell): a file from
  the viewer opened there at its line, an agent's changes reviewed there
  (the repository's working copy), a changed file opened at its line, the
  pane's folder added as a project. Needs folio with `file:line`,
  `--project` and `--review` on its command line.

- SSH hosts of `~/.ssh/config` (its Includes too) in the palette, each opened
  in a tab of its own; a host's files in the file panels over sftp — browsed,
  copied both ways, moved, renamed, a folder made, deleted (for good: no
  trash there) — by the system's OpenSSH: keys and the ssh-agent, nothing
  secret kept. The places (Ctrl+\\ in the panels): home, the groups' folders,
  the hosts.

- A viewer beside the panes: markdown with live blocks (diagrams of every
  notation, BPMN, draw.io, OpenAPI…), diagram and API files, pictures, video
  and sound, code highlighted. Opened by Cmd/Ctrl+click on a path in the
  output (`src/a.ts:42`), Enter on a file in the file panels, a double click
  in an agent's changes. Sandboxed on a scheme of its own, no network: a
  document sees only its folder.

## [0.2.0] - 2026-11-14

Stage 2 begins: agents in panes, their changes, files the Midnight Commander way.

### Added

- Shell integration for zsh, bash and PowerShell (`packages/shell-integration`,
  taken from folio to be shared): commands marked with their text and exit
  code, the folder said after each one; going between commands works in all
  three.
- Agents in panes (`[agents] commands`: claude, codex, grok, gemini…): working,
  waiting for you, done or failed — on their tab, group and the status bar,
  with a system notification when one is out of sight; started from the
  palette in a tab of their own.
- `shell-notify` in every pane's PATH for agents and their hooks; the palette
  puts Claude Code's hooks in `~/.claude/settings.json` (and takes them out).
- An agent's changes (Cmd/Ctrl+Shift+G): the files changed since it started,
  their diffs, a comment on a line pasted into its pane.
- File panels as in Midnight Commander (Ctrl+O): two folders side by side,
  F3 quick view, F4 edit in a new tab, F5 copy, F6 move or rename, F7 new
  folder, F8 to the trash, marks by mask; closed, the shell goes to the
  active panel's folder. A full-screen program keeps Ctrl+O for itself.

### Fixed

- A tab opened with a profile starts in the profile's folder.

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
