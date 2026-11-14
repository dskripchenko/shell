import { defineConfig } from '@playwright/test'

// The README's screenshots (tests/readme), taken by `pnpm readme:shots`: not part of the test run.
export default defineConfig({
  testDir: 'tests/readme',
  timeout: 240_000,
  workers: 1,
  reporter: 'list',
})
