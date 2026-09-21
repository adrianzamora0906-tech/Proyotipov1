import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import ApiService from '../../core/api/apiService.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);
const dateValue = value => String(value || '').slice(0, 10);
const displayDate = value => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const today = () => {
  const value = new Date();
  const part = number => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}`;
};

class MissedPracticalClassesView extends Component {
  constructor(props) {
    super(props);
    this.filters = { search: '', instructorId: '', vehicleType: '', dateFrom: '', dateTo: '', page: 1, limit: 30 };
    this.data = { items: [], instructors: [], total: 0, page: 1, limit: 30 };
    this.error = '';
  }

  async render() {
    await this.load();
    const content = `<main class="missed-classes-page">
      <style>
        .missed-classes-page{display:grid;gap:18px}.missed-hero{display:flex;justify-content:space-between;gap:20px;padding:24px;border:1px solid #dfe3ec;border-radius:17px;background:linear-gradient(135deg,#fff,#f3f1ff)}
        .missed-hero h1{margin:4px 0 7px;color:#161b2b;font-size:28px}.missed-hero p{margin:0;color:#667085;max-width:760px}.missed-eyebrow{color:#5146e5;font-size:12px;font-weight:800;letter-spacing:.09em}.missed-total{min-width:145px;padding:14px 18px;border-radius:14px;background:#5146e5;color:#fff;text-align:center}.missed-total strong{display:block;font-size:30px}.missed-total span{font-size:12px}
        .missed-filters{display:grid;grid-template-columns:2fr 1.25fr 1fr 1fr 1fr auto;gap:10px;padding:16px;border:1px solid #e4e7ec;border-radius:14px;background:#fff}.missed-filters label,.recovery-form label{display:grid;gap:6px;color:#344054;font-size:12px;font-weight:700}.missed-filters input,.missed-filters select,.recovery-form input,.recovery-form select,.recovery-form textarea{width:100%;min-height:42px;padding:9px 11px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#101828}.missed-filters button{align-self:end}
        .missed-card{border:1px solid #e4e7ec;border-radius:14px;background:#fff;overflow:hidden}.missed-table-wrap{overflow:auto}.missed-table{width:100%;border-collapse:collapse}.missed-table th{padding:12px 14px;background:#f8fafc;color:#475467;font-size:11px;text-align:left;white-space:nowrap}.missed-table td{padding:14px;border-top:1px solid #eaecf0;vertical-align:middle;font-size:13px}.missed-table strong,.missed-table small{display:block}.missed-table small{margin-top:3px;color:#667085}.type-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef4ff;color:#3538cd;font-size:11px;font-weight:800}.type-pill.moto{background:#fff4e8;color:#b54708}.missed-empty{padding:50px 20px;text-align:center;color:#667085}.missed-pagination{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-top:1px solid #eaecf0;color:#667085;font-size:13px}.missed-pagination div{display:flex;gap:8px}
        .recovery-modal{max-width:760px}.recovery-context{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:13px;border-radius:11px;background:#f8fafc}.recovery-context small{display:block;color:#667085}.recovery-form{display:grid;grid-template-columns:repeat(2,1fr);gap:13px;margin-top:15px}.recovery-form .wide{grid-column:1/-1}.recovery-form textarea{min-height:78px;resize:vertical}.availability-box{grid-column:1/-1;padding:12px;border:1px dashed #b8b4f5;border-radius:10px;background:#f7f6ff}.availability-box p{margin:0;color:#667085;font-size:13px}.recovery-slot-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.recovery-slot-list .btn-primary{background:#5146e5;color:#fff;border-color:#5146e5}.medical-check{display:flex!important;grid-column:1/-1;grid-template-columns:auto 1fr!important;align-items:center;gap:9px!important;padding:11px;border-radius:9px;background:#fff8e6}.medical-check input{width:17px!important;min-height:auto!important}.missed-status{padding:11px 14px;border-radius:10px}.missed-status.error{background:#fef3f2;color:#b42318}.missed-status.success{background:#ecfdf3;color:#067647}
        @media(max-width:1050px){.missed-filters{grid-template-columns:repeat(2,1fr)}.missed-filters button{width:100%}}@media(max-width:700px){.missed-hero{flex-direction:column}.missed-total{align-self:flex-start}.missed-filters,.recovery-form,.recovery-context{grid-template-columns:1fr}.recovery-form .wide,.availability-box{grid-column:1}.missed-table{min-width:880px}}
      </style>
      <header class="missed-hero"><div><span class="missed-eyebrow">SECRETARÍA · RECUPERACIÓN DE CLASES</span><h1>Clases sin asistencia</h1><p>Reagenda clases prácticas vencidas por lluvia, enfermedad justificada u otra novedad. La clase original se conserva en el historial.</p></div><div class="missed-total"><strong>${this.data.total}</strong><span>pendientes de revisar</span></div></header>
      ${this.error ? `<div class="missed-status error">${esc(this.error)}</div>` : '<div id="missed-page-status"></div>'}
      <form class="missed-filters" id="missed-filters">
        <label>Estudiante o cédula<input name="search" value="${esc(this.filters.search)}" placeholder="Buscar estudiante..."></label>
        <label>Instructor<select name="instructorId"><option value="">Todos</option>${this.data.instructors.map(item => `<option value="${item.id}" ${this.filters.instructorId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
        <label>Tipo<select name="vehicleType"><option value="">Todos</option><option value="carro" ${this.filters.vehicleType === 'carro' ? 'selected' : ''}>Automóvil</option><option value="moto" ${this.filters.vehicleType === 'moto' ? 'selected' : ''}>Moto</option></select></label>
        <label>Desde<input type="date" name="dateFrom" value="${esc(this.filters.dateFrom)}"></label><label>Hasta<input type="date" name="dateTo" value="${esc(this.filters.dateTo)}"></label>
        <button class="btn btn-primary" type="submit">Buscar</button>
      </form>
      <section class="missed-card"><div class="missed-table-wrap">${this.table()}</div>${this.pagination()}</section>
      <div class="modal-overlay" id="recovery-modal" aria-hidden="true"></div>
    </main>`;
    return SidebarLayout.render(content);
  }

  async mount() {
    SidebarLayout.attachEventListeners();
    document.getElementById('missed-filters')?.addEventListener('submit', event => this.applyFilters(event));
    document.querySelectorAll('[data-reschedule]').forEach(button => button.addEventListener('click', () => this.openModal(button.dataset.reschedule)));
    document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => this.changePage(Number(button.dataset.page))));
  }

  async load() {
    try { const result = await ApiService.getMissedPracticalClasses(this.filters); if (!result.success) throw new Error(result.error); this.data = result.data; this.error = ''; }
    catch (error) { this.error = error.data?.error || error.message || 'No se pudo cargar la bandeja.'; }
  }

  table() {
    if (!this.data.items.length) return '<div class="missed-empty"><strong>No hay clases pendientes con estos filtros.</strong><br>Prueba otro instructor o rango de fechas.</div>';
    return `<table class="missed-table"><thead><tr><th>Estudiante</th><th>Clase perdida</th><th>Instructor</th><th>Curso</th><th>Sucursal</th><th></th></tr></thead><tbody>${this.data.items.map(item => `<tr>
      <td><strong>${esc(item.student_name)}</strong><small>${esc(item.identification)}</small></td><td><strong>${displayDate(item.scheduled_start)}</strong><small>${Math.round((new Date(item.scheduled_end)-new Date(item.scheduled_start))/60000)} minutos</small></td>
      <td>${esc(item.instructor_name)}</td><td><span class="type-pill ${item.vehicle_type}">${item.vehicle_type === 'moto' ? 'Moto' : 'Automóvil'}</span><small>${esc(item.course_name)}</small></td><td>${esc(item.branch_name)}</td>
      <td><button type="button" class="btn btn-primary btn-small" data-reschedule="${item.id}">Reagendar</button></td></tr>`).join('')}</tbody></table>`;
  }

  pagination() {
    const pages = Math.max(1, Math.ceil(this.data.total / this.data.limit));
    return `<div class="missed-pagination"><span>Página ${this.data.page} de ${pages}</span><div><button class="btn btn-secondary btn-small" data-page="${this.data.page - 1}" ${this.data.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn btn-secondary btn-small" data-page="${this.data.page + 1}" ${this.data.page >= pages ? 'disabled' : ''}>Siguiente</button></div></div>`;
  }

  applyFilters(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    ['search', 'instructorId', 'vehicleType', 'dateFrom', 'dateTo'].forEach(key => { this.filters[key] = String(form.get(key) || '').trim(); });
    this.filters.page = 1; this.refresh();
  }
  changePage(page) { this.filters.page = page; this.refresh(); }
  async refresh() { document.getElementById('app').innerHTML = await this.render(); await this.mount(); }

  openModal(id) {
    const item = this.data.items.find(row => row.id === id); if (!item) return;
    const duration = Math.max(40, Math.round((new Date(item.scheduled_end) - new Date(item.scheduled_start)) / 60000));
    const overlay = document.getElementById('recovery-modal'); overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false');
    overlay.innerHTML = `<div class="modal recovery-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title">Reagendar clase</h2><p>Selecciona el nuevo horario y valida quién está disponible.</p></div><button class="modal-close" id="close-recovery">&times;</button></div><div class="modal-body">
      <div class="recovery-context"><div><small>Estudiante</small><strong>${esc(item.student_name)}</strong><small>${esc(item.identification)}</small></div><div><small>Clase original</small><strong>${displayDate(item.scheduled_start)}</strong><small>${esc(item.instructor_name)} · ${duration} minutos</small></div></div>
      <form id="recovery-form" class="recovery-form"><label>Fecha nueva<input type="date" name="date" min="${today()}" value="${today()}" required></label><label>Motivo<select name="reasonCode" required><option value="RAIN">Lluvia / clima</option><option value="MEDICAL">Enfermedad con certificado</option><option value="OTHER">Otro motivo justificado</option></select></label>
      <label class="wide">Instructor<input value="${esc(item.instructor_name)}" disabled><input type="hidden" name="instructorId" value="${item.instructor_id}"></label>
      <input type="hidden" name="startTime"><input type="hidden" name="endTime">
      <label class="wide">Detalle del motivo<textarea name="reasonDetail" minlength="5" maxlength="500" placeholder="Ej.: Instructor de moto no salió por lluvia intensa" required></textarea></label>
      <label class="medical-check" id="medical-check" hidden><input type="checkbox" name="medicalCertificateConfirmed"><span>Confirmo que Secretaría revisó el certificado médico del estudiante.</span></label>
      <div class="availability-box"><p id="availability-message">Consultando la disponibilidad de ${esc(item.instructor_name)}...</p><div id="available-slots"></div></div>
      <div class="wide" id="recovery-status"></div><div class="modal-footer wide"><button type="button" class="btn btn-secondary" id="cancel-recovery">Cancelar</button><button type="submit" class="btn btn-primary" id="save-recovery" disabled>Guardar reagendamiento</button></div></form></div></div>`;
    const form = document.getElementById('recovery-form');
    const close = () => { overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); overlay.innerHTML = ''; };
    document.getElementById('close-recovery').onclick = close; document.getElementById('cancel-recovery').onclick = close;
    form.reasonCode.onchange = event => { document.getElementById('medical-check').hidden = event.target.value !== 'MEDICAL'; };
    form.date.onchange = () => this.checkAvailability(id, form);
    form.onsubmit = event => this.save(event, id, close);
    this.checkAvailability(id, form);
  }

  async checkAvailability(id, form) {
    const values = Object.fromEntries(new FormData(form)); const message = document.getElementById('availability-message');
    const container = document.getElementById('available-slots'); const save = document.getElementById('save-recovery');
    save.disabled = true; form.startTime.value = ''; form.endTime.value = ''; container.innerHTML = '';
    if (!values.date) { message.textContent = 'Selecciona una fecha.'; return; }
    message.textContent = 'Verificando la agenda del instructor...';
    try { const result = await ApiService.getMissedClassAvailability(id, { date: values.date });
      if (!result.success) throw new Error(result.error); const slots = result.data.slots || [];
      if (!slots.length) { message.textContent = `${result.data.instructor.name} no tiene bloques libres ese día.`; return; }
      message.textContent = `Horarios disponibles de ${result.data.instructor.name}:`;
      container.innerHTML = `<div class="recovery-slot-list">${slots.map(slot => `<button type="button" class="btn btn-secondary btn-small" data-slot-start="${slot.start_time}" data-slot-end="${slot.end_time}">${slot.start_time} - ${slot.end_time}</button>`).join('')}</div>`;
      container.querySelectorAll('[data-slot-start]').forEach(button => button.onclick = () => {
        container.querySelectorAll('button').forEach(item => item.classList.remove('btn-primary'));
        button.classList.add('btn-primary'); form.startTime.value = button.dataset.slotStart; form.endTime.value = button.dataset.slotEnd; save.disabled = false;
      });
    } catch (error) { message.textContent = error.data?.error || error.message || 'No se pudo comprobar la disponibilidad.'; }
  }

  async save(event, id, close) {
    event.preventDefault(); const form = event.currentTarget; const button = document.getElementById('save-recovery'); const status = document.getElementById('recovery-status');
    const raw = Object.fromEntries(new FormData(form)); const data = { ...raw, medicalCertificateConfirmed: form.medicalCertificateConfirmed.checked };
    button.disabled = true; status.className = 'missed-status'; status.textContent = 'Guardando y validando nuevamente...';
    try { const result = await ApiService.rescheduleMissedClass(id, data); if (!result.success) throw new Error(result.error); status.className = 'missed-status success'; status.textContent = result.message; setTimeout(async () => { close(); await this.refresh(); }, 700); }
    catch (error) { status.className = 'missed-status error'; status.textContent = error.data?.error || error.message || 'No se pudo reagendar.'; button.disabled = false; }
  }
}

export default MissedPracticalClassesView;
