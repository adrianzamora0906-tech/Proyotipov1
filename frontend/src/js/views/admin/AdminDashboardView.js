import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminDashboardService from '../../services/AdminDashboardService.js';
import { permissionService } from '../../core/auth/PermissionService.js';

const number = value => new Intl.NumberFormat('es-EC').format(Number(value) || 0);
const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const dateTime = value => value ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const readable = code => ({ PAYMENT_CREATED: 'Registró un pago', PAYMENT_VOIDED: 'Anuló un pago', USER_CREATED: 'Creó un usuario', USER_DISABLED: 'Desactivó un usuario', PERMISSION_GRANTED: 'Otorgó un permiso', PERMISSION_REVOKED: 'Revocó un permiso', WORKFLOW_CHANGED: 'Actualizó un flujo de trabajo', SYSTEM_SETTING_CHANGED: 'Actualizó la configuración', STUDENT_CREATED: 'Registró un estudiante', SESSION_REVOKED: 'Revocó una sesión' })[code] || String(code || 'Actividad del sistema').toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

export default class AdminDashboardView extends Component {
  async render() {
    return SidebarLayout.render(`<main class="admin-dashboard" id="admin-dashboard">
      <header class="admin-dashboard__header"><div><h1>Administración del Sistema</h1><p>Control global y configuración de SportmancarERP</p></div><button class="btn btn-secondary" id="dashboard-refresh" type="button">↻ Actualizar</button></header>
      <section class="dashboard-filters" aria-label="Filtros"><label>Sucursal<select id="dashboard-branch"><option value="">Todas las sucursales</option></select></label><label>Periodo<select id="dashboard-period"><option value="today">Hoy</option><option value="week">Esta semana</option><option value="month" selected>Este mes</option><option value="previous_month">Mes anterior</option><option value="year">Este año</option><option value="custom">Personalizado</option></select></label><label class="custom-date" hidden>Desde<input id="dashboard-from" type="date"></label><label class="custom-date" hidden>Hasta<input id="dashboard-to" type="date"></label></section>
      <div id="dashboard-status" class="dashboard-status" aria-live="polite"></div>
      <section id="dashboard-kpis" class="dashboard-kpis dashboard-skeleton"></section>
      <section class="dashboard-panel"><div class="panel-title"><h2>Alertas y atención requerida</h2></div><div id="dashboard-alerts" class="dashboard-skeleton"></div></section>
      <div class="dashboard-columns"><section class="dashboard-panel"><div class="panel-title"><h2>Actividad reciente</h2><a href="/admin-system/audit">Ver toda la auditoría</a></div><div id="dashboard-activity" class="dashboard-skeleton"></div></section><section class="dashboard-panel"><div class="panel-title"><h2>Resumen operativo</h2></div><div id="dashboard-operations" class="dashboard-skeleton"></div></section></div>
      <section class="dashboard-panel"><div class="panel-title"><h2>Estado de sucursales</h2><a href="/admin-system/branches">Ver todas las sucursales</a></div><div id="dashboard-branches" class="dashboard-table-wrap dashboard-skeleton"></div></section>
      <section class="dashboard-panel"><div class="panel-title"><h2>Resumen financiero</h2><a href="/admin-system/finance">Ir a Financiero</a></div><div id="dashboard-financial" class="dashboard-skeleton"></div></section>
      <section class="dashboard-panel"><div class="panel-title"><h2>Accesos rápidos</h2></div><div id="dashboard-actions" class="quick-actions"></div></section>
    </main>`);
  }

  async mount() {
    this.activityPage = 1;
    this.activityItems = [];
    this.activityError = null;
    this.renderActions();
    document.getElementById('dashboard-refresh')?.addEventListener('click', () => this.load());
    document.getElementById('dashboard-branch')?.addEventListener('change', () => this.load());
    document.getElementById('dashboard-period')?.addEventListener('change', e => { document.querySelectorAll('.custom-date').forEach(x => { x.hidden = e.target.value !== 'custom'; }); if (e.target.value !== 'custom') this.load(); });
    document.querySelectorAll('.custom-date input').forEach(x => x.addEventListener('change', () => { if (document.getElementById('dashboard-from').value && document.getElementById('dashboard-to').value) this.load(); }));
    document.getElementById('dashboard-activity')?.addEventListener('click', event => {
      const button = event.target.closest('[data-activity-page]');
      if (!button || button.disabled) return;
      this.activityPage = Number(button.dataset.activityPage);
      this.renderActivity();
    });
    await this.load();
  }

