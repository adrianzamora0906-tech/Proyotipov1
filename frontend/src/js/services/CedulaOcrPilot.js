import Validator from '../helpers/Validator.js';
export const PILOT_USER_ID = 'e838645a-123c-4615-b72f-dfdd6c03b6da';
const pilotUsers = new Set([PILOT_USER_ID, 'cf826077-d878-4ab3-81be-cd5aa010d6e6', '232213dd-1596-4b29-93a9-4ffc7b182411']);
export const isCedulaOcrPilotUser = userId => pilotUsers.has(userId);
const nonName = /NACIONALIDAD|APELLIDOS|NOMBRES|FECHA|SEXO|LUGAR|ESTADO|FIRMA|C[EÉ]DULA|INSTRUCCI|PROFESI|DOCUMENTO|DONANTE|ECUATORIANA|REP[ÚU]BLICA|CONDICI[ÓO]N|CIUDADAN[IÍ]A|ACCI[ÓO]N|DIRECCI[ÓO]N/;
export function parseMrzNames(text) {
  const candidates = text.toUpperCase().split(/\r?\n/).map(line => line.replace(/\s/g, ''))
    .filter(line => /^[A-Z<]{12,60}$/.test(line))
    .map(line => line.match(/^([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)<*$/)).filter(Boolean)
    .map(match => ({ lastName: match[1].replace(/</g, ' '), firstName: match[2].replace(/</g, ' ') }))
    .filter(value => !nonName.test(value.firstName + ' ' + value.lastName));
  const unique = [...new Map(candidates.map(value => [value.firstName + '|' + value.lastName, value])).values()];
  return unique.length === 1 ? unique[0] : {};
}
function validPastDate(iso) {
  const date = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso && date < new Date();
}
export function parseMrzNumbers(text) {
  const ids = new Set(), births = new Set();
  for (const raw of text.toUpperCase().split(/\r?\n/)) {
    const line = raw.replace(/\s/g, '');
    // Only optional data of an Ecuadorian TD1 first line may contain NUI;
    // the document number at the beginning is not the personal ID.
    if (/^[IA]<*ECU/.test(line) && line.length >= 25) {
      for (const match of line.slice(15).matchAll(/(?:^|<)(\d{10})(?=<|$)/g)) {
        if (Validator.isValidCedula(match[1])) ids.add(match[1]);
      }
    }
    const match = line.match(/^(\d{6})(\d)[MF<]\d{6}\d[A-Z<]{3}[A-Z0-9<]*$/);
    if (!match) continue;
    const checksum = [...match[1]].reduce((sum, digit, index) => sum + Number(digit) * [7,3,1][index % 3], 0) % 10;
    if (checksum !== Number(match[2])) continue;
    const yy = Number(match[1].slice(0,2)), month = match[1].slice(2,4), day = match[1].slice(4,6);
    let year = 2000 + yy;
    if (!validPastDate(`${year}-${month}-${day}`)) year -= 100;
    const iso = `${year}-${month}-${day}`;
    if (validPastDate(iso)) births.add(iso);
  }
  return { identification: ids.size === 1 ? [...ids][0] : '', birthDate: births.size === 1 ? [...births][0] : '' };
}
export function parseCedulaText(text) {
  const lines = text.toUpperCase().split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const candidates = [...text.matchAll(/\b\d{10}\b/g)].map(match => match[0]).filter(value => Validator.isValidCedula(value));
  for (const match of text.toUpperCase().matchAll(/N[.\s]*U[.\s]*I[.:\s-]*(\d(?:[ .-]?\d){9})(?!\d)/g)) {
    const value = match[1].replace(/\D/g,''); if (Validator.isValidCedula(value)) candidates.push(value);
  }
  const numbers = parseMrzNumbers(text);
  if (numbers.identification) candidates.push(numbers.identification);
  const field = label => {
    const i = lines.findIndex(line => label.test(line));
    if (i < 0) return '';
    const values = [];
    const inline = lines[i].replace(label, '').replace(/^[:.\s]+/, '').trim();
    for (const value of [inline, ...lines.slice(i + 1, i + 4)].filter(Boolean)) {
      if (nonName.test(value)) break;
      if (!/^[A-ZÁÉÍÓÚÜÑ ]{2,80}$/.test(value)) break;
      values.push(value);
      if (values.length === 2) break;
    }
    return values.join(' ');
  };
  const birthLine = lines.findIndex(line => /FECHA\s*(?:DE\s*)?NACIMIENTO/.test(line));
  const months = { ENE:'01', FEB:'02', MAR:'03', ABR:'04', MAY:'05', JUN:'06', JUL:'07', AGO:'08', SEP:'09', SET:'09', OCT:'10', NOV:'11', DIC:'12' };
  const birthText = birthLine < 0 ? '' : lines.slice(birthLine, birthLine + 3).join(' ').split(/VENCIMIENTO|EXPEDICI[ÓO]N|EMISI[ÓO]N|LUGAR/)[0];
  const match = birthText.match(/\b(\d{1,2})[\s\/.-]+(\d{1,2}|ENE(?:RO)?|FEB(?:RERO)?|MAR(?:ZO)?|ABR(?:IL)?|MAY(?:O)?|JUN(?:IO)?|JUL(?:IO)?|AGO(?:STO)?|SEP(?:TIEMBRE)?|SET(?:IEMBRE)?|OCT(?:UBRE)?|NOV(?:IEMBRE)?|DIC(?:IEMBRE)?)[\s\/.-]+(\d{4})\b/);
  let birthDate = '';
  if (match) {
    const month = months[match[2].slice(0,3)] || match[2].padStart(2,'0');
    const iso = `${match[3]}-${month}-${match[1].padStart(2,'0')}`;
    const date = new Date(iso + 'T12:00:00Z');
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso && date < new Date()) birthDate = iso;
  }
  const mrz = parseMrzNames(text);
  const names = field(/^NOMBRES?\b/);
  const firstName = mrz.firstName && names.startsWith(mrz.firstName) ? names : mrz.firstName || names;
  return { identification: [...new Set(candidates)].length === 1 ? candidates[0] : '', firstName, lastName: mrz.lastName || field(/^APELLIDOS?\b/), birthDate: birthDate || numbers.birthDate };
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
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    for (const image of images) text += '\n' + (await worker.recognize(image)).data.text;
    const result = parseCedulaText(text);
    const diagnostics = ['LECTURA GENERAL\n' + text];
    if (images[1]) {
      progress?.('Leyendo los nombres del reverso…');
      const image = images[1];
      const region = document.createElement('canvas');
      const scale = Math.min(3, 2200 / image.width);
      region.width = Math.round(image.width * scale); region.height = Math.round(image.height * 0.42 * scale);
      region.getContext('2d').drawImage(image, 0, image.height * 0.58, image.width, image.height * 0.42, 0, 0, region.width, region.height);
      await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
      const mrzText = (await worker.recognize(region)).data.text;
      diagnostics.push('REVERSO\n' + mrzText);
      const names = parseMrzNames(mrzText);
      if (names.firstName) {
        if (!result.firstName || !result.firstName.startsWith(names.firstName)) result.firstName = names.firstName;
        result.lastName = names.lastName;
      }
      const numbers = parseMrzNumbers(mrzText);
      if (!result.identification) result.identification = numbers.identification;
      if (!result.birthDate) result.birthDate = numbers.birthDate;
      await worker.setParameters({ tessedit_char_whitelist: '' });
    }
    const possiblyTruncatedName = result.firstName && result.firstName.split(' ').at(-1).length <= 3;
    if ((!result.firstName || !result.lastName || !result.birthDate || possiblyTruncatedName) && images[0]) {
      progress?.('Releyendo la zona de nombres y nacimiento…');
      // Older Ecuadorian cards place these labels in a narrow central column.
      // Read that column independently so the portrait/right column do not
      // interrupt the reading order. This is a copy, never the saved document.
      const image = images[0];
      const region = document.createElement('canvas');
      const scale = Math.min(3, 2000 / (image.width * 0.48));
      region.width = Math.round(image.width * 0.48 * scale);
      region.height = Math.round(image.height * 0.72 * scale);
      region.getContext('2d').drawImage(image, image.width * 0.27, 0, image.width * 0.48, image.height * 0.72, 0, 0, region.width, region.height);
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      const regionText = (await worker.recognize(region)).data.text;
      diagnostics.push('ZONA CENTRAL\n' + regionText);
      const retry = parseCedulaText(regionText);
      for (const key of ['firstName', 'lastName', 'birthDate']) if (!result[key] && retry[key]) result[key] = retry[key];
      if (retry.firstName && result.firstName && retry.firstName.startsWith(result.firstName)) result.firstName = retry.firstName;
    }
    if (!result.identification && images[0]) {
      progress?.('Verificando el número de cédula…');
      const image = images[0];
      const region = document.createElement('canvas');
      const scale = Math.min(3, 1800 / (image.width * 0.65));
      region.width = Math.round(image.width * 0.65 * scale); region.height = Math.round(image.height * 0.18 * scale);
      region.getContext('2d').drawImage(image, 0, image.height * 0.82, image.width * 0.65, image.height * 0.18, 0, 0, region.width, region.height);
      await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789' });
      const numberText = (await worker.recognize(region)).data.text;
      diagnostics.push('NUMERO DEL FRENTE\n' + numberText);
      result.identification = parseCedulaText(numberText).identification;
    }
    return { ...result, diagnosticText: diagnostics.join('\n\n') };
  } finally { await worker.terminate(); }
}
