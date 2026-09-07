import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';
import { authService } from '../../core/auth/AuthService.js';
import { permissionService } from '../../core/auth/PermissionService.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const number = (value) => new Intl.NumberFormat('es-EC').format(Number(value || 0));
const money = (value) => `$${new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`;

export default class ManagerBranchesView extends Component {
  constructor(props = {}) {
    super(props);
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 9);
    this.formatInputDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.defaultDateFrom = this.formatInputDate(from);
    this.defaultDateTo = this.formatInputDate(today);
    this.selectedMetric = 'enrollments';
    this.comparisonLevel = 'branch';
  }

  async render() {
    return SidebarLayout.render(`
      <section class="manager-branches">
        <header class="manager-branches__header">
          <div>
            <span class="manager-branches__eyebrow">Vista consolidada</span>
            <h1>Sucursales</h1>
            <p>Compara capacidad, personal y actividad académica de cada sede.</p>
          </div>
          <div class="manager-branches__header-note"><strong id="manager-branches-visible">0</strong><span>sucursales visibles</span></div>
        </header>

        <section class="dashboard-filters manager-filter-bar manager-branches-filters" aria-label="Filtros de sucursales">
          <label>Tipo de curso<select id="manager-branches-course-type"><option value="">Todos los cursos</option><option value="moto">Clase A - Moto</option><option value="carro">Clase B - Automóvil</option></select></label>
          <label>Provincia<select id="manager-branches-province"><option value="">Todas</option></select></label>
          <label>Cantón / ciudad<select id="manager-branches-city"><option value="">Todos</option></select></label>
          <label>Estado<select id="manager-branches-status"><option value="">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
          <label>Desde<input id="manager-branches-date-from" type="date" value="${this.defaultDateFrom}" max="${this.defaultDateTo}"></label>
          <label>Hasta<input id="manager-branches-date-to" type="date" value="${this.defaultDateTo}" max="${this.defaultDateTo}"></label>
          <button class="btn btn-secondary" id="manager-branches-refresh" type="button">Limpiar filtros</button>
        </section>

        <section class="dashboard-kpis manager-branches-kpis" id="manager-branches-kpis"></section>
        <section class="dashboard-panel manager-branches-charts" id="manager-branches-charts">
          <div class="panel-title">
            <div><h2>Rendimiento comparativo</h2><small>Compara los resultados diarios por sucursal o por provincia</small></div>
            <label class="manager-branches-compare-control">Comparar por
              <select id="manager-branches-comparison-level">
                <option value="branch">Sucursal</option>
                <option value="province">Provincia</option>
              </select>
            </label>
          </div>
          <div id="manager-branches-charts-content"></div>
        </section>
        <section class="dashboard-panel manager-branches-panel" id="manager-branches-table"></section>
        <div class="modal-overlay" id="branch-staff-modal" aria-hidden="true">
          <div class="modal branch-staff-modal" role="dialog" aria-modal="true" aria-labelledby="branch-staff-title">
            <div class="modal-header"><div><h2 class="modal-title" id="branch-staff-title">Rendimiento del personal</h2><p class="manager-modal-subtitle" id="branch-staff-period"></p></div><button type="button" class="modal-close" id="branch-staff-close" aria-label="Cerrar">&times;</button></div>
            <div class="modal-body" id="branch-staff-content"></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" id="branch-staff-done">Cerrar</button></div>
          </div>
        </div>
      </section>
    `);
  }

  async mount() {
    this.courseTypeSelect = document.getElementById('manager-branches-course-type');
    this.provinceSelect = document.getElementById('manager-branches-province');
    this.citySelect = document.getElementById('manager-branches-city');
    this.statusSelect = document.getElementById('manager-branches-status');
    this.dateFromInput = document.getElementById('manager-branches-date-from');
    this.dateToInput = document.getElementById('manager-branches-date-to');
    this.refreshButton = document.getElementById('manager-branches-refresh');
    this.comparisonLevelSelect = document.getElementById('manager-branches-comparison-level');
    this.staffModal = document.getElementById('branch-staff-modal');

    this.refreshButton?.addEventListener('click', () => {
      this.courseTypeSelect.value = '';
      this.provinceSelect.value = '';
      this.citySelect.value = '';
      this.statusSelect.value = '';
      this.dateFromInput.value = this.defaultDateFrom;
      this.dateToInput.value = this.defaultDateTo;
      this.syncCityOptions(false);
      this.load();
    });
    this.courseTypeSelect?.addEventListener('change', () => this.load());
    this.provinceSelect?.addEventListener('change', () => {
      this.syncCityOptions(false);
      this.load();
    });
    this.citySelect?.addEventListener('change', () => this.load());
    this.statusSelect?.addEventListener('change', () => this.load());
    this.comparisonLevelSelect?.addEventListener('change', () => {
      this.comparisonLevel = this.comparisonLevelSelect.value;
      this.renderCharts(this.chartBranches || []);
    });
    this.dateFromInput?.addEventListener('change', () => this.handleDateChange('from'));
    this.dateToInput?.addEventListener('change', () => this.handleDateChange('to'));
    document.getElementById('branch-staff-close')?.addEventListener('click', () => this.closeStaffModal());
    document.getElementById('branch-staff-done')?.addEventListener('click', () => this.closeStaffModal());
    this.staffModal?.addEventListener('click', event => { if (event.target === this.staffModal) this.closeStaffModal(); });

    await this.load();
  }

  handleDateChange(changed) {
    if (!this.dateFromInput.value || !this.dateToInput.value) return;
    if (this.dateFromInput.value > this.dateToInput.value) {
      if (changed === 'from') this.dateToInput.value = this.dateFromInput.value;
      else this.dateFromInput.value = this.dateToInput.value;
    }
    this.load();
  }

  async load() {
    this.refreshButton.disabled = true;
    const filters = {
      courseType: this.courseTypeSelect?.value || undefined,
      status: this.statusSelect?.value || undefined,
      province: this.provinceSelect?.value || undefined,
      city: this.citySelect?.value || undefined,
      dateFrom: this.dateFromInput?.value || undefined,
      dateTo: this.dateToInput?.value || undefined,
      limit: 100,
    };

    try {
      const response = await AdminService.branches(filters);
      const payload = response.data || {};
      this.branchOptions = payload.filters?.branches || [];
      this.cityCatalog = payload.filters?.cityCatalog || [];
      this.renderFilters(payload.filters || {});
      this.chartBranches = payload.data || [];
      this.renderKpis(this.chartBranches);
      this.renderCharts(this.chartBranches);
      this.renderTable(payload.data || []);
      const visible = document.getElementById('manager-branches-visible');
      if (visible) visible.textContent = number((payload.data || []).length);
    } catch (error) {
      document.getElementById('manager-branches-table').innerHTML = `<p class="dashboard-empty">${esc(error.message || 'No se pudo cargar la información de sucursales.')}</p>`;
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  renderFilters(filters) {
    if (!this.branchOptions?.length) return;
    const selectedProvince = this.provinceSelect.value;
    const provinces = [...new Set(this.branchOptions.map((item) => item.province).filter(Boolean))].sort();
    this.provinceSelect.innerHTML = `<option value="">Todas</option>${provinces.map((province) => `<option value="${esc(province)}">${esc(province)}</option>`).join('')}`;
    this.provinceSelect.value = provinces.includes(selectedProvince) ? selectedProvince : '';
    this.syncCityOptions(false);
  }

  syncCityOptions(loadAfterSync = true) {
    const province = this.provinceSelect.value;
    const selectedCity = this.citySelect.value;
    const cities = [...new Set(this.branchOptions.filter((item) => !province || item.province === province).map((item) => item.city).filter(Boolean))].sort();
    this.citySelect.innerHTML = `<option value="">Todos</option>${cities.map((city) => `<option value="${esc(city)}">${esc(city)}</option>`).join('')}`;
    this.citySelect.value = cities.includes(selectedCity) ? selectedCity : '';
    if (loadAfterSync) this.load();
  }

  renderKpis(branches = []) {
    const totals = branches.flatMap(branch => branch.daily_enrollments || []).reduce((summary, day) => {
      summary.enrollments += Number(day.enrollments || 0);
      summary.income += Number(day.income || 0);
      summary.students_with_payment += Number(day.students_with_payment || 0);
      summary.fully_paid_enrollments += Number(day.fully_paid_enrollments || 0);
      summary.pending_balance += Number(day.pending_balance || 0);
      return summary;
    }, { enrollments: 0, income: 0, students_with_payment: 0, fully_paid_enrollments: 0, pending_balance: 0 });
    totals.students_with_payment = branches.reduce((total, branch) => total + Number(branch.students_with_payment || 0), 0);
    const cards = [
      ['enrollments', 'Matriculados', number(totals.enrollments), 'Inscripciones del periodo', 'total'],
      ['income', 'Ingresos cobrados', money(totals.income), 'Cobros realizados', 'active'],
      ['students_with_payment', 'Personas con algún pago', number(totals.students_with_payment), 'Realizaron al menos un abono', 'staff'],
      ['fully_paid_enrollments', 'Matrículas totalmente pagadas', number(totals.fully_paid_enrollments), 'Sin saldo pendiente', 'courses'],
      ['pending_balance', 'Saldos pendientes', money(totals.pending_balance), 'Generados en el periodo', 'inactive'],
    ];
    const container = document.getElementById('manager-branches-kpis');
    container.innerHTML = cards.map(([key, label, value, detail, tone]) => `<button type="button" data-metric="${key}" class="dashboard-kpi manager-kpi manager-branch-kpi manager-branch-kpi--${tone} ${key === this.selectedMetric ? 'is-selected' : ''}"><div class="manager-branch-kpi__icon"></div><div><strong>${value}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></div></button>`).join('');
    container.querySelectorAll('[data-metric]').forEach(card => card.addEventListener('click', () => {
      this.selectedMetric = card.dataset.metric;
      this.renderKpis(this.chartBranches || branches);
      this.renderCharts(this.chartBranches || branches);
    }));
  }

  renderTable(branches) {
    const table = document.getElementById('manager-branches-table');
    if (!branches.length) {
      table.innerHTML = '<p class="dashboard-empty">No se encontraron sucursales con los filtros actuales.</p>';
      return;
    }

    table.innerHTML = `
      <div class="manager-branches-table-head"><div><h2>Detalle de sucursales</h2><p>Información administrativa y operativa consolidada.</p></div><span>${number(branches.length)} resultados</span></div>
      <div class="dashboard-table-wrap manager-branches-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sucursal</th>
              <th>Provincia</th>
              <th>Cantón</th>
              <th>Administrador</th>
              <th>Personal</th>
              <th>Estudiantes</th>
              <th>Matrículas</th>
              <th>Proceso de cobro</th>
              <th>Estado</th>
              <th>Personal</th>
            </tr>
          </thead>
          <tbody>
            ${branches.map((branch) => `
              <tr>
                <td><strong>${esc(branch.name)}</strong><small>${esc(branch.address || '')}</small></td>
                <td>${esc(branch.province || '—')}</td>
                <td>${esc(branch.city || '—')}</td>
                <td>${esc(branch.administrator_name || 'Sin asignar')}</td>
                <td>${number(branch.staff_count)}</td>
                <td>${number(branch.active_students)}</td>
                <td>${number(branch.active_enrollments)}</td>
                <td>${esc(branch.workflow_name || 'Sin workflow')}</td>
                <td>${this.statusLabel(branch)}</td>
                <td><button type="button" class="branch-staff-button" data-branch-staff="${branch.id}">Ver rendimiento</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    table.querySelectorAll('[data-branch-staff]').forEach(button => button.addEventListener('click', () => this.openStaffModal(button.dataset.branchStaff)));
  }

  openStaffModal(branchId) {
    const branch = (this.chartBranches || []).find(item => item.id === branchId);
    if (!branch || !this.staffModal) return;
    const people = branch.staff_performance || [];
    const secretaries = people.filter(person => person.role === 'SECRETARY');
    const cashiers = people.filter(person => person.role === 'CASHIER');
    const registered = secretaries.reduce((total, person) => total + Number(person.registered_students || 0), 0);
    const confirmed = secretaries.reduce((total, person) => total + Number(person.confirmed_enrollments || 0), 0);
    const studentsWithPayment = Number(branch.students_with_payment || 0);
    const collected = cashiers.reduce((total, person) => total + Number(person.collected_amount || 0), 0);
    const topSecretary = [...secretaries].sort((a, b) => Number(b.registered_students) - Number(a.registered_students))[0];
    document.getElementById('branch-staff-title').textContent = `Personal · ${branch.name}`;
    document.getElementById('branch-staff-period').textContent = `Resultados del ${this.dateFromInput.value} al ${this.dateToInput.value}`;
    const roleLabel = role => ({ BRANCH_ADMIN: 'Administrador', SECRETARY: 'Secretaría', CASHIER: 'Caja' }[role] || role);
    const dateLabel = value => value ? new Date(value).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin actividad';
    document.getElementById('branch-staff-content').innerHTML = `
      <div class="branch-staff-summary">
        <article><strong>${number(registered)}</strong><span>Estudiantes registrados</span></article>
        <article><strong>${number(studentsWithPayment)}</strong><span>Personas con algún pago</span></article>
        <article><strong>${number(confirmed)}</strong><span>Matrículas totalmente pagadas</span></article>
        <article><strong>${money(collected)}</strong><span>Cobrado por caja</span></article>
        <article><strong>${esc(topSecretary?.name || 'Sin registros')}</strong><span>Mayor registro del periodo</span></article>
      </div>
      ${people.length ? `<div class="dashboard-table-wrap branch-staff-table"><table><thead><tr><th>Personal</th><th>Rol</th><th>Registrados</th><th>Totalmente pagadas</th><th>Transacciones</th><th>Total cobrado</th><th>Última actividad</th></tr></thead><tbody>${people.map(person => `<tr><td><strong>${esc(person.name)}</strong></td><td><span class="branch-staff-role branch-staff-role--${person.role.toLowerCase()}">${roleLabel(person.role)}</span></td><td>${person.role === 'SECRETARY' ? number(person.registered_students) : '—'}</td><td>${person.role === 'SECRETARY' ? number(person.confirmed_enrollments) : '—'}</td><td>${person.role === 'CASHIER' ? number(person.payments_count) : '—'}</td><td>${person.role === 'CASHIER' ? money(person.collected_amount) : '—'}</td><td>${dateLabel(person.last_activity)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dashboard-empty">Esta sucursal todavía no tiene personal asignado.</p>'}
      <p class="branch-staff-note">Una persona con algún pago puede mantener saldo pendiente. “Totalmente pagadas” cuenta únicamente matrículas sin deuda; “Transacciones” cuenta los cobros o abonos procesados por caja.</p>
    `;
    this.staffModal.classList.add('active');
    this.staffModal.setAttribute('aria-hidden', 'false');
  }

  closeStaffModal() {
    this.staffModal?.classList.remove('active');
    this.staffModal?.setAttribute('aria-hidden', 'true');
  }

  renderCharts(branches) {
    const container = document.getElementById('manager-branches-charts-content');
    if (!branches.length) {
      container.innerHTML = '<p class="dashboard-empty">No hay datos de sucursales para comparar.</p>';
      return;
    }

    const comparisonItems = this.buildComparisonItems(branches);
    const metrics = {
      enrollments: { label: 'Matriculados', title: 'Estudiantes matriculados por día', unit: 'matriculados', money: false },
      income: { label: 'Ingresos cobrados', title: 'Ingresos cobrados por día', unit: 'cobrados', money: true },
      students_with_payment: { label: 'Personas con algún pago', title: 'Personas que realizaron pagos por día', unit: 'personas con pago', money: false },
      fully_paid_enrollments: { label: 'Matrículas totalmente pagadas', title: 'Matrículas pagadas completamente por día', unit: 'matrículas pagadas', money: false },
      pending_balance: { label: 'Saldos pendientes', title: 'Saldos pendientes generados por día', unit: 'pendientes', money: true },
    };
    const metric = metrics[this.selectedMetric] || metrics.enrollments;
    const palette = ['#f5b700', '#ef4444', '#16a34a', '#4f46e5', '#0ea5e9', '#a855f7'];
    const dates = (comparisonItems[0]?.daily_enrollments || []).map(item => item.date);
    const allValues = comparisonItems.flatMap(item => (item.daily_enrollments || []).map(day => Number(day[this.selectedMetric] || 0)));
    const maximum = Math.max(...allValues, 1);
    const shortDate = value => new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
    const formatValue = value => metric.money ? `$${new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}` : number(value);

    const legend = comparisonItems.map((item, index) => `
      <span><i style="background:${palette[index % palette.length]}"></i>${esc(item.name)}</span>
    `).join('');
    const chartWidth = Math.max(960, dates.length * 78);
    const chartHeight = 320;
    const margins = { left: 55, right: 24, top: 24, bottom: 52 };
    const plotWidth = chartWidth - margins.left - margins.right;
    const plotHeight = chartHeight - margins.top - margins.bottom;
    const xFor = index => margins.left + ((dates.length > 1 ? index / (dates.length - 1) : 0.5) * plotWidth);
    const yFor = value => margins.top + plotHeight - ((Number(value || 0) / maximum) * plotHeight);
    const grid = [0, .25, .5, .75, 1].map(ratio => {
      const y = margins.top + plotHeight - (ratio * plotHeight);
      const gridValue = maximum * ratio;
      return `<g><line x1="${margins.left}" y1="${y}" x2="${chartWidth - margins.right}" y2="${y}" class="branch-line-grid"/><text x="${margins.left - 12}" y="${y + 4}" text-anchor="end" class="branch-line-axis-label">${metric.money ? `$${number(Math.round(gridValue))}` : number(Math.round(gridValue))}</text></g>`;
    }).join('');
    const dateLabels = dates.map((date, index) => `<text x="${xFor(index)}" y="${chartHeight - 17}" text-anchor="middle" class="branch-line-date">${shortDate(date)}</text>`).join('');
    const series = comparisonItems.map((item, itemIndex) => {
      const color = palette[itemIndex % palette.length];
      const values = dates.map((_, index) => Number(item.daily_enrollments?.[index]?.[this.selectedMetric] || 0));
      const points = values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ');
      const dots = values.map((value, index) => `<circle cx="${xFor(index)}" cy="${yFor(value)}" r="5" fill="${color}" class="branch-line-point"><title>${esc(item.name)}: ${formatValue(value)} ${metric.unit} el ${shortDate(dates[index])}</title></circle>`).join('');
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="branch-line-series"/>${dots}`;
    }).join('');

    const selectedCity = this.citySelect?.value;
    const branchTotals = comparisonItems.map((item, index) => ({
      name: item.name,
      color: palette[index % palette.length],
      value: (item.daily_enrollments || []).reduce((total, day) => total + Number(day[this.selectedMetric] || 0), 0),
    }));
    const grandTotal = branchTotals.reduce((total, branch) => total + branch.value, 0);
    let accumulatedPercentage = 0;
    const donutSegments = branchTotals.map((branch) => {
      const start = accumulatedPercentage;
      const percentage = grandTotal ? (branch.value / grandTotal) * 100 : 0;
      accumulatedPercentage += percentage;
      return `${branch.color} ${start}% ${accumulatedPercentage}%`;
    });
    const donutBackground = grandTotal ? `conic-gradient(${donutSegments.join(',')})` : 'conic-gradient(#e4e7ec 0 100%)';
    const comparingProvinces = this.comparisonLevel === 'province';
    const comparisonName = comparingProvinces ? 'provincia' : 'sucursal';
    container.innerHTML = `
      <article class="branch-daily-chart-card">
        <div class="branch-daily-chart-head">
          <div><h3>${metric.title}</h3><p>${comparingProvinces ? 'Totales consolidados de todas las sucursales de cada provincia.' : (selectedCity ? `Comparación entre las sucursales de ${esc(selectedCity)}.` : 'Comparación entre las sucursales visibles.')}</p></div>
          <div class="branch-daily-legend">${legend}</div>
        </div>
        <div class="branch-line-chart-wrap"><svg class="branch-line-chart" style="min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Comparación diaria de estudiantes matriculados por sucursal">${grid}<line x1="${margins.left}" y1="${margins.top}" x2="${margins.left}" y2="${margins.top + plotHeight}" class="branch-line-axis"/><line x1="${margins.left}" y1="${margins.top + plotHeight}" x2="${chartWidth - margins.right}" y2="${margins.top + plotHeight}" class="branch-line-axis"/>${series}${dateLabels}</svg></div>
        <p class="branch-daily-note">Cada color representa una ${comparisonName}. Pasa el cursor sobre un punto para consultar el valor exacto.</p>
      </article>
      <article class="branch-donut-card">
        <div class="branch-donut-heading">
          <h3>Participación por ${comparisonName}</h3>
          <p>Distribución acumulada de ${metric.label.toLowerCase()} dentro del periodo seleccionado.</p>
        </div>
        <div class="branch-donut-content">
          <div class="branch-donut" style="background:${donutBackground}" role="img" aria-label="Participación de ${metric.label.toLowerCase()} por ${comparisonName}">
            <div><strong>${formatValue(grandTotal)}</strong><span>Total del periodo</span></div>
          </div>
          <div class="branch-donut-legend">
            ${branchTotals.map(branch => {
              const percentage = grandTotal ? (branch.value / grandTotal) * 100 : 0;
              return `<div><i style="background:${branch.color}"></i><span><strong>${esc(branch.name)}</strong><small>${formatValue(branch.value)}</small></span><b>${percentage.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</b></div>`;
            }).join('')}
          </div>
        </div>
      </article>
    `;
  }

  buildComparisonItems(branches = []) {
    if (this.comparisonLevel !== 'province') return branches;

    const metrics = ['enrollments', 'income', 'students_with_payment', 'fully_paid_enrollments', 'pending_balance'];
    const grouped = new Map();
    branches.forEach(branch => {
      const province = branch.province || 'Sin provincia';
      if (!grouped.has(province)) grouped.set(province, { name: province, dailyByDate: new Map() });
      const group = grouped.get(province);
      (branch.daily_enrollments || []).forEach(day => {
        if (!group.dailyByDate.has(day.date)) group.dailyByDate.set(day.date, { date: day.date });
        const targetDay = group.dailyByDate.get(day.date);
        metrics.forEach(metric => { targetDay[metric] = Number(targetDay[metric] || 0) + Number(day[metric] || 0); });
      });
    });

    return [...grouped.values()].map(group => ({
      name: group.name,
      daily_enrollments: [...group.dailyByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    }));
  }

  statusLabel(branch) {
    if (!branch.active) return '<span class="status-badge status-inactive">Inactiva</span>';
    if (branch.configuration_status === 'requires_configuration') return '<span class="status-badge status-warning">Requiere configuración</span>';
    return '<span class="status-badge status-active">Activa</span>';
  }
}
