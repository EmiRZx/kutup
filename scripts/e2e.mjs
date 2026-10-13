// End-to-end smoke test of the back office in a real browser: add a book,
// register a member, lend, reload (the library must survive), and check in.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/e2e.mjs [baseUrl]
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const baseUrl = process.argv[2] ?? 'http://localhost:4173/';
const executablePath =
  process.env.CHROME_PATH ??
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linux: '/usr/bin/google-chrome',
  }[process.platform];

// CI runners don't allow Chrome's sandbox.
const browser = await puppeteer.launch({ executablePath, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
const errors = [];

async function step(name, run) {
  await run();
  console.log(`✓ ${name}`);
}

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });

  const go = async (hash) => {
    await page.goto(`${baseUrl}#${hash}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.admin, .home, .paperwork, .desk-scene', { timeout: 20000 });
  };
  const text = () => page.$eval('.main', (el) => el.textContent ?? '');
  const clickButton = async (label) => {
    const [button] = await page.$$(`xpath/.//button[normalize-space(.)="${label}"]`);
    assert.ok(button, `button "${label}" not found`);
    await button.click();
  };
  const fill = async (label, value) => {
    const [input] = await page.$$(`xpath/.//label[span[normalize-space(.)="${label}"]]//input`);
    assert.ok(input, `field "${label}" not found`);
    await input.click({ count: 3 });
    await input.type(value);
  };

  // Start from a clean sample library.
  await go('/admin');
  page.once('dialog', (dialog) => dialog.accept());
  await clickButton('Reset sample');
  await page.waitForFunction(() => document.body.textContent?.includes('A fresh sample library is ready'));

  let barcode = '';
  await step('add a book to the catalog', async () => {
    await go('/admin/catalog');
    await clickButton('Add a book');
    await fill('ISBN-13', '978-0-14-143951-8');
    await fill('Title', 'Persuasion');
    await fill('Authors', 'Jane Austen');
    await fill('Year', '1817');
    await clickButton('Add to catalog');
    await page.waitForFunction(() => location.hash.startsWith('#/admin/catalog/'));
    await page.waitForSelector('td.mono');
    barcode = await page.$eval('td.mono', (el) => el.textContent ?? '');
    assert.match(barcode, /^B\d{5}-01$/);
    assert.ok((await text()).includes('Jane Austen, 1817'));
  });

  let card = '';
  let memberHash = '';
  await step('register a member', async () => {
    await go('/admin/members');
    await clickButton('Register a member');
    await fill('Full name', 'Ada Lovelace');
    await fill('E-mail', 'ada@kutup.edu');
    await clickButton('Register');
    await page.waitForSelector('.library-card__number');
    card = (await page.$eval('.library-card__number', (el) => el.textContent ?? '')).replace(/\s/g, '');
    memberHash = await page.evaluate(() => location.hash.slice(1));
    assert.match(card, /^\d{8}$/);
  });

  await step('the desk refuses a forged card', async () => {
    await go('/admin/circulation');
    await fill('Library card number', '12345678');
    await page.waitForFunction(() => document.body.textContent?.includes('No such card'));
  });

  await step('lend the book with a valid card', async () => {
    await go(`/admin/circulation?card=${card}`);
    await fill('Book barcode', barcode);
    await page.waitForFunction(() => document.body.textContent?.includes('All clear'));
    await clickButton('Lend');
    await page.waitForFunction(() => document.body.textContent?.includes('Lent to Ada Lovelace'));
  });

  await step('the loan survives a page reload', async () => {
    await new Promise((resolve) => setTimeout(resolve, 600)); // autosave is debounced
    await page.reload({ waitUntil: 'networkidle0' });
    await go(memberHash);
    await page.waitForFunction(() => document.body.textContent?.includes('Persuasion'));
    assert.ok((await text()).includes('1 of 5'));
  });

  await step('a week later it is still on time; three weeks later it is late', async () => {
    await clickButton('+1 week');
    await clickButton('+1 week');
    await clickButton('+1 week');
    await go('/admin/circulation');
    const inputs = await page.$$('input.input--big');
    await inputs[2].type(barcode);
    await page.waitForFunction(() => document.body.textContent?.includes('7 days late'));
  });

  await step('check it in and charge the late fine', async () => {
    await clickButton('Check in');
    await page.waitForSelector('.receipt');
    const receipt = await page.$eval('.receipt', (el) => el.textContent ?? '');
    assert.ok(receipt.includes('7 days late'), receipt);
    assert.ok(receipt.includes('$1.75'), receipt);
  });

  await step('the SQL console sees the new rows and cannot change them', async () => {
    await go('/admin/database');
    const editor = await page.$('textarea');
    await editor.evaluate((el) => el.select());
    await editor.type("SELECT name FROM members WHERE email = 'ada@kutup.edu'");
    await clickButton('Run query');
    await page.waitForFunction(() => document.querySelector('.sql-result')?.textContent?.includes('Ada Lovelace'));
    await editor.evaluate((el) => el.select());
    await editor.type('DELETE FROM members');
    await clickButton('Run query');
    await page.waitForSelector('.notice--danger');
  });

  await step('the desk game: hired, briefed, first patron stamped', async () => {
    await go('/desk');
    await page.waitForSelector('.letter');
    await clickButton('Accept the post');
    await page.waitForSelector('.newspaper');
    assert.ok((await page.$eval('.newspaper', (el) => el.textContent ?? '')).includes('Card expired'));
    await clickButton('Open the doors');
    await page.waitForSelector('.patron');
    const [stamp] = await page.$$('xpath/.//button[normalize-space(.)="Received" or normalize-space(.)="Approved"]');
    await stamp.click();
    await page.waitForSelector('.stamp-mark');
    assert.ok((await page.$eval('.desk__status', (el) => el.textContent ?? '')).includes('Served 1'));
  });

  await step('a reload mid-shift puts you back at the desk', async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.desk-scene', { timeout: 20000 });
    await page.waitForSelector('.patron, .booth__empty');
    assert.ok((await page.$eval('.desk__status', (el) => el.textContent ?? '')).includes('Served 1'));
  });

  await step('the back office sees the game’s library', async () => {
    await go('/admin/database');
    const editor = await page.$('textarea');
    await editor.evaluate((el) => el.select());
    await editor.type('SELECT count(*) AS served FROM game_encounters');
    await clickButton('Run query');
    await page.waitForFunction(() => document.querySelector('.sql-result td')?.textContent === '1');
  });
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All end-to-end checks passed.');
