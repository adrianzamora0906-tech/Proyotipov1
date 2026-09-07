import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import InstructorStudentService from '../../services/instructorStudentService.js';
import { badgeClass, escapeHtml, formatDateTime, stateMessage } from './InstructorHelpers.js';

class InstructorStudentsView extends Component {
  async render() {
    const params = new URLSearchParams(window.location.search);
    const selectedEnrollment = params.get('enrollment');

    try {
      const result = await InstructorStudentService.getStudents({
        search: params.get('search') || '',
        course: params.get('course') || '',
        stage: params.get('stage') || '',
      });
      const detail = selectedEnrollment ? await InstructorStudentService.getStudent(selectedEnrollment) : null;

      const content = `
        <div class="instructor-page">
          <div class="page-header">
            <div>
              <h1>Mis estudiantes</h1>
              <p>Seguimiento academico por matricula asignada</p>
            </div>
          </div>

          <form class="card instructor-filters" id="student-filter-form">
            <div class="form-group"><label class="form-label">Buscar</label><input class="form-input" name="search" value="${escapeHtml(params.get('search') || '')}" placeholder="Nombre del estudiante"></div>
            <div class="form-group"><label class="form-label">Curso</label><input class="form-input" name="course" value="${escapeHtml(params.get('course') || '')}" placeholder="Automovil o moto"></div>
            <div class="form-group"><label class="form-label">Etapa</label><select class="form-input" name="stage"><option value="">Todos los estudiantes</option><option value="upcoming" ${params.get('stage') === 'upcoming' ? 'selected' : ''}>Próximos</option><option value="active" ${params.get('stage') === 'active' ? 'selected' : ''}>En clase ahora</option><option value="completed" ${params.get('stage') === 'completed' ? 'selected' : ''}>Ya recibieron clase</option></select></div>
            <button class="btn btn-secondary" type="button" id="clear-instructor-student-filters">Limpiar filtros</button>
          </form>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Asignaciones activas</h3><span class="badge badge-primary">${result.data.length}</span></div>
            <div class="card-body">${result.data.length ? this.renderRows(result.data) : '<div class="instructor-empty">No tienes estudiantes asignados con esos filtros.</div>'}</div>
          </div>

          ${detail ? this.renderDetail(detail.data) : ''}
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

  renderRows(items) {
    return `
      <div class="instructor-table-wrap">
        <table class="table">
          <thead><tr><th>Nombre</th><th>Curso</th><th>Sucursal</th><th>Clases</th><th>Avance</th><th>Proxima clase</th><th>Estado</th><th>Accion</th></tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td data-label="Estudiante">${escapeHtml(item.name)}</td>
                <td data-label="Curso">${escapeHtml(item.course)}</td>
                <td data-label="Sucursal">${escapeHtml(item.branch)}</td>
                <td data-label="Clases">${item.completedSessions}/${item.totalSessions}</td>
                <td data-label="Avance"><div class="progress-bar"><span style="width:${item.progress}%"></span></div>${item.progress}%</td>
                <td data-label="Proxima clase">${item.nextSession ? formatDateTime(item.nextSession) : 'Sin programar'}</td>
                <td data-label="Estado"><span class="badge ${badgeClass(item.stage === 'active' ? 'EN_CURSO' : item.stage === 'completed' ? 'COMPLETADA' : 'PROXIMA')}">${item.stage === 'active' ? 'En clase ahora' : item.stage === 'completed' ? 'Ya recibió clase' : 'Próximo'}</span></td>
                <td class="mobile-actions" data-label="Accion"><a class="btn btn-secondary btn-small" href="/instructor/students?enrollment=${item.enrollmentId}">Ver seguimiento</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderDetail(detail) {
    return `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Seguimiento academico</h3><a class="btn btn-secondary btn-small" href="/instructor/students">Cerrar</a></div>
        <div class="card-body">
          <div class="profile-details">
            <div class="info-item"><span class="info-label">Estudiante</span><span class="info-value">${escapeHtml(detail.first_name)} ${escapeHtml(detail.last_name)}</span></div>
            <div class="info-item"><span class="info-label">Curso</span><span class="info-value">${escapeHtml(detail.course_name)}</span></div>
            <div class="info-item"><span class="info-label">Matricula</span><span class="info-value">${escapeHtml(detail.enrollment_status)}</span></div>
          </div>
          <h3>Clases</h3>
          ${detail.sessions.length ? `<div class="instructor-table-wrap"><table class="table"><tbody>${detail.sessions.map(item => `<tr><td data-label="Fecha">${formatDateTime(item.scheduled_start)}</td><td data-label="Estado"><span class="badge ${badgeClass(item.status)}">${item.status}</span></td><td data-label="Observaciones">${escapeHtml(item.observations || 'Sin observaciones')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="instructor-empty">Sin clases registradas.</div>'}
          <h3>Evaluaciones practicas</h3>
          ${detail.evaluations.length ? `<div class="instructor-table-wrap"><table class="table"><tbody>${detail.evaluations.map(item => `<tr><td data-label="Evaluacion">${escapeHtml(item.evaluation_type)}</td><td data-label="Puntaje">${item.percentage || 0}%</td><td data-label="Resultado"><span class="badge ${badgeClass(item.result)}">${escapeHtml(item.result)}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="instructor-empty">Sin evaluaciones registradas.</div>'}
          <h3>Incidencias relacionadas</h3>
          ${detail.incidents.length ? `<div class="instructor-table-wrap"><table class="table"><tbody>${detail.incidents.map(item => `<tr><td data-label="Tipo">${escapeHtml(item.incident_type)}</td><td data-label="Estado"><span class="badge ${badgeClass(item.status)}">${escapeHtml(item.status)}</span></td><td data-label="Descripcion">${escapeHtml(item.description)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="instructor-empty">Sin incidencias.</div>'}
        </div>
      </div>
    `;
  }

  async mount() {
    const filterForm = document.getElementById('student-filter-form');
    const applyFilters = () => {
      const values = new FormData(filterForm);
      const qs = new URLSearchParams({
        search: values.get('search'),
        course: values.get('course'),
        stage: values.get('stage'),
      });
      window.history.pushState(null, null, `/instructor/students?${qs}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    filterForm?.addEventListener('submit', event => event.preventDefault());
    let filterTimer;
    filterForm?.querySelectorAll('input').forEach(field => field.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(applyFilters, 350); }));
    filterForm?.querySelector('[name="stage"]')?.addEventListener('change', applyFilters);
    document.getElementById('clear-instructor-student-filters')?.addEventListener('click', () => { window.history.pushState(null, null, '/instructor/students'); window.dispatchEvent(new PopStateEvent('popstate')); });
  }
}

export default InstructorStudentsView;
