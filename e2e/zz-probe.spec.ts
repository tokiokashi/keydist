import { execSync } from 'node:child_process';
import { test } from '@playwright/test';
test('probe', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/workspace/new');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'zzja'; d.textContent = 'Bigram Flow 日本語のテキスト、ＱＷＥＲＴＹ（）・'; document.body.append(d); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument', { depth: -1 });
  const out: string[] = [];
  for (const sel of ['#zzja']) {
    try {
      const n = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
      if (!n.nodeId) continue;
      const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: n.nodeId });
      out.push(sel + ' ' + JSON.stringify(f.fonts));
    } catch {
      out.push(sel + ' err');
    }
  }
  const info = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '14px Inter, ui-sans-serif, system-ui, sans-serif';
    return {
      dpr: devicePixelRatio,
      ua: navigator.userAgent,
      latin: c.measureText('Bigram Flow QWERTY').width,
      ja: c.measureText('日本語のテキスト').width,
      ff: getComputedStyle(document.body).fontFamily,
    };
  });
  const sh = (c: string) => { try { return execSync(c, { encoding: 'utf8' }); } catch { return 'err'; } };
  console.log('FCLIST ' + sh('fc-list : family | sort -u') + 'FCMATCH ' + sh('fc-match sans-serif; fc-match system-ui; fc-match "sans-serif:lang=ja"; fc-match Inter'));
  console.log('PROBE ' + browser.version() + ' ' + JSON.stringify(info) + '\n' + out.join('\n'));
});
