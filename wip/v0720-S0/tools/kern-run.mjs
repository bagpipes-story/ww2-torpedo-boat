import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE, { isolate: true }); const browser = await chromium.launch(); const page = await browser.newPage();
await page.goto(sv.base); await page.waitForFunction(() => window.__kern); console.log((await page.evaluate(() => window.__kern())).join('\n'));
await browser.close(); await sv.close();
