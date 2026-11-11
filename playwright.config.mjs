// Browser tests: https://playwright.dev/docs/test-configuration
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

// CI runs every engine, each project in its own job (listed in .github/workflows/checks.yml);
// locally only Chromium (npx playwright install --only-shell chromium).
const browsers = CI ? ['chromium', 'firefox', 'webkit'] : ['chromium'];
const devicesByBrowser = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' };

// The minified build, which sites load, runs in every engine; the source, which differs only
// by minification, in Chromium.
const filesByBrowser = { chromium: ['pace.js', 'pace.min.js'], firefox: ['pace.min.js'], webkit: ['pace.min.js'] };

export default defineConfig({
  testDir: 'tests',
  forbidOnly: CI,
  // The tests spend their time waiting for pace's timers and their own requests, not on the
  // CPU, so they run in parallel, also within a file; on CI, one worker per CPU core.
  fullyParallel: true,
  workers: CI ? '100%' : undefined,
  reporter: CI ? [['github'], ['list']] : 'list',
  projects: browsers.flatMap((browser) =>
    filesByBrowser[browser].map((paceFile) => ({
      name: `${browser} ${paceFile}`,
      use: { ...devices[devicesByBrowser[browser]], paceFile },
    })),
  ),
});
