// Browser tests: https://playwright.dev/docs/test-configuration
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

// CI runs every engine; locally only Chromium (npx playwright install --only-shell chromium).
const browsers = CI ? ['chromium', 'firefox', 'webkit'] : ['chromium'];
const devicesByBrowser = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' };

// Every test runs against both the source and the minified build.
const files = ['pace.js', 'pace.min.js'];

export default defineConfig({
  testDir: 'tests',
  forbidOnly: CI,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['list']] : 'list',
  projects: browsers.flatMap((browser) =>
    files.map((paceFile) => ({
      name: `${browser} ${paceFile}`,
      use: { ...devices[devicesByBrowser[browser]], paceFile },
    })),
  ),
});
