import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/components/ScannerDeviceDialog.js', import.meta.url), 'utf8');
const start = source.indexOf('    const attachCertificate = async file => {');
const end = source.indexOf('    dropZone.onclick', start);
assert.ok(start >= 0 && end > start);

function makeHandler() {
  let saved = '';
  class Reader {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  }
  const context = { Blob, Uint8Array, String, FileReader:Reader, disposed:false,
    options:{onCertificate: value => { saved = value; }},
    dropZone:{textContent:'',classList:{add: value => { context.addedClass = value; }}}, removeCertificate:{hidden:true}, certificate:{textContent:''}, status:{textContent:''},
    prepareCertificate: async () => {} };
  const handler = vm.runInNewContext(`${source.slice(start,end)}; attachCertificate`, context);
  return {handler, context, saved: () => saved};
}

test('adjunta el PDF original sin convertirlo ni eliminar paginas', async () => {
  const {handler, context, saved} = makeHandler();
  const contents = '%PDF-1.7\npage 1\npage 2\n%%EOF';
  await handler(new File([contents], 'titulo.pdf', {type:'application/pdf'}));
  assert.equal(Buffer.from(saved().split(',')[1], 'base64').toString(), contents);
  assert.match(context.dropZone.textContent, /titulo\.pdf/);
  assert.equal(context.addedClass, 'has-certificate');
  assert.equal(context.removeCertificate.hidden, false);
});

test('rechaza archivos invalidos y no reemplaza el documento', async () => {
  const {handler, saved} = makeHandler();
  await assert.rejects(handler(new File(['incorrecto'], 'titulo.pdf', {type:'application/pdf'})), /PDF válido/);
  await assert.rejects(handler(new File(['texto'], 'titulo.txt', {type:'text/plain'})), /PDF, JPG o PNG/);
  assert.equal(saved(), '');
});
