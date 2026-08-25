import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'npm run build && vite preview --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ]
})
