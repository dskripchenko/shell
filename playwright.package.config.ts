import { defineConfig } from '@playwright/test'

// The packaged program, run as a person would (SHELL_APP: its executable): see tests/package.
export default defineConfig({
  testDir: 'tests/package',
  timeout: 180_000,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
})
