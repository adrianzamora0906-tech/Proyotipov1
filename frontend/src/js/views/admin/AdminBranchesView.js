import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';
import { permissionService } from '../../core/auth/PermissionService.js';
import { authService } from '../../core/auth/AuthService.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const number = value => new Intl.NumberFormat('es-EC').format(Number(value || 0));
const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const dateTime = value => value ? new Date(value).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin registro';
const dateOnly = value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('es-EC') : 'Sin fecha';
const staffRoleLabel = (role, user) => {
  if (role.code !== 'INSTRUCTOR') return role.code;
  return `INSTRUCTOR · ${{ carro: 'CARRO', moto: 'MOTO', mixto: 'CARRO Y MOTO', teoria: 'TEORÍA' }[user.practice_area] || 'SIN ESPECIALIDAD'}`;
};
const staffRoleRank = user => Math.max(0, ...(user.roles || []).map(role => ({
  ADMIN_SYSTEM: 700,
  GENERAL_MANAGER: 600,
  BRANCH_ADMIN: 500,
  SECRETARY: 400,
  CASHIER: 300,
  INSTRUCTOR: 200,
  STUDENT: 100,
}[role.code] || 0)));
const permissionImpact = code => ({
  PAYMENT_VIEW: 'Menú: Pagos e Historial de Cobros',
  PAYMENT_CREATE: 'Matrícula: Registrar pago en el modal',
  PAYMENT_VOID: 'Financiero: permite solicitar o ejecutar la anulación de un pago',
  STUDENT_VIEW: 'Menú: Estudiantes',
  DOCUMENT_VIEW: 'Menú: Documentación',
  SCHEDULE_VIEW: 'Menú: Horarios',
  REPORT_VIEW: 'Menú: Reportes de cursos de su propia sucursal',
  REPORT_EXPORT: 'Reportes: permite exportar datos de su sucursal',
})[code] || '';
function params() {
  return new URLSearchParams(window.location.search);
}
function go(path) {
  window.history.pushState(null, null, path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
function saveDownload(file) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function moduleUrl(section, branchId, extra = {}) {
  const q = new URLSearchParams({ branchId, ...extra });
  return `/admin-system/${section}?${q.toString()}`;
}

export default class AdminBranchesView extends Component {
  constructor(routeParams = {}) {
    super(routeParams);
    this.query = params();
    this.branchAccess = window.location.pathname === '/branch-access';
    this.branchId = this.query.get('branchId') || (this.branchAccess ? authService.getCurrentUser()?.branch_id : null);
    this.tab = this.branchAccess ? 'staff' : (this.query.get('tab') || 'summary');
    this.programCourseId = this.query.get('programCourseId');
  }

  async render() {
    if (this.branchId && this.programCourseId) return SidebarLayout.render('<main class="course-program-page" id="course-program-page"><div class="branch-empty">Cargando configuración del programa...</div></main>');
    const content = this.branchId ? this.detailShell() : this.listShell();
    return SidebarLayout.render(content);
  }

  async mount() {
    if (this.branchId && this.programCourseId) return this.loadCourseProgramPage();
    if (this.branchId) await this.loadDetail();
    else await this.loadList();
  }

  listShell() {
    const canCreate = permissionService.can('BRANCH_CREATE');
    return `
      <section class="admin-branches">
        <header class="admin-branches__header">
          <div>
            <h1>Sucursales</h1>
            <p>Gestión, configuración y supervisión de las sedes de SportmancarERP.</p>
          </div>
          ${canCreate ? '<button class="btn btn-primary" id="new-branch-btn">+ Nueva sucursal</button>' : ''}
        </header>

        <form class="branch-filters" id="branch-filters">
          <label>Buscar<input name="search" placeholder="Buscar por nombre, código o cantón..."></label>
          <label>Sucursal<select name="branchId"><option value="">Todas las sucursales</option></select></label>
          <label>Estado<select name="status"><option value="">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
          <label>Provincia<select name="province"><option value="">Todas</option></select></label>
          <label>Cantón<select name="city"><option value="">Todos</option></select></label>
          <button class="btn btn-secondary" type="button" id="clear-branch-filters">Limpiar filtros</button>
        </form>

        <div id="branch-status" class="branch-status">Cargando sucursales...</div>
        <section class="branch-kpis" id="branch-kpis"></section>
        <section class="branch-table-panel" id="branch-table"></section>
      </section>
      <div id="branch-modal"></div>
    `;
  }

  detailShell() {
    const tabs = this.branchAccess ? [['staff', 'Personal y Accesos']] : [
      ['summary', 'Resumen'],
      ['staff', 'Personal y Accesos'],
      ['operation', 'Operación'],
      ['courses', 'Cursos'],
      ['routes', 'Rutas'],
      ['settings', 'Configuración'],
      ['activity', 'Actividad'],
    ];
    return `
      <section class="admin-branches branch-detail">
        <button class="btn btn-light" id="back-branches">← Sucursales</button>
        <div id="branch-detail-header" class="branch-detail__header branch-loading"></div>
        <nav class="branch-tabs">
          ${tabs.map(([key, label]) => `<button class="${this.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}
        </nav>
        <div id="branch-detail-body" class="branch-detail__body branch-loading"></div>
      </section>
      <div id="branch-modal"></div>
    `;
  }

  async loadList() {
    const form = document.getElementById('branch-filters');
    const initial = Object.fromEntries(this.query.entries());
    Object.entries(initial).forEach(([key, value]) => { if (form?.elements[key]) form.elements[key].value = value; });

    const response = await AdminService.branches({ ...initial, limit: initial.limit || 25 });
    const payload = response.data;
    this.renderFilterOptions(payload.filters || {}, initial);
    this.renderKpis(payload.stats || {});
    this.renderTable(payload);
    document.getElementById('branch-status').textContent = `${number(payload.pagination?.total || 0)} sucursales encontradas`;

    form?.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      go(`/admin-system/branches?${new URLSearchParams(Object.entries(data).filter(([, v]) => v)).toString()}`);
    });
    form?.querySelectorAll('select').forEach(field => field.addEventListener('change', () => form.requestSubmit()));
    form?.elements.search?.addEventListener('input', () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => form.requestSubmit(), 350); });
    document.getElementById('clear-branch-filters')?.addEventListener('click', () => go('/admin-system/branches'));
    document.getElementById('new-branch-btn')?.addEventListener('click', () => this.openBranchForm());
  }

  renderFilterOptions(filters, selected = {}) {
    const branchSelect = document.querySelector('[name="branchId"]');
    const provinceSelect = document.querySelector('#branch-filters [name="province"]');
    const citySelect = document.querySelector('[name="city"]');
    if (branchSelect && !branchSelect.dataset.loaded) {
      branchSelect.insertAdjacentHTML('beforeend', (filters.branches || []).map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join(''));
      branchSelect.value = selected.branchId || '';
      branchSelect.dataset.loaded = '1';
    }
    if (provinceSelect && !provinceSelect.dataset.loaded) {
      provinceSelect.insertAdjacentHTML('beforeend', (filters.provinces || []).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
      provinceSelect.value = selected.province || '';
      provinceSelect.dataset.loaded = '1';
    }
    const loadCantons = province => {
      if (!citySelect) return;
      const cities = (filters.cityCatalog || []).filter(city => !province || city.province === province);
      citySelect.innerHTML = `<option value="">Todos</option>${cities.map(city => `<option value="${esc(city.name)}">${esc(city.name)}</option>`).join('')}`;
    };
    if (citySelect) {
      loadCantons(provinceSelect?.value || '');
      citySelect.value = selected.city || '';
      provinceSelect?.addEventListener('change', () => loadCantons(provinceSelect.value));
    }
  }

  renderKpis(stats) {
    const container = document.getElementById('branch-kpis');
    container.innerHTML = [
      ['branches','S','Sucursales totales',stats.total,'Sedes registradas',''],
      ['active','✓','Activas',stats.active,'Operando actualmente','active'],
      ['inactive','–','Inactivas',stats.inactive,'Fuera de operación','inactive'],
      ['staff','P','Personal activo',stats.active_staff,'Colaboradores habilitados',null],
    ].map(([tone,icon,label,value,detail,status]) => `<button type="button" class="branch-kpi branch-kpi--${tone}${status!==null?' branch-kpi--action':''}" ${status!==null?`data-status-filter="${status}"`:''}><span class="branch-kpi__icon">${icon}</span><div><strong>${number(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></div>${status!==null?'<i>Ver</i>':''}</button>`).join('');
    const selectedStatus = this.query.get('status') || '';
    container.querySelector(`[data-status-filter="${selectedStatus}"]`)?.classList.add('is-selected');
    container.querySelectorAll('[data-status-filter]').forEach(card => card.addEventListener('click', () => {
      const form = document.getElementById('branch-filters');
      form.elements.status.value = card.dataset.statusFilter;
      form.requestSubmit();
    }));
  }

  renderTable(payload) {
    const rows = payload.data || [];
    const canUpdate = permissionService.can('BRANCH_UPDATE');
    const groupedRows = Object.values(rows.reduce((groups, branch) => {
      const province = branch.province || 'Sin provincia';
      const city = branch.city || 'Sin cantón';
      const key = `${province}::${city}`;
      if (!groups[key]) groups[key] = { key, province, city, rows: [] };
      groups[key].rows.push(branch);
      return groups;
    }, {})).sort((left, right) => left.city.localeCompare(right.city, 'es'));
    const branchRow = branch => `
      <tr class="branch-list-row" tabindex="0" data-id="${esc(branch.id)}" data-name="${esc(String(branch.name||'').toLocaleLowerCase('es'))}" data-city="${esc(String(branch.city||'').toLocaleLowerCase('es'))}" data-staff="${Number(branch.staff_count)||0}" data-students="${Number(branch.active_students)||0}" data-enrollments="${Number(branch.active_enrollments)||0}">
        <td><span class="branch-list-avatar">${esc(String(branch.name||'S').slice(0,1).toUpperCase())}</span><span class="branch-list-name"><strong>${esc(branch.name)}</strong><small>${esc(branch.address || 'Dirección no registrada')}</small></span></td>
        <td>${esc(branch.code || 'Sin código')}</td>
        <td>${esc(branch.administrator_name || 'Sin administrador')}</td>
        <td><span class="branch-number-chip">${number(branch.staff_count)}</span></td>
        <td><span class="branch-number-chip branch-number-chip--students">${number(branch.active_students)}</span></td>
        <td><span class="branch-number-chip branch-number-chip--enrollments">${number(branch.active_enrollments)}</span></td>
        <td>${esc(branch.workflow_name || 'Sin workflow')}</td>
        <td>${this.statusPill(branch)}</td>
        <td class="branch-actions"><button class="btn btn-small view-branch" data-id="${esc(branch.id)}">Ver</button>${canUpdate ? `<button class="btn btn-small edit-branch" data-id="${esc(branch.id)}">Editar</button>` : ''}</td>
      </tr>`;
    const html = rows.length ? `
      <header class="branch-table-panel__header"><div><h2>Sucursales registradas</h2><span>${number(payload.pagination?.total || rows.length)} resultados</span></div><small>Selecciona una fila para abrir su configuración</small></header>
      <div class="branch-table-wrap">
        <table>
          <thead><tr><th><button class="branch-sort" data-sort="name">Sucursal <span>↕</span></button></th><th>Código</th><th>Administrador</th><th><button class="branch-sort" data-sort="staff">Personal <span>↕</span></button></th><th><button class="branch-sort" data-sort="students">Estudiantes <span>↕</span></button></th><th><button class="branch-sort" data-sort="enrollments">Matrículas <span>↕</span></button></th><th>Flujo operativo</th><th>Estado</th><th>Acciones</th></tr></thead>
          ${groupedRows.map(group => `<tbody class="branch-city-group" data-group="${esc(group.key)}"><tr class="branch-city-heading"><td colspan="9"><button type="button" class="branch-city-toggle" aria-expanded="true"><span class="branch-city-icon">${esc(group.city.slice(0,1).toUpperCase())}</span><span><strong>${esc(group.city)}</strong><small>${esc(group.province)} · ${number(group.rows.length)} ${group.rows.length===1?'sucursal':'sucursales'}</small></span><span class="branch-city-totals"><b>${number(group.rows.reduce((sum,item)=>sum+(Number(item.staff_count)||0),0))}</b> personal <b>${number(group.rows.reduce((sum,item)=>sum+(Number(item.active_students)||0),0))}</b> estudiantes</span><i>⌃</i></button></td></tr>${group.rows.map(branchRow).join('')}</tbody>`).join('')}
        </table>
      </div>
      <div class="branch-pagination">25 por página · Página ${number(payload.pagination?.page || 1)}</div>
    ` : '<div class="branch-empty">No existen sucursales con estos filtros.</div>';
    document.getElementById('branch-table').innerHTML = html;
    document.querySelectorAll('.view-branch').forEach(btn => btn.addEventListener('click', () => go(`/admin-system/branches?branchId=${encodeURIComponent(btn.dataset.id)}`)));
    document.querySelectorAll('.edit-branch').forEach(btn => btn.addEventListener('click', async () => {
      const branch = rows.find(item => String(item.id) === String(btn.dataset.id));
      this.openBranchForm(branch);
    }));
    document.querySelectorAll('.branch-list-row').forEach(row=>{
      const open=event=>{if(event.target.closest('button'))return;go(`/admin-system/branches?branchId=${encodeURIComponent(row.dataset.id)}`);};
      row.addEventListener('click',open);
      row.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();open(event);}});
    });
    document.querySelectorAll('.branch-city-toggle').forEach(button=>button.addEventListener('click',()=>{
      const group=button.closest('.branch-city-group'),collapsed=group.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded',String(!collapsed));
      button.querySelector('i').textContent=collapsed?'⌄':'⌃';
    }));
    document.querySelectorAll('.branch-sort').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.sort,direction=button.dataset.direction==='asc'?'desc':'asc',numeric=['staff','students','enrollments'].includes(key);
      document.querySelectorAll('.branch-city-group').forEach(group=>{
        const items=[...group.querySelectorAll('.branch-list-row')];
        items.sort((left,right)=>{const a=numeric?Number(left.dataset[key]):left.dataset[key],b=numeric?Number(right.dataset[key]):right.dataset[key];const result=numeric?a-b:String(a).localeCompare(String(b),'es');return direction==='asc'?result:-result;});
        items.forEach(item=>group.appendChild(item));
      });
      document.querySelectorAll('.branch-sort').forEach(item=>{item.dataset.direction='';item.querySelector('span').textContent='↕';});
      button.dataset.direction=direction;button.querySelector('span').textContent=direction==='asc'?'↑':'↓';
    }));
  }

  statusPill(branch) {
    if (!branch.active || branch.configuration_status === 'inactive') return '<span class="branch-pill inactive">Inactiva</span>';
    if (branch.configuration_status === 'requires_configuration') return '<span class="branch-pill warning">Requiere configuración</span>';
    return '<span class="branch-pill active">Activa</span>';
  }

  async loadDetail() {
    try {
      const [branchResponse, summaryResponse] = await Promise.all([
        AdminService.branch(this.branchId),
        AdminService.branchSummary(this.branchId, { period: this.query.get('period') || 'month' }),
      ]);
      this.branch = branchResponse.data;
      this.summary = summaryResponse.data;
      this.renderDetailHeader();
      await this.renderActiveTab();
      this.attachDetailEvents();
    } catch (error) {
      document.getElementById('branch-detail-header').innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`;
      document.getElementById('branch-detail-body').innerHTML = '';
    }
  }

  renderDetailHeader() {
    const branch = this.branch;
    document.getElementById('branch-detail-header').innerHTML = `
      <div>
        <h1>${esc(branch.name)}</h1>
        <p>${esc([branch.city, branch.province].filter(Boolean).join(', '))}</p>
      </div>
      <div class="branch-header-meta">
        <span>Código: <strong>${esc(branch.code || 'Sin código')}</strong></span>
        ${this.statusPill(branch)}
        <span>Administrador: <strong>${esc(branch.administrator_name || 'Sin asignar')}</strong></span>
        ${permissionService.can('BRANCH_UPDATE') ? '<button class="btn" id="edit-current-branch">Editar sucursal</button>' : ''}
      </div>
    `;
  }

  attachDetailEvents() {
    document.getElementById('back-branches')?.addEventListener('click', () => go('/admin-system/branches'));
    document.getElementById('edit-current-branch')?.addEventListener('click', () => this.openBranchForm(this.branch));
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => go(`${this.branchAccess?'/branch-access':'/admin-system/branches'}?branchId=${encodeURIComponent(this.branchId)}&tab=${btn.dataset.tab}`)));
  }

  async renderActiveTab() {
    const body = document.getElementById('branch-detail-body');
    body.innerHTML = '<div class="branch-empty">Cargando sección...</div>';
    if (this.tab === 'staff') return this.renderStaff(body);
    if (this.tab === 'operation') return this.renderOperation(body);
    if (this.tab === 'courses') return this.renderCourses(body);
    if (this.tab === 'routes') return this.renderTrainingRoutes(body);
    if (this.tab === 'settings') return this.renderSettings(body);
    if (this.tab === 'activity') return this.renderActivity(body);
    return this.renderSummary(body);
  }

  renderSummary(body) {
    const m = this.summary.metrics || {};
    const h = this.summary.health || {};
    const quick = [
      ['USER_VIEW', 'Personal y Accesos', `/admin-system/branches?branchId=${this.branchId}&tab=staff`],
      ['PAYMENT_VIEW', 'Ver información financiera', moduleUrl('finance', this.branchId)],
      ['SCHEDULE_VIEW', 'Revisar cursos y ciclos', `/admin-system/branches?branchId=${this.branchId}&tab=courses`],
      ['REPORT_VIEW', 'Ver reportes de la sucursal', moduleUrl('reports', this.branchId)],
      ['AUDIT_VIEW', 'Consultar auditoría completa', moduleUrl('audit', this.branchId)],
      ['SETTING_VIEW', 'Ver configuración local', `/admin-system/branches?branchId=${this.branchId}&tab=settings`],
    ].filter(([permission]) => permissionService.can(permission));
    body.innerHTML = `
      <section class="branch-metrics">
        ${[
          ['Personal activo', m.active_staff],
          ['Estudiantes activos', m.active_students],
          ['Matrículas activas', m.active_enrollments],
          ['Instructores activos', m.active_instructors],
          ['Clases de hoy', m.classes_today],
          ['Recaudado en el periodo', money(m.collected)],
          ['Pagos pendientes', money(m.pending_payments)],
          ['Incidencias abiertas', m.open_incidents],
        ].map(([label, value]) => `<article><strong>${typeof value === 'string' ? esc(value) : number(value)}</strong><span>${esc(label)}</span></article>`).join('')}
      </section>
      <section class="branch-two-columns">
        <article class="branch-card"><h2>Información de sucursal</h2>${this.infoRows(this.branch)}</article>
        <article class="branch-card"><h2>Estado de configuración</h2>${this.healthRows(h)}</article>
      </section>
      <section class="branch-card"><h2>Accesos rápidos</h2><div class="branch-quick-actions">${quick.map(([, label, route]) => `<button class="btn" data-route="${esc(route)}">${esc(label)}</button>`).join('') || '<p>No hay accesos disponibles con los permisos actuales.</p>'}</div></section>
    `;
  }

  infoRows(branch) {
    const rows = [
      ['Nombre', branch.name], ['Código', branch.code || 'Sin código'], ['Provincia', branch.province || 'No registrada'],
      ['Cantón', branch.city], ['Dirección', branch.address || 'No registrada'], ['Teléfono', branch.phone || 'No registrado'],
      ['Correo', branch.email || 'No registrado'], ['Estado', branch.active ? 'Activa' : 'Inactiva'],
      ['Administrador', branch.administrator_name || 'Sin asignar'], ['Workflow', branch.workflow_name || 'Sin workflow'],
    ];
    return `<dl class="branch-info">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  healthRows(h) {
    const rows = [
      [h.administrator_assigned, 'Administrador asignado'],
      [h.workflow_configured, 'Workflow configurado'],
      [h.courses_enabled, 'Cursos habilitados'],
      [h.active_staff, 'Personal activo'],
      [Number(h.users_without_roles || 0) === 0, `${number(h.users_without_roles)} usuarios requieren revisión de roles`],
      [h.finance_configured, 'Configuración financiera'],
    ];
    return `<ul class="branch-health">${rows.map(([ok, label]) => `<li class="${ok ? 'ok' : 'warn'}"><span>${ok ? '✓' : '!'}</span>${esc(label)}</li>`).join('')}</ul>`;
  }

  async renderStaff(body) {
    const [staffResponse, rolesResponse] = await Promise.all([AdminService.branchStaff(this.branchId), this.branchAccess ? Promise.resolve({ data: [] }) : AdminService.roles()]);
    const staff = staffResponse.data || [];
    const roles = rolesResponse.data || [];
    const canUpdateUsers = permissionService.can('USER_UPDATE');
    body.innerHTML = `
      <section class="branch-card">
        <div class="branch-section-title"><h2>Personal y Accesos</h2>${permissionService.can('USER_CREATE') ? '<button class="btn btn-primary" id="new-user-from-branch">Nuevo usuario</button>' : ''}</div>
        <div class="branch-table-wrap"><table><thead><tr><th>Persona</th><th><button type="button" class="branch-table-sort" id="sort-staff-role" aria-label="Ordenar por jerarquía del rol" aria-sort="none">Rol/es <span>↕</span></button></th><th>Usuario</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody id="branch-staff-rows">
          ${staff.map(user => `<tr class="${user.active?'':'user-blocked'}" data-role-rank="${staffRoleRank(user)}" data-person-name="${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim().toLocaleLowerCase('es'))}"><td class="${canUpdateUsers?'editable-person':''}" ${canUpdateUsers?`data-user-id="${esc(user.id)}" role="button" tabindex="0" title="Editar perfil"`:''}><strong>${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim())}</strong><small>${esc(user.email || '')}</small>${canUpdateUsers?'<span class="editable-person__hint">Ver y editar perfil</span>':''}</td><td>${(user.roles || []).map(role => `<span class="branch-role">${esc(staffRoleLabel(role,user))}</span>`).join('') || 'Sin rol'}</td><td>${esc(user.username)}</td><td><span class="branch-pill ${user.active?'active':'inactive'}">${user.active ? 'Activo' : 'Bloqueado'}</span></td><td>${dateTime(user.last_login_at)}</td><td class="branch-actions"><button class="btn btn-small view-user-access" data-user-id="${esc(user.id)}">Accesos</button><button class="btn btn-small view-user-sessions" data-user-id="${esc(user.id)}">Sesiones</button>${permissionService.can('USER_DISABLE')&&String(user.id)!==String(authService.getCurrentUser()?.userId)?`<button class="btn btn-small toggle-branch-user" data-user-id="${esc(user.id)}" data-active="${user.active?'false':'true'}">${user.active?'Bloquear':'Desbloquear'}</button>`:''}${permissionService.can('USER_RESET_ACCESS')?`<button class="btn btn-small reset-user-access" data-user-id="${esc(user.id)}">Restablecer acceso</button>`:''}</td></tr>`).join('') || '<tr><td colspan="6">No hay personal en esta sucursal.</td></tr>'}
        </tbody></table></div>
      </section>
      ${this.branchAccess ? '' : `<section class="branch-card"><h2>Roles disponibles</h2><div class="branch-role-list">${roles.map(role => `<span>${esc(role.code)} · ${esc(role.name)}</span>`).join('')}</div></section>`}
    `;
    const roleSort = body.querySelector('#sort-staff-role');
    roleSort?.addEventListener('click', () => {
      const tbody = body.querySelector('#branch-staff-rows');
      const direction = roleSort.dataset.direction === 'desc' ? 'asc' : 'desc';
      const rows = [...tbody.querySelectorAll('tr[data-role-rank]')];
      rows.sort((a, b) => {
        const rankDifference = Number(b.dataset.roleRank) - Number(a.dataset.roleRank);
        const orderedRank = direction === 'desc' ? rankDifference : -rankDifference;
        return orderedRank || a.dataset.personName.localeCompare(b.dataset.personName, 'es');
      });
      rows.forEach(row => tbody.appendChild(row));
      roleSort.dataset.direction = direction;
      roleSort.setAttribute('aria-sort', direction === 'desc' ? 'descending' : 'ascending');
      roleSort.querySelector('span').textContent = direction === 'desc' ? '↓' : '↑';
    });
    document.getElementById('new-user-from-branch')?.addEventListener('click', () => this.openUserForm(roles));
    document.querySelectorAll('.editable-person').forEach(cell => {
      const openProfile = () => {
        const user = staff.find(item => String(item.id) === String(cell.dataset.userId));
        if (user) this.openEditUserProfile(user, body);
      };
      cell.addEventListener('click', openProfile);
      cell.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProfile(); } });
    });
    document.querySelectorAll('.view-user-access').forEach(button => button.addEventListener('click', () => {
      const user = staff.find(item => String(item.id) === String(button.dataset.userId));
      if (user) this.openPermissionsModal(user);
    }));
    document.querySelectorAll('.view-user-sessions').forEach(button => button.addEventListener('click', () => { const user=staff.find(item=>String(item.id)===String(button.dataset.userId));if(user)this.openSessionsModal(user); }));
    document.querySelectorAll('.toggle-branch-user').forEach(button => button.addEventListener('click', async()=>{try{button.disabled=true;await AdminService.setActive(button.dataset.userId,button.dataset.active==='true','Cambio desde Personal y Accesos');await this.renderStaff(body);}catch(error){button.disabled=false;window.alert(error.message||'No se pudo cambiar el estado del usuario.');}}));
    document.querySelectorAll('.reset-user-access').forEach(button => button.addEventListener('click', async()=>{try{button.disabled=true;await AdminService.resetUserAccess(button.dataset.userId,'Restablecido desde Personal y Accesos');window.alert('Acceso restablecido correctamente. El usuario deberá cambiar su contraseña al ingresar.');await this.renderStaff(body);}catch(error){button.disabled=false;window.alert(error.message||'No se pudo restablecer el acceso.');}}));
  }

  openEditUserProfile(user, body) {
    const modal = document.getElementById('branch-modal');
    const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
    const isInstructor = (user.roles || []).some(role => role.code === 'INSTRUCTOR');
    const isSecretary = (user.roles || []).some(role => role.code === 'SECRETARY');
    const canConvertRole = isSecretary && authService.getCurrentUser()?.roles?.includes('ADMIN_SYSTEM');
    modal.innerHTML = `<div class="branch-modal-backdrop"><form class="branch-modal user-profile-modal" id="edit-user-profile-form">
      <div class="user-profile-modal__hero"><div class="user-profile-modal__avatar">${esc(initials)}</div><div><span class="user-profile-modal__eyebrow">Perfil del usuario</span><h2>${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim())}</h2><p>@${esc(user.username)} · ${esc(this.branch.name)}</p></div><button type="button" class="permission-modal__close close-modal" aria-label="Cerrar">×</button></div>
      <section class="user-profile-modal__section"><div class="user-profile-modal__section-title"><strong>Información personal</strong><span>Actualiza los datos visibles dentro del sistema.</span></div><div class="user-profile-modal__grid">
        <label>Nombres<input class="form-input" name="firstName" value="${esc(user.first_name || '')}" required></label>
        <label>Apellidos<input class="form-input" name="lastName" value="${esc(user.last_name || '')}" required></label>
        <label class="user-profile-modal__wide">Correo electrónico<input class="form-input" name="email" type="email" value="${esc(user.email || '')}" placeholder="correo@ejemplo.com"></label>
      </div></section>
      ${canConvertRole ? `<section class="user-profile-modal__section user-profile-modal__role"><div class="user-profile-modal__section-title"><strong>Rol dentro del sistema</strong><span>Solo el Administrador del sistema puede realizar esta conversión.</span></div><div class="user-profile-modal__grid">
        <label>Rol<select class="form-input" name="roleCode" id="edit-user-role"><option value="SECRETARY">Secretaría</option><option value="INSTRUCTOR">Instructor</option></select></label>
        <label id="edit-instructor-area-wrap" hidden>Tipo de instructor<input class="form-input" value="Profesor de teoría" readonly><input type="hidden" name="practiceArea" value="teoria"></label>
      </div><div class="user-profile-modal__notice user-profile-modal__role-notice" id="edit-user-role-notice" hidden>Al guardar, el usuario perderá el acceso de Secretaría y será registrado únicamente como profesor de teoría. Sus sesiones abiertas se cerrarán.</div></section>` : ''}
      <section class="user-profile-modal__section user-profile-modal__security"><div class="user-profile-modal__section-title"><strong>Seguridad de acceso</strong><span>Déjalo vacío si no deseas cambiar la contraseña.</span></div><div class="user-profile-modal__grid">
        <label>Nueva contraseña<input class="form-input" name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
        <label>Confirmar contraseña<input class="form-input" name="passwordConfirmation" type="password" minlength="8" autocomplete="new-password" placeholder="Repita la contraseña"></label>
      </div><div class="user-profile-modal__notice">Al cambiarla, las sesiones abiertas de esta persona se cerrarán por seguridad.</div></section>
      ${isInstructor ? `<section class="user-profile-modal__section"><div class="user-profile-modal__section-title"><strong>Disponibilidad del instructor</strong><span>Define los días y bloques en que puede recibir clases.</span></div><button type="button" class="btn btn-primary" id="configure-instructor-availability">Configurar disponibilidad</button></section>` : ''}
      <div id="edit-user-profile-status" class="branch-status" aria-live="polite"></div>
      <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar perfil</button></div>
    </form></div>`;
    const close = () => { modal.innerHTML = ''; };
    modal.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', close));
    const roleSelect = modal.querySelector('#edit-user-role');
    const syncRoleFields = () => {
      const convertsToInstructor = roleSelect?.value === 'INSTRUCTOR';
      const area = modal.querySelector('#edit-instructor-area-wrap');
      const notice = modal.querySelector('#edit-user-role-notice');
      if (area) area.hidden = !convertsToInstructor;
      if (notice) notice.hidden = !convertsToInstructor;
    };
    roleSelect?.addEventListener('change', syncRoleFields);
    syncRoleFields();
    modal.querySelector('#configure-instructor-availability')?.addEventListener('click', () => this.openBranchInstructorAvailability(user, body));
    modal.querySelector('#edit-user-profile-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const status = form.querySelector('#edit-user-profile-status');
      const submit = form.querySelector('button[type="submit"]');
      if (data.password !== data.passwordConfirmation) { status.textContent = 'Las contraseñas no coinciden.'; status.classList.add('dashboard-error'); return; }
      const payload = { firstName: data.firstName.trim(), lastName: data.lastName.trim(), email: data.email.trim() || null };
      if (data.password) payload.password = data.password;
      if (canConvertRole && data.roleCode === 'INSTRUCTOR') {
        if (!window.confirm('¿Confirmas cambiar este usuario de Secretaría a profesor de teoría? Sus sesiones abiertas se cerrarán.')) return;
        payload.roleCode = 'INSTRUCTOR';
        payload.practiceArea = data.practiceArea;
      }
      try {
        submit.disabled = true; status.textContent = 'Guardando perfil...'; status.classList.remove('dashboard-error');
        await AdminService.updateUser(user.id, payload);
        close();
        await this.renderStaff(body);
      } catch (error) {
        submit.disabled = false; status.textContent = error.message || 'No se pudo actualizar el perfil'; status.classList.add('dashboard-error');
      }
    });
  }

  async openBranchInstructorAvailability(user, body) {
    const modal=document.getElementById('branch-modal');
    modal.innerHTML='<div class="branch-modal-backdrop"><section class="branch-modal instructor-availability-modal"><p>Consultando disponibilidad...</p></section></div>';
    try {
      const [response,branchesResponse]=await Promise.all([
        AdminService.instructorAvailability(user.id,this.branchId),
        AdminService.branches({city:this.branch.city,status:'active',limit:100}),
      ]);
      const data=response.data||{},priorityAssignment=data.priorityAssignment||null,assignment=priorityAssignment||data.branchAssignment||{},isPriority=assignment.assignment_type==='priority',savedPriority=new Set((assignment.allowed_slots||[]).map(slot=>`${slot.weekday}:${slot.startTime||slot.start_time}-${slot.endTime||slot.end_time}`)),current=isPriority?savedPriority:new Set((data.slots||[]).map(slot=>`${slot.weekday}:${slot.start_time}-${slot.end_time}`));
      const cantonBranches=(branchesResponse.data?.data||[]).filter(branch=>branch.active!==false&&branch.city===this.branch.city);
      const selectedPriorityBranchId=priorityAssignment?.branch_id||this.branchId;
      const days=[[1,'Lunes'],[2,'Martes'],[3,'Miércoles'],[4,'Jueves'],[5,'Viernes']];
      const blocks=[['06:00','07:40'],['08:00','09:40'],['10:00','11:40'],['12:00','13:40'],['14:00','15:40'],['16:00','17:40'],['18:00','19:40'],['20:00','21:40']];
      modal.innerHTML=`<div class="branch-modal-backdrop"><form class="branch-modal instructor-availability-modal" id="branch-instructor-availability-form"><div class="permission-modal__header"><div><h2>Disponibilidad del instructor</h2><p>${esc(user.first_name)} ${esc(user.last_name)} · ${esc(this.branch.name)}</p></div><button type="button" class="permission-modal__close back-user-profile">×</button></div><div class="instructor-availability-help">Selecciona cuándo puede recibir asignaciones. Los bloques con clases se ocuparán automáticamente.</div><label class="instructor-practice-area"><span>Tipo de instructor</span><select class="form-input" name="practiceArea" required><option value="carro" ${data.instructor?.practice_area==='carro'?'selected':''}>Solo automóvil</option><option value="moto" ${data.instructor?.practice_area==='moto'?'selected':''}>Solo moto</option><option value="mixto" ${data.instructor?.practice_area==='mixto'?'selected':''}>Automóvil y moto</option></select><small>Esta selección determina en qué cursos puede ser asignado.</small></label><div class="instructor-availability-actions"><button type="button" class="btn btn-primary" data-all-availability>Seleccionar todo</button><button type="button" class="btn btn-light" data-clear-availability>Limpiar selección</button></div><div class="instructor-availability-grid"><div class="availability-heading">Hora</div>${days.map(day=>`<button type="button" class="availability-heading availability-day-toggle" data-day="${day[0]}">${day[1]}</button>`).join('')}${blocks.map(([start,end])=>`<div class="availability-time">${start}<small>${end}</small></div>${days.map(day=>`<label class="availability-cell"><input type="checkbox" data-weekday="${day[0]}" data-start="${start}" data-end="${end}" ${current.has(`${day[0]}:${start}-${end}`)?'checked':''}><span></span></label>`).join('')}`).join('')}</div><div id="availability-status" class="branch-status"></div><div class="branch-modal-actions"><button type="button" class="btn back-user-profile">Volver</button><button type="submit" class="btn btn-primary">Guardar configuración</button></div></form></div>`;
      const form=modal.querySelector('form'),back=()=>this.openEditUserProfile(user,body);
      form.querySelector('.instructor-availability-help').textContent='La jornada del instructor siempre está completa. Marca las horas prioritarias de esta sucursal; las demás se comparten con el cantón.';
      form.querySelector('[data-all-availability]').textContent='Marcar todas';
      form.querySelector('[data-clear-availability]').textContent='Compartir todas';
      form.querySelector('.instructor-availability-actions').insertAdjacentHTML('beforebegin',`<section class="instructor-branch-priority"><div class="instructor-priority-heading"><label for="priority-branch-select"><strong>Prioritario en</strong></label><label class="instructor-priority-toggle instructor-priority-switch"><input type="checkbox" name="priorityBranch" ${isPriority?'checked':''}><i></i></label></div><select class="form-input" name="priorityBranchId" id="priority-branch-select">${cantonBranches.map(branch=>`<option value="${esc(branch.id)}" ${String(branch.id)===String(selectedPriorityBranchId)?'selected':''}>${esc(branch.name)}</option>`).join('')}</select><small class="priority-branch-help"></small></section>`);
      form.querySelector('.instructor-availability-actions').prepend(Object.assign(document.createElement('strong'),{textContent:'Horas prioritarias en la sucursal elegida'}));
      form.querySelector('.instructor-availability-actions').insertAdjacentHTML('afterend','<small class="availability-row-help">Marca o desmarca el lunes para aplicar esa hora a toda la fila.</small>');
      modal.querySelectorAll('.back-user-profile').forEach(button=>button.onclick=back);
      modal.querySelector('[data-all-availability]').onclick=()=>form.querySelectorAll('.availability-cell input').forEach(input=>{input.checked=true;});
      modal.querySelector('[data-clear-availability]').onclick=()=>form.querySelectorAll('.availability-cell input').forEach(input=>{input.checked=false;});
      modal.querySelectorAll('.availability-day-toggle').forEach(button=>button.onclick=()=>{const inputs=[...form.querySelectorAll(`[data-weekday="${button.dataset.day}"]`)];const checked=inputs.some(input=>!input.checked);inputs.forEach(input=>{input.checked=checked;});});
      modal.querySelectorAll('.availability-cell input[data-weekday="1"]').forEach(input=>{const rowToggle=input.closest('label');rowToggle?.classList.add('availability-row-toggle');rowToggle?.setAttribute('title','Aplicar esta hora de lunes a viernes');input.addEventListener('change',()=>{form.querySelectorAll(`.availability-cell input[data-start="${input.dataset.start}"][data-end="${input.dataset.end}"]`).forEach(rowInput=>{rowInput.checked=input.checked;});});});
      const availabilityActions=form.querySelector('.instructor-availability-actions'),availabilityGrid=form.querySelector('.instructor-availability-grid'),prioritySelect=form.elements.priorityBranchId,priorityHelp=form.querySelector('.priority-branch-help');
      const updatePriorityCopy=()=>{const branchName=prioritySelect.options[prioritySelect.selectedIndex]?.text||'la sucursal elegida';priorityHelp.textContent=`Las horas marcadas quedan reservadas para ${branchName}; las horas sin marcar pueden utilizarse en las demás sucursales del cantón.`;};
      const togglePriority=()=>{const visible=form.elements.priorityBranch.checked;prioritySelect.disabled=!visible;availabilityActions.hidden=!visible;availabilityGrid.hidden=!visible;updatePriorityCopy();};
      prioritySelect.onchange=updatePriorityCopy;form.elements.priorityBranch.onchange=togglePriority;togglePriority();
      form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]'),status=form.querySelector('#availability-status');submit.disabled=true;status.textContent='Guardando...';try{const allowedSlots=form.elements.priorityBranch.checked?[...form.querySelectorAll('.availability-cell input:checked')].map(input=>({weekday:Number(input.dataset.weekday),startTime:input.dataset.start,endTime:input.dataset.end})):[];await AdminService.saveInstructorAvailability(user.id,[],form.elements.practiceArea.value,{branchId:prioritySelect.value||this.branchId,assignmentType:form.elements.priorityBranch.checked?'priority':'standard',practiceArea:form.elements.practiceArea.value,effectiveFrom:new Date().toISOString().slice(0,10),effectiveUntil:null,allowedSlots});status.textContent='Configuración guardada correctamente.';setTimeout(async()=>{modal.innerHTML='';await this.renderStaff(body);},650);}catch(error){status.textContent=error.message||'No se pudo guardar.';submit.disabled=false;}};
    } catch(error) {
      modal.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal"><h2>No se pudo abrir</h2><p>${esc(error.message)}</p><div class="branch-modal-actions"><button class="btn btn-primary back-user-profile">Volver</button></div></section></div>`;
      modal.querySelector('.back-user-profile').onclick=()=>this.openEditUserProfile(user,body);
    }
  }

  async openSessionsModal(user) {
    const modal=document.getElementById('branch-modal');modal.innerHTML='<div class="branch-modal-backdrop"><section class="branch-modal"><p>Cargando sesiones...</p></section></div>';
    try{const detail=(await AdminService.user(user.id,{branchId:this.branchId})).data||{},sessions=detail.sessions||[],showTechnicalData=(authService.getCurrentUser()?.roles||[]).includes('ADMIN_SYSTEM'),columns=showTechnicalData?6:4;modal.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal permission-modal"><div class="permission-modal__header"><div><h2>Sesiones de ${esc(`${user.first_name||''} ${user.last_name||''}`.trim())}</h2><p>${esc(user.username)} · ${esc(this.branch.name)}</p></div><button class="permission-modal__close close-modal" aria-label="Cerrar">×</button></div><div class="branch-table-wrap"><table><thead><tr><th>Inicio</th><th>Última actividad</th>${showTechnicalData?'<th>IP</th><th>Navegador / dispositivo</th>':''}<th>Estado</th><th>Acción</th></tr></thead><tbody>${sessions.map(s=>`<tr><td>${dateTime(s.created_at)}</td><td>${dateTime(s.last_activity_at)}</td>${showTechnicalData?`<td>${esc(s.ip_address||'—')}</td><td>${esc(s.user_agent||'—')}</td>`:''}<td>${s.revoked_at?'Revocada':new Date(s.expires_at)<=new Date()?'Expirada':'Activa'}</td><td>${!s.revoked_at&&new Date(s.expires_at)>new Date()?`<button class="btn btn-small revoke-user-session" data-id="${esc(s.id)}">Cerrar sesión</button>`:'—'}</td></tr>`).join('')||`<tr><td colspan="${columns}">No existen sesiones registradas.</td></tr>`}</tbody></table></div><div class="branch-modal-actions"><button class="btn close-modal">Cerrar</button><button class="btn btn-primary revoke-all-user-sessions">Cerrar todas las sesiones</button></div></section></div>`;
      const close=()=>modal.innerHTML='';modal.querySelectorAll('.close-modal').forEach(x=>x.onclick=close);modal.querySelectorAll('.revoke-user-session').forEach(x=>x.onclick=async()=>{await AdminService.revokeSession(x.dataset.id,'Cerrada desde Personal y Accesos');await this.openSessionsModal(user);});modal.querySelector('.revoke-all-user-sessions').onclick=async()=>{await AdminService.revokeUserSessions(user.id,'Cierre total desde Personal y Accesos');await this.openSessionsModal(user);};
    }catch(error){modal.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal"><div class="alert alert-error">${esc(error.message)}</div><button class="btn close-modal">Cerrar</button></section></div>`;modal.querySelector('.close-modal').onclick=()=>modal.innerHTML='';}
  }

  async renderOperation(body) {
    const [workflowsResponse, methodsResponse] = await Promise.all([
      AdminService.branchWorkflow(this.branchId),
      AdminService.branchPaymentMethods(this.branchId),
    ]);
    const workflows = workflowsResponse.data || [];
    const methods = methodsResponse.data || [];
    const current = workflows.find(w => w.active) || null;
    body.innerHTML = `
      <section class="branch-card">
        <div class="branch-section-title"><div><h2>Workflow operativo actual</h2><p>${esc(current?.name || 'Sin workflow configurado')}</p></div>${permissionService.can('WORKFLOW_MANAGE') ? '<button class="btn" id="change-workflow">Cambiar workflow</button>' : ''}</div>
        ${this.workflowDiagram(current?.code)}
        <div class="branch-warning">Cambiar el workflow puede requerir actualizar permisos del personal. El sistema no concede permisos automáticamente.</div>
      </section>
      <section class="branch-card" style="margin-top:1rem">
        <div class="branch-section-title"><div><h2>Métodos de pago aceptados</h2><p>Define las formas de pago disponibles para Caja y Secretaría en esta sucursal.</p></div></div>
        <form id="payment-methods-form" class="branch-payment-methods">
          ${methods.map(method => `<article class="payment-method-option">
            <label><input type="checkbox" name="active:${esc(method.code)}" ${method.active ? 'checked' : ''} ${permissionService.can('BRANCH_UPDATE') ? '' : 'disabled'}> <strong>${esc(method.name)}</strong></label>
            <label><input type="checkbox" name="reference:${esc(method.code)}" ${method.requires_reference ? 'checked' : ''} ${permissionService.can('BRANCH_UPDATE') ? '' : 'disabled'}> Referencia obligatoria</label>
            ${method.code === 'tarjeta' ? `<label>Proveedor o adquirente<input class="form-input" name="provider:${esc(method.code)}" value="${esc(method.provider || '')}" placeholder="Ej.: Datafast" ${permissionService.can('BRANCH_UPDATE') ? '' : 'disabled'}></label>` : ''}
          </article>`).join('')}
          ${permissionService.can('BRANCH_UPDATE') ? '<div><button class="btn btn-primary" type="submit">Guardar métodos de pago</button></div>' : ''}
          <div id="payment-methods-status" class="branch-status" aria-live="polite"></div>
        </form>
      </section>
    `;
    document.getElementById('change-workflow')?.addEventListener('click', () => this.openWorkflowForm(workflows));
    document.getElementById('payment-methods-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById('payment-methods-status');
      const payload = { methods: methods.map(method => ({
        code: method.code,
        active: form.elements[`active:${method.code}`]?.checked || false,
        requiresReference: form.elements[`reference:${method.code}`]?.checked || false,
        provider: form.elements[`provider:${method.code}`]?.value?.trim() || null,
      })) };
      try {
        status.textContent = 'Guardando...';
        await AdminService.updateBranchPaymentMethods(this.branchId, payload);
        status.textContent = 'Métodos de pago actualizados.';
        await this.renderOperation(body);
      } catch (error) { status.textContent = error.message; }
    });
  }

  workflowDiagram(code) {
    const steps = code === 'SECRETARY_CAN_COLLECT'
      ? ['Secretaría', 'Registro', 'Cobro', 'Continuación del proceso']
      : ['Secretaría', 'Registro del estudiante', 'Caja', 'Cobro', 'Secretaría', 'Continuación del proceso'];
    return `<div class="workflow-diagram">${steps.map(step => `<span>${esc(step)}</span>`).join('<b>↓</b>')}</div>`;
  }

  async renderCourses(body) {
    const [response,theoryResponse,servicesResponse] = await Promise.all([
      AdminService.branchCourses(this.branchId),
      AdminService.theorySchedules(this.branchId),
      AdminService.branchComplementaryServices(this.branchId),
    ]);
    const courses = response.data || [];
    const complementaryServices = servicesResponse.data || [];
    const theory=theoryResponse.data||{},theoryTurns=theory.turns||[];
    const theorySettings=theory.settings||{regular_enabled:true,saturday_enabled:true,virtual_enabled:true};
    const theoryCards=[
      {key:'regular',field:'regular_enabled',title:'Teoría regular',description:'Lunes a viernes · 18:00 a 20:00',modality:'presencial_regular'},
      {key:'saturday',field:'saturday_enabled',title:'Teoría intensiva',description:'Sábados · 08:00 a 12:30',modality:'presencial_sabado'},
      {key:'virtual',field:'virtual_enabled',title:'Teoría virtual',description:'Clases en línea, sin horario presencial',modality:null},
    ];
    const theoryCardMarkup=theoryCards.map(card=>{
      const enabled=theorySettings[card.field]!==false;
      const schedules=card.modality?theoryTurns.filter(item=>item.modality===card.modality):[];
      return `<article class="branch-card branch-course theory-course-card theory-course-card--${card.key}">
        <div class="branch-section-title"><div><h2>${card.title}</h2><p>${card.description}</p></div><span class="branch-pill ${enabled?'active':'inactive'}">${enabled?'Habilitada':'Deshabilitada'}</span></div>
        ${card.modality?`<div class="theory-course-next">${schedules.map(item=>`<div><strong>${esc(item.start_time)}–${esc(item.end_time)} · ${number(item.capacity)} cupos</strong><span>${esc(item.instructor_name)}</span>${permissionService.can('BRANCH_UPDATE')?`<span class="theory-turn-actions"><button class="btn btn-small edit-theory-turn" data-id="${esc(item.id)}">Editar</button><button class="btn btn-small delete-theory-turn" data-id="${esc(item.id)}">Eliminar</button></span>`:''}</div>`).join('')||'<p>No hay turnos configurados.</p>'}</div>`:'<div class="theory-course-next"><p>Disponible para las sucursales que trabajan en modalidad virtual.</p></div>'}
        ${permissionService.can('BRANCH_UPDATE')?`<div class="branch-quick-actions">${card.modality&&enabled?`<button class="btn program-theory-mode" data-modality="${card.modality}">${card.key==='saturday'?'Agregar turno':'Configurar turno'}</button>`:''}<button class="btn toggle-theory-mode" data-mode="${card.key}" data-enabled="${enabled?'false':'true'}">${enabled?'Deshabilitar':'Habilitar'}</button></div>`:''}
      </article>`;
    }).join('');
    const complementaryMarkup=complementaryServices.map(service=>`<article class="branch-card branch-course complementary-service-card">
      <div class="branch-section-title"><div><h2>Renovación de licencia</h2><p>${esc(service.name)} para personas que renuevan su licencia.</p></div><span class="branch-pill ${service.enabled?'active':'inactive'}">${service.enabled?'Habilitada':'Deshabilitada'}</span></div>
      <form class="complementary-service-form" data-service-id="${esc(service.id)}">
        <label class="theory-setting-options"><span><input type="checkbox" name="enabled" ${service.enabled?'checked':''}> <strong>Permitir registros en esta sucursal</strong></span></label>
        <label><span>Precio en esta sucursal</span><input class="form-input" type="number" name="priceOverride" min="0" step="0.01" value="${Number(service.effective_price||service.base_price).toFixed(2)}" required></label>
        <small>Precio general: ${money(service.base_price)}. Este valor se usará al registrar la renovación.</small>
        <div class="branch-quick-actions">${permissionService.can('BRANCH_UPDATE')?'<button class="btn btn-primary" type="submit">Guardar configuración</button>':''}<span class="branch-status" aria-live="polite"></span></div>
      </form>
    </article>`).join('');
    body.innerHTML = `${permissionService.can('BRANCH_UPDATE') ? '<div class="branch-section-title"><div><h2>Cursos de la sucursal</h2><p>Solo los cursos habilitados estarán disponibles al matricular.</p></div><button class="btn btn-primary" id="new-course-btn">+ Nuevo curso</button></div>' : ''}<section class="branch-course-grid">${courses.map(course => `
      <article class="branch-card branch-course">
        <div class="branch-section-title"><div><h2>${esc(course.name)}</h2><p>${esc(course.description || '')}</p></div><span class="branch-pill ${course.branch_active ? 'active' : 'inactive'}">${course.branch_active ? 'Habilitado' : 'Deshabilitado'}</span></div>
        <div class="summary-grid">
          <div><strong>${number(course.active_students)}</strong><span>Estudiantes activos</span></div>
          <div><strong>${number(course.active_enrollments)}</strong><span>Matrículas activas</span></div>
          <div><strong>${number(course.enabled_instructors)}</strong><span>Instructores habilitados</span></div>
          <div><strong>${number(course.classes_period)}</strong><span>Clases del periodo</span></div>
        </div>
        <div class="branch-quick-actions"><button class="btn" data-route="${esc(moduleUrl('reports', this.branchId, { courseId: course.id }))}">Ver reporte</button>${permissionService.can('BRANCH_UPDATE') ? `<button class="btn configure-course" data-id="${esc(course.id)}">Configurar programa</button><button class="btn edit-course" data-id="${esc(course.id)}">Editar</button><button class="btn toggle-course" data-id="${esc(course.id)}" data-active="${course.branch_active ? 'false' : 'true'}">${course.branch_active ? 'Deshabilitar' : 'Habilitar'}</button>` : ''}</div>
      </article>`).join('')}${theoryCardMarkup}</section><div class="branch-section-title" style="margin-top:24px"><div><h2>Servicios relacionados con cursos y licencias</h2><p>Activa los servicios que puede registrar esta sucursal y define su tarifa.</p></div></div><section class="branch-course-grid">${complementaryMarkup||'<div class="branch-empty">No hay servicios complementarios disponibles.</div>'}</section>`;
    document.querySelectorAll('.toggle-course').forEach(btn => btn.addEventListener('click', async () => {
      await AdminService.updateBranchCourse(this.branchId, btn.dataset.id, btn.dataset.active === 'true');
      await this.renderCourses(body);
    }));
    document.getElementById('new-course-btn')?.addEventListener('click', () => this.openCourseForm(body));
    document.querySelectorAll('.edit-course').forEach(button => button.addEventListener('click', () => this.openCourseForm(body, courses.find(course => course.id === button.dataset.id))));
    document.querySelectorAll('.configure-course').forEach(button => button.addEventListener('click', () => go(`/admin-system/branches?branchId=${encodeURIComponent(this.branchId)}&tab=courses&programCourseId=${encodeURIComponent(button.dataset.id)}`)));
    document.querySelectorAll('.program-theory-mode').forEach(button=>button.addEventListener('click',()=>this.openTheoryScheduleForm(body,theory,button.dataset.modality)));
    document.querySelectorAll('.edit-theory-turn').forEach(button=>button.addEventListener('click',()=>{
      const turn=theoryTurns.find(item=>String(item.id)===String(button.dataset.id));
      if(turn)this.openTheoryScheduleForm(body,theory,turn.modality,turn);
    }));
    document.querySelectorAll('.delete-theory-turn').forEach(button=>button.addEventListener('click',()=>{
      const turn=theoryTurns.find(item=>String(item.id)===String(button.dataset.id));
      if(turn)this.openDeleteTheoryTurnConfirmation(body,turn);
    }));
    document.querySelectorAll('.toggle-theory-mode').forEach(button=>button.addEventListener('click',async()=>{
      const next={regularEnabled:theorySettings.regular_enabled!==false,saturdayEnabled:theorySettings.saturday_enabled!==false,virtualEnabled:theorySettings.virtual_enabled!==false};
      const key={regular:'regularEnabled',saturday:'saturdayEnabled',virtual:'virtualEnabled'}[button.dataset.mode];
      next[key]=button.dataset.enabled==='true';
      button.disabled=true;
      try{await AdminService.saveTheorySettings(this.branchId,next);await this.renderCourses(body);}catch(error){button.disabled=false;button.textContent=error.message||'No se pudo cambiar';}
    }));
    document.querySelectorAll('.complementary-service-form').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]'),status=form.querySelector('.branch-status'),fd=new FormData(form);
      button.disabled=true;button.textContent='Guardando...';status.textContent='';
      try{
        await AdminService.updateBranchComplementaryService(this.branchId,form.dataset.serviceId,{enabled:fd.has('enabled'),priceOverride:fd.get('priceOverride')});
        await this.renderCourses(body);
      }catch(error){status.textContent=error.message||'No se pudo guardar la configuración.';button.disabled=false;button.textContent='Guardar configuración';}
    }));
  }

  openTheorySettingsForm(body,theory={}){
    const modal=document.getElementById('branch-modal'),settings=theory.settings||{};
    modal.innerHTML=`<div class="branch-modal-backdrop"><form class="branch-modal permission-modal"><div class="permission-modal__header"><div><h2>Modalidades teóricas</h2><p>${esc(this.branch.name)}</p></div><button type="button" class="permission-modal__close close-theory">×</button></div><div class="theory-setting-options"><label><input type="checkbox" name="regularEnabled" ${settings.regular_enabled?'checked':''}><span><strong>Regular</strong><small>Lunes a viernes · 18:00 a 20:00</small></span></label><label><input type="checkbox" name="saturdayEnabled" ${settings.saturday_enabled?'checked':''}><span><strong>Sábado intensivo</strong><small>Sábado · 08:00 a 12:30</small></span></label><label><input type="checkbox" name="virtualEnabled" ${settings.virtual_enabled?'checked':''}><span><strong>Virtual</strong><small>Sin horario presencial fijo</small></span></label></div><div id="theory-settings-status" class="branch-status"></div><div class="branch-modal-actions"><button type="button" class="btn close-theory">Cancelar</button><button type="submit" class="btn btn-primary">Guardar modalidades</button></div></form></div>`;
    const close=()=>{modal.innerHTML='';};modal.querySelectorAll('.close-theory').forEach(button=>button.onclick=close);modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,status=form.querySelector('#theory-settings-status'),submit=form.querySelector('[type="submit"]');submit.disabled=true;try{await AdminService.saveTheorySettings(this.branchId,{regularEnabled:form.elements.regularEnabled.checked,saturdayEnabled:form.elements.saturdayEnabled.checked,virtualEnabled:form.elements.virtualEnabled.checked});close();await this.renderCourses(body);}catch(error){status.textContent=error.message||'No se pudieron guardar las modalidades.';submit.disabled=false;}};
  }

  openDeleteTheoryTurnConfirmation(body,turn){
    const modal=document.getElementById('branch-modal');
    modal.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal"><h2>Eliminar turno teórico</h2><p>Se eliminará el turno de ${esc(turn.start_time)} a ${esc(turn.end_time)} asignado a ${esc(turn.instructor_name)}. Esta acción quedará registrada en auditoría.</p><div id="delete-theory-status" class="branch-status"></div><div class="branch-modal-actions"><button type="button" class="btn close-delete-theory">Cancelar</button><button type="button" class="btn btn-primary" id="confirm-delete-theory">Eliminar turno</button></div></section></div>`;
    const close=()=>{modal.innerHTML='';};modal.querySelector('.close-delete-theory').onclick=close;
    modal.querySelector('#confirm-delete-theory').onclick=async event=>{const button=event.currentTarget,status=modal.querySelector('#delete-theory-status');button.disabled=true;status.textContent='Eliminando...';try{await AdminService.deleteTheorySchedule(this.branchId,turn.id);close();await this.renderCourses(body);}catch(error){button.disabled=false;status.textContent=error.message||'No se pudo eliminar el turno.';}};
  }

  openTheoryScheduleForm(body,theory={},forcedModality=null,turn=null){
    const modal=document.getElementById('branch-modal'),instructors=theory.instructors||[],courses=theory.courses||[],settings=theory.settings||{};
    const modeOptions=`${settings.regular_enabled&&(!forcedModality||forcedModality==='presencial_regular')?'<option value="presencial_regular" selected>Regular · lunes a viernes</option>':''}${settings.saturday_enabled&&(!forcedModality||forcedModality==='presencial_sabado')?'<option value="presencial_sabado" selected>Sábado intensivo</option>':''}`;
    const initialStart=turn?.start_time||((forcedModality==='presencial_sabado')?'08:00':'18:00'),initialEnd=turn?.end_time||((forcedModality==='presencial_sabado')?'12:30':'20:00');
    modal.innerHTML=`<div class="branch-modal-backdrop"><form class="branch-modal permission-modal" id="theory-schedule-form"><div class="permission-modal__header"><div><h2>${turn?'Editar':'Configurar'} turno teórico</h2><p>${esc(this.branch.name)} · se repite automáticamente</p></div><button type="button" class="permission-modal__close close-theory">×</button></div>${modeOptions?`<div class="theory-schedule-fields"><label><span>Modalidad</span><select class="form-input" name="modality">${modeOptions}</select></label><label><span>Instructor</span><select class="form-input" name="instructorId" required><option value="">Seleccionar instructor</option>${instructors.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(turn?.instructor_id)?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><label><span>Hora inicial</span><input class="form-input" type="time" name="startTime" value="${esc(initialStart)}" required></label><label><span>Hora final</span><input class="form-input" type="time" name="endTime" value="${esc(initialEnd)}" required></label><label><span>Cupo del turno</span><input class="form-input" type="number" name="capacity" min="1" value="${number(turn?.capacity||30)}" required></label><label><span>Curso</span><select class="form-input" name="courseId"><option value="">Todos los cursos</option>${courses.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(turn?.course_id)?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label></div><label><span>Observación (opcional)</span><textarea class="form-input" name="notes" rows="2">${esc(turn?.notes||'')}</textarea></label>`:'<div class="alert alert-info">Esta sucursal trabaja únicamente con teoría virtual; no requiere configurar un turno presencial.</div>'}<div id="theory-schedule-status" class="branch-status"></div><div class="branch-modal-actions"><button type="button" class="btn close-theory">Cancelar</button>${modeOptions?'<button type="submit" class="btn btn-primary">Guardar turno</button>':''}</div></form></div>`;
    const close=()=>{modal.innerHTML='';};modal.querySelectorAll('.close-theory').forEach(button=>button.onclick=close);
    const form=modal.querySelector('form'),syncMode=(reset=true)=>{if(!form.elements.modality)return;const saturday=form.elements.modality.value==='presencial_sabado';if(reset){form.elements.startTime.value=saturday?'08:00':'18:00';form.elements.endTime.value=saturday?'12:30':'20:00';}form.elements.startTime.readOnly=!saturday;form.elements.endTime.readOnly=!saturday;};if(form.elements.modality){form.elements.modality.onchange=()=>syncMode(true);syncMode(false);}
    form.onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,status=form.querySelector('#theory-schedule-status'),submit=form.querySelector('[type="submit"]');if(!submit)return;submit.disabled=true;status.textContent='Guardando...';try{const data=Object.fromEntries(new FormData(form));if(turn)await AdminService.updateTheorySchedule(this.branchId,turn.id,data);else await AdminService.saveTheorySchedule(this.branchId,data);close();await this.renderCourses(body);}catch(error){status.textContent=error.message||'No se pudo guardar el turno.';submit.disabled=false;}};
  }

  async loadCourseProgramPage() {
    const host = document.getElementById('course-program-page');
    try {
      const response = await AdminService.branchCourses(this.branchId);
      const course = (response.data || []).find(item => item.id === this.programCourseId);
      if (!course) throw new Error('No se encontró el curso solicitado.');
      await this.openCourseProgramForm(host, course, true);
    } catch (error) {
      host.innerHTML = `<section class="course-program-page-error"><h2>No se pudo abrir el programa</h2><p>${esc(error.message)}</p><button class="btn btn-secondary" id="course-program-back-error">Volver a cursos</button></section>`;
      document.getElementById('course-program-back-error')?.addEventListener('click', () => go(`/admin-system/branches?branchId=${encodeURIComponent(this.branchId)}&tab=courses`));
    }
  }

  async openCourseProgramForm(body, course, page = false) {
    const response=await AdminService.courseProgram(this.branchId,course.id),data=response.data||{},program=data.program||{};
    const inferredVehicleType=/moto|clase\s*a\b/i.test(String(course.name||''))?'moto':'carro';
    const selectedVehicleType=inferredVehicleType;
    const ranges=(modality,fallback)=>{const unique=new Map();(data.templates||[]).filter(x=>x.modality===modality).forEach(x=>{const start=String(x.start_time).slice(0,5),end=String(x.end_time).slice(0,5);unique.set(`${start}-${end}`,{start,end});});return unique.size?[...unique.values()]:fallback;};
    const normal=ranges('normal',[{start:'06:00',end:'07:40'},{start:'08:00',end:'09:40'},{start:'10:00',end:'11:40'},{start:'12:00',end:'13:40'},{start:'14:00',end:'15:40'},{start:'16:00',end:'17:40'},{start:'18:00',end:'19:40'},{start:'20:00',end:'21:40'}]);
    const intensive=ranges('intensivo',[{start:'06:00',end:'08:30'},{start:'09:00',end:'11:30'},{start:'12:00',end:'14:30'}]);
    const slotRows=(modality,items)=>items.map((item,index)=>`<div class="course-slot-row"><span>${index+1}</span><label>Desde<input type="time" name="${modality}Start" value="${item.start}" required></label><i>→</i><label>Hasta<input type="time" name="${modality}End" value="${item.end}" required></label><button type="button" class="course-slot-remove" aria-label="Eliminar horario">&times;</button></div>`).join('');
    const instructors=data.instructors||[];
    const priorityInstructors=instructors.filter(instructor=>instructor.priority_branch);
    const areaLabel=area=>({carro:'Automóvil',moto:'Moto',mixto:'Automóvil y moto',teoria:'Teoría'})[area]||area;
    const groupRow=(group={},index=0)=>`<fieldset class="course-instructor-group"><legend>Equipo ${index+1}</legend><label>Nombre<input name="groupName" value="${esc(group.name||`Equipo ${index+1}`)}" required></label><div class="course-group-sequence-note"><input type="hidden" name="groupNextStartDate" value=""><strong>Aplicación automática</strong><small>Los cambios de este equipo se aplicarán al próximo curso de su secuencia.</small></div><div class="course-group-members-title"><strong>Instructores prioritarios de la sucursal</strong><small>Los instructores de apoyo del cantón no forman parte de los grupos fijos.</small></div><div class="course-group-members">${priorityInstructors.map(instructor=>`<label><input type="checkbox" data-practice-area="${esc(instructor.practice_area)}" name="groupMember-${index}" value="${instructor.id}" ${(group.members||[]).some(member=>String(member.id)===String(instructor.id))?'checked':''}> <span>${esc(instructor.name)}<small>${esc(areaLabel(instructor.practice_area))} · Prioridad de esta sucursal</small></span></label>`).join('')||'<p>No hay instructores prioritarios compatibles configurados.</p>'}</div><button type="button" class="btn btn-light remove-instructor-group">Eliminar equipo</button></fieldset>`;
    const configuredGroups=(data.groups||[]).length?data.groups:[{}];
    const modal=page?body:document.getElementById('branch-modal');modal.innerHTML=`${page?'<div class="course-program-page__top"><button type="button" class="btn btn-light close-modal">← Volver a cursos</button></div>':'<div class="branch-modal-backdrop">'}<form class="${page?'course-program-page__form':'branch-modal course-program-modal'}" id="course-program-form" novalidate>
      <div class="course-program-header"><div><span>Configuración académica</span><h2>${esc(course.name)}</h2><p>Define la duración, capacidad y horarios disponibles para esta sucursal.</p></div><button type="button" class="permission-modal__close close-modal" aria-label="Cerrar">&times;</button></div>
      <div class="course-program-body">
        <section class="course-program-section"><div class="course-program-section__title"><div><strong>Datos generales</strong><small>Reglas que se aplicarán a todas las modalidades</small></div></div>
          <div class="course-program-grid course-program-grid--general">
            <label><span>Tipo de recurso</span><select name="vehicleType" disabled><option value="carro" ${selectedVehicleType==='carro'?'selected':''}>Automóvil</option><option value="moto" ${selectedVehicleType==='moto'?'selected':''}>Moto</option></select><small>Se determina automáticamente según el curso.</small></label>
            <label><span>Minutos por sesión</span><input name="sessionMinutes" type="number" min="1" value="${program.session_minutes||100}" required><small>Duración de cada clase práctica</small></label>
            <label><span>Estudiantes por instructor</span><input name="capacityPerInstructor" type="number" min="1" value="${program.capacity_per_instructor||1}" required><small>Cupo simultáneo por instructor</small></label>
          </div>
        </section>
        <section class="course-program-section"><div class="course-program-section__title"><div><strong>Organización de instructores</strong><small>La capacidad pertenece al cantón; los instructores de esta sucursal se asignan primero.</small></div></div>
          <div class="course-program-grid course-program-grid--general"><label><span>Forma de asignación</span><select name="assignmentMode"><option value="individual" ${program.assignment_mode!=='groups'?'selected':''}>Todos individuales</option><option value="groups" ${program.assignment_mode==='groups'?'selected':''}>Grupos fijos</option></select><small>Cambia entre instructores independientes o grupos fijos para este curso.</small></label><label><span>Generación automática</span><input type="checkbox" name="automaticCycles" ${program.automatic_cycles?'checked':''}><small>Al terminar un ciclo, el mismo grupo inicia el siguiente día lectivo disponible.</small></label></div>
          <div class="course-groups-editor" ${program.assignment_mode==='groups'?'':'hidden'}><div id="course-instructor-groups">${configuredGroups.map(groupRow).join('')}</div><button type="button" class="btn btn-light" id="add-instructor-group">+ Agregar grupo</button></div>
        </section>
        <div class="course-program-modalities">
          <section class="course-program-card">
            <div class="course-program-card__head"><div><strong>Modalidad normal</strong><small>Programa regular de lunes a viernes</small></div><label class="course-program-switch"><input type="checkbox" name="normalEnabled" ${program.normal_enabled!==false?'checked':''}><span></span><b>Habilitada</b></label></div>
            <label class="course-program-duration"><span>Duración del programa</span><div><input name="normalDurationDays" type="number" min="1" value="${program.normal_duration_days||program.duration_days||8}" required><b>días</b></div></label>
            <div class="course-program-slots"><span>Horarios disponibles</span><small>Configúralos una sola vez. Se repetirán automáticamente de lunes a viernes.</small><div class="course-slot-columns"><span>#</span><span>Hora inicial</span><i></i><span>Hora final</span><i></i></div><div class="course-slot-list" data-slot-list="normal">${slotRows('normal',normal)}</div><button type="button" class="course-slot-add" data-add-slot="normal">+ Agregar horario</button></div>
          </section>
          <section class="course-program-card course-program-card--intensive">
            <div class="course-program-card__head"><div><strong>Modalidad intensiva</strong><small>Programa concentrado de fin de semana</small></div><label class="course-program-switch"><input type="checkbox" name="intensiveEnabled" ${program.intensive_enabled?'checked':''}><span></span><b>Habilitada</b></label></div>
            <label class="course-program-duration"><span>Duración del programa</span><div><input name="intensiveDurationDays" type="number" min="1" value="${program.intensive_duration_days||4}" required><b>días</b></div></label>
            <div class="course-program-slots"><span>Horarios disponibles</span><small>Configúralos una sola vez. Se repetirán automáticamente sábado y domingo.</small><div class="course-slot-columns"><span>#</span><span>Hora inicial</span><i></i><span>Hora final</span><i></i></div><div class="course-slot-list" data-slot-list="intensive">${slotRows('intensive',intensive)}</div><button type="button" class="course-slot-add" data-add-slot="intensive">+ Agregar horario</button></div>
          </section>
        </div>
        <div class="course-program-day-guide"><strong>Aplicación automática</strong><span>Normal: lunes a viernes</span><span>Intensiva: sábado y domingo</span></div>
        <div id="program-status" class="branch-status"></div>
      </div>
      <div class="branch-modal-actions course-program-actions"><button type="button" class="btn close-modal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar programa</button></div>
    </form>${page?'':'</div>'}`;
    const close=()=>page?go(`/admin-system/branches?branchId=${encodeURIComponent(this.branchId)}&tab=courses`):(modal.innerHTML='');modal.querySelectorAll('.close-modal').forEach(x=>x.onclick=close);
    const showProgramResult=(type,message,onAccept=null)=>{document.getElementById('course-program-result')?.remove();const layer=document.createElement('div');layer.id='course-program-result';layer.className='branch-modal-backdrop course-program-result';layer.innerHTML=`<div class="branch-modal course-program-result__dialog" role="dialog" aria-modal="true"><div class="course-program-result__icon ${type}">${type==='success'?'✓':'!'}</div><h2>${type==='success'?'Programa guardado':'No se pudo guardar'}</h2><p>${esc(message)}</p><div class="branch-modal-actions"><button type="button" class="btn btn-primary">Aceptar</button></div></div>`;document.body.appendChild(layer);layer.querySelector('button').onclick=()=>{layer.remove();if(onAccept)onAccept();};};
    const renumber=list=>list.querySelectorAll('.course-slot-row>span').forEach((badge,index)=>badge.textContent=index+1);
    const timeToMinutes=value=>{const [hours,minutes]=String(value||'00:00').split(':').map(Number);return hours*60+minutes;};
    const minutesToTime=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
    modal.querySelectorAll('.course-slot-remove').forEach(button=>button.onclick=()=>{const list=button.closest('.course-slot-list');if(list.children.length>1){button.closest('.course-slot-row').remove();renumber(list);}});
    modal.querySelectorAll('[data-add-slot]').forEach(button=>button.onclick=()=>{const modality=button.dataset.addSlot,list=modal.querySelector(`[data-slot-list="${modality}"]`),lastEnd=list.lastElementChild?.querySelector(`[name="${modality}End"]`)?.value||'07:40',breakMinutes=modality==='intensive'?30:20,startMinutes=timeToMinutes(lastEnd)+breakMinutes,duration=modality==='intensive'?150:Math.max(1,Number(modal.querySelector('[name="sessionMinutes"]').value)||100),endMinutes=startMinutes+duration,status=modal.querySelector('#program-status');if(endMinutes>=1440){status.textContent='No se puede agregar otro horario porque terminaría después de medianoche.';return;}status.textContent='';const start=minutesToTime(startMinutes),end=minutesToTime(endMinutes),row=document.createElement('div');row.className='course-slot-row';row.innerHTML=`<span>${list.children.length+1}</span><label>Desde<input type="time" name="${modality}Start" value="${start}" required></label><i>→</i><label>Hasta<input type="time" name="${modality}End" value="${end}" required></label><button type="button" class="course-slot-remove" aria-label="Eliminar horario">&times;</button>`;row.querySelector('.course-slot-remove').onclick=()=>{if(list.children.length>1){row.remove();renumber(list);}};list.appendChild(row);});
    const groupsHost=modal.querySelector('#course-instructor-groups');const bindGroupRemove=()=>groupsHost.querySelectorAll('.remove-instructor-group').forEach(button=>button.onclick=()=>{button.closest('.course-instructor-group').remove();});const syncCompatibility=()=>{const vehicle=selectedVehicleType;groupsHost.querySelectorAll('[data-practice-area]').forEach(input=>{const compatible=input.dataset.practiceArea==='mixto'||input.dataset.practiceArea===vehicle;input.disabled=!compatible;if(!compatible)input.checked=false;input.closest('label').classList.toggle('is-incompatible',!compatible);});};bindGroupRemove();syncCompatibility();
    const syncGroupMode=()=>{const enabled=modal.querySelector('[name="assignmentMode"]').value==='groups';modal.querySelector('.course-groups-editor').hidden=!enabled;groupsHost.querySelectorAll('input').forEach(input=>{input.disabled=!enabled;});if(enabled)syncCompatibility();};
    modal.querySelector('[name="assignmentMode"]').onchange=syncGroupMode;syncGroupMode();
    modal.querySelector('#add-instructor-group').onclick=()=>{const wrapper=document.createElement('div');wrapper.innerHTML=groupRow({},groupsHost.children.length);groupsHost.appendChild(wrapper.firstElementChild);bindGroupRemove();syncGroupMode();};
    modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,invalid=form.querySelector(':invalid');if(invalid){const field=invalid.closest('label')?.querySelector('span')?.textContent||invalid.closest('fieldset')?.querySelector('legend')?.textContent||'campo obligatorio';showProgramResult('error',`Revisa ${field}: falta completar un dato obligatorio.`);invalid.focus();return;}const fd=new FormData(form),expand=(modality,days)=>{const starts=fd.getAll(`${modality}Start`),ends=fd.getAll(`${modality}End`);return days.flatMap(day=>starts.map((start,index)=>({modality:modality==='intensive'?'intensivo':'normal',dayOfWeek:day,startTime:start,endTime:ends[index]})));};const groups=[...groupsHost.querySelectorAll('.course-instructor-group')].map(group=>({name:group.querySelector('[name="groupName"]').value,nextStartDate:group.querySelector('[name="groupNextStartDate"]').value,memberIds:[...group.querySelectorAll('.course-group-members input:checked')].map(input=>input.value)}));if(fd.get('assignmentMode')==='groups'&&groups.some(group=>!group.memberIds.length)){showProgramResult('error','Cada equipo debe tener al menos un instructor seleccionado.');return;}const payload={vehicleType:selectedVehicleType,assignmentMode:fd.get('assignmentMode'),automaticCycles:fd.has('automaticCycles'),normalStartDays:[1,2,3,4,5],intensiveStartDays:[6],groups,normalDurationDays:Number(fd.get('normalDurationDays')),intensiveDurationDays:Number(fd.get('intensiveDurationDays')),sessionMinutes:Number(fd.get('sessionMinutes')),capacityPerInstructor:Number(fd.get('capacityPerInstructor')),normalEnabled:fd.has('normalEnabled'),intensiveEnabled:fd.has('intensiveEnabled'),slots:[...(fd.has('normalEnabled')?expand('normal',[1,2,3,4,5]):[]),...(fd.has('intensiveEnabled')?expand('intensive',[6,0]):[])]};const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='Guardando...';try{await AdminService.saveCourseProgram(this.branchId,course.id,payload);showProgramResult('success','La configuración académica y los horarios se guardaron correctamente.',close);}catch(error){showProgramResult('error',error.message||'Ocurrió un error inesperado al guardar el programa.');}finally{submit.disabled=false;submit.textContent='Guardar programa';}};
  }

  openCourseForm(body, course = null) {
    const editing = Boolean(course?.id);
    const modal = document.getElementById('branch-modal');
    modal.innerHTML = `<div class="branch-modal-backdrop"><form class="branch-modal" id="course-form">
      <div class="permission-modal__header"><div><h2>${editing ? 'Editar curso' : 'Nuevo curso'}</h2><p>${editing ? 'Actualiza los datos generales del curso.' : `Se creará en el catálogo y quedará habilitado en ${esc(this.branch.name)}.`}</p></div><button type="button" class="permission-modal__close close-modal">&times;</button></div>
      <label>Nombre<input name="name" required placeholder="Ej.: Licencia profesional tipo C" value="${esc(course?.name || '')}"></label>
      <label>Descripción<textarea name="description" placeholder="Describa el objetivo del curso">${esc(course?.description || '')}</textarea></label>
      <label>Precio<input name="price" type="number" min="0" step="0.01" required placeholder="0.00" value="${course?.price ?? ''}"></label>
      <div id="course-form-status" class="branch-status"></div>
      <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button class="btn btn-primary">${editing ? 'Guardar cambios' : 'Crear curso'}</button></div>
    </form></div>`;
    const close = () => { modal.innerHTML = ''; };
    modal.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', close));
    modal.querySelector('#course-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const status = modal.querySelector('#course-form-status');
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true; status.textContent = 'Creando curso...';
      try { const data=Object.fromEntries(new FormData(event.currentTarget)); if(editing) await AdminService.updateCourse(this.branchId,course.id,data); else await AdminService.createBranchCourse(this.branchId,data); close(); await this.renderCourses(body); }
      catch (error) { submit.disabled = false; status.textContent = error.message || 'No se pudo crear el curso'; status.classList.add('dashboard-error'); }
    });
  }

  async renderTrainingRoutes(body) {
    try {
      const response = await AdminService.branchTrainingRoutes(this.branchId);
      const payload = response.data || {};
      const routes = payload.routes || [];
      const orderedRoutes = [...routes].sort((first, second) => Number(first.recommended_session_number || 999) - Number(second.recommended_session_number || 999));
      const activeRoutes = orderedRoutes.filter(item => item.active);
      const latestRoute = [...routes].sort((first, second) => new Date(second.updated_at || 0) - new Date(first.updated_at || 0))[0] || null;
      const configuredDays = activeRoutes.map(item => Number(item.recommended_session_number)).filter(Number.isFinite);
      const canUpdate = permissionService.can('BRANCH_UPDATE');
      body.innerHTML = `
        <section class="branch-card route-import-card route-workspace">
          <div class="route-workspace__header">
            <div><span class="route-eyebrow">Planificación práctica</span><h2>Rutas de ${esc(payload.branch?.city || 'este cantón')}</h2><p>Carga los recorridos GPS y déjalos listos para que el instructor pueda revisarlos inmediatamente.</p></div>
            <button type="button" class="btn route-template-button" id="download-route-template">↓ Descargar plantilla</button>
          </div>
          <div class="route-summary-strip">
            <article><span>Rutas activas</span><strong>${number(activeRoutes.length)}</strong><small>Disponibles en el cantón</small></article>
            <article><span>Días configurados</span><strong>${configuredDays.length ? esc(configuredDays.join(', ')) : '—'}</strong><small>El día 1 corresponde a mecánica</small></article>
            <article><span>Última carga</span><strong>${esc(latestRoute?.source_file_name || 'Sin archivo')}</strong><small>${latestRoute ? `Ruta del día ${number(latestRoute.recommended_session_number)}` : 'Aún no hay recorridos'}</small></article>
          </div>
          ${canUpdate ? `<div class="route-import-box">
            <div class="route-import-guide"><span><b>1</b><small>Nombra</small><strong>Dia_4.xlsx</strong></span><i>→</i><span><b>2</b><small>Selecciona</small><strong>Uno o varios Excel</strong></span><i>→</i><span><b>3</b><small>Listo</small><strong>Se publica automáticamente</strong></span></div>
            <label class="route-file-picker" for="route-excel-file"><span class="route-upload-icon">XLSX</span><span class="route-upload-copy"><strong>Seleccionar Excel de direcciones</strong><small>El sistema detecta el día, el recorrido y la duración. No necesitas completar más campos.</small></span><span class="btn btn-primary route-upload-button">Elegir archivos</span><input id="route-excel-file" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
          </div>` : ''}
          <div id="route-import-status" class="branch-status"></div>
          <div id="route-preview"></div>
        </section>
        <section class="branch-table-panel route-table-panel">
          <div class="branch-section-title route-table-heading"><div><span class="route-eyebrow">Recorridos publicados</span><h2>Rutas configuradas</h2><p>Ordenadas por día y compartidas entre las sucursales de ${esc(payload.branch?.city || 'este cantón')}.</p></div><span class="branch-pill active">${number(activeRoutes.length)} activas</span></div>
          ${orderedRoutes.length ? `<div class="branch-table-wrap"><table class="route-table"><thead><tr><th>Día</th><th>Archivo cargado</th><th>Curso y ruta</th><th>Recorrido</th><th>Duración</th><th>Estado</th></tr></thead><tbody>${orderedRoutes.map(route => `<tr class="${route.id===latestRoute?.id?'is-latest':''}"><td><span class="route-day-chip">${number(route.recommended_session_number)}</span></td><td><span class="route-source-file">${esc(route.source_file_name || 'Carga anterior')}</span><small>${esc(route.code)}</small>${route.id===latestRoute?.id?'<em class="route-latest-tag">Última carga</em>':''}</td><td><strong class="route-table-name">${esc(route.name)}</strong><small>${esc(route.course_name || 'General')}</small></td><td><div class="route-path"><span><b>Origen</b>${esc(route.origin_label)}</span><i>→</i><span><b>Destino</b>${esc(route.destination_label)}</span></div></td><td><strong class="route-duration">${route.estimated_minutes ? number(route.estimated_minutes) : '—'}</strong><small>minutos</small></td><td><span class="branch-pill ${route.active ? 'active' : 'inactive'}">${route.active ? 'Activa' : 'Inactiva'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="branch-empty">Todavía no hay rutas configuradas para este cantón. Selecciona el Excel de direcciones para crear la primera.</div>'}
        </section>`;

      body.querySelector('#download-route-template')?.addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; button.textContent = 'Preparando...';
        try { saveDownload(await AdminService.branchTrainingRoutesTemplate(this.branchId)); }
        catch (error) { body.querySelector('#route-import-status').textContent = error.message || 'No se pudo descargar la plantilla'; }
        finally { button.disabled = false; button.textContent = 'Descargar plantilla Excel'; }
      });
      const input = body.querySelector('#route-excel-file');
      input?.addEventListener('change', async () => {
        const files = [...(input.files || [])].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
        if (!files.length) return;
        const status = body.querySelector('#route-import-status');
        const preview = body.querySelector('#route-preview');
        input.disabled = true; status.textContent = `Procesando ${number(files.length)} archivo(s)...`;
        preview.innerHTML = `<div class="route-upload-list">${files.map((file,index) => { const day=file.name.match(/(?:dia|día)[\s_-]*(\d+)/i)?.[1]; return `<article class="route-upload-item" data-file-index="${index}"><span class="route-upload-item__icon">XL</span><div><strong>${esc(file.name)}</strong><small>${day ? `Se asignará al día ${esc(day)}` : 'Se asignará al siguiente día disponible'} · ${esc((file.size/1024).toFixed(1))} KB</small></div><span class="route-upload-state">En espera</span></article>`; }).join('')}</div>`;
        let completed = 0; let failed = 0;
        for (let index=0; index<files.length; index+=1) {
          const file=files[index]; const item=preview.querySelector(`[data-file-index="${index}"]`); const state=item?.querySelector('.route-upload-state');
          if(state){state.textContent='Importando...';state.className='route-upload-state is-loading';}
          try {
            const base64 = await fileToBase64(file);
            await AdminService.importBranchTrainingRoutes(this.branchId, base64, file.name);
            completed+=1; if(state){state.textContent='Importado';state.className='route-upload-state is-success';}
          } catch(error) {
            failed+=1; if(state){state.textContent=error.message||'Error';state.className='route-upload-state is-error';item.title=error.message||'';}
          }
        }
        input.disabled=false;
        status.textContent=failed ? `${number(completed)} archivo(s) importados y ${number(failed)} con error. Revisa el detalle.` : `${number(completed)} archivo(s) importados correctamente. Ya puedes comprobar la última ruta desde el perfil del instructor.`;
        if(!failed) window.setTimeout(()=>this.renderTrainingRoutes(body),1200);
      });
    } catch (error) {
      body.innerHTML = `<section class="branch-card"><div class="alert alert-error">${esc(error.message || 'No se pudieron cargar las rutas')}</div></section>`;
    }
  }

  async renderSettings(body) {
    const response = await AdminService.branchSettings(this.branchId);
    const settings = response.data || [];
    body.innerHTML = `<section class="branch-card"><h2>Configuración específica de la sucursal</h2>${settings.length ? `<div class="branch-settings">${settings.map(item => `<div><strong>${esc(item.key)}</strong><code>${esc(JSON.stringify(item.value))}</code><small>${esc(item.description || '')}</small></div>`).join('')}</div>` : '<div class="branch-empty">No existen settings BRANCH para esta sucursal.</div>'}</section>`;
  }

  async renderActivity(body) {
    const response = await AdminService.branchActivity(this.branchId, { limit: 25 });
    const activity = response.data || [];
    body.innerHTML = `<section class="branch-card"><div class="branch-section-title"><h2>Actividad de la sucursal</h2><button class="btn" data-route="${esc(moduleUrl('audit', this.branchId))}">Ver auditoría completa</button></div>${activity.length ? activity.map(item => `<article class="branch-activity"><time>${dateTime(item.created_at)}</time><div><strong>${esc(item.user_name || item.username || 'Sistema')}</strong><p>${esc(item.description || item.action)}</p><small>${esc(item.module || 'Sistema')} · ${esc(item.role || '')}</small></div></article>`).join('') : '<div class="branch-empty">No hay actividad reciente para esta sucursal.</div>'}</section>`;
  }

  openBranchForm(branch = null) {
    const isEdit = Boolean(branch?.id);
    document.getElementById('branch-modal').innerHTML = `
      <div class="branch-modal-backdrop">
        <form class="branch-modal" id="branch-form">
          <h2>${isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <input name="code" placeholder="Código" value="${esc(branch?.code || '')}" ${isEdit ? '' : 'required'}>
          <input name="name" placeholder="Nombre" value="${esc(branch?.name || '')}" required>
          <input name="province" placeholder="Provincia" value="${esc(branch?.province || '')}">
          <input name="city" placeholder="Ciudad" value="${esc(branch?.city || '')}" required>
          <input name="address" placeholder="Dirección" value="${esc(branch?.address || '')}">
          <input name="phone" placeholder="Teléfono" value="${esc(branch?.phone || '')}">
          <input name="email" type="email" placeholder="Correo" value="${esc(branch?.email || '')}">
          <select name="active"><option value="true" ${branch?.active !== false ? 'selected' : ''}>Activa</option><option value="false" ${branch?.active === false ? 'selected' : ''}>Inactiva</option></select>
          <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear sucursal'}</button></div>
        </form>
      </div>`;
    document.querySelector('.close-modal')?.addEventListener('click', () => document.getElementById('branch-modal').innerHTML = '');
    document.getElementById('branch-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget));
      data.active = data.active === 'true';
      const result = isEdit ? await AdminService.updateBranch(branch.id, data) : await AdminService.createBranch(data);
      document.getElementById('branch-modal').innerHTML = '';
      go(`/admin-system/branches?branchId=${encodeURIComponent(result.data.id)}`);
    });
  }

  async openBranchForm(branch = null) {
    const isEdit = Boolean(branch?.id);
    let catalog = { provinces: [], cities: [] };
    try {
      const catalogResponse = await AdminService.branchLocations();
      catalog = catalogResponse.data || catalog;
    } catch (error) {
      catalog = {
        provinces: [{ name: branch?.province || 'Manabí' }].filter(item => item.name),
        cities: [{ name: branch?.city || 'Manta', province: branch?.province || 'Manabí' }].filter(item => item.name),
      };
    }
    const provinceValue = branch?.province || 'Manabí';
    const cityValue = branch?.city || 'Manta';
    const lat = branch?.latitude ?? '';
    const lng = branch?.longitude ?? '';
    document.getElementById('branch-modal').innerHTML = `
      <div class="branch-modal-backdrop">
        <form class="branch-modal" id="branch-form">
          <h2>${isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <input name="code" placeholder="Código" value="${esc(branch?.code || '')}" ${isEdit ? '' : 'required'}>
          <input name="name" placeholder="Nombre" value="${esc(branch?.name || '')}" required>
          <label>Provincia<select name="province" id="branch-province" required>${this.provinceOptions(catalog.provinces, provinceValue)}</select></label>
          <label>Cantón<select name="city" id="branch-city" required>${this.cityOptions(catalog.cities, provinceValue, cityValue)}</select></label>
          <div class="branch-location-row">
            <input name="address" id="branch-address" placeholder="Dirección" value="${esc(branch?.address || '')}">
            <button type="button" class="btn btn-light" id="open-location-picker">Mapa</button>
          </div>
          <input type="hidden" name="latitude" id="branch-latitude" value="${esc(lat)}">
          <input type="hidden" name="longitude" id="branch-longitude" value="${esc(lng)}">
          <input type="hidden" name="locationSource" id="branch-location-source" value="${esc(branch?.location_source || '')}">
          <div class="branch-location-status" id="branch-location-status"></div>
          <input name="phone" placeholder="Teléfono" value="${esc(branch?.phone || '')}">
          <input name="email" type="email" placeholder="Correo" value="${esc(branch?.email || '')}">
          <select name="active"><option value="true" ${branch?.active !== false ? 'selected' : ''}>Activa</option><option value="false" ${branch?.active === false ? 'selected' : ''}>Inactiva</option></select>
          <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear sucursal'}</button></div>
        </form>
      </div>`;
    const form = document.getElementById('branch-form');
    const provinceSelect = document.getElementById('branch-province');
    const citySelect = document.getElementById('branch-city');
    provinceSelect?.addEventListener('change', () => {
      citySelect.innerHTML = this.cityOptions(catalog.cities, provinceSelect.value, '');
    });
    this.setLocationStatus(form);
    document.getElementById('open-location-picker')?.addEventListener('click', () => this.openLocationPicker(form, catalog));
    document.querySelector('.close-modal')?.addEventListener('click', () => document.getElementById('branch-modal').innerHTML = '');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget));
      data.active = data.active === 'true';
      data.latitude = data.latitude || null;
      data.longitude = data.longitude || null;
      data.cityId = (catalog.cities || []).find(city => city.name === data.city && city.province === data.province)?.id || null;
      const result = isEdit ? await AdminService.updateBranch(branch.id, data) : await AdminService.createBranch(data);
      document.getElementById('branch-modal').innerHTML = '';
      go(`/admin-system/branches?branchId=${encodeURIComponent(result.data.id)}`);
    });
  }

  provinceOptions(provinces, selected) {
    return (provinces || []).map(province => {
      const name = province.name || province;
      return `<option value="${esc(name)}" ${name === selected ? 'selected' : ''}>${esc(name)}</option>`;
    }).join('');
  }

  cityOptions(cities, province, selected) {
    const options = (cities || []).filter(city => !province || city.province === province);
    return options.map(city => `<option value="${esc(city.name)}" ${city.name === selected ? 'selected' : ''}>${esc(city.name)}</option>`).join('');
  }

  normalizeLocationText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  selectOptionByText(select, text) {
    if (!select || !text) return false;
    const target = this.normalizeLocationText(text);
    const option = [...select.options].find(item => this.normalizeLocationText(item.value) === target || this.normalizeLocationText(item.textContent) === target);
    if (!option) return false;
    select.value = option.value;
    return true;
  }

  setLocationStatus(form) {
    const lat = form?.elements.latitude?.value;
    const lng = form?.elements.longitude?.value;
    const status = document.getElementById('branch-location-status');
    if (!status) return;
    if (!lat || !lng) {
      status.innerHTML = '<span>Sin punto exacto seleccionado.</span>';
      return;
    }
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    status.innerHTML = `<span>Ubicación: ${esc(Number(lat).toFixed(6))}, ${esc(Number(lng).toFixed(6))}</span><a href="${mapsUrl}" target="_blank" rel="noopener">Abrir en Google Maps</a>`;
  }

  async openLocationPicker(form, catalog = { provinces: [], cities: [] }) {
    let config = null;
    try {
      const response = await AdminService.branchMapConfig();
      config = response.data;
    } catch (error) {
      config = null;
    }
    const rawLat = form?.elements.latitude?.value;
    const rawLng = form?.elements.longitude?.value;
    const currentLat = rawLat === '' || rawLat === null || rawLat === undefined ? NaN : Number(rawLat);
    const currentLng = rawLng === '' || rawLng === null || rawLng === undefined ? NaN : Number(rawLng);
    const center = Number.isFinite(currentLat) && Number.isFinite(currentLng)
      ? [currentLng, currentLat]
      : (config?.defaultCenter || [-80.7089, -0.9677]);

    document.getElementById('branch-modal').insertAdjacentHTML('beforeend', `
      <div class="branch-map-backdrop" id="branch-map-modal">
        <div class="branch-map-modal">
          <div class="branch-section-title">
            <div><h2>Seleccionar ubicación</h2><p>Haz clic en el mapa o arrastra el marcador.</p></div>
            <button type="button" class="btn btn-light" id="close-location-picker">Cerrar</button>
          </div>
          <div class="branch-map-canvas" id="branch-map-canvas"></div>
          <div class="branch-map-footer">
            <span id="branch-map-selected">Coordenadas: ${esc(center[1].toFixed(6))}, ${esc(center[0].toFixed(6))}</span>
            <button type="button" class="btn btn-primary" id="use-location-picker">Usar ubicación</button>
          </div>
        </div>
      </div>
    `);

    const close = () => document.getElementById('branch-map-modal')?.remove();
    document.getElementById('close-location-picker')?.addEventListener('click', close);

    let selected = { lng: center[0], lat: center[1], address: '', province: '', city: '' };
    const setSelected = async (lng, lat, marker = null) => {
      selected = { ...selected, lng, lat };
      document.getElementById('branch-map-selected').textContent = `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (marker) marker.setLngLat([lng, lat]);
      const location = await this.reverseGeocode(lng, lat, config?.apiKey);
      selected = { ...selected, ...location };
    };

    if (!config?.apiKey || !window.maptilersdk) {
      document.getElementById('branch-map-canvas').innerHTML = '<div class="branch-map-placeholder">No se pudo cargar el mapa. Revisa MAPTILER_API_KEY en el backend.</div>';
    } else {
      window.maptilersdk.config.apiKey = config.apiKey;
      const map = new window.maptilersdk.Map({
        container: 'branch-map-canvas',
        style: window.maptilersdk.MapStyle.STREETS,
        center,
        zoom: config.defaultZoom || 14,
      });
      const marker = new window.maptilersdk.Marker({ draggable: true }).setLngLat(center).addTo(map);
      marker.on('dragend', () => {
        const point = marker.getLngLat();
        setSelected(point.lng, point.lat);
      });
      map.on('click', event => setSelected(event.lngLat.lng, event.lngLat.lat, marker));
      setSelected(center[0], center[1], marker);
    }

    document.getElementById('use-location-picker')?.addEventListener('click', () => {
      form.elements.latitude.value = selected.lat.toFixed(7);
      form.elements.longitude.value = selected.lng.toFixed(7);
      form.elements.locationSource.value = config?.provider || 'manual';
      if (selected.address) form.elements.address.value = selected.address;
      const provinceSelect = form.elements.province;
      const citySelect = form.elements.city;
      if (selected.province && this.selectOptionByText(provinceSelect, selected.province)) {
        citySelect.innerHTML = this.cityOptions(catalog.cities, provinceSelect.value, '');
      }
      if (selected.city) this.selectOptionByText(citySelect, selected.city);
      this.setLocationStatus(form);
      close();
    });
  }

  async reverseGeocode(lng, lat, apiKey) {
    if (!apiKey) return {};
    try {
      const response = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${encodeURIComponent(apiKey)}&language=es`);
      if (!response.ok) return {};
      const payload = await response.json();
      const feature = payload.features?.[0] || {};
      const context = [feature, ...(feature.context || [])];
      const byId = prefixes => context.find(item => prefixes.some(prefix => String(item.id || '').startsWith(prefix)));
      const label = item => item?.text || item?.matching_text || item?.place_name || '';
      const province = label(byId(['region']));
      let city = label(byId(['place', 'locality', 'municipality', 'county', 'district']));
      if (!city && ['place', 'locality', 'municipality'].some(type => (feature.place_type || []).includes(type))) city = label(feature);
      return {
        address: feature.place_name || feature.text || '',
        province,
        city,
      };
    } catch (error) {
      return {};
    }
  }

  async openUserForm(roles) {
    document.getElementById('branch-modal').innerHTML = `
      <div class="branch-modal-backdrop"><form class="branch-modal" id="branch-user-form">
        <h2>Nuevo usuario para ${esc(this.branch.name)}</h2>
        <input name="firstName" placeholder="Nombres" required><input name="lastName" placeholder="Apellidos" required>
        <input name="username" placeholder="Usuario" required><input name="email" type="email" placeholder="Correo">
        <input name="password" type="password" minlength="8" placeholder="Contraseña temporal" required>
        <select name="roleCode" required>${roles.map(role => `<option value="${esc(role.code)}">${esc(role.name)} (${esc(role.code)})</option>`).join('')}</select>
        <input type="hidden" name="branchId" value="${esc(this.branchId)}">
        <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button class="btn btn-primary">Crear usuario</button></div>
      </form></div>`;
    document.querySelector('.close-modal')?.addEventListener('click', () => document.getElementById('branch-modal').innerHTML = '');
    document.getElementById('branch-user-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await AdminService.createUser(Object.fromEntries(new FormData(e.currentTarget)));
      document.getElementById('branch-modal').innerHTML = '';
      await this.renderActiveTab();
    });
  }

  async openPermissionsModal(user) {
    const modal = document.getElementById('branch-modal');
    const systemAdminPage = !this.branchAccess && (authService.getCurrentUser()?.roles || []).includes('ADMIN_SYSTEM');
    const host = systemAdminPage ? document.getElementById('branch-detail-body') : modal;
    const toggleBranchChrome = hidden => {
      if (!systemAdminPage) return;
      document.getElementById('back-branches').hidden = hidden;
      document.getElementById('branch-detail-header').hidden = hidden;
      document.querySelector('.branch-tabs').hidden = hidden;
    };
    toggleBranchChrome(true);
    const canManage = permissionService.can('PERMISSION_MANAGE');
    host.innerHTML = systemAdminPage
      ? `<section class="permission-page"><div class="branch-empty">Cargando accesos de ${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim())}...</div></section>`
      : `<div class="branch-modal-backdrop"><section class="branch-modal permission-modal"><h2>Accesos de ${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim())}</h2><p>Cargando permisos efectivos...</p></section></div>`;
    try {
      const [detailResponse, catalogResponse] = await Promise.all([
        AdminService.user(user.id, { branchId: this.branchId }),
        AdminService.permissions(),
      ]);
      const detail = detailResponse.data || {};
      const operationalCodes = new Set(['PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_VOID','RECEIPT_VIEW','RECEIPT_GENERATE','STUDENT_VIEW','STUDENT_CREATE','STUDENT_UPDATE','ENROLLMENT_VIEW','ENROLLMENT_CREATE','DOCUMENT_VIEW','DOCUMENT_CREATE','DOCUMENT_UPDATE','SCHEDULE_VIEW','SCHEDULE_CHANGE','REPORT_VIEW','REPORT_EXPORT','ATM_DOCUMENT_GENERATE','INSTRUCTOR_PERFORMANCE_VIEW','INSTRUCTOR_PERFORMANCE_REPORT']);
      const catalog = (catalogResponse.data || []).filter(item => !this.branchAccess || operationalCodes.has(item.code));
      const effective = new Set(detail.authorization?.permissions || []);
      const grouped = catalog.reduce((result, item) => {
        (result[item.module] ||= []).push(item);
        return result;
      }, {});
      host.innerHTML = `
        ${systemAdminPage ? '<section class="permission-page">' : '<div class="branch-modal-backdrop">'}
          <form class="${systemAdminPage ? 'permission-page__form' : 'branch-modal'} permission-modal" id="user-permissions-form">
            <div class="permission-modal__header"><div><h2>Accesos de ${esc(`${user.first_name || ''} ${user.last_name || ''}`.trim())}</h2><p>${esc(user.username)} · ${esc(this.branch.name)}</p></div>${systemAdminPage ? '<button type="button" class="btn btn-secondary close-modal">← Volver al personal</button>' : '<button type="button" class="permission-modal__close close-modal" aria-label="Cerrar">×</button>'}</div>
            <div class="permission-flow-note"><strong>Configuración del flujo operativo</strong><span>Los permisos marcados determinan lo que esta persona puede consultar o ejecutar. Al retirar permisos financieros, Pagos desaparecerá de su menú.</span></div>
            <fieldset class="permission-group operational-roles"><legend><span>Roles operativos rápidos</span></legend>
              ${!this.branchAccess?`<label class="permission-option"><input type="checkbox" class="operational-role" data-codes="GESTION_PERSONAL" ${effective.has('GESTION_PERSONAL')?'checked':''} ${canManage?'':'disabled'}><span><strong>Gestión de personal</strong><small>Administra únicamente los accesos operativos del personal de su propia sucursal.</small><em class="permission-menu-impact">Menú: Personal y accesos</em></span></label>`:''}
              <label class="permission-option"><input type="checkbox" class="operational-role" data-codes="REPORT_VIEW,REPORT_EXPORT" ${effective.has('REPORT_EXPORT')?'checked':''} ${canManage?'':'disabled'}><span><strong>Ver y exportar reportes</strong><small>Permite consultar y exportar reportes de la sucursal asignada.</small><em class="permission-menu-impact">Menú: Reportes</em></span></label>
              <label class="permission-option"><input type="checkbox" class="operational-role" data-codes="PAYMENT_VIEW,PAYMENT_CREATE,RECEIPT_VIEW,RECEIPT_GENERATE" ${effective.has('PAYMENT_CREATE')?'checked':''} ${canManage?'':'disabled'}><span><strong>Puede cobrar</strong><small>Consulta saldos, registra pagos y genera comprobantes.</small><em class="permission-menu-impact">Activa el flujo de cobro de esta sucursal</em></span></label>
              <label class="permission-option"><input type="checkbox" class="operational-role" data-codes="PAYMENT_VIEW,RECEIPT_VIEW" ${effective.has('PAYMENT_VIEW')&&!effective.has('PAYMENT_CREATE')?'checked':''} ${canManage?'':'disabled'}><span><strong>Solo consultar cobros</strong><small>Puede revisar pagos y comprobantes, pero no cobrar.</small></span></label>
              <label class="permission-option"><input type="checkbox" class="operational-role" data-codes="STUDENT_VIEW,STUDENT_CREATE,ENROLLMENT_VIEW,ENROLLMENT_CREATE" ${effective.has('STUDENT_CREATE')&&effective.has('ENROLLMENT_CREATE')?'checked':''} ${canManage?'':'disabled'}><span><strong>Puede matricular</strong><small>Registra estudiantes y crea matrículas sin permisos administrativos.</small></span></label>
            </fieldset>
            <input class="permission-search" id="permission-search" type="search" placeholder="Buscar permiso o acción...">
            <div class="permission-groups">
              ${Object.entries(grouped).map(([moduleName, items]) => `<fieldset class="permission-group" data-permission-group><legend><span>${esc(moduleName)}</span>${canManage ? '<button type="button" class="permission-group-toggle">Marcar todos</button>' : ''}</legend>${items.map(item => `<label class="permission-option" data-permission-text="${esc(`${item.code} ${item.name} ${item.description || ''}`.toLowerCase())}"><input type="checkbox" name="permissionCodes" value="${esc(item.code)}" ${effective.has(item.code) ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span><strong>${esc(item.name || item.code)}</strong><small>${esc(item.code)}${item.description ? ` · ${esc(item.description)}` : ''}</small>${permissionImpact(item.code) ? `<em class="permission-menu-impact">${esc(permissionImpact(item.code))}</em>` : ''}</span></label>`).join('')}</fieldset>`).join('')}
            </div>
            <label class="permission-reason">Motivo del cambio<input name="reason" placeholder="Ej.: Secretaría registra, pero Caja realiza el cobro" ${canManage ? '' : 'disabled'}></label>
            <div id="permission-modal-status" class="branch-status"></div>
            <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button>${canManage ? '<button type="submit" class="btn btn-primary">Guardar accesos</button>' : ''}</div>
          </form>
        ${systemAdminPage ? '</section>' : '</div>'}`;
      const close = async () => { if (systemAdminPage) { toggleBranchChrome(false); await this.renderStaff(host); } else modal.innerHTML = ''; };
      host.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', close));
      host.querySelector('#permission-search')?.addEventListener('input', event => {
        const term = event.target.value.trim().toLowerCase();
        host.querySelectorAll('.permission-option[data-permission-text]').forEach(option => { option.hidden = Boolean(term) && !option.dataset.permissionText.includes(term); });
        host.querySelectorAll('[data-permission-group]').forEach(group => { group.hidden = ![...group.querySelectorAll('.permission-option')].some(option => !option.hidden); });
      });
      host.querySelectorAll('.permission-group-toggle').forEach(button => button.addEventListener('click', () => {
        const checks = [...button.closest('fieldset').querySelectorAll('input[type="checkbox"]:not(:disabled)')];
        const mark = checks.some(check => !check.checked);
        checks.forEach(check => { check.checked = mark; });
        button.textContent = mark ? 'Desmarcar todos' : 'Marcar todos';
      }));
      host.querySelectorAll('.operational-role').forEach(toggle => toggle.addEventListener('change', () => {
        toggle.dataset.codes.split(',').forEach(code => { const permission = host.querySelector(`input[name="permissionCodes"][value="${code}"]`); if (permission) permission.checked = toggle.checked; });
        if (toggle.dataset.codes.includes('PAYMENT_CREATE') && toggle.checked) {
          const consultOnly = [...host.querySelectorAll('.operational-role')].find(item => item.dataset.codes === 'PAYMENT_VIEW,RECEIPT_VIEW');
          if (consultOnly) consultOnly.checked = false;
        }
      }));
      host.querySelector('#user-permissions-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const status = host.querySelector('#permission-modal-status');
        const submit = event.currentTarget.querySelector('button[type="submit"]');
        status.classList.remove('dashboard-error');
        status.textContent = 'Guardando accesos...'; if (submit) submit.disabled = true;
        try {
          const formData = new FormData(event.currentTarget);
          const response = await AdminService.updateUserPermissions(user.id, { branchId: this.branchId, permissionCodes: formData.getAll('permissionCodes'), reason: formData.get('reason') });
          const warnings = response.data?.warnings || [];
          if (warnings.length) window.alert(warnings.map(item => item.message).join('\n'));
          const currentUser = authService.getCurrentUser();
          if (currentUser?.id === user.id) {
            await authService.refreshAuthorization(this.branchId);
          }
          status.textContent = 'Accesos guardados correctamente. Los cambios ya están activos.';
          status.classList.add('permission-save-success');
          if (submit) {
            submit.disabled = false;
            submit.textContent = 'Accesos guardados';
            window.setTimeout(() => { submit.textContent = 'Guardar accesos'; }, 1800);
          }
        } catch (error) {
          status.textContent = error.message || 'No se pudieron guardar los accesos';
          status.classList.add('dashboard-error'); if (submit) submit.disabled = false;
        }
      });
    } catch (error) {
      host.innerHTML = `<section class="${systemAdminPage ? 'permission-page' : 'branch-modal-backdrop'}"><div class="${systemAdminPage ? 'permission-page__form' : 'branch-modal'}"><h2>No se pudieron cargar los accesos</h2><p>${esc(error.message)}</p><div class="branch-modal-actions"><button type="button" class="btn close-modal">Volver</button></div></div></section>`;
      host.querySelector('.close-modal')?.addEventListener('click', async () => { if (systemAdminPage) { toggleBranchChrome(false); await this.renderStaff(host); } else modal.innerHTML = ''; });
    }
  }

  openWorkflowForm(workflows) {
    document.getElementById('branch-modal').innerHTML = `
      <div class="branch-modal-backdrop"><form class="branch-modal" id="workflow-form">
        <h2>Cambiar workflow</h2>
        <p>El cambio de workflow puede requerir actualizar los permisos del personal de esta sucursal.</p>
        <select name="workflowCode" required>${workflows.map(w => `<option value="${esc(w.code)}" ${w.active ? 'selected' : ''}>${esc(w.name)} (${esc(w.code)})</option>`).join('')}</select>
        <div class="branch-warning">No se otorgará PAYMENT_CREATE ni otros permisos silenciosamente.</div>
        <div class="branch-modal-actions"><button type="button" class="btn close-modal">Cancelar</button><button class="btn btn-primary">Guardar workflow</button></div>
      </form></div>`;
    document.querySelector('.close-modal')?.addEventListener('click', () => document.getElementById('branch-modal').innerHTML = '');
    document.getElementById('workflow-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await AdminService.updateBranchWorkflow(this.branchId, Object.fromEntries(new FormData(e.currentTarget)));
      document.getElementById('branch-modal').innerHTML = '';
      await this.renderOperation(document.getElementById('branch-detail-body'));
    });
  }
}
