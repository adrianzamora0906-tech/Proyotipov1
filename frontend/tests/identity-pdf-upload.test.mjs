import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/components/ScannerDeviceDialog.js', import.meta.url), 'utf8');
const start = source.indexOf('if (options.onDocument && !bloodOnly)');
const end = source.indexOf('\n  search.onclick', start);
const flow = source.slice(start, end);

test('el PDF solicita ambas caras y mantiene el carnet opcional', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(flow, /confirm\.disabled = !\(front\.checked && reverse\.checked\)/);
  assert.match(flow, /await options\.onDocument\(fileUrl, includesBloodCard\)/);
  assert.match(flow, /querySelector\('\[data-blood\]'\)\.checked/);
  assert.match(flow, /String\.fromCharCode\(\.\.\.signature\) !== '%PDF-'/);
  assert.match(flow, /9 \* 1024 \* 1024/);
  assert.match(flow, /removeUploadedDocument\.onclick/);
});

test('el recuadro permite elegir o arrastrar un PDF al mismo flujo de confirmacion', () => {
  assert.match(flow, /identityDropZone\.onclick = uploadButton\.onclick/);
  assert.match(flow, /identityDropZone\.onkeydown/);
  assert.match(flow, /identityDropZone\.ondrop/);
  assert.match(flow, /openPdfConfirmation\(files\[0\]\)/);
  assert.match(flow, /if \(file\) openPdfConfirmation\(file\)/);
  assert.match(flow, /identityDropZone\.classList\.add\('has-certificate'\)/);
});
