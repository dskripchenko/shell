# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Статус

Репозиторий: https://github.com/dskripchenko/shell (MIT, открытый); CI — `.github/workflows/tests.yml` на трёх ОС, релиз по тегу `v<версия>` — `release.yml`.

Этапы 1 и 2 сделаны (0.3.0), этап 3 закрыт (0.6.0: проекты, git на вкладках и worktree, связка с folio в обе стороны, настройки в окне, Secure Keyboard Entry, протокол клавиатуры kitty, общий с folio журнал правок агентов, правка документов через folio, общие с folio темы консолей, цвета, проекты и хоткеи): каркас (окно, группы, вкладки, сплиты, палитра, хоткеи, конфиг, темы, выпадающее окно, восстановление сессии со scrollback), shell integration, агенты, изменения агента, файловые панели, просмотрщик, SSH/SFTP, связка с folio. Карту этапов см. в `FEATURES.md`.

## Команды

```sh
pnpm install
pnpm start                                  # собрать и запустить
pnpm test                                   # unit-тесты (vitest), tests/unit
pnpm vitest run tests/unit/keys.spec.ts     # один файл; -t "имя" — один тест
pnpm lint && pnpm typecheck                 # eslint; vue-tsc
pnpm test:e2e                               # сборка + Playwright с настоящим Electron, tests/e2e
pnpm exec playwright test -g "restart"      # один e2e-тест (после pnpm build)
pnpm dist                                   # переносные архивы в release/
TERMINAL_DIST=../terminal/dist pnpm build   # собрать против локальной сборки @dskripchenko/terminal
```

Данные приложения при разработке лежат в `.shell-data/` в рабочей папке; переменная `SHELL_DATA` направляет их в другое место (e2e создаёт свою папку на каждый тест). `SHELL_E2E=1` — окно не забирает фокус, нет иконки в Dock.

## Архитектура

