# Разработка

Node 20 или новее, pnpm 10; набор инструментов C++ — только там, где у
node-pty нет готовой сборки.

```sh
pnpm install
pnpm start                 # собрать и запустить (данные — в .shell-data/ здесь)
pnpm test                  # unit-тесты (vitest)
pnpm test:e2e              # сборка, запуск приложения и прогон (Playwright)
pnpm lint && pnpm typecheck
pnpm dist                  # переносные архивы в release/
pnpm readme:shots          # скриншоты в docs/images (нужен ImageMagick)
```

`SHELL_DATA` переносит данные в другое место; `SHELL_E2E=1` — окно не
забирает фокус.

## Как устроено

- Electron и node-pty; окно — Vue 3, запущено в песочнице, с главным
  процессом говорит только через мост preload.
- Эмулятор — [`@dskripchenko/terminal`](https://github.com/dskripchenko/terminal),
  отрисовка в DOM: последовательности VT/xterm, прокрутка, метки оболочки,
  картинки, протокол клавиатуры kitty.
- `src/common/` — логика без Electron и DOM, покрыта unit-тестами: рабочее
  пространство (группы → вкладки → сплиты, неизменяемое), клавиши, конфиг,
  темы, состояния агентов, триггеры, проекты, пути архивов.
- `src/main/` — окна и IPC, оболочки (`pty.ts`), сеанс, настройки, git, файлы,
  архивы, SSH и SFTP, схема просмотрщика, локальный API для folio, обновления.
- `src/renderer/` — окно: панели, палитра, файловые панели, просмотрщик.
- `packages/shell-integration` — [`@dskripchenko/shell-integration`](https://www.npmjs.com/package/@dskripchenko/shell-integration)
  на npm: метки оболочек, их разбор, журнал правок агентов; публикуется по
  тегу `shell-integration-v<версия>`.

Выпуск: версия в `package.json` и раздел в `CHANGELOG.md`, затем тег
`v<версия>` — workflow собирает архивы на трёх системах и публикует их с
текстом из CHANGELOG.
