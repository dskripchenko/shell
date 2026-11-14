# 开发

需要 Node 20 或更高版本、pnpm 10；只有在 node-pty 没有预编译二进制的平台上才需要 C++ 工具链。

```sh
pnpm install
pnpm start                 # 构建并运行（数据在当前目录的 .shell-data/ 中）
pnpm test                  # 单元测试（vitest）
pnpm test:e2e              # 构建、启动应用并自动操作（Playwright）
pnpm lint && pnpm typecheck
pnpm dist                  # 便携压缩包输出到 release/
pnpm readme:shots          # 生成 docs/images 中的截图（需要 ImageMagick）
```

`SHELL_DATA` 可把数据放到别处；`SHELL_E2E=1` 让窗口不抢焦点。

## 结构

- Electron 加 node-pty；窗口是 Vue 3，在沙箱中运行，只能通过 preload 桥与主进程通信。
- 终端模拟器是 [`@dskripchenko/terminal`](https://github.com/dskripchenko/terminal)，
  在 DOM 中绘制：VT/xterm 序列、回滚、shell 标记、图片、kitty 键盘协议。
- `src/common/` —— 不依赖 Electron 和 DOM 的逻辑，由单元测试覆盖：工作区（分组 → 标签 →
  分屏，不可变）、快捷键、配置、主题、智能体状态、触发器、项目、压缩包路径。
- `src/main/` —— 窗口与 IPC、shell（`pty.ts`）、会话、设置、git、文件、压缩包、SSH 和
  SFTP、查看器的协议、给 folio 用的本地 API、更新。
- `src/renderer/` —— 窗口：窗格、命令面板、文件面板、查看器。
- `packages/shell-integration` —— npm 上的
  [`@dskripchenko/shell-integration`](https://www.npmjs.com/package/@dskripchenko/shell-integration)：
  shell 的标记、标记解析、智能体修改日志；通过标签 `shell-integration-v<版本>` 发布。

发布：修改 `package.json` 中的版本并在 `CHANGELOG.md` 中加一节，然后打标签 `v<版本>`——
工作流会在三个系统上构建压缩包，并以 CHANGELOG 的内容发布。
