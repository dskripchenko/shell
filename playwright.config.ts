import { defineConfig } from '@playwright/test'

// The app knows it is under test: no Dock icon, windows that do not take the focus.
process.env.SHELL_E2E = '1'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
})
