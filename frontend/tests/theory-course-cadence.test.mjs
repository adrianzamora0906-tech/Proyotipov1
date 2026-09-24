import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../backend/services/TheoryCourseService.js', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('la teoria regular conserva su apertura quincenal de lunes a viernes', () => {
  assert.match(source, /const REGULAR_CADENCE_ANCHOR = '2026-09-21'/);
  assert.match(source, /return remainder===0\?monday:addDays\(monday,14-remainder\)/);
});

test('los intensivos de mañana y tarde comienzan en sabados alternados', () => {
  assert.match(source, /INTENSIVE_MORNING_CADENCE_ANCHOR = '2026-09-26'/);
  assert.match(source, /INTENSIVE_AFTERNOON_CADENCE_ANCHOR = '2026-10-03'/);
  assert.match(source, /option\.startTime==='13:00'/);
  assert.match(source, /currentOrNextIntensiveSaturday\(fromDate,anchor\)/);
});

test('cada turno intensivo vuelve a abrir cada dos semanas', () => {
  assert.match(source, /const periods=Math\.ceil\(elapsedDays\/14\)/);
  assert.match(source, /return addDays\(anchor,periods\*14\)/);
  assert.match(source, /start=addDays\(start,14\)/);
});

test('un grupo lleno muestra las fechas del siguiente grupo disponible', () => {
  assert.match(viewSource, /rangeStart=full\?group\?\.nextAvailableStartDate:group\?\.startDate/);
  assert.match(viewSource, /rangeEnd=full\?group\?\.nextAvailableEndDate:group\?\.endDate/);
});

test('el siguiente grupo se pinta segun sus propios cupos y no como lleno', () => {
  assert.match(source, /nextAvailable:Math\.max\(nextCapacity-nextOccupied,0\)/);
  assert.match(viewSource, /available=Number\(full\?group\?\.nextAvailable:group\?\.available\)/);
  assert.doesNotMatch(viewSource, /\$\{full\?'theory-option-full':''\}/);
});
