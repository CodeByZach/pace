// Browser tests: https://playwright.dev/docs/test-configuration
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

// CI runs every engine (one job each, picked with --project); locally only Chromium
// (npx playwright install --only-shell chromium).
const browsers = CI ? ['chromium', 'firefox', 'webkit'] : ['chromium'];
const devicesByBrowser = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' };

// The minified build, which sites load, runs in every engine; the source, which differs only
// by minification, in Chromium.
const filesByBrowser = { chromium: ['pace.js', 'pace.min.js'], firefox: ['pace.min.js'], webkit: ['pace.min.js'] };

export default defineConfig({
  testDir: 'tests',
  forbidOnly: CI,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['list']] : 'list',
  projects: browsers.flatMap((browser) =>
    filesByBrowser[browser].map((paceFile) => ({
      name: `${browser} ${paceFile}`,
      use: { ...devices[devicesByBrowser[browser]], paceFile },
    })),
  ),
});
