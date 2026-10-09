import ApiService from '../../core/api/apiService.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function openWeekendGroupEditor(calendar, onSaved) {
  if (document.getElementById('weekend-group-editor')) return;
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'weekend-group-editor'; dialog.className = 'weekend-group-editor';
  dialog.setAttribute('aria-labelledby', 'weekend-group-title');
  dialog.innerHTML = `<div class="modal-header"><div><h2 id="weekend-group-title" class="modal-title">Editar grupo de fin de semana</h2><p>${escape(calendar.course.code)} &middot; ${escape(calendar.instructor.name)}</p></div><button class="modal-close" type="button" aria-label="Cerrar" data-close>&times;</button></div><div class="modal-body"><p role="status">Cargando grupo...</p><div data-content></div></div>`;
  document.body.append(dialog); dialog.showModal();
  let saving = false;
  const close = () => { if (!saving) dialog.close(); };
  dialog.querySelector('[data-close]').onclick = close;
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.onclose = () => { dialog.remove(); opener?.focus(); };
  const status = dialog.querySelector('[role=status]');
  try {
    const response = await ApiService.getWeekendGroup(calendar.course.id, calendar.instructor.id);
    if (!response.success) throw new Error(response.error || 'No se pudo cargar el grupo');
    if (!dialog.isConnected) return;
    const data = response.data;
    const records = new Map();
    const original = new Map();
    const normalize = member => ({ enrollmentId: member.enrollmentId,
      instructorId: member.slots.find(slot => slot.editable)?.instructorId || data.instructorId,
      slots: member.slots.filter(slot => slot.editable).map(slot => ({ date: slot.date, time: slot.time })).sort((a,b) => a.date.localeCompare(b.date)), remove: false });
    data.members.forEach(member => { const value = normalize(member); records.set(member.enrollmentId, { member, value }); original.set(member.enrollmentId, JSON.stringify(value)); });
    dialog.querySelector('[data-content]').innerHTML = `<div class="weekend-group-members"></div>
      <div class="weekend-group-add"><label>Agregar estudiante<select class="form-select" data-add-select><option value="">Seleccionar estudiante del curso...</option>${data.candidates.filter(member => member.slots.some(slot => slot.editable)).map(member => `<option value="${escape(member.enrollmentId)}">${escape(member.name)} &middot; ${escape(member.identification)}</option>`).join('')}</select></label><button type="button" class="btn btn-secondary" data-add>Agregar</button></div>
      <label>Motivo del cambio<textarea class="form-textarea" data-reason maxlength="1000" rows="2" required></textarea></label>
      <div class="modal-footer"><button class="btn btn-secondary" type="button" data-cancel>Cancelar</button><button class="btn btn-primary" type="button" data-save>Guardar cambios</button></div>`;
    const host = dialog.querySelector('.weekend-group-members');
    const render = () => {
      host.innerHTML = [...records.values()].map(({ member, value }) => `<section class="weekend-group-member" data-member="${escape(member.enrollmentId)}">
        <div class="weekend-group-member-header"><div><strong>${escape(member.name)}</strong><small>${escape(member.identification)}</small></div>
        ${value.slots.length ? `<label><input type="checkbox" data-remove ${value.remove ? 'checked' : ''}> Retirar del grupo</label>` : '<span>Sin clases futuras</span>'}</div>
        ${value.slots.length ? `<label>Instructor<select class="form-select" data-instructor ${value.remove ? 'disabled' : ''}>${data.instructors.map(instructor => `<option value="${escape(instructor.id)}" ${String(instructor.id) === String(value.instructorId) ? 'selected' : ''}>${escape(instructor.name)}</option>`).join('')}</select></label>
        <div class="weekend-group-slots">${value.slots.map((slot,index) => `<div data-slot="${index}"><label>Fecha<select class="form-select" data-date ${value.remove ? 'disabled' : ''}>${[...new Set([...data.dates, slot.date])].sort().map(date => `<option ${date === slot.date ? 'selected' : ''}>${escape(date)}</option>`).join('')}</select></label><label>Horario<select class="form-select" data-time ${value.remove ? 'disabled' : ''}>${[...new Set([...data.times, slot.time])].map(time => `<option ${time === slot.time ? 'selected' : ''}>${escape(time)}</option>`).join('')}</select></label></div>`).join('')}</div>` : ''}
        ${member.slots.some(slot => !slot.editable) ? '<small>Clases anteriores conservadas</small>' : ''}</section>`).join('') || '<p>Este grupo no tiene estudiantes matriculados.</p>';
    };
    host.onchange = event => {
      const row = event.target.closest('[data-member]'); if (!row) return;
      const value = records.get(row.dataset.member).value;
      if (event.target.matches('[data-remove]')) { value.remove = event.target.checked; render(); }
      else if (event.target.matches('[data-instructor]')) value.instructorId = event.target.value;
      else {
        const index = Number(event.target.closest('[data-slot]')?.dataset.slot);
        if (event.target.matches('[data-date]')) value.slots[index].date = event.target.value;
        if (event.target.matches('[data-time]')) value.slots[index].time = event.target.value;
      }
    };
    dialog.querySelector('[data-add]').onclick = () => {
      const selected = dialog.querySelector('[data-add-select]');
      const member = data.candidates.find(item => item.enrollmentId === selected.value);
      if (!member || records.has(member.enrollmentId)) return;
      const value = normalize(member); value.instructorId = data.instructorId;
      records.set(member.enrollmentId, { member, value }); render();
      selected.selectedOptions[0].disabled = true; selected.value = '';
    };
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.querySelector('[data-save]').onclick = async () => {
      if (saving) return;
      const reason = dialog.querySelector('[data-reason]').value.trim();
      const changes = [...records.values()].map(item => item.value).filter(value =>
        value.slots.length && JSON.stringify(value) !== original.get(value.enrollmentId));
      if (!changes.length) { status.textContent = 'No hay cambios para guardar.'; return; }
      if (!reason) { status.textContent = 'Indica el motivo del cambio.'; dialog.querySelector('[data-reason]').focus(); return; }
      if (changes.some(change => change.remove) && !window.confirm('Se retiraran las practicas futuras de los estudiantes marcados. Su matricula y sus pagos se conservaran. ¿Continuar?')) return;
      saving = true; dialog.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = true; });
      status.textContent = 'Validando cupos y guardando cambios...';
      try {
        const saved = await ApiService.updateWeekendGroup(data.cycle.id, data.instructorId, { version: data.version, reason, changes });
        if (!saved.success) throw new Error(saved.error || 'No se pudo guardar');
        saving = false; dialog.close(); await onSaved();
      } catch (error) {
        saving = false; dialog.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = false; });
        render(); status.textContent = error.data?.error?.message || error.message || 'No se pudo guardar';
      }
    };
    render(); status.textContent = '';
  } catch (error) { status.textContent = error.data?.error?.message || error.message || 'No se pudo cargar el grupo'; }
}
