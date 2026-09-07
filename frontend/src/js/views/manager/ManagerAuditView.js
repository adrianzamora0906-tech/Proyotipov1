import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const dateTime = value => value ? new Date(value).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente';
const statusLabel = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' };
const actionLabel = {
  AUTH_LOGIN_SUCCESS: 'Inicio de sesión exitoso', AUTH_LOGOUT: 'Cierre de sesión', AUTH_LOGIN_FAILED: 'Intento de acceso fallido',
  SESSION_REVOKED: 'Sesión revocada', PAYMENT_REGISTERED: 'Pago registrado', PAYMENT_VOIDED: 'Pago anulado',
  USER_CREATED: 'Usuario creado', USER_ENABLED: 'Usuario habilitado', USER_DISABLED: 'Usuario deshabilitado',
  USER_PERMISSIONS_UPDATED: 'Permisos modificados', WORKFLOW_CHANGED: 'Flujo de trabajo modificado',
  BRANCH_CREATED: 'Sucursal creada', BRANCH_UPDATED: 'Sucursal modificada', BRANCH_COURSE_ENABLED: 'Curso habilitado',
  BRANCH_COURSE_DISABLED: 'Curso deshabilitado', BRANCH_PAYMENT_METHODS_UPDATED: 'Métodos de pago modificados',
  SYSTEM_SETTING_CHANGED: 'Configuración modificada', ATTENDANCE_QR_CONFIRMED: 'Asistencia confirmada',
};

