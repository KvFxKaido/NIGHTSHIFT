import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import checkFacadeMenu from './check-facade-menu-browser.js';

await mkdir('artifacts', { recursive: true });
const server = process.env.GARAGE_TEST_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
let page;
try {
  await server?.listen();
  const base = process.env.GARAGE_TEST_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
  browser = await chromium.launch({ args: [`--use-angle=${process.env.GARAGE_TEST_ANGLE ?? 'swiftshader'}`, '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  console.log(JSON.stringify(await checkFacadeMenu(page, base), null, 2));
} catch (error) {
  await page?.screenshot({ path: 'artifacts/facade-failure.png', timeout: 10000 }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
