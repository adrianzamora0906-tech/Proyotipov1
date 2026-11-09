import Validator from '../helpers/Validator.js';
export const PILOT_USER_ID = 'e838645a-123c-4615-b72f-dfdd6c03b6da';
export function parseCedulaText(text) {
  const lines = text.toUpperCase().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates = [...text.matchAll(/\b\d{10}\b/g)].map(match => match[0]).filter(value => Validator.isValidCedula(value));
  const field = label => {
    const i = lines.findIndex(line => label.test(line));
    if (i < 0) return '';
    const inline = lines[i].replace(label, '').replace(/^[:\s]+/, '').trim();
    const value = inline || lines[i + 1] || '';
    return /^[A-ZÁÉÍÓÚÜÑ ]{2,80}$/.test(value) && !/NACIONALIDAD|APELLIDOS|NOMBRES|FECHA|SEXO/.test(value) ? value : '';
  };
  const birthLine = lines.findIndex(line => /FECHA DE NACIMIENTO/.test(line));
  const match = birthLine < 0 ? null : lines.slice(birthLine, birthLine + 3).join(' ').match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  let birthDate = '';
  if (match) {
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(iso + 'T12:00:00Z');
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso && date < new Date()) birthDate = iso;
  }
  return { identification: [...new Set(candidates)].length === 1 ? candidates[0] : '', firstName: field(/^NOMBRES\b/), lastName: field(/^APELLIDOS\b/), birthDate };
}
let library;
export async function recognizeCedula(images, progress) {
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); library = null; reject(new Error('La descarga OCR tardó demasiado. Continúa con los datos manuales.')); }, 30000);
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    script.onload = () => { clearTimeout(timer); resolve(window.Tesseract); };
    script.onerror = () => { clearTimeout(timer); library = null; reject(new Error('No se pudo descargar el motor OCR. Puedes completar los datos manualmente.')); };
    document.head.append(script);
  });
  const engine = await library;
  const worker = await engine.createWorker('spa', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    logger: message => progress?.(message.status === 'recognizing text' ? `Leyendo texto ${Math.round(message.progress * 100)}%` : 'Preparando motor OCR…'),
  });
  try {
    let text = '';
    for (const image of images) text += '\n' + (await worker.recognize(image)).data.text;
    return parseCedulaText(text);
  } finally { await worker.terminate(); }
}
