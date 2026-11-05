const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="host"></div>');
    await page.addScriptTag({ path: 'frontend-react/node_modules/dompurify/dist/purify.min.js' });
    const wrapper = fs.readFileSync('frontend/src/js/helpers/SafeHtml.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function sanitizeHtml', 'window.sanitizeHtml = function');
    await page.addScriptTag({ content: 'const DOMPurify=window.DOMPurify;\n' + wrapper });
    await page.evaluate(() => {
      window.injected = 0;
      document.getElementById('host').innerHTML = window.sanitizeHtml('<form id="record-form"><input name="cedula" value="1317643777"><button type="button" id="save" data-action="save">Guardar</button></form><img src="x" onerror="window.injected=1"><svg onload="window.injected=2"></svg><a href="javascript:window.injected=3">Malicioso</a><iframe srcdoc="<script>parent.injected=4</script>"></iframe>');
      document.getElementById('save').addEventListener('click', () => { window.saved = true; });
    });
    await page.locator('#save').click();
    assert.equal(await page.evaluate(() => window.injected), 0);
    assert.equal(await page.evaluate(() => window.saved), true);
    assert.equal(await page.locator('[onerror],[onload],iframe,[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator('[name="cedula"]').inputValue(), '1317643777');
    console.log('PASS: payloads XSS eliminados; campos, data-attributes y eventos de montaje conservados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
