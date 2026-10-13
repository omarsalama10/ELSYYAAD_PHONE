import { defineConfig, devices } from '@playwright/test'

// Two separate apps from one codebase: the gym tracker (dist/, :4173) and Life OS (dist-life/, :4174).
const iphone = { ...devices['iPhone 13'], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const, trace: 'retain-on-failure' as const }

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'gym', testIgnore: /life\.spec\.ts/, use: { ...iphone, baseURL: 'http://localhost:4173/' } },
    { name: 'life', testMatch: /life\.spec\.ts/, use: { ...iphone, baseURL: 'http://localhost:4174/' } },
  ],
  webServer: [
    { command: 'npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run preview:life', url: 'http://localhost:4174/', reuseExistingServer: true, timeout: 60_000 },
  ],
})
