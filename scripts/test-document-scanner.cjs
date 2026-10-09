const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const root = path.resolve(__dirname, '../frontend');
  const server = http.createServer((req, res) => {
    const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(name, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      const result = await page.evaluate(async () => {
        const scanner = await import('/src/js/services/DocumentScannerService.js');
        const start = performance.now();
        const cv = await scanner.loadScanner();
        const loadedMs = performance.now() - start;
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#242424'; ctx.fillRect(0, 0, 1000, 700);
        ctx.fillStyle = '#fafafa'; ctx.beginPath();
        ctx.moveTo(160, 130); ctx.lineTo(850, 90); ctx.lineTo(800, 570); ctx.lineTo(120, 530); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#343434'; ctx.font = '24px Arial'; ctx.fillText('DOCUMENTO DE PRUEBA', 260, 300);
        const detectionStart = performance.now();
        const points = scanner.detectCorners(cv, canvas);
        const corrected = scanner.correctPerspective(cv, canvas, points);
        const processingMs = performance.now() - detectionStart;
        const soft = document.createElement('canvas'); soft.width = 1000; soft.height = 700;
        const softContext = soft.getContext('2d');
        softContext.fillStyle = '#bbbbbb'; softContext.fillRect(0, 0, 1000, 700);
        softContext.fillStyle = '#d0d0d0'; softContext.beginPath();
        softContext.roundRect(170, 145, 660, 410, 24); softContext.fill();
        const softPoints = scanner.detectCorners(cv, soft);
        if (softPoints[0].x < 100 || softPoints[0].y < 90) throw new Error('No detecta documento con bordes redondeados y poco contraste: ' + JSON.stringify(softPoints));
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        window.scannerPromise = scanner.editDocument(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
        return { points, width: corrected.width, height: corrected.height, loadedMs, processingMs,
          invalidRejected: !scanner.validCorners([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]) };
      });
      assert(result.invalidRejected);
      assert(result.width > 600 && result.width < 760, JSON.stringify(result));
      assert(result.height > 390 && result.height < 520, JSON.stringify(result));
      await page.locator('dialog[open]').waitFor();
      const bounds = await page.locator('.scanner-images > canvas').boundingBox();
      await page.mouse.move(bounds.x + bounds.width * 0.16, bounds.y + bounds.height * 0.185);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.22); await page.mouse.up();
      await page.locator('[data-rotate]').click();
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), `scanner-${viewport.width}.png`), fullPage: true });
      await page.locator('[data-accept]').click();
      const accepted = await page.evaluate(async () => {
        const canvas = await window.scannerPromise;
        return { width: canvas.width, height: canvas.height };
      });
      assert(accepted.height > accepted.width);
      assert.equal(await page.locator('dialog').count(), 0);
      const pdfResult = await page.evaluate(async () => {
        const { default: View } = await import('/src/js/views/mobile-upload/MobileDocumentUploadView.js');
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
        canvas.getContext('2d').fillRect(0, 0, 640, 400);
        const file = new File(['unused'], 'accepted.jpg', { type: 'image/jpeg' });
        const view = Object.create(View.prototype);
        view.scannedImages = new WeakMap([[file, canvas]]);
        const pdf = await view.createMultiScanPdf([{ file }, { file }]);
        const contents = await pdf.text();
        return { type: pdf.type, imagesPreserved: (contents.match(/\/Width 640 \/Height 400/g) || []).length };
      });
      assert.equal(pdfResult.type, 'application/pdf');
      assert.equal(pdfResult.imagesPreserved, 2);
      console.log(JSON.stringify({ viewport, ...result, accepted }));
      await page.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
