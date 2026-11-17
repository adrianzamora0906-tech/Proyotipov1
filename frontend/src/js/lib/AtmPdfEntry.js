import { pdfPageText, parseAntCourses } from './AtmCourseComparison.js';

// Solo los identificadores terminados en -E corresponden al ingreso de la solicitud.
// El oficio de respuesta terminado en -OF no debe completar este campo.
export function findAntEntryNumbers(text) {
  const normalized = String(text).toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-');
  const matches = normalized.match(/\bANT\s*-\s*[A-Z]{2,10}\s*-\s*\d{4}\s*-\s*\d+\s*-\s*E\b/g) || [];
  return [...new Set(matches.map(value => value.replace(/\s+/g, '')))];
}

export async function extractAntResponse(file) {
  if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Selecciona un archivo PDF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('El PDF supera los 10 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') {
    throw new Error('El archivo seleccionado no contiene un PDF válido.');
  }
  const pdfjs = await import('./pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  // No abrir diálogos de contraseña: se conserva el ingreso manual como alternativa.
  task.onPassword = () => task.destroy();
  try {
    const document = await task.promise;
    if (document.numPages > 100) throw new Error('El PDF supera las 100 páginas permitidas.');
    const entries = new Set();
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(pdfPageText(content.items));
      for (const entry of findAntEntryNumbers(content.items.map(item => item.str || '').join(' '))) {
        entries.add(entry);
      }
      page.cleanup();
    }
    return { entries: [...entries], courses: parseAntCourses(pages.join('\n')) };
  } finally {
    await task.destroy();
  }
}

export async function extractAntEntryNumbers(file) {
  return (await extractAntResponse(file)).entries;
}
