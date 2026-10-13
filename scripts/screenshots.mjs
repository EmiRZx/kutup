// Takes a screenshot of every screen in a running build, and fails on any
// browser error. Usage:
//   npm run build && npx vite preview --port 4173 &
//   node scripts/screenshots.mjs [baseUrl] [outDir]
// Uses the locally installed Chrome (set CHROME_PATH to override).
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const baseUrl = process.argv[2] ?? 'http://localhost:4173/';
const outDir = process.argv[3] ?? 'screenshots';
const executablePath =
  process.env.CHROME_PATH ??
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linux: '/usr/bin/google-chrome',
  }[process.platform];

/** @type {{ name: string; hash: string; width?: number; fullPage?: boolean; act?: (page: import('puppeteer-core').Page) => Promise<void> }[]} */
const SCREENS = [
  { name: 'home', hash: '/' },
  { name: 'dashboard', hash: '/admin', fullPage: true },
  {
    name: 'circulation',
    hash: '/admin/circulation',
    act: async (page) => {
      // Borrow a real member's card number, then try to lend them a book to show the rules firing.
      await page.goto(`${baseUrl}#/admin/members/2`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.library-card__number', { timeout: 15000 });
      const card = await page.$eval('.library-card__number', (el) => el.textContent ?? '');
      await page.goto(`${baseUrl}#/admin/circulation?card=${card.replace(/\s/g, '')}`, { waitUntil: 'networkidle0' });
      const inputs = await page.$$('input.input--big');
      await inputs[1]?.type('B00046-01'); // a reference-only dictionary
      await inputs[2]?.type('B00001-01');
    },
  },
  { name: 'catalog', hash: '/admin/catalog' },
  { name: 'book', hash: '/admin/catalog/1', fullPage: true },
  { name: 'members', hash: '/admin/members' },
  { name: 'member', hash: '/admin/members/2', fullPage: true },
  { name: 'reservations', hash: '/admin/reservations' },
  { name: 'policy', hash: '/admin/policy' },
  {
    name: 'database',
    hash: '/admin/database',
    act: async (page) => {
      const [button] = await page.$$('xpath/.//button[contains(., "Run query")]');
      await button?.click();
    },
  },
  { name: 'home-mobile', hash: '/', width: 390, fullPage: true },
  { name: 'dashboard-mobile', hash: '/admin', width: 390, fullPage: true },
];

await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && errors.push(`console: ${message.text()}`));

  for (const screen of SCREENS) {
    await page.setViewport({ width: screen.width ?? 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}#${screen.hash}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.home, .admin', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    if (screen.act) await screen.act(page);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await page.screenshot({ path: `${outDir}/${screen.name}.png`, fullPage: screen.fullPage ?? false });
    console.log(`✓ ${screen.name}`);
  }
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