export default class ManagerAuditView extends Component {
  constructor(props = {}) {
    super(props);
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 29);
    const inputDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.defaults = { dateFrom: inputDate(from), dateTo: inputDate(today) };
    this.page = 1;
  }

  async render() {
    return SidebarLayout.render(`
      <main class="manager-audit">
        <header class="manager-audit__header"><div><span>CONTROL Y TRAZABILIDAD</span><h1>Auditoría gerencial</h1><p>Supervisa solicitudes de anulación y conoce quién solicitó y aprobó cada movimiento.</p></div><div class="manager-audit__readonly">Solo consulta</div></header>
        <section class="manager-audit-filters">
          <label>Sucursal<select id="audit-branch"><option value="">Todas las sucursales</option></select></label>
          <label id="audit-module-label">Módulo<select id="audit-module"><option value="">Todos los módulos</option><option value="FINANCIERO">Financiero</option><option value="SEGURIDAD">Seguridad y accesos</option><option value="SESIONES">Sesiones</option><option value="USUARIOS">Usuarios</option><option value="PERMISOS">Permisos</option><option value="SUCURSALES">Sucursales</option><option value="CONFIGURACION">Configuración</option><option value="WORKFLOWS">Flujos de trabajo</option></select></label>
          <label id="audit-status-label" hidden>Estado<select id="audit-status"><option value="">Todos los estados</option><option value="PENDING">Pendientes</option><option value="APPROVED">Aprobadas</option><option value="REJECTED">Rechazadas</option></select></label>
          <label>Desde<input id="audit-from" type="date" value="${this.defaults.dateFrom}"></label>
          <label>Hasta<input id="audit-to" type="date" value="${this.defaults.dateTo}"></label>
          <button class="btn btn-secondary" id="audit-clear" type="button">Limpiar filtros</button>
        </section>
        <nav class="manager-audit-tabs"><button class="active" data-audit-tab="general">Actividad general</button><button data-audit-tab="voids">Anulaciones y correcciones</button></nav>
        <section class="manager-audit-kpis" id="audit-general-kpis"></section>
        <section class="manager-audit-kpis" id="audit-kpis" hidden></section>
        <section class="manager-audit-panel" id="audit-general-panel">
          <div class="manager-audit-panel__head"><div><h2>Historial de actividad</h2><p>Accesos, pagos, usuarios, permisos, sucursales y cambios de configuración.</p></div><span id="audit-general-count">0 acciones</span></div>
          <div class="table-container"><table><thead><tr><th>Fecha y hora</th><th>Responsable(s)</th><th>Módulo</th><th>Acción realizada</th><th>Sucursal</th><th>Resultado</th><th>Nivel</th></tr></thead><tbody id="audit-general-body"></tbody></table></div>
          <div class="manager-audit-pagination"><button class="btn btn-secondary" id="audit-general-prev">Anterior</button><span id="audit-general-page"></span><button class="btn btn-secondary" id="audit-general-next">Siguiente</button></div>
        </section>
        <section class="manager-audit-panel" id="audit-void-panel" hidden>
          <div class="manager-audit-panel__head"><div><h2>Anulaciones y correcciones</h2><p>El pago solo figura como anulado cuando la solicitud fue aprobada.</p></div><span id="audit-count">0 movimientos</span></div>
          <div class="table-container"><table><thead><tr><th>Fecha</th><th>Estudiante</th><th>Pago</th><th>Valor</th><th>Solicitado por</th><th>Estado</th><th>Aprobado/rechazado por</th><th>Sucursal</th><th>Detalle</th></tr></thead><tbody id="audit-void-body"></tbody></table></div>
          <div class="manager-audit-pagination"><button class="btn btn-secondary" id="audit-prev">Anterior</button><span id="audit-page"></span><button class="btn btn-secondary" id="audit-next">Siguiente</button></div>
        </section>
        <div class="modal-overlay" id="audit-detail-modal" aria-hidden="true"><div class="modal manager-audit-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title">Detalle de la anulación</h2><p>Trazabilidad completa de la solicitud</p></div><button class="modal-close" id="audit-detail-close" aria-label="Cerrar">&times;</button></div><div class="modal-body" id="audit-detail-body"></div><div class="modal-footer"><button class="btn btn-secondary" id="audit-detail-done">Cerrar</button></div></div></div>
      </main>`);
  }

  async mount() {
    this.branch = document.getElementById('audit-branch');
    this.module = document.getElementById('audit-module');
    this.status = document.getElementById('audit-status');
    this.from = document.getElementById('audit-from');
    this.to = document.getElementById('audit-to');
    this.activeTab = 'general';
    [this.branch, this.module, this.status, this.from, this.to].forEach(control => control?.addEventListener('change', () => { this.page = 1; this.load(); }));
    document.getElementById('audit-clear')?.addEventListener('click', () => { this.branch.value = ''; this.module.value = ''; this.status.value = ''; this.from.value = this.defaults.dateFrom; this.to.value = this.defaults.dateTo; this.page = 1; this.load(); });
    document.querySelectorAll('[data-audit-tab]').forEach(button => button.addEventListener('click', () => this.setTab(button.dataset.auditTab)));
    document.getElementById('audit-prev')?.addEventListener('click', () => { if (this.page > 1) { this.page--; this.load(); } });
    document.getElementById('audit-next')?.addEventListener('click', () => { if (this.page < this.pages) { this.page++; this.load(); } });
    document.getElementById('audit-general-prev')?.addEventListener('click', () => { if (this.page > 1) { this.page--; this.load(); } });
    document.getElementById('audit-general-next')?.addEventListener('click', () => { if (this.page < this.generalPages) { this.page++; this.load(); } });
    document.getElementById('audit-detail-close')?.addEventListener('click', () => this.closeDetail());
    document.getElementById('audit-detail-done')?.addEventListener('click', () => this.closeDetail());
    document.getElementById('audit-detail-modal')?.addEventListener('click', event => { if (event.target.id === 'audit-detail-modal') this.closeDetail(); });
    await this.load();
  }

  async load() {
    if (this.activeTab === 'general') return this.loadGeneral();
    const response = await AdminService.auditPaymentVoids({ branchId: this.branch?.value, status: this.status?.value, dateFrom: this.from?.value, dateTo: this.to?.value, page: this.page });
    const payload = response.data || {};
    this.rows = payload.data || [];
    this.pages = payload.pagination?.pages || 1;
    if (payload.branches?.length && this.branch.options.length === 1) this.branch.insertAdjacentHTML('beforeend', payload.branches.map(item => `<option value="${esc(item.id)}">${esc(item.name.trim())}</option>`).join(''));
    const summary = payload.summary || {};
    document.getElementById('audit-kpis').innerHTML = [
      ['pending', summary.pending, 'Solicitudes pendientes', 'Requieren decisión'],
      ['approved', summary.approved, 'Anulaciones aprobadas', 'Pagos anulados'],
      ['rejected', summary.rejected, 'Solicitudes rechazadas', 'Pagos conservados'],
      ['amount', money(summary.approved_amount), 'Valor total anulado', 'Solo aprobaciones'],
    ].map(([tone, value, title, note]) => `<article class="manager-audit-kpi ${tone}"><strong>${esc(value)}</strong><span>${title}</span><small>${note}</small></article>`).join('');
    document.getElementById('audit-count').textContent = `${summary.total || 0} movimientos`;
    document.getElementById('audit-void-body').innerHTML = this.rows.length ? this.rows.map((row, index) => `<tr><td>${dateTime(row.requested_at)}</td><td><strong>${esc(row.student_name)}</strong><small>${esc(row.identification)}</small></td><td><strong>${esc(row.payment_method)}</strong><small>${esc(row.reference || 'Sin referencia')}</small></td><td>${money(row.amount)}</td><td>${esc(row.requested_by_name)}</td><td><span class="audit-status ${row.status.toLowerCase()}">${statusLabel[row.status]}</span></td><td>${esc(row.reviewed_by_name || 'Pendiente de aprobación')}</td><td>${esc(row.branch_name.trim())}</td><td><button class="btn-link" data-audit-detail="${index}">Ver detalle</button></td></tr>`).join('') : '<tr><td colspan="9" class="dashboard-empty">No existen solicitudes de anulación para estos filtros.</td></tr>';
    document.querySelectorAll('[data-audit-detail]').forEach(button => button.addEventListener('click', () => this.openDetail(this.rows[Number(button.dataset.auditDetail)])));
    document.getElementById('audit-page').textContent = `Página ${this.page} de ${this.pages}`;
    document.getElementById('audit-prev').disabled = this.page <= 1;
    document.getElementById('audit-next').disabled = this.page >= this.pages;
  }

  async loadGeneral() {
    const response = await AdminService.audit({ branchId: this.branch?.value, module: this.module?.value, dateFrom: this.from?.value, dateTo: this.to?.value, page: this.page, limit: 25 });
    const payload = response.data || {};
    if (this.branch.options.length === 1) {
      const metadata = (await AdminService.auditPaymentVoids({ page: 1 })).data || {};
      if (metadata.branches?.length) this.branch.insertAdjacentHTML('beforeend', metadata.branches.map(item => `<option value="${esc(item.id)}">${esc(item.name.trim())}</option>`).join(''));
    }
    const rows = payload.data || [];
    this.generalPages = payload.pagination?.pages || 1;
    const critical = rows.filter(row => ['AUTH_LOGIN_FAILED', 'SESSION_REVOKED', 'PAYMENT_VOIDED', 'USER_DISABLED', 'USER_PERMISSIONS_UPDATED', 'SYSTEM_SETTING_CHANGED'].includes(row.action)).length;
    const financial = rows.filter(row => row.module === 'FINANCIERO').length;
    const users = new Set(rows.map(row => row.user_id).filter(Boolean)).size;
    document.getElementById('audit-general-kpis').innerHTML = [
      [payload.pagination?.total || 0, 'Acciones encontradas', 'En el periodo seleccionado'],
      [users, 'Usuarios involucrados', 'En esta página'],
      [financial, 'Movimientos financieros', 'En esta página'],
      [critical, 'Acciones importantes', 'Requieren supervisión'],
    ].map(([value, title, note]) => `<article class="manager-audit-kpi"><strong>${esc(value)}</strong><span>${title}</span><small>${note}</small></article>`).join('');
    document.getElementById('audit-general-count').textContent = `${payload.pagination?.total || 0} acciones`;
    document.getElementById('audit-general-body').innerHTML = rows.length ? rows.map(row => {
      const important = ['AUTH_LOGIN_FAILED', 'SESSION_REVOKED', 'PAYMENT_VOIDED', 'USER_DISABLED', 'USER_PERMISSIONS_UPDATED', 'SYSTEM_SETTING_CHANGED'].includes(row.action);
      const user = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Sistema';
      const responsibility = row.action === 'PAYMENT_VOIDED' && row.requested_by_name
        ? `<strong>Solicitó: ${esc(row.requested_by_name)}</strong><small>Aprobó: ${esc(row.reviewed_by_name || user)}</small>`
        : `<strong>${esc(user)}</strong><small>${esc(row.role || '')}</small>`;
      const description = row.action === 'PAYMENT_VOIDED' && row.void_request_reason
        ? `${row.description || 'Pago anulado'} · Motivo: ${row.void_request_reason}`
        : row.description || '';
      return `<tr><td>${dateTime(row.created_at)}</td><td>${responsibility}</td><td>${esc(row.module || 'Sistema')}</td><td><strong>${esc(actionLabel[row.action] || row.action)}</strong><small>${esc(description)}</small></td><td>${esc(row.branch_name?.trim() || 'General')}</td><td><span class="audit-status approved">${row.action === 'PAYMENT_VOIDED' ? 'Aprobada' : 'Registrado'}</span></td><td><span class="audit-level ${important ? 'important' : ''}">${important ? 'Importante' : 'Informativo'}</span></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="dashboard-empty">No existen actividades para estos filtros.</td></tr>';
    document.getElementById('audit-general-page').textContent = `Página ${this.page} de ${this.generalPages}`;
    document.getElementById('audit-general-prev').disabled = this.page <= 1;
    document.getElementById('audit-general-next').disabled = this.page >= this.generalPages;
  }

  setTab(tab) {
    this.activeTab = tab; this.page = 1;
    document.querySelectorAll('[data-audit-tab]').forEach(button => button.classList.toggle('active', button.dataset.auditTab === tab));
    document.getElementById('audit-general-panel').hidden = tab !== 'general';
    document.getElementById('audit-general-kpis').hidden = tab !== 'general';
    document.getElementById('audit-void-panel').hidden = tab !== 'voids';
    document.getElementById('audit-kpis').hidden = tab !== 'voids';
    document.getElementById('audit-module-label').hidden = tab !== 'general';
    document.getElementById('audit-status-label').hidden = tab !== 'voids';
    this.load();
  }

  openDetail(row) {
    const decision = row.status === 'PENDING' ? 'Aún no existe una decisión' : `${statusLabel[row.status]} por ${row.reviewed_by_name}`;
    document.getElementById('audit-detail-body').innerHTML = `<div class="audit-detail-summary"><div><small>Estudiante</small><strong>${esc(row.student_name)}</strong><span>${esc(row.identification)}</span></div><div><small>Valor solicitado</small><strong>${money(row.amount)}</strong><span>${esc(row.payment_method)}</span></div><div><small>Estado</small><strong>${statusLabel[row.status]}</strong><span>${esc(row.branch_name.trim())}</span></div></div><div class="audit-timeline"><article><i></i><div><small>${dateTime(row.requested_at)}</small><h3>Solicitud registrada por ${esc(row.requested_by_name)}</h3><p>${esc(row.reason)}</p></div></article><article class="${row.status === 'PENDING' ? 'pending' : ''}"><i></i><div><small>${dateTime(row.reviewed_at)}</small><h3>${esc(decision)}</h3><p>${esc(row.review_note || (row.status === 'PENDING' ? 'La solicitud espera revisión del usuario autorizado.' : 'Sin observación adicional.'))}</p></div></article></div>`;
    const modal = document.getElementById('audit-detail-modal'); modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
  }
  closeDetail() { const modal = document.getElementById('audit-detail-modal'); modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
}
