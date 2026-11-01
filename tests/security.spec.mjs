// Options from page markup must not be able to change pace's behavior or inject code.
import { test, expect } from './fixtures.mjs';

test('reads data-pace-options only from a <script> element', async ({ page, open }) => {
  await open({ head: `<meta data-pace-options='{ "className": "from-markup" }'>` });
  await expect(page.locator('.pace-progress')).toHaveClass('pace-progress');
});

test('ignores __proto__ keys in options, also nested ones', async ({ page, open }) => {
  await open({ paceAttributes: `data-pace-options='{ "__proto__": { "top": true }, "ajax": { "__proto__": { "nested": true } } }'` });
  expect(await page.evaluate(() => [({}).top, ({}).nested])).toEqual([undefined, undefined]);
});

test('applies className as class names, never as HTML', async ({ page, open }) => {
  const className = 'x"><img src=x onerror="window.injected=1">';
  await open({ head: `<script>window.paceOptions = { className: '${className}' };</script>` });
  await expect(page.locator('.pace-progress')).toHaveAttribute('class', `pace-progress ${className}`);
  await expect(page.locator('.pace img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
