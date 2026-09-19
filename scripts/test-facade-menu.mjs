import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import checkFacadeMenu from './check-facade-menu-browser.js';

await mkdir('artifacts', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
let page;
try {
  await server.listen();
  const { port } = server.httpServer.address();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  console.log(JSON.stringify(await checkFacadeMenu(page, `http://127.0.0.1:${port}/`), null, 2));
} catch (error) {
  await page?.screenshot({ path: 'artifacts/facade-failure.png', timeout: 10000 }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
