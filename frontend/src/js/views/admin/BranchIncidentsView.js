import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';
import { authService } from '../../core/auth/AuthService.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const dateTime = value => value ? new Date(value).toLocaleString('es-EC') : '';
const localDate = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

export default class BranchIncidentsView extends Component {
  async render() {
    return SidebarLayout.render(`<main class="instructor-page branch-incidents-page">
      <style>
        .branch-incidents-page #incident-filters {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px;align-items:end;margin:20px 0;}
        .branch-incidents-page #incident-filters label {display:grid;gap:6px;min-width:0;}
        .branch-incidents-page #branch-incidents {overflow-x:auto;}
        .branch-incidents-page table {min-width:780px;}
        .branch-incidents-page td {vertical-align:top;max-width:320px;overflow-wrap:anywhere;}
        .branch-incidents-page details {min-width:140px;}
        .branch-incidents-page thead th {background:#f0f7f6;color:#23574d;border-bottom:2px solid #cce4dd;}
        .branch-incidents-page tbody tr:hover {background:#f7faf9;}
        .branch-incidents-page .incident-tag {display:inline-block;padding:4px 9px;border-radius:6px;font-size:12px;font-weight:600;line-height:1.5;background:#eef1f4;color:#475569;}
        .branch-incidents-page .incident-tag[data-state="ABIERTA"] {background:#fff3d6;color:#805600;}
        .branch-incidents-page .incident-tag[data-state="REVISADA"] {background:#dcf5e8;color:#176342;}
        .branch-incidents-page .incident-tag[data-priority="BAJA"] {background:#e6f2fc;color:#245d8a;}
        .branch-incidents-page .incident-tag[data-priority="MEDIA"] {background:#fff3d6;color:#805600;}
        .branch-incidents-page .incident-tag[data-priority="ALTA"],.branch-incidents-page .incident-tag[data-priority="CRITICA"],.branch-incidents-page .incident-tag[data-priority="CRÍTICA"] {background:#fce5e8;color:#a12e40;}
        .branch-incidents-page [data-review-incident] {display:block;margin-top:8px;background:#187653;color:#fff;border:1px solid #187653;border-radius:6px;}
        .branch-incidents-page [data-review-incident]:hover {background:#125c40;}
        .branch-incidents-page [data-review-incident]:disabled {opacity:.65;}
        .branch-incidents-page summary {color:#216d8c;cursor:pointer;}
        .branch-incidents-page summary:hover {text-decoration:underline;}
      </style>
      <h1>Incidencias de sucursal</h1>
      <form id="incident-filters" class="filter-bar">
        <label>Buscar<input class="form-input" name="search" type="search" placeholder="Instructor, estudiante o descripcion"></label>
        <label>Estado<select class="form-select" name="status"><option value="">Todos</option></select></label>
        <label>Prioridad<select class="form-select" name="priority"><option value="">Todas</option></select></label>
        <label>Desde<input class="form-input" type="date" name="from"></label>
        <label>Hasta<input class="form-input" type="date" name="to"></label>
        <button class="btn btn-secondary" type="reset">Limpiar</button>
      </form>
      <p id="incident-count" aria-live="polite"></p>
      <div id="incident-action-error" class="alert alert-error" role="alert" hidden></div>
      <div id="branch-incidents" class="table-responsive">Cargando incidencias...</div>
    </main>`);
  }

  async mount() {
    const container = document.getElementById('branch-incidents');
    try {
      const user = authService.getCurrentUser();
      const branchId = user?.operationalBranchId || user?.branch_id;
      this.branchId = branchId;
      if (!branchId) throw new Error('No tienes una sucursal asignada');
      const response = await AdminService.branchIncidents(branchId);
      this.items = response.data || [];
      const form = document.getElementById('incident-filters');
      for (const key of ['status', 'priority']) {
        const values = [...new Set([...this.items.map(item => item[key]).filter(Boolean), ...(key === 'status' ? ['REVISADA'] : [])])].sort();
        form.elements[key].insertAdjacentHTML('beforeend', values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
      }
      form.addEventListener('submit', event => event.preventDefault());
      form.addEventListener('input', () => this.renderRows());
      form.addEventListener('change', () => this.renderRows());
      form.addEventListener('reset', () => setTimeout(() => this.renderRows(), 0));
      container.addEventListener('click', async event => {
        const button = event.target.closest('[data-review-incident]');
        if (!button || button.disabled) return;
        const errorBox = document.getElementById('incident-action-error');
        errorBox.hidden = true;
        button.disabled = true;
        button.textContent = 'Guardando...';
        try {
          const response = await AdminService.reviewBranchIncident(this.branchId, button.dataset.reviewIncident);
          const item = this.items.find(item => item.id === button.dataset.reviewIncident);
          if (item) {
            Object.assign(item, response.data);
            const user = authService.getCurrentUser();
            item.reviewer_name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || '';
          }
          this.renderRows();
        } catch (error) {
          errorBox.textContent = error.message || 'No se pudo marcar la incidencia como revisada';
          errorBox.hidden = false;
          button.disabled = false;
          button.textContent = 'Marcar como revisada';
        }
      });
      this.renderRows();
    } catch (error) {
      container.innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`;
    }
  }

  renderRows() {
    const filters = Object.fromEntries(new FormData(document.getElementById('incident-filters')));
    const search = filters.search.trim().toLocaleLowerCase('es');
    const items = this.items.filter(item => {
      const day = localDate(item.reported_at);
      return (!filters.status || item.status === filters.status)
        && (!filters.priority || item.priority === filters.priority)
        && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
        && (!search || [item.reporter_name, item.student_name, item.incident_type, item.description].join(' ').toLocaleLowerCase('es').includes(search));
    });
    document.getElementById('incident-count').textContent = `${items.length} incidencias`;
    document.getElementById('branch-incidents').innerHTML = `<table class="table"><thead><tr>
      <th>Fecha</th><th>Instructor</th><th>Estudiante</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Detalle</th>
      </tr></thead><tbody>${items.map(item => `<tr>
        <td>${esc(dateTime(item.reported_at))}</td><td>${esc(item.reporter_name)}</td>
        <td>${esc(item.student_name || 'Sin estudiante')}<br><small>${esc(item.course_name)}</small></td>
        <td>${esc(item.incident_type)}</td><td><span class="incident-tag" data-priority="${esc(item.priority)}">${esc(item.priority)}</span></td><td><span class="incident-tag" data-state="${esc(item.status)}">${esc(item.status)}</span>
        ${item.status !== 'REVISADA' ? `<button type="button" class="btn btn-small" data-review-incident="${esc(item.id)}">Marcar como revisada</button>` : ''}</td>
        <td><details><summary>Ver detalle</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(item.description)}</p>
        ${item.vehicle_code || item.plate ? `<p>Vehiculo: ${esc([item.vehicle_code,item.plate].filter(Boolean).join(' - '))}</p>` : ''}
        ${item.reviewed_at ? `<p>Revisada por: ${esc(item.reviewer_name || 'Administracion')}<br>${esc(dateTime(item.reviewed_at))}</p>` : ''}
        ${item.evidence_path ? `<p style="overflow-wrap:anywhere">Evidencia: ${esc(item.evidence_path)}</p>` : ''}</details></td>
      </tr>`).join('') || '<tr><td colspan="7">No hay incidencias para estos filtros.</td></tr>'}</tbody></table>`;
  }
}
