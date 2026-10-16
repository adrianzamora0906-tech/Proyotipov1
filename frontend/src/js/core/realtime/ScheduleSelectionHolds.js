import { realtimeClient } from './RealtimeClient.js';

let started = false, desired = [], holds = [], signature = '', timer;
function isOpen() {
  const modal = document.getElementById('student-modal-overlay');
  return modal && modal.getAttribute('aria-hidden') !== 'true';
}
function paint() {
  if (!isOpen()) {
    if (desired.length) { desired = []; signature = ''; realtimeClient.sendSelectionHold([]); }
    return;
  }
  document.querySelectorAll('.enrollment-calendar .schedule-option').forEach(cell => {
    let slot;
    try { slot = JSON.parse(cell.dataset.schedule || '{}'); } catch (_) { return; }
    const calendar = cell.closest('.enrollment-calendar');
    const instructorId = calendar?.querySelector('[data-course-instructor-id].active')?.dataset.courseInstructorId
      || document.getElementById('preferred-instructor-select')?.value;
    const times = String(slot.time || '').match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
    const blocked = Boolean(times && holds.some(hold => !hold.mine && hold.slots.some(held =>
      held.instructorId === instructorId && held.date === slot.date && held.start < times[2] && held.end > times[1])));
    if (blocked) {
      if (!cell.dataset.selectionHeld) {
        cell.dataset.selectionHeld = 'true';
        cell.dataset.selectionWasDisabled = String(cell.disabled);
      }
      cell.disabled = true;
      cell.title = 'En seleccion por otro usuario';
      const label = cell.querySelector('.schedule-option-capacity');
      if (label) {
        if (!label.dataset.holdOriginal) label.dataset.holdOriginal = label.textContent;
        if (label.textContent !== 'En seleccion por otro usuario') label.textContent = 'En seleccion por otro usuario';
      }
    } else if (cell.dataset.selectionHeld) {
      cell.disabled = cell.dataset.selectionWasDisabled === 'true';
      delete cell.dataset.selectionHeld;
      delete cell.dataset.selectionWasDisabled;
      cell.removeAttribute('title');
      const label = cell.querySelector('.schedule-option-capacity');
      if (label?.dataset.holdOriginal) { label.textContent = label.dataset.holdOriginal; delete label.dataset.holdOriginal; }
    }
  });
}
function start() {
  if (started) return;
  started = true;
  window.addEventListener('erp:schedule-holds', event => {
    if (event.detail.type === 'schedule-holds') holds = event.detail.holds || [];
    if (event.detail.type === 'schedule-hold-result' && !event.detail.requestId && !event.detail.accepted) {
      desired = []; signature = '';
      realtimeClient.sendSelectionHold([]);
      document.querySelectorAll('.schedule-option.selected').forEach(cell => cell.classList.remove('selected'));
      const input = document.getElementById('selected-schedule-plan');
      if (input) input.value = '';
      const id = document.getElementById('selected-schedule-id');
      if (id) id.value = '';
      const summary = document.getElementById('schedule-selection-summary');
      if (summary) summary.textContent = 'Otro usuario esta seleccionando ese cupo. Elige otro horario.';
    }
    paint();
  });
  const observer = new MutationObserver(() => {
    clearTimeout(timer); timer = setTimeout(paint, 80);
  });
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-hidden'] });
  setInterval(() => {
    paint();
    if (!checking && desired.length && isOpen()) realtimeClient.sendSelectionHold(desired);
  }, 25000);
}
function selectionSlots(plan, instructorId) {
  return instructorId ? plan.map(slot => {
    const times = String(slot.time || '').match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
    return times ? { instructorId, cycleId:slot.cycleId, date:slot.date, start:times[1], end:times[2] } : null;
  }).filter(slot => slot?.cycleId) : [];
}
let checking = false, requestNumber = 0;
export async function confirmScheduleSelection(plan, instructorId) {
  if (checking) throw new Error('Ya se esta comprobando un cupo.');
  const slots = selectionSlots(plan, instructorId);
  if (plan.length && slots.length !== plan.length) throw new Error('Selecciona un instructor para comprobar el cupo.');
  checking = true;
  const requestId = `selection-${Date.now()}-${++requestNumber}`;
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); window.removeEventListener('erp:schedule-holds', listener); };
      const listener = event => {
        if (event.detail.type !== 'schedule-hold-result' || event.detail.requestId !== requestId) return;
        cleanup();
        if (event.detail.accepted) resolve();
        else reject(new Error('Otro usuario esta seleccionando ese cupo. Elige otro horario.'));
      };
      const timeout = setTimeout(() => {
        cleanup(); reject(new Error('No se pudo confirmar el cupo en un segundo. Intenta nuevamente.'));
      }, 1000);
      window.addEventListener('erp:schedule-holds', listener);
      if (!realtimeClient.sendSelectionHold(slots, requestId)) {
        cleanup(); reject(new Error('Sin conexion en tiempo real. Espera la reconexion y vuelve a intentar.'));
      }
    });
    if (!isOpen()) throw new Error('El formulario se cerro antes de confirmar.');
    desired = slots; signature = JSON.stringify(slots);
  } catch (error) {
    // Restaura la retencion anterior incluso si el servidor responde despues del timeout.
    realtimeClient.sendSelectionHold(isOpen() ? desired : []);
    throw error;
  } finally { checking = false; }
}
export function holdScheduleSelection(plan, instructorId) {
  start();
  if (checking) return;
  const slots = selectionSlots(plan, instructorId);
  const next = JSON.stringify(slots);
  desired = slots;
  if (next !== signature) {
    signature = next;
    realtimeClient.sendSelectionHold(slots);
  }
  paint();
}
start();
