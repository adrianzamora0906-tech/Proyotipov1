import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import IncidentService from '../../services/incidentService.js';
import InstructorStudentService from '../../services/instructorStudentService.js';
import { badgeClass, escapeHtml, formatDateTime, stateMessage } from './InstructorHelpers.js';

class InstructorIncidentsView extends Component {
  async render() {
    try {
      const [incidents, students] = await Promise.all([
        IncidentService.getIncidents(),
        InstructorStudentService.getStudents({ limit: 100 }),
      ]);
      const content = `
        <div class="instructor-page">
          <div class="page-header"><div><h1>Incidencias</h1><p>Reporte y consulta de novedades operativas</p></div></div>
          <div class="dashboard-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Reportar incidencia</h3></div>
              <div class="card-body">${this.renderForm(students.data)}</div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Mis incidencias</h3></div>
              <div class="card-body">${this.renderIncidents(incidents.data)}</div>
            </div>
          </div>
        </div>
      `;
      const layout = await SidebarLayout.render(content);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    } catch (error) {
      const layout = await SidebarLayout.render(`<div class="alert alert-error">${stateMessage(error)}</div>`);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    }
  }

  renderForm(students) {
    const types = ['Estudiante ausente', 'Estudiante llego tarde', 'Vehiculo con falla', 'Dano en el vehiculo', 'Accidente', 'Clase suspendida', 'Condiciones climaticas', 'Problema de horario', 'Comportamiento inapropiado', 'Problema de seguridad', 'Otro'];
    return `
      <form id="incident-form">
        <div class="form-group"><label class="form-label required">Tipo</label><select class="form-select" name="incidentType" required>${types.map(type => `<option value="${type}">${type}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Estudiante relacionado</label><select class="form-select" name="enrollmentId"><option value="">Sin estudiante</option>${students.map(item => `<option value="${item.enrollmentId}">${escapeHtml(item.name)} - ${escapeHtml(item.course)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Prioridad</label><select class="form-select" name="priority"><option>BAJA</option><option selected>MEDIA</option><option>ALTA</option><option>CRITICA</option></select></div>
        <div class="form-group"><label class="form-label required">Descripcion</label><textarea class="form-textarea" name="description" required></textarea></div>
        <div class="form-group"><label class="form-label">Evidencia</label><input class="form-input" name="evidencePath" placeholder="Ruta o referencia de evidencia"></div>
        <button class="btn btn-primary" type="submit">Reportar incidencia</button>
      </form>
    `;
  }

  renderIncidents(items) {
    if (!items.length) return '<div class="instructor-empty">No has reportado incidencias.</div>';
    return `
      <table class="table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Descripcion</th></tr></thead>
        <tbody>${items.map(item => `
          <tr>
            <td data-label="Fecha">${formatDateTime(item.reported_at)}</td>
            <td data-label="Tipo">${escapeHtml(item.incident_type)}</td>
            <td data-label="Prioridad"><span class="badge ${badgeClass(item.priority)}">${escapeHtml(item.priority)}</span></td>
            <td data-label="Estado"><span class="badge ${badgeClass(item.status)}">${escapeHtml(item.status)}</span></td>
            <td data-label="Descripcion">${escapeHtml(item.description)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  async mount() {
    const form = document.getElementById('incident-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      try {
        button.disabled = true;
        await IncidentService.createIncident({
          incidentType: values.get('incidentType'),
          enrollmentId: values.get('enrollmentId') || null,
          priority: values.get('priority'),
          description: values.get('description'),
          evidencePath: values.get('evidencePath') || null,
        });
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (error) {
        window.alert(stateMessage(error));
        button.disabled = false;
      }
    });
  }
}

export default InstructorIncidentsView;
