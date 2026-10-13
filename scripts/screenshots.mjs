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

  await gameTour(page);
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

/** Plays the first day of a new career, photographing each phase. */
async function gameTour(page) {
  const shot = async (name, fullPage = false) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage });
    console.log(`✓ ${name}`);
  };
  const click = async (label) => {
    const [button] = await page.$$(`xpath/.//button[contains(normalize-space(.), "${label}")]`);
    if (!button) throw new Error(`No button "${label}"`);
    await button.click();
  };
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}#/desk`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.letter, .newspaper, .desk-scene, .ledger-sheet, .review', { timeout: 15000 });
  if (!(await page.$('.letter'))) {
    // An earlier career exists: start over from the review screen or via the hiring letter.
    await page.goto(`${baseUrl}#/`, { waitUntil: 'networkidle0' });
    page.once('dialog', (d) => d.accept());
    await page.goto(`${baseUrl}#/admin`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.admin');
    await click('Reset sample');
    await page.waitForFunction(() => document.body.textContent?.includes('A fresh sample library is ready'));
    await page.goto(`${baseUrl}#/desk`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.letter');
  }
  await shot('game-letter');
  await click('Accept the post');
  await page.waitForSelector('.newspaper');
  await shot('game-bulletin', true);
  await click('Open the doors');
  await page.waitForSelector('.patron');
  await shot('game-desk');

  // Scan whatever is on the desk, then stamp it.
  for (let served = 0; served < 12; served++) {
    if (await page.$('.booth__empty')) break;
    const card = await page.$('.desk-card__number');
    if (card) await card.click();
    await (await page.$('.barcode'))?.click();
    if (served === 1) await shot('game-terminal');
    if (await page.$('.desk-card')) {
      await click(served % 3 === 2 ? 'Denied' : 'Approved');
      if (await page.$('.reasons')) {
        const [reason] = await page.$$('.reason');
        await reason.click();
      }
    } else {
      await click(served % 2 ? 'Damaged' : 'Received');
    }
    await page.waitForSelector('.stamp-mark');
    if (served === 0 || (await page.$('.citation'))) await shot(served === 0 ? 'game-stamped' : 'game-citation');
    await click('Next, please');
    await page.waitForSelector('.patron, .booth__empty');
  }
  await page.waitForSelector('.booth__empty');
  await shot('game-closed');
  await click('Close up for the day');
  await page.waitForSelector('.ledger-sheet');
  await shot('game-ledger', true);
}