  filters() { return { branchId: document.getElementById('dashboard-branch')?.value, period: document.getElementById('dashboard-period')?.value, dateFrom: document.getElementById('dashboard-from')?.value, dateTo: document.getElementById('dashboard-to')?.value }; }
  sectionError(key, data) { return data.errors?.[key] ? '<p class="dashboard-empty dashboard-error">No fue posible cargar esta sección. Intenta actualizar.</p>' : null; }
  async load() {
    const status = document.getElementById('dashboard-status'); const refresh = document.getElementById('dashboard-refresh');
    status.textContent = 'Actualizando datos…'; refresh.disabled = true;
    try { const response = await AdminDashboardService.get(this.filters()); const data = response.data || {}; this.activityPage = 1; this.paint(data); status.textContent = `Actualizado ${new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`; }
    catch (error) { status.textContent = error.message || 'No se pudo actualizar el dashboard'; status.classList.add('dashboard-error'); }
    finally { refresh.disabled = false; }
  }
  paint(data) {
    const branch = document.getElementById('dashboard-branch'); const selected = branch.value;
    if (!branch.dataset.loaded && data.branchOptions) { branch.insertAdjacentHTML('beforeend', data.branchOptions.map(x => `<option value="${escape(x.id)}">${escape(x.name)}</option>`).join('')); branch.dataset.loaded = '1'; branch.value = selected; }
    const s = data.summary || {}, x = data.secondary || {};
    const kpis = [
      ['🏢','Sucursales activas',s.active_branches,`${number(s.inactive_branches)} inactivas`,'/admin-system/branches'],['👥','Usuarios activos',s.active_users,'Usuarios habilitados','/admin-system/security'],['◉','Sesiones activas',s.active_sessions,'Actividad en los últimos 15 min','/admin-system/security'],['🎓','Total de estudiantes',s.students,`+${number(s.new_students)} en el periodo`,'/admin-system/people'],['📋','Matrículas activas',s.active_enrollments,'Procesos actualmente activos','/admin-system/academic'],['💳','Pagos pendientes',x.pending_payments,`${money(x.pending_balance)} por cobrar`,'/admin-system/finance'],['📅','Clases de hoy',x.classes_today,'Programadas hoy','/admin-system/academic'],['⚠','Incidencias abiertas',x.open_incidents,`${number(x.critical_incidents)} críticas`,'/admin-system/academic'],['🛡','Acciones críticas hoy',x.critical_actions_today,'Según auditoría','/admin-system/audit']];
    document.getElementById('dashboard-kpis').innerHTML = kpis.map(k => `<a class="dashboard-kpi" href="${k[4]}"><span class="dashboard-kpi__icon">${k[0]}</span><strong>${number(k[2])}</strong><span>${k[1]}</span><small>${k[3]}</small></a>`).join('');
    const alertsError = this.sectionError('alerts', data); document.getElementById('dashboard-alerts').innerHTML = alertsError || (data.alerts?.length ? data.alerts.map(a => `<article class="dashboard-alert dashboard-alert--${escape(a.level)}"><span>⚠</span><div><strong>${escape(a.title)}</strong><p>${escape(a.description || `${number(a.count)} elemento(s) requieren revisión.`)}</p></div><a href="${escape(a.href)}">Ver</a></article>`).join('') : '<p class="dashboard-empty">No existen alertas administrativas pendientes.</p>');
    this.activityError = this.sectionError('activity', data);
    this.activityItems = data.activity || [];
    this.renderActivity();
    const o = data.operations || {}; document.getElementById('dashboard-operations').innerHTML = this.sectionError('operations', data) || `<div class="summary-grid">${[['Matrículas',o.enrollments],['Pagos registrados',o.payments],['Clases realizadas',o.completed_classes],['Incidencias',o.incidents]].map(v => `<div><strong>${number(v[1])}</strong><span>${v[0]}</span></div>`).join('')}</div>`;
    document.getElementById('dashboard-branches').innerHTML = this.sectionError('branches', data) || (data.branches?.length ? `<table><thead><tr><th>Sucursal</th><th>Usuarios</th><th>Estudiantes</th><th>Matrículas</th><th>Actividad hoy</th><th>Estado</th></tr></thead><tbody>${data.branches.map(b => `<tr><td><strong>${escape(b.name)}</strong><small>${escape(b.city || '')}</small></td><td>${number(b.users)}</td><td>${number(b.students)}</td><td>${number(b.active_enrollments)}</td><td>${number(b.activity_today)}</td><td><span class="status-pill ${b.active ? 'active' : 'inactive'}">${b.active ? 'Activa' : 'Inactiva'}</span></td></tr>`).join('')}</tbody></table>` : '<p class="dashboard-empty">No hay sucursales para mostrar.</p>');
    const f = data.financial || {}; document.getElementById('dashboard-financial').innerHTML = this.sectionError('financial', data) || `<div class="summary-grid financial-grid">${[['Recaudado',money(f.collected)],['Saldo pendiente',money(f.pending)],['Pagos',number(f.transactions)],['Anulados',number(f.voided)]].map(v => `<div><strong>${v[1]}</strong><span>${v[0]}</span></div>`).join('')}</div>`;
  }
  renderActivity() {
    const container = document.getElementById('dashboard-activity');
    if (!container) return;
    if (this.activityError) { container.innerHTML = this.activityError; return; }
    if (!this.activityItems.length) { container.innerHTML = '<p class="dashboard-empty">No hay actividad en el periodo seleccionado.</p>'; return; }
    const pageSize = 4;
    const totalPages = Math.ceil(this.activityItems.length / pageSize);
    this.activityPage = Math.min(Math.max(this.activityPage, 1), totalPages);
    const start = (this.activityPage - 1) * pageSize;
    const items = this.activityItems.slice(start, start + pageSize);
    const rows = items.map(a => `<article class="activity-item"><time>${dateTime(a.created_at)}</time><div><strong>${escape(a.user_name)}</strong><p>${escape(a.description || readable(a.action))}</p><small>${escape(a.module || 'Sistema')}${a.branch_name ? ` · ${escape(a.branch_name)}` : ' · Vista global'}</small></div></article>`).join('');
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1).map(page => `<button type="button" class="activity-page${page === this.activityPage ? ' is-active' : ''}" data-activity-page="${page}" aria-label="Página ${page}" ${page === this.activityPage ? 'aria-current="page"' : ''}>${page}</button>`).join('');
    container.innerHTML = `${rows}<nav class="activity-pagination" aria-label="Paginación de actividad"><button type="button" class="activity-page activity-page--nav" data-activity-page="${this.activityPage - 1}" ${this.activityPage === 1 ? 'disabled' : ''}>Anterior</button><span>${pages}</span><button type="button" class="activity-page activity-page--nav" data-activity-page="${this.activityPage + 1}" ${this.activityPage === totalPages ? 'disabled' : ''}>Siguiente</button></nav><p class="activity-pagination__summary">Mostrando ${start + 1}-${Math.min(start + pageSize, this.activityItems.length)} de ${this.activityItems.length} actividades</p>`;
  }
  renderActions() {
    const actions = [['USER_CREATE','＋ Nuevo usuario','/admin-system/security'],['BRANCH_VIEW','Sucursales','/admin-system/branches'],['ROLE_VIEW','Roles y permisos','/admin-system/security'],['AUDIT_VIEW','Auditoría','/admin-system/audit'],['SETTING_VIEW','Configuración','/admin-system/settings'],['REPORT_VIEW','Generar reporte','/admin-system/reports']];
    document.getElementById('dashboard-actions').innerHTML = actions.filter(a => permissionService.can(a[0])).map((a, i) => `<a class="btn ${i ? 'btn-secondary' : 'btn-primary'}" href="${a[2]}">${a[1]}</a>`).join('') || '<p class="dashboard-empty">No hay accesos disponibles para tus permisos.</p>';
  }
}

export { number as formatNumber, money as formatMoney, readable as readableAction };
