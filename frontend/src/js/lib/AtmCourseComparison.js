const codePattern = () => /\bSP\s*[-_]\s*[A-Z]{1,8}\s*[-_]?\s*\d{1,4}\s*[-_]\s*\d{2,4}\b/gi;
export const courseKey = value => String(value || '').toUpperCase().replace(/[\s_-]/g, '');

const isoDate = value => {
  const match = value.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null;
};

// Reconstruye las filas por coordenadas, incluso si el PDF guarda primero las columnas.
export function pdfPageText(items) {
  const lines = [];
  const sorted = items.filter(item => item.str?.trim() && item.transform)
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  for (const item of sorted) {
    const y = item.transform[5];
    let line = lines.find(row => Math.abs(row.y - y) < 2);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.map(line => line.items.sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(' ')).join('\n');
}

export function parseAntCourses(text) {
  const normalized = String(text).replace(/[\u2010-\u2015\u2212]/g, '-');
  const matches = [...normalized.matchAll(codePattern())];
  const courses = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const tail = normalized.slice(match.index + match[0].length, matches[index + 1]?.index);
    // Solo la fila inmediata; no tomar fechas de párrafos o tablas posteriores.
    const row = tail.split('\n').slice(0, 3).join(' ');
    const dates = [...row.matchAll(/\b\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{4}\b/g)].slice(0, 4);
    if (!dates.length) continue;
    const last = dates[3];
    const receipt = last ? row.slice(last.index + last[0].length).match(/^\s*(\d{5,}|PENDIENTE)\b/i)?.[1] : null;
    const course = {
      courseCode: match[0].replace(/\s+/g, ''),
      registrationStart: dates[0] ? isoDate(dates[0][0]) : null,
      registrationEnd: dates[1] ? isoDate(dates[1][0]) : null,
      courseStart: dates[2] ? isoDate(dates[2][0]) : null,
      courseEnd: dates[3] ? isoDate(dates[3][0]) : null,
      receiptNumber: receipt || null,
    };
    // Encabezados repetidos en varias páginas no duplican una fila idéntica.
    if (!courses.some(existing => JSON.stringify(existing) === JSON.stringify(course))) courses.push(course);
  }
  return courses;
}

export const comparisonFields = [
  ['registrationStart', 'Inicio de matrícula'],
  ['registrationEnd', 'Fin de matrícula'],
  ['courseStart', 'Inicio de clases'],
  ['courseEnd', 'Fin de clases'],
  ['receiptNumber', 'Comprobante'],
];

export function compareAntCourses(sent, received) {
  const used = new Set();
  const rows = sent.map(course => {
    const candidates = received.map((value, index) => ({ value, index }))
      .filter(({ value }) => courseKey(value.courseCode) === courseKey(course.courseCode));
    const candidate = candidates[0];
    candidates.forEach(({ index }) => used.add(index));
    if (!candidate) return { sent: course, received: null, status: 'missing', differences: ['Curso no encontrado en el PDF'] };
    const differences = comparisonFields.filter(([key]) => {
      const expected = String(course[key] || '').trim().toUpperCase();
      const actual = String(candidate.value[key] || '').trim().toUpperCase();
      return !expected || !actual || expected !== actual;
    }).map(([, label]) => label);
    if (candidates.length > 1) differences.push('El código aparece con datos distintos en el PDF');
    return { sent: course, received: candidate.value, status: differences.length ? 'different' : 'match', differences };
  });
  received.forEach((course, index) => {
    if (!used.has(index)) rows.push({ sent: null, received: course, status: 'extra', differences: ['Curso no incluido en este oficio'] });
  });
  return rows;
}
