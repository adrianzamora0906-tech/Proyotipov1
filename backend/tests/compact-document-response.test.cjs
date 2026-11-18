const { test } = require('node:test');
const assert = require('node:assert/strict');
const compact = require('../services/compactDocumentResponse');
test('elimina archivos de respuestas individuales y paquetes sin alterar los metadatos', () => {
  const original = { documents: [{ id: '1', file_url: 'data:application/pdf;base64,AAA', uploaded_at: 'fecha' }, { id: '2', file_path: 'contenido' }] };
  assert.deepEqual(compact(original), { documents: [{ id: '1', uploaded_at: 'fecha' }, { id: '2' }] });
  assert.equal(original.documents[0].file_url, 'data:application/pdf;base64,AAA');
  assert.deepEqual(compact({ id: '3', fileUrl: 'contenido' }), { id: '3' });
});
