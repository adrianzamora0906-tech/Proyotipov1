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
        const softExpected = [{ x: 170, y: 145 }, { x: 830, y: 145 }, { x: 830, y: 555 }, { x: 170, y: 555 }];
        const cornerError = Math.max(...softPoints.map((p, i) => Math.hypot(p.x - softExpected[i].x, p.y - softExpected[i].y)));
        if (cornerError > 5) throw new Error('Recorte impreciso de esquinas redondeadas: ' + JSON.stringify({ cornerError, softPoints }));
        const framed = document.createElement('canvas'); framed.width = 1000; framed.height = 700;
        const framedContext = framed.getContext('2d');
        framedContext.fillStyle = '#222'; framedContext.fillRect(0, 0, 1000, 700);
        framedContext.fillStyle = '#bbb'; framedContext.fillRect(3, 3, 994, 694);
        framedContext.fillStyle = '#d0d0d0'; framedContext.fillRect(280, 210, 440, 280);
        const framedPoints = scanner.detectCorners(cv, framed);
        if (framedPoints[0].x < 250 || framedPoints[0].y < 180) throw new Error('El fondo se confunde con la cedula: ' + JSON.stringify(framedPoints));
        const small = document.createElement('canvas'); small.width = 1000; small.height = 700;
        const smallContext = small.getContext('2d');
        smallContext.fillStyle = '#242424'; smallContext.fillRect(0, 0, 1000, 700);
        smallContext.fillStyle = '#fafafa'; smallContext.fillRect(350, 250, 250, 160);
        const smallPoints = scanner.detectCorners(cv, small);
        if (smallPoints[0].x < 320 || smallPoints[0].x > 370 || smallPoints[0].y < 220 || smallPoints[0].y > 270) throw new Error('No detecta cedula pequena: ' + JSON.stringify(smallPoints));
        const nearEdge = document.createElement('canvas'); nearEdge.width = 600; nearEdge.height = 900;
        const nearContext = nearEdge.getContext('2d');
        nearContext.fillStyle = '#e4e4e4'; nearContext.fillRect(0, 0, 600, 900);
        nearContext.fillStyle = '#dedede'; nearContext.beginPath();
        nearContext.roundRect(30, 390, 590, 370, 20); nearContext.fill();
        nearContext.fillStyle = '#444'; nearContext.font = '18px Arial';
        for (let row = 0; row < 8; row++) nearContext.fillText('DATOS DEL DOCUMENTO', 210, 470 + row * 28);
        nearContext.fillStyle = '#999'; nearContext.fillRect(70, 490, 105, 150);
        const nearStart = performance.now();
        const nearPoints = scanner.detectCorners(cv, nearEdge);
        const nearMs = performance.now() - nearStart;
        if (nearPoints[0].x > 65 || nearPoints[0].y < 355 || nearPoints[0].y > 425 ||
          nearPoints[1].x < 575 || nearPoints[2].y < 725 || nearPoints[2].y > 790) {
          throw new Error('Falla fondo claro con borde derecho al limite: ' + JSON.stringify(nearPoints));
        }
        const blank = document.createElement('canvas'); blank.width = 600; blank.height = 900;
        blank.getContext('2d').fillRect(0, 0, 600, 900);
        const blankPoints = scanner.detectCorners(cv, blank);
        if (blankPoints[0].x !== 0 || blankPoints[2].x !== 599 || blankPoints[2].y !== 899) throw new Error('Inventa recorte sin documento');
        window.nearEdgeCanvas = nearEdge;
        const shadow = document.createElement('canvas'); shadow.width = 600; shadow.height = 900;
        const shadowContext = shadow.getContext('2d');
        shadowContext.fillStyle = '#d8d8d8'; shadowContext.fillRect(0, 0, 600, 900);
        shadowContext.fillStyle = '#d3d3d3'; shadowContext.beginPath();
        shadowContext.moveTo(150, 60); shadowContext.lineTo(470, 20); shadowContext.lineTo(540, 370);
        shadowContext.lineTo(70, 370); shadowContext.closePath(); shadowContext.fill();
        const emptyShadowPoints = scanner.detectCorners(cv, shadow);
        if (emptyShadowPoints[0].x !== 0 || emptyShadowPoints[2].y !== 899) throw new Error('Acepta sombra vacia como documento');
        shadowContext.fillStyle = '#c9cfd4'; shadowContext.beginPath(); shadowContext.roundRect(40, 400, 520, 320, 18); shadowContext.fill();
        shadowContext.fillStyle = '#444'; shadowContext.font = '18px Arial';
        for (let row = 0; row < 7; row++) shadowContext.fillText('DATOS DEL DOCUMENTO', 80, 440 + row * 35);
        const shadowPoints = scanner.detectCorners(cv, shadow);
        if (shadowPoints[0].y < 375 || shadowPoints[2].y > 745) throw new Error('Selecciona sombra en vez de documento: ' + JSON.stringify(shadowPoints));
        window.shadowCanvas = shadow;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        window.scannerPromise = scanner.editDocument(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
        return { points, nearPoints, shadowPoints, nearMs, cornerError, width: corrected.width, height: corrected.height, loadedMs, processingMs,
          invalidRejected: !scanner.validCorners([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]) };
      });
      assert(result.invalidRejected);
      assert(result.width > 600 && result.width < 760, JSON.stringify(result));
      assert(result.height > 390 && result.height < 520, JSON.stringify(result));
      await page.locator('dialog[open]').waitFor();
      const bounds = await page.locator('.scanner-images > canvas').boundingBox();
      await page.locator('[data-original]').click();
      const beforeEdge = await page.locator('.scanner-result canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
      await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + 1);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.1); await page.mouse.up();
      const afterEdge = await page.locator('.scanner-result canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
      assert.equal(afterEdge.width, beforeEdge.width, 'Moving the top side must preserve width');
      assert(afterEdge.height < beforeEdge.height - 50, JSON.stringify({ beforeEdge, afterEdge }));
      await page.locator('[data-original]').click();
      await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * 0.1, bounds.y + bounds.height / 2); await page.mouse.up();
      const afterLeft = await page.locator('.scanner-result canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
      assert.equal(afterLeft.height, beforeEdge.height);
      assert(afterLeft.width < beforeEdge.width - 50);
      await page.locator('[data-cancel]').click();
      assert.equal(await page.evaluate(() => window.scannerPromise), null);
      await page.evaluate(async () => {
        const scanner = await import('/src/js/services/DocumentScannerService.js');
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#242424'; ctx.fillRect(0, 0, 1000, 700);
        ctx.fillStyle = '#fafafa'; ctx.beginPath();
        ctx.moveTo(160, 130); ctx.lineTo(850, 90); ctx.lineTo(800, 570); ctx.lineTo(120, 530); ctx.closePath(); ctx.fill();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        window.scannerPromise = scanner.editDocument(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
      });
      await page.locator('dialog[open]').waitFor();
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
      await page.evaluate(async () => {
        const scanner = await import('/src/js/services/DocumentScannerService.js');
        const blob = await new Promise(resolve => window.nearEdgeCanvas.toBlob(resolve, 'image/png'));
        window.nearPromise = scanner.editDocument(new File([blob], 'near-edge.png', { type: 'image/png' }));
      });
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('dialog [role="status"]').textContent(), '');
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), `scanner-near-edge-${viewport.width}.png`), fullPage: true });
      await page.locator('[data-accept]').click();
      const nearAccepted = await page.evaluate(async () => {
        const canvas = await window.nearPromise;
        return { width: canvas.width, height: canvas.height };
      });
      assert(nearAccepted.width > 550 && nearAccepted.width < 600, JSON.stringify(nearAccepted));
      assert(nearAccepted.height > 340 && nearAccepted.height < 390, JSON.stringify(nearAccepted));
      await page.evaluate(async () => {
        const scanner = await import('/src/js/services/DocumentScannerService.js');
        const blob = await new Promise(resolve => window.shadowCanvas.toBlob(resolve, 'image/png'));
        window.shadowPromise = scanner.editDocument(new File([blob], 'shadow.png', { type: 'image/png' }));
      });
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('dialog [role="status"]').textContent(), '');
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), `scanner-shadow-${viewport.width}.png`), fullPage: true });
      await page.locator('[data-accept]').click();
      const shadowAccepted = await page.evaluate(async () => {
        const canvas = await window.shadowPromise;
        return { width: canvas.width, height: canvas.height };
      });
      assert(shadowAccepted.width > 495 && shadowAccepted.width < 545, JSON.stringify(shadowAccepted));
      assert(shadowAccepted.height > 295 && shadowAccepted.height < 345, JSON.stringify(shadowAccepted));
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