- `src/common/` — чистая логика без Electron и DOM, покрыта unit-тестами: модель рабочего пространства `layout.ts` (группы → вкладки → дерево сплитов; неизменяемые функции, каждое изменение возвращает новый объект), хоткеи `keys.ts` (сочетания по `KeyboardEvent.code`, цепочки `ctrl+a>c`, наборы по умолчанию: на macOS `⌘`, иначе `Ctrl+Shift`, т. к. `Ctrl+буква` принадлежит оболочке), конфиг `config.ts` (TOML; ошибка не ломает запуск — поле получает значение по умолчанию, а ошибка показывается в строке состояния), импорт тем `themes.ts`, нечёткий поиск `fuzzy.ts` (понимает запрос в другой раскладке), контракт IPC `ipc.ts`.
- `src/main/` — главный процесс: `index.ts` (окна main и quake, у каждого свой `SessionStore` и свои `Ptys`; IPC с проверкой аргументов), `pty.ts` (node-pty, вывод пачками раз в 4 мс, хвост вывода `Tail` для восстановления), `session.ts` (`session.json` + `scrollback/<name>/<paneId>.log`, атомарная запись), `settings.ts` (config.toml + `themes/`, перечитываются при сохранении), `probe.ts` (папка процесса через lsof/`/proc`, ветка git из `.git/HEAD` без запуска git), `dataDir.ts` (данные рядом с программой).
- `src/preload/` — единственный мост: `window.shell` (тип `ShellApi`). Окно запускается с `contextIsolation` и `sandbox`, без Node.
- `src/renderer/` — Vue 3. Рабочее пространство — `shallowRef` с простыми объектами (в IPC уходит без прокси); любое изменение идёт через `commit()`, который сохраняет его и закрывает исчезнувшие панели. `terminals.ts` держит по одному `Terminal`+`TerminalView` на панель всё время её жизни: элемент вида переносится в слот панели при показе вкладки и вынимается при скрытии, оболочка продолжает работать. Действия — команды с id в `commands.ts`; `keyboard.ts` перехватывает клавиши в фазе capture раньше терминала.
- `packages/shell-integration` (`@dskripchenko/shell-integration`, workspace-пакет; позже отдельный npm-пакет, на него перейдёт и folio): `integrate()` запускает zsh/bash/PowerShell со скриптами меток (OSC 133, 633;E) и папки (OSC 7) после пользовательских файлов запуска; `EventReader` читает из вывода метки, папку, уведомления OSC 9/777 и звонок, склеивая последовательности, разорванные между кусками. Скрипты — файлы `.zsh/.bash/.ps1`, в сборку и тесты попадают как текст (loader в `scripts/build.mjs`, плагин в `vite.config.ts`). Изменения скриптов переносить и в folio (`src/main/shell/`), пока он не перешёл на пакет. Тесты гоняют настоящие оболочки (`tests/unit/shellIntegration.spec.ts`), PowerShell — только на Windows CI.
- Агенты: `src/common/agents.ts` — какая команда агент (`[agents] commands`) и его состояние (работает / ждёт ввода / закончил / ошибка / простой) по событиям панели, выводу, вводу и времени; `src/renderer/agents.ts` применяет это к панелям, ставит значки (`AgentMark`), шлёт уведомления системы, когда панель не на виду, и вводит команду агента при первом промпте новой вкладки.
- Точные сигналы агентов: `src/main/notify.ts` — HTTP-сервер на 127.0.0.1 со случайным токеном на запуск; каждой панели даются `SHELL_PANE_ID`, `SHELL_NOTIFY_URL`, `SHELL_NOTIFY_TOKEN` и `shell-data/bin` первым в PATH, где лежит `shell-notify` (sh и `.cmd`, внутри curl). Сигнал (`running|waiting|done`) делает агента «точным»: тишина и вывод его статус больше не меняют. `src/main/claudeHooks.ts` по команде палитры добавляет в `~/.claude/settings.json` хуки Notification/Stop/UserPromptSubmit с меткой `# shell-notify` (старый файл копируется в `.before-shell`) и убирает только их.
- Журнал правок агентов, общий с folio: `packages/shell-integration/src/agentEdits.ts` — команда хука PostToolUse (одна строка sh: пишет в `$(git rev-parse --git-common-dir)/agent-edits.jsonl` время, `SHELL_PANE_ID` и вход хука), разбор и сжатие журнала. shell ставит хук вместе с остальными в `~/.claude/settings.json` (`claudeHooks.ts`), читает — `repoEdits` в `changes.ts`; панель изменений показывает, чей агент правил файл. Формат менять согласованно с folio (`src/main/review/agentEdits.ts` там — копия до перехода на пакет).
- Изменения агента: `src/main/changes.ts` — при старте агента берётся точка отсчёта (`git stash create`, не трогает рабочую копию, иначе HEAD; плюс список неотслеживаемых файлов), от неё — изменённые файлы (`git diff --numstat` + новые неотслеживаемые) и diff файла; без агента — рабочая копия к HEAD. Нужна системная `git`. Окно передаёт точку отсчёта обратно, главный процесс проверяет, что `root` — корень репозитория, пути — внутри него. Панель — `ChangesPanel.vue` (`⌘⇧G`), разбор diff — `src/common/diff.ts`; комментарий к строке вставляется в панель агента как `файл:строка — текст` без Enter.
- Файловые панели: `FileCommander.vue` + `FilePanel.vue` поверх `.panes` (`Ctrl+O` — команда `commander.toggle` с условием `when`: в alt screen клавиша уходит программе). Операции с диском — `src/main/files.ts` (копирование без перезаписи, перенос с откатом на copy+rm между дисками, корзина через `shell.trashItem`), логика панелей — `src/common/commander.ts`. В IPC передавать обычные массивы, не реактивные (прокси Vue не клонируются). Занятость оболочки — `ui.busy` по меткам 133;C / 133;A: `cd` при закрытии панелей отправляется, только если оболочка на промпте.
- SSH и SFTP — через системный OpenSSH (`src/main/remote.ts`): хосты из `~/.ssh/config` (с `Include`), файлы — `sftp -b - -o BatchMode=yes` по одному запуску на элемент (в пакетном режиме ошибка прерывает весь пакет). Только ключи/ssh-agent, ключ хоста проверяет OpenSSH; секретов shell не хранит. В панелях удалённое место — `sftp://хост/путь` (`src/common/ssh.ts`); «Места» (`Ctrl+\`) — домашняя папка, папки групп, хосты. e2e подменяет `sftp` скриптом на Node (`tests/e2e/fakes/sftp.mjs`) поверх локальной папки; подменить `ssh` во вкладке нельзя (login-оболочка macOS ставит системный PATH первым) — тест проверяет набранную команду.
- Для оболочек без интеграции (fish и др.) папку панели главный процесс узнаёт сам раз в 2 секунды для активной панели (lsof на macOS, `/proc` на Linux); PowerShell сообщает папку сам — `withCwdReport` в `pty.ts` оборачивает его `prompt` и шлёт OSC 7.
- Профили — `[profiles.<имя>]` в config.toml (программа, аргументы, env, папка, тема). Имя профиля хранится в панели (`PaneLeaf.profile`) и в группе (`Group.profile`): новые вкладки группы и сплиты наследуют его; главный процесс разворачивает имя в программу и env при запуске.
- Обновления — `src/main/update.ts`: копия апдейтера folio, отвязанная от продукта параметром `Product`, чтобы потом вынести оба в общий пакет. Проверка раз в сутки при запуске только в собранном приложении (`SHELL_UPDATE_URL` направляет на тестовую ленту), установка при выходе.
- Проекты: `src/common/projects.ts` — шаблон группы (вкладки, сплиты, папки относительно корня проекта, профили, команда агента в панели), `projectOf`/`groupOf` туда и обратно с новыми id; хранение — `src/main/projects.ts` (`shell-data/projects.json`, общий для окон); в окне — `src/renderer/projects.ts` и режим палитры `ui.palette = 'projects'` (переключатель). Группа, открытая из проекта, хранит его id в `Group.project`.
- git на вкладках: `src/main/git.ts` (`status --porcelain=v2` с `GIT_OPTIONAL_LOCKS=0`, `worktree add` рядом с репозиторием: `<repo>-<ветка>`), разбор — `src/common/git.ts`; окно спрашивает статус вкладок активной группы раз в 4 секунды (`ui.git`), диалог worktree — `WorktreeDialog.vue`.
- API для folio: `src/main/api.ts` — маршруты `/api/open-tab|paste|review` на том же локальном сервере, что `shell-notify`, но со своим токеном (токен панелей его не открывает); файл присутствия `shell-presence.json` (`SHELL_PRESENCE`, иначе `$XDG_RUNTIME_DIR` или temp, 0600), удаляется при выходе. Главный процесс передаёт запрос главному окну (`IPC.apiRequest`/`apiReply`), его обрабатывает `src/renderer/requests.ts`.
- Настройки в окне: `SettingsDialog.vue` пишет по одной настройке через `SettingsStore.set` → `setConfigValue` (`src/common/config.ts`: строка заменяется, или встаёт под закомментированным примером, или под заголовком раздела; остальной текст не трогается), дальше как при правке файла. Secure Keyboard Entry — `[security] secure-keyboard`, только macOS и только пока shell активен (`did-become-active`/`did-resign-active`).
- Общее с folio: палитра `COLORS` (`layout.ts`) — те же 9 цветов, что у групп вкладок folio; `/api/look` (темы `lookOf` из `themes.ts` и шрифт) и `/api/projects` отвечает главный процесс без окна; проекты folio — из его файла присутствия (`projects`), кэш `shell-data/folio-projects.json`, в переключателе проектов после своих. Таблица общих хоткеев — в `FEATURES.md`.
- folio — `src/main/folio.ts`: поиск (`[folio] path` → файл присутствия запущенного folio `folio-presence.json`, только свой и живой процесс → PATH → `/Applications`, `~/Applications`, рядом с shell) и запуск с аргументами `файл:строка`, `--project`, `--review` (запущенный folio забирает их сам). Окно узнаёт, найден ли folio (`ui.folio`), при старте, смене настроек и возврате фокуса; без него кнопки и команды folio скрыты. e2e подставляет вместо folio скрипт через конфиг.
- Иконки — `build/icons/shell.svg` и `shell-small.svg`; `node scripts/icons.mjs` (на Mac) перерисовывает PNG, `.icns` и `.ico`.
- Релиз: версия в `package.json` и раздел в `CHANGELOG.md`, затем тег `v<версия>` — `release.yml` собирает архивы на трёх ОС и публикует релиз с текстом из CHANGELOG.

Замер эмулятора: `bench/terminal/run.sh` (один раз `npm install` в этой папке; нужен собранный `../terminal/dist` и установленный `../folio`, оттуда берутся electron и esbuild). Движки: `terminal` (`@dskripchenko/terminal`), `xterm-dom`, `xterm-webgl`. Фильтры: `ENGINES=terminal SCENARIOS=bulk,agent REPS=1 ./run.sh`. Результаты пишутся в `results.json`, эталон до правок — `baseline-0.3.0.json`.

Карта возможностей и этапы (1, 2, 3, «позже», «не берём») лежат в `FEATURES.md`, это главный источник требований. Дизайн экранов — на холсте https://claude.ai/artifact/413BymkoqPF1BhfTUmevCR (UID Design System).

Не придумывать сокращений и личных префиксов от имени автора для имён в коде, конфигах и документации; пакеты называются полным именем, внутренние сущности — нейтрально по смыслу.

## Что строим

Личный кроссплатформенный терминал (macOS, Windows, Linux) на замену Terminal.app. Ориентиры по функциям: iTerm2, Ghostty, Warp, Termius, Windows Terminal; по файловой навигации — Midnight Commander.

Ключевые сценарии:
- группы (workspaces) → вкладки с именами и цветами → сплит-панели; восстановление после перезапуска вместе со scrollback; выпадающее окно по глобальному хоткею;
- параллельная работа CLI-агентов (claude, codex, grok и других) в разных проектах и git worktrees: статус агента на вкладке, уведомления, панель изменённых файлов, diff;
- двухпанельный файловый менеджер в стиле MC поверх терминала (Ctrl+O, F3–F8), синхронизированный с cwd;
- просмотрщик артефактов: код, markdown с живыми блоками embed, картинки, diff;
- SSH-хосты из `~/.ssh/config` и SFTP в файловых панелях;
- полная кастомизация: текстовый конфиг с hot reload, темы с импортом чужих схем, все хоткеи переназначаются, палитра команд.

## Жёсткие ограничения

- Никаких аккаунтов, подписок, облачного синка, телеметрии и обязательной сети. Приложение полностью работает офлайн.
- Терминал не встраивает ИИ и не вызывает API провайдеров. Он запускает CLI пользователя и интегрируется с ними через PTY, escape-последовательности (OSC 7/9/133/777) и собственный локальный CLI (`shell notify`, `shell open`), который агенты вызывают из своих хуков.
- Функциональность одинакова на трёх ОС. Платформенный код (PTY/ConPTY, глобальные хоткеи, Secure Keyboard Entry, уведомления) изолируется в отдельные модули.
- Каждое пользовательское действие — команда с id. Хоткеи, палитра команд, меню и CLI вызывают одни и те же команды; хардкод сочетаний клавиш в компонентах запрещён.

## Связь с folio

`../folio` — Electron-приложение того же автора для md, ревью работы агентов и git. Его тоже можно дорабатывать. shell работает без folio, а когда folio найден, включает кросс-функции; протокол описан в `FEATURES.md`, раздел 3. Прежде чем писать своё, проверь, нет ли этого в folio: консоли и OSC-события (`src/main/consoleEvents.ts`, `src/main/shell/`), хуки Claude Code и MCP (`src/main/review/`), портативное хранение данных (`src/main/dataDir.ts`). Общий код выносится в пакеты, а не копируется.

## Стек

Electron + `node-pty` + Vue 3, как в folio: работа с консолями, хуки, MCP-мост, сборка и автообновление переносятся оттуда. Эмулятор терминала — `@dskripchenko/terminal` (`../terminal`, отрисовка в DOM), xterm.js не используем. По замеру (`bench/terminal`) он не хуже xterm.js на выводе агентов и полноэкранных программах. Shell нужен пакет ≥ 0.5.0 (в 0.5.0 — протокол клавиатуры kitty, флаг disambiguate; оставленные программой флаги shell снимает на промпте, `terminals.atPrompt`): в 0.4.0 обрезка scrollback без копирования (`ScreenBuffer.dropTop`, `length`, `line(i)`) и синхронный вывод DEC 2026 с DECRQM (Claude Code обрамляет им кадры), в 0.4.1 — вид, созданный вне страницы (так живут панели скрытых вкладок), и копирование по физической клавише. Изменения пакета прогоняются через замер shell, результат сверяется с `baseline-0.3.0.json`. Проект открытый, лицензия MIT, зависимости только с совместимыми лицензиями.

Shell портативный, по правилам folio и `portable`: без установщика и прав администратора (zip для macOS и Windows, AppImage для Linux), все данные лежат в папке рядом с программой (см. `folio/src/main/dataDir.ts`), ничего не пишется в реестр или профиль пользователя, нет ассоциаций файлов и фоновых служб. Обновление заменяет программу в её папке после проверки `.sha256`.

Собственные пакеты автора (исходники лежат рядом в `../`): `@dskripchenko/ui` (компоненты, токены, темы на CSS-переменных), `@dskripchenko/code-editor` и `@dskripchenko/syntax` (просмотрщик кода), `@dskripchenko/embed` (живые блоки: markdown, диаграммы, BPMN, draw.io, OpenAPI, flow, board, kanban, calendar). Соседние проекты используют pnpm, Vite, TypeScript, ESLint, Vitest и Playwright, Node ≥ 20.

Просмотрщик и embed (так и сделано):
- Документы недоверенные (от агентов, из чужих репозиториев). Просмотрщик — отдельная страница `src/renderer/viewer.html` + `viewer.ts` в iframe с `sandbox="allow-scripts"` на своей схеме `shell-doc://` (`src/main/viewer.ts`): другой origin, без preload, строгий CSP без сети. Окно передаёт ей файл через `postMessage`, обратно слушает только ссылки и двойной щелчок.
- Просмотрщик только читает, правка — в folio: двойной щелчок шлёт окну `{type:'edit', text, index?}` (текст блока или номер строки в `pre`), окно находит строку исходника (`lineOfText` в `src/common/viewer.ts`) и открывает файл в folio на ней; без folio — программой системы.
- На странице просмотрщика — толстый бандл `embed.bundle.js` (копируется в `dist/renderer/vendor` при сборке): у изолированной страницы и так свой Vue, CDN не нужен. Элементы: `dsk-markdown` (живые блоки), `dsk-diagram`, `dsk-bpmn`, `dsk-dmn`, `dsk-drawio`, `dsk-openapi`, `dsk-asyncapi`, `dsk-video`, `dsk-audio`; код показывается как огороженный блок markdown. Что каким элементом — `src/common/viewer.ts`.
- `shell-doc://app/` отдаёт только `viewer.html`, `vendor/*`, `assets/*`; `shell-doc://r-<id>/` — файлы папки, открытой для просмотра (корень репозитория документа или его папка), и ничего вне её. Сетевые запросы блоков (`poll-url` у flow, «Try it» у OpenAPI) запрещены CSP.
