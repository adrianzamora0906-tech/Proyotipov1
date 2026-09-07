import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const labels = { REGISTRATION: ['Inscripción', 'registration'], SCHEDULE: ['Horario', 'schedule'], INSTRUCTOR: ['Instructor', 'instructor'], PAYMENT: ['Pago', 'payment'], DOCUMENT: ['Documento', 'document'], ACCESS: ['Credenciales', 'access'] };
const time = value => new Date(value).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
const day = value => new Date(value).toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });

export default class ManagerEnrollmentMonitorView extends Component {
  constructor(props = {}) { super(props); this.paused = false; this.loading = false; this.known = new Set(); }

  async render() {
    return SidebarLayout.render(`
      <main class="enrollment-monitor">
        <header class="enrollment-monitor__header"><div><span>OPERACIÓN EN TIEMPO REAL</span><h1>Monitoreo de inscripciones</h1><p>Sigue cada paso del registro de estudiantes en todas las sucursales.</p></div><div class="enrollment-monitor__live"><i></i><strong>En vivo</strong><small id="monitor-updated">Conectando…</small></div></header>
        <section class="enrollment-monitor__toolbar">
          <label>Sucursal<select id="monitor-branch"><option value="">Todas las sucursales</option></select></label>
          <label>Actividad<select id="monitor-type"><option value="">Todo el proceso</option><option value="REGISTRATION">Inscripciones</option><option value="SCHEDULE">Horarios</option><option value="INSTRUCTOR">Instructores</option><option value="PAYMENT">Pagos</option><option value="DOCUMENT">Documentos</option><option value="ACCESS">Credenciales</option></select></label>
          <button class="btn btn-secondary" id="monitor-toggle" type="button">Pausar monitor</button><button class="btn btn-primary" id="monitor-refresh" type="button">Actualizar ahora</button>
        </section>
        <section class="enrollment-monitor__kpis" id="monitor-kpis"></section>
        <section class="enrollment-monitor__panel"><div class="enrollment-monitor__panel-head"><div><h2>Actividad de inscripción</h2><p>Los movimientos más recientes aparecen primero.</p></div><span id="monitor-count">0 movimientos</span></div><div class="enrollment-monitor__feed" id="monitor-feed"><div class="dashboard-empty">Cargando actividad…</div></div></section>
      </main>`);
  }

  async mount() {
    this.branch = document.getElementById('monitor-branch'); this.type = document.getElementById('monitor-type');
    this.branch?.addEventListener('change', () => this.load(true)); this.type?.addEventListener('change', () => this.load(true));
    document.getElementById('monitor-refresh')?.addEventListener('click', () => this.load());
    document.getElementById('monitor-toggle')?.addEventListener('click', event => { this.paused = !this.paused; event.currentTarget.textContent = this.paused ? 'Reanudar monitor' : 'Pausar monitor'; document.querySelector('.enrollment-monitor__live')?.classList.toggle('paused', this.paused); if (!this.paused) this.load(); });
    await this.load(true); this.timer = window.setInterval(() => { if (!this.paused) this.load(); }, 5000);
  }

  async load(reset = false) {
    if (this.loading) return; this.loading = true;
    try {
      const response = await AdminService.enrollmentMonitor({ branchId: this.branch?.value, type: this.type?.value, limit: 100 }); const payload = response.data || {};
      if (payload.branches?.length && this.branch?.options.length === 1) this.branch.insertAdjacentHTML('beforeend', payload.branches.map(item => `<option value="${esc(item.id)}">${esc(item.name.trim())}</option>`).join(''));
      this.paintSummary(payload.summary || {}); this.paintEvents(payload.events || [], reset);
      const updated = document.getElementById('monitor-updated'); if (updated) updated.textContent = `Actualizado ${time(payload.serverTime || new Date())}`;
    } catch (error) { const feed = document.getElementById('monitor-feed'); if (feed) feed.innerHTML = `<div class="enrollment-monitor__error">No se pudo actualizar el monitor. ${esc(error.message || '')}</div>`; }
    finally { this.loading = false; }
  }

  paintSummary(summary) {
    const values = [[summary.registrations_today || 0, 'Inscripciones hoy', 'Nuevos estudiantes'], [summary.scheduled_today || 0, 'Con horario', 'Registros de hoy'], [summary.active_registrars || 0, 'Personal activo', 'Registrando hoy'], [summary.registrations_month || 0, 'Inscripciones del mes', 'Acumulado actual']];
    const target = document.getElementById('monitor-kpis'); if (target) target.innerHTML = values.map(([value, title, note], index) => `<article class="enrollment-monitor__kpi tone-${index + 1}"><strong>${esc(value)}</strong><span>${title}</span><small>${note}</small></article>`).join('');
  }

  paintEvents(events, reset) {
    const target = document.getElementById('monitor-feed'); const count = document.getElementById('monitor-count'); if (count) count.textContent = `${events.length} movimientos recientes`; if (!target) return;
    if (!events.length) { target.innerHTML = '<div class="dashboard-empty">Aún no hay movimientos para estos filtros.</div>'; return; }
    const previous = reset ? new Set() : this.known;
    target.innerHTML = events.map(row => { const [label, tone] = labels[row.event_type] || ['Actividad', 'default']; const key = `${row.event_type}-${row.event_id}`; const fresh = previous.size && !previous.has(key); return `<article class="enrollment-monitor__event ${fresh ? 'is-new' : ''}"><div class="enrollment-monitor__when"><strong>${time(row.event_at)}</strong><span>${day(row.event_at)}</span></div><div class="enrollment-monitor__marker ${tone}"><i></i></div><div class="enrollment-monitor__body"><div><span class="enrollment-monitor__badge ${tone}">${label}</span><strong>${esc(row.title)}</strong></div><h3>${esc(row.student_name)}</h3><p>${esc(row.detail || row.course_name || '')}</p><small>${esc(row.identification)} · ${esc(row.branch_name?.trim())}${row.course_name ? ` · ${esc(row.course_name)}` : ''}</small></div><div class="enrollment-monitor__actor"><small>Responsable</small><strong>${esc(row.actor_name)}</strong></div></article>`; }).join('');
    this.known = new Set(events.map(row => `${row.event_type}-${row.event_id}`));
  }

  unmount() { window.clearInterval(this.timer); super.unmount(); }
}
