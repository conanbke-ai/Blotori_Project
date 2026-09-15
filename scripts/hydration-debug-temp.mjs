import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const messages = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (/hydration|server rendered|cannot be a descendant|validateDOMNesting|HTML/i.test(text)) messages.push(`[console:${msg.type()}] ${text}`);
});
page.on('pageerror', (error) => messages.push(`[pageerror] ${error.stack || error.message}`));
await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('HYDRATION_DEBUG_BEGIN');
console.log(messages.join('\n\n') || 'NO_HYDRATION_MESSAGES');
console.log('HYDRATION_DEBUG_END');
await browser.close();
if (messages.length) process.exitCode = 2;
