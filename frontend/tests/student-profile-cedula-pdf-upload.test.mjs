import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');

test('documentacion del perfil carga directamente el PDF de cedula', () => {
  assert.match(view, /id="cedula-pdf-file" accept="application\/pdf,\.pdf"/);
  assert.match(view, /id="upload-cedula-pdf"/);
  assert.match(view, /type: 'cedula', name: file\.name, fileUrl/);
  assert.match(view, /file\.size > 9 \* 1024 \* 1024/);
});

test('la seccion ya no muestra fotos ni generacion de PDF', () => {
  const section = view.slice(view.indexOf('renderCedulaPdfUpload'), view.indexOf('async openBloodCardCompletionCapture'));
  assert.doesNotMatch(section, /id="cedula-front"/);
  assert.doesNotMatch(section, /id="cedula-back"/);
  assert.doesNotMatch(section, /id="generate-cedula-pdf"/);
  assert.doesNotMatch(section, /id="mobile-cedula-capture"/);
});
