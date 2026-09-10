/**
 * Students List View
 * Pantalla de listado de estudiantes
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import StudentService from '../../services/StudentService.js?v=registro-sin-fallback-20260820';
import ScheduleService from '../../services/ScheduleService.js';
import PaymentService from '../../services/PaymentService.js';
import DocumentService from '../../services/DocumentService.js';
import NotificationService from '../../services/NotificationService.js';
import Validator from '../../helpers/Validator.js';
import DateHelper from '../../helpers/DateHelper.js';
import StringHelper from '../../helpers/StringHelper.js';
import { authService } from '../../core/auth/AuthService.js';
import ApiService from '../../core/api/apiService.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

class StudentsView extends Component {
  async render() {
    const isRegistrationPage = ['/students/new', '/student-form'].includes(window.location.pathname);
    const queryParams = new URLSearchParams(window.location.search);
    const currentUser = authService.getCurrentUser();
    const isBranchAdmin = (currentUser?.roles || []).includes('BRANCH_ADMIN');
    const currentPage = Math.max(Number(queryParams.get('page')) || 1, 1);
    const searchQuery = queryParams.get('search') || queryParams.get('q') || '';
    const selectedRegistrationType = queryParams.get('registration_type') || 'REGULAR';
    this.registrationType = selectedRegistrationType;
    const listParams = {};
    if (queryParams.get('scope')) listParams.scope = queryParams.get('scope');
    if (queryParams.get('branch_id')) listParams.branch_id = queryParams.get('branch_id');
    if (searchQuery) listParams.search = searchQuery;
    const selectedStatus = queryParams.has('status') ? queryParams.get('status') : (isBranchAdmin ? 'active' : '');
    const statusFilterOptions = [
      ['', 'Todos los estados'],
      ['active', 'Matriculados o en curso'],
      ['payment_pending', 'Con pago pendiente'],
      ['documents_pending', 'Con documentos pendientes'],
      ['pendiente_pago', 'Pendiente pago'],
      ['pago_parcial', 'Pago parcial'],
      ['matriculado', 'Matriculado'],
      ['reservado', 'Reservado'],
      ['en_curso', 'En curso'],
      ['completado', 'Curso completado'],
    ];
    const statusFilterOptionsHtml = statusFilterOptions
      .map(([value, label]) => `<option value="${value}" ${selectedStatus === value ? 'selected' : ''}>${label}</option>`)
      .join('');
    if (selectedStatus) listParams.status = selectedStatus;
    listParams.registration_type = selectedRegistrationType;
    if (queryParams.get('province')) listParams.province = queryParams.get('province');
    if (queryParams.get('city')) listParams.city = queryParams.get('city');
    if (queryParams.get('created_date')) listParams.created_date = queryParams.get('created_date');
    if (queryParams.get('course_type')) listParams.course_type = queryParams.get('course_type');
    this.groupBy = queryParams.get('group') || '';
    this.listParams = { ...listParams };

    const summaryParams = { ...listParams };
    delete summaryParams.status;
    delete summaryParams.registration_type;
    const [students, branches, reservations, summaryStudents, summaryReservations] = await Promise.all([
      StudentService.getAllStudents(listParams),
      StudentService.getBranches(),
      StudentService.getActiveReservations(listParams),
      StudentService.getAllStudents(summaryParams),
      selectedStatus ? StudentService.getActiveReservations(summaryParams) : Promise.resolve(null),
    ]);
    const allSummaryStudents = summaryStudents || students;
    const allSummaryReservations = summaryReservations || reservations;
    this.visibleReservations = reservations;
    const currentBranch = currentUser?.branch || '';
    const currentBranchId = currentUser?.branch_id || '';
    const currentBranchRecord = branches.find(branch => branch.id === currentBranchId)
      || branches.find(branch => branch.name === currentBranch)
      || (currentBranchId && currentBranch ? { id: currentBranchId, name: currentBranch } : null);
    const cantonBranches = branches.filter(branch => currentBranchRecord?.city_id
      ? branch.city_id === currentBranchRecord.city_id
      : branch.city === currentBranchRecord?.city);
    // La sucursal de la sesión siempre debe estar disponible en el filtro,
    // incluso si el catálogo de sucursales no pudo cargarse temporalmente.
    if (currentBranchRecord && !cantonBranches.some(branch => branch.id === currentBranchRecord.id)) {
      cantonBranches.unshift(currentBranchRecord);
    }
    const activeStudentFilter = queryParams.get('scope') === 'all'
      ? 'all'
      : queryParams.get('scope') === 'created'
        ? 'created'
        : `branch:${queryParams.get('branch_id') || currentBranchRecord?.id || ''}`;
    const provinceOptions = [...new Set(cantonBranches.map(branch => branch.province).filter(Boolean))];
    const cantonOptions = [...new Set(cantonBranches.map(branch => branch.city).filter(Boolean))];
    const orderedStudents = [...students].sort((first, second) => {
      if (this.groupBy === 'instructor') {
        const firstInstructor = (first.instructorName || 'Sin instructor').toLowerCase();
        const secondInstructor = (second.instructorName || 'Sin instructor').toLowerCase();
        return firstInstructor.localeCompare(secondInstructor)
          || this.compareStudentsByCreationDate(first, second);
      }
      const firstCurrent = first.branch === currentBranch ? 0 : 1;
      const secondCurrent = second.branch === currentBranch ? 0 : 1;
      return firstCurrent - secondCurrent
        || (first.branch || '').localeCompare(second.branch || '')
        || this.compareStudentsByCreationDate(first, second);
    });
    this.studentsSnapshot = this.createSnapshot(orderedStudents);
    this.reservationsSnapshot = this.createReservationsSnapshot(allSummaryReservations);

    // El registro completo vive en esta vista para conservar documentos,
    // horarios, pagos, QR y sus validaciones. En esta ruta se presenta como
    // página, no como diálogo superpuesto al listado.
    const pageSize = 10;
    const showingReservations = selectedStatus === 'reservado';
    const displayedRecords = showingReservations ? reservations : orderedStudents;
    const totalPages = Math.max(Math.ceil(displayedRecords.length / pageSize), 1);
    const page = Math.min(currentPage, totalPages);
    const pagedStudents = orderedStudents.slice((page - 1) * pageSize, page * pageSize);
    const pagedReservations = reservations.slice((page - 1) * pageSize, page * pageSize);

    const studentsContent = `
      <div class="students">
        <div class="page-header">
          <div>
            <h1>Estudiantes</h1>
            <p>Gestión del registro de estudiantes</p>
          </div>
          <button class="btn btn-primary" id="new-student-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Nuevo Estudiante
          </button>
        </div>

        <section class="students-summary" id="students-summary" aria-label="Resumen de estudiantes">
          ${this.renderStudentSummary(allSummaryStudents, allSummaryReservations, selectedStatus)}
        </section>

        <form class="student-filter-bar" id="student-filter-form">
          <label>Buscar<input class="form-input" name="search" value="${searchQuery}" placeholder="Buscar por nombre o cédula..."></label>
          <label>Sucursal<select class="form-select" name="studentScope">
            ${cantonBranches.map(branch => `<option value="branch:${branch.id}" ${activeStudentFilter === `branch:${branch.id}` ? 'selected' : ''}>${branch.name}</option>`).join('')}
            <option value="all" ${activeStudentFilter === 'all' ? 'selected' : ''}>Todas las sucursales del cantón</option>
            <option value="created" ${activeStudentFilter === 'created' ? 'selected' : ''}>Creados o modificados por mí</option>
          </select></label>
          <label>Estado<select class="form-select" name="status">
            ${statusFilterOptionsHtml}
          </select></label>
          <label>Tipo de curso<select class="form-select" name="course_type">
            <option value="">Todos</option>
            <option value="carro" ${queryParams.get('course_type') === 'carro' ? 'selected' : ''}>Carro</option>
            <option value="moto" ${queryParams.get('course_type') === 'moto' ? 'selected' : ''}>Moto</option>
          </select></label>
          <label>Provincia<select class="form-select" name="province"><option value="">Todas</option>${provinceOptions.map(value => `<option value="${value}" ${queryParams.get('province') === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          <label>Cantón<select class="form-select" name="city"><option value="">Todos</option>${cantonOptions.map(value => `<option value="${value}" ${queryParams.get('city') === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          <label>Fecha de creación<input class="form-input" type="date" name="created_date" value="${queryParams.get('created_date') || ''}"></label>
          <button class="btn btn-secondary" type="button" id="clear-student-filters">Limpiar filtros</button>
        </form>

        <div class="card students-list-card">
          <div class="card-header students-list-header">
            <div>
              <h3 class="card-title" id="students-list-title">${showingReservations ? 'Cupos reservados' : 'Estudiantes registrados'}</h3>
              <p id="students-list-description">${showingReservations ? 'Personas con un lugar protegido que todavía no tienen matrícula.' : 'Selecciona una fila para abrir el expediente.'}</p>
            </div>
            <span class="students-result-count" id="students-result-count">${this.getResultCountLabel(displayedRecords.length, showingReservations)}</span>
          </div>

          <nav class="student-registration-tabs" id="student-registration-tabs" aria-label="Tipos de registro">
            ${this.renderRegistrationTabs(allSummaryStudents, selectedRegistrationType)}
          </nav>

          <div id="students-list-content">
          ${displayedRecords.length > 0 ? `
            <div class="card-body">
              <div class="students-table ${showingReservations ? 'students-table--reservations' : 'students-table--with-created-date'}">
                <div class="table-head">
                  <div class="table-row">
                    ${showingReservations ? `
                    <div class="table-cell">Nombre</div><div class="table-cell">Cédula / teléfono</div><div class="table-cell">Instructor</div><div class="table-cell">Curso</div><div class="table-cell">Fecha de inicio</div><div class="table-cell">Horario</div><div class="table-cell">Estado</div><div class="table-cell">Acción</div>
                    ` : `
                    <div class="table-cell">Nombre</div>
                    <div class="table-cell">Cédula</div>
                    <div class="table-cell">Inscrito por</div>
                    <div class="table-cell">Sucursal</div>
                    <div class="table-cell">
                      <button type="button" class="btn btn-link" id="group-by-instructor-btn" style="padding:0; font-size:inherit;">Instructor</button>
                      ${this.groupBy === 'instructor' ? '<span class="badge badge-secondary">Agrupado</span>' : ''}
                    </div>
                    <div class="table-cell">Fecha de creación</div>
                    <div class="table-cell table-status-filter"><span>Estado</span><select id="student-status-column-filter" aria-label="Filtrar la columna Estado" title="Filtrar por estado">${statusFilterOptionsHtml}</select></div>`}
                  </div>
                </div>
                <div class="table-body">
                  ${showingReservations ? this.renderReservationRows(pagedReservations) : this.renderStudentRows(pagedStudents)}
                </div>
              </div>
            </div>
            <div class="student-pagination">
              <span>Página ${page} de ${totalPages}</span>
              <div>
                <button type="button" class="btn btn-secondary" data-page="${Math.max(page - 1, 1)}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
                <button type="button" class="btn btn-primary" data-page="${Math.min(page + 1, totalPages)}" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button>
              </div>
            </div>
          ` : `
            <div class="card-body" style="text-align: center; padding: 3rem;">
              <p style="color: var(--gray-500); margin-bottom: 1rem;">${showingReservations ? 'No hay cupos reservados' : 'No hay estudiantes registrados'}</p>
              ${showingReservations ? '' : '<button class="btn btn-primary" id="create-first-student">Registrar Primer Estudiante</button>'}
            </div>
          `}
          </div>
        </div>

        ${await this.renderStudentModal()}
      </div>
    `;

    const layout = await SidebarLayout.render(studentsContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const isRegistrationPage = ['/students/new', '/student-form'].includes(window.location.pathname);
    if (isRegistrationPage) {
      await this.mountStudentModalEvents();
      this.openStudentModal();
      return;
    }
    const studentFilterForm = document.getElementById('student-filter-form');
    const applyStudentFilters = async () => {
      const data = Object.fromEntries(new FormData(studentFilterForm));
      const next = new URLSearchParams();
      if (data.studentScope === 'all') next.set('scope', 'all');
      else if (data.studentScope === 'created') next.set('scope', 'created');
      else if (data.studentScope?.startsWith('branch:')) next.set('branch_id', data.studentScope.slice(7));
      for (const key of ['search', 'status', 'course_type', 'province', 'city', 'created_date']) {
        if (data[key]) next.set(key, data[key]);
      }
      if (this.registrationType) next.set('registration_type', this.registrationType);
      if (this.groupBy) next.set('group', this.groupBy);
      const url = `/students${next.toString() ? `?${next}` : ''}`;
      window.history.replaceState(null, null, url);
      await this.refreshStudentTable(this.getStudentListParams(data), 1);
    };
    studentFilterForm?.addEventListener('submit', event => event.preventDefault());
    studentFilterForm?.querySelectorAll('select').forEach(field => field.addEventListener('change', applyStudentFilters));
    studentFilterForm?.elements.created_date?.addEventListener('change', applyStudentFilters);
    this.bindStudentTableEvents(studentFilterForm, applyStudentFilters);
    this.bindSummaryCardEvents(studentFilterForm, applyStudentFilters);
    this.bindRegistrationTabEvents(studentFilterForm);
    let studentFilterTimer;
    studentFilterForm?.elements.search?.addEventListener('input', () => { clearTimeout(studentFilterTimer); studentFilterTimer = setTimeout(applyStudentFilters, 350); });
    document.getElementById('clear-student-filters')?.addEventListener('click', async () => {
      studentFilterForm.reset();
      this.groupBy = '';
      this.registrationType = 'REGULAR';
      window.history.replaceState(null, null, '/students');
      await this.refreshStudentTable(this.getStudentListParams(Object.fromEntries(new FormData(studentFilterForm))), 1);
    });
    const newStudentBtn = document.getElementById('new-student-btn');
    if (newStudentBtn) {
      newStudentBtn.addEventListener('click', () => this.goToRegistrationPage());
    }

    const createFirstBtn = document.getElementById('create-first-student');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', () => this.goToRegistrationPage());
    }

    await this.mountStudentModalEvents();
    this.updateNotificationBadge();
    this.startAutomaticRefresh();
  }

  goToRegistrationPage() {
    this.openStudentModal();
  }

  getStudentListParams(formData) {
    const params = {};
    if (formData.studentScope === 'all') params.scope = 'all';
    else if (formData.studentScope === 'created') params.scope = 'created';
    else if (formData.studentScope?.startsWith('branch:')) params.branch_id = formData.studentScope.slice(7);
    for (const key of ['search', 'status', 'course_type', 'province', 'city', 'created_date']) {
      if (formData[key]) params[key] = formData[key];
    }
    if (this.registrationType) params.registration_type = this.registrationType;
    return params;
  }

  async refreshStudentTable(params, requestedPage = 1) {
    const container = document.getElementById('students-list-content');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    container.style.opacity = '0.55';

    try {
      const summaryParams = { ...params };
      delete summaryParams.status;
      delete summaryParams.registration_type;
      const [students, reservations, summaryStudents, summaryReservations] = await Promise.all([
        StudentService.getAllStudents(params),
        StudentService.getActiveReservations(params),
        StudentService.getAllStudents(summaryParams),
        params.status ? StudentService.getActiveReservations(summaryParams) : Promise.resolve(null),
      ]);
      const currentBranch = authService.getCurrentUser()?.branch || '';
      const orderedStudents = [...students].sort((first, second) => {
        if (this.groupBy === 'instructor') {
          return (first.instructorName || 'Sin instructor').localeCompare(second.instructorName || 'Sin instructor')
            || this.compareStudentsByCreationDate(first, second);
        }
        return (first.branch === currentBranch ? 0 : 1) - (second.branch === currentBranch ? 0 : 1)
          || (first.branch || '').localeCompare(second.branch || '')
          || this.compareStudentsByCreationDate(first, second);
      });
      const pageSize = 10;
      const showingReservations = params.status === 'reservado';
      this.visibleReservations = reservations;
      const displayedRecords = showingReservations ? reservations : orderedStudents;
      const totalPages = Math.max(Math.ceil(displayedRecords.length / pageSize), 1);
      const page = Math.min(Math.max(Number(requestedPage) || 1, 1), totalPages);
      const pagedStudents = orderedStudents.slice((page - 1) * pageSize, page * pageSize);
      const pagedReservations = reservations.slice((page - 1) * pageSize, page * pageSize);
      const statusSelect = document.querySelector('#student-filter-form [name="status"]');
      const statusOptions = Array.from(statusSelect?.options || [])
        .map(option => `<option value="${option.value}" ${option.selected ? 'selected' : ''}>${option.textContent}</option>`)
        .join('');

      document.getElementById('students-result-count').textContent = this.getResultCountLabel(displayedRecords.length, showingReservations);
      document.getElementById('students-list-title').textContent = showingReservations ? 'Cupos reservados' : 'Estudiantes registrados';
      document.getElementById('students-list-description').textContent = showingReservations
        ? 'Personas con un lugar protegido que todavía no tienen matrícula.'
        : 'Selecciona una fila para abrir el expediente.';
      const summary = document.getElementById('students-summary');
      if (summary) summary.innerHTML = this.renderStudentSummary(summaryStudents || orderedStudents, summaryReservations || reservations, params.status || '');
      const registrationTabs = document.getElementById('student-registration-tabs');
      if (registrationTabs) registrationTabs.innerHTML = this.renderRegistrationTabs(summaryStudents || orderedStudents, this.registrationType);
      container.innerHTML = displayedRecords.length ? `
        <div class="card-body">
          <div class="students-table ${showingReservations ? 'students-table--reservations' : 'students-table--with-created-date'}">
            <div class="table-head"><div class="table-row">
              ${showingReservations ? `<div class="table-cell">Nombre</div><div class="table-cell">Cédula / teléfono</div><div class="table-cell">Instructor</div><div class="table-cell">Curso</div><div class="table-cell">Fecha de inicio</div><div class="table-cell">Horario</div><div class="table-cell">Estado</div><div class="table-cell">Acción</div>` : `<div class="table-cell">Nombre</div><div class="table-cell">Cédula</div>
              <div class="table-cell">Inscrito por</div>
              <div class="table-cell">Sucursal</div>
              <div class="table-cell"><button type="button" class="btn btn-link" id="group-by-instructor-btn" style="padding:0;font-size:inherit;">Instructor</button>${this.groupBy === 'instructor' ? '<span class="badge badge-secondary">Agrupado</span>' : ''}</div>
              <div class="table-cell">Fecha de creación</div>
              <div class="table-cell table-status-filter"><span>Estado</span><select id="student-status-column-filter" aria-label="Filtrar la columna Estado" title="Filtrar por estado">${statusOptions}</select></div>`}
            </div></div>
            <div class="table-body">${showingReservations ? this.renderReservationRows(pagedReservations) : this.renderStudentRows(pagedStudents)}</div>
          </div>
        </div>
        <div class="student-pagination">
          <span>Página ${page} de ${totalPages}</span><div>
            <button type="button" class="btn btn-secondary" data-page="${Math.max(page - 1, 1)}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
            <button type="button" class="btn btn-primary" data-page="${Math.min(page + 1, totalPages)}" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>` : `<div class="card-body" style="text-align:center;padding:3rem;"><p style="color:var(--gray-500);margin-bottom:1rem;">${showingReservations ? 'No hay cupos reservados que coincidan con los filtros seleccionados' : 'No hay estudiantes que coincidan con los filtros seleccionados'}</p>${showingReservations ? '' : '<button class="btn btn-primary" id="create-first-student">Registrar estudiante</button>'}</div>`;

      this.listParams = { ...params };
      this.studentsSnapshot = this.createSnapshot(orderedStudents);
      this.reservationsSnapshot = this.createReservationsSnapshot(summaryReservations || reservations);
      this.bindStudentTableEvents(document.getElementById('student-filter-form'), async () => {
        const form = document.getElementById('student-filter-form');
        const data = Object.fromEntries(new FormData(form));
        const next = new URLSearchParams();
        if (data.studentScope === 'all') next.set('scope', 'all');
        else if (data.studentScope === 'created') next.set('scope', 'created');
        else if (data.studentScope?.startsWith('branch:')) next.set('branch_id', data.studentScope.slice(7));
        for (const key of ['search', 'status', 'course_type', 'province', 'city', 'created_date']) if (data[key]) next.set(key, data[key]);
        if (this.registrationType) next.set('registration_type', this.registrationType);
        if (this.groupBy) next.set('group', this.groupBy);
        window.history.replaceState(null, null, `/students${next.toString() ? `?${next}` : ''}`);
        await this.refreshStudentTable(this.getStudentListParams(data), 1);
      });
      this.bindSummaryCardEvents(document.getElementById('student-filter-form'));
      this.bindRegistrationTabEvents(document.getElementById('student-filter-form'));
    } catch (error) {
      console.error('No se pudo filtrar el listado de estudiantes:', error);
      container.innerHTML = '<div class="card-body"><div class="alert alert-danger">No se pudo actualizar la tabla. Inténtalo nuevamente.</div></div>';
    } finally {
      container.removeAttribute('aria-busy');
      container.style.opacity = '';
    }
  }

  bindStudentTableEvents(studentFilterForm, applyStudentFilters) {
    document.getElementById('student-status-column-filter')?.addEventListener('change', event => {
      studentFilterForm.elements.status.value = event.target.value;
      applyStudentFilters();
    });
    document.querySelectorAll('.table-row[data-student-id]').forEach(row => {
      row.addEventListener('click', () => {
        window.history.pushState(null, null, `/student-profile/${row.dataset.studentId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
    document.querySelectorAll('.student-pagination button[data-page]').forEach(button => {
      button.addEventListener('click', async event => {
        const page = Number(event.currentTarget.dataset.page) || 1;
        const next = new URLSearchParams(window.location.search);
        if (page > 1) next.set('page', String(page)); else next.delete('page');
        window.history.replaceState(null, null, `/students${next.toString() ? `?${next}` : ''}`);
        const data = Object.fromEntries(new FormData(studentFilterForm));
        await this.refreshStudentTable(this.getStudentListParams(data), page);
      });
    });
    document.getElementById('group-by-instructor-btn')?.addEventListener('click', async () => {
      this.groupBy = this.groupBy === 'instructor' ? '' : 'instructor';
      const next = new URLSearchParams(window.location.search);
      if (this.groupBy) next.set('group', this.groupBy); else next.delete('group');
      next.delete('page');
      window.history.replaceState(null, null, `/students${next.toString() ? `?${next}` : ''}`);
      const data = Object.fromEntries(new FormData(studentFilterForm));
      await this.refreshStudentTable(this.getStudentListParams(data), 1);
    });
    document.getElementById('create-first-student')?.addEventListener('click', () => this.openStudentModal());
    document.querySelectorAll('[data-activate-reservation]').forEach(button => {
      button.addEventListener('click', () => {
        const reservation = (this.visibleReservations || []).find(item => String(item.id) === button.dataset.activateReservation);
        if (reservation) this.openReservationActivation(reservation);
      });
    });
  }

  bindSummaryCardEvents(studentFilterForm, applyStudentFilters = null) {
    if (!studentFilterForm) return;
    document.querySelectorAll('.student-summary-card[data-status]').forEach(card => {
      card.addEventListener('click', async () => {
        studentFilterForm.elements.status.value = card.dataset.status || '';
        if (applyStudentFilters) {
          await applyStudentFilters();
          return;
        }
        const data = Object.fromEntries(new FormData(studentFilterForm));
        const next = new URLSearchParams(window.location.search);
        next.delete('page');
        if (data.status) next.set('status', data.status); else next.delete('status');
        window.history.replaceState(null, null, `/students${next.toString() ? `?${next}` : ''}`);
        await this.refreshStudentTable(this.getStudentListParams(data), 1);
      });
    });
  }

  renderRegistrationTabs(students = [], activeType = 'REGULAR') {
    const types = [
      ['REGULAR', 'Curso normal'],
      ['ADDITIONAL_PRACTICE', 'Prácticas adicionales'],
      ['LICENSE_RENEWAL', 'Renovación de licencia'],
    ];
    return types.map(([value, label]) => {
      const count = students.filter(student => String(student.registrationType || student.registration_type || 'REGULAR').toUpperCase() === value).length;
      const active = activeType === value;
      return `<button type="button" class="student-registration-tab ${active ? 'is-active' : ''}" data-registration-type="${value}" aria-pressed="${active}">${label}<b>${count}</b></button>`;
    }).join('');
  }

  bindRegistrationTabEvents(studentFilterForm) {
    if (!studentFilterForm) return;
    document.querySelectorAll('.student-registration-tab[data-registration-type]').forEach(button => {
      button.addEventListener('click', async () => {
        const nextType = button.dataset.registrationType || 'REGULAR';
        if (nextType === this.registrationType) return;
        this.registrationType = nextType;
        studentFilterForm.elements.status.value = '';
        const next = new URLSearchParams(window.location.search);
        next.set('registration_type', nextType);
        next.delete('status');
        next.delete('page');
        window.history.replaceState(null, null, `/students?${next}`);
        await this.refreshStudentTable(
          this.getStudentListParams(Object.fromEntries(new FormData(studentFilterForm))),
          1,
        );
      });
    });
  }

  async renderStudentModal(pageMode = false) {
    const schedules = await this.getSchedulesForModal();
    const canRegisterPayment = authService.can('PAYMENT_CREATE');
    const paymentMethods = canRegisterPayment ? await PaymentService.getAvailableMethods(authService.getCurrentUser()?.branch_id || '') : [];
    const paymentOptions = paymentMethods.map(method => `<option value="${method.code}" data-requires-reference="${method.requires_reference ? 'true' : 'false'}">${method.name}</option>`).join('');
    const observationsField = (extraClass = '') => `
      <div class="form-group registration-observations-field ${extraClass}"${extraClass.includes('renewal-observations-field') ? ' hidden' : ''}>
        <label class="form-label">Observaciones <small>(opcional)</small></label>
        <textarea class="form-textarea" name="notes" rows="3" maxlength="500" placeholder="Ejemplo: detalle especial, referencia interna o novedad del registro."></textarea>
        <div class="form-error"></div>
      </div>
    `;
    return `
      <div class="modal-overlay student-modal-overlay" id="student-modal-overlay" aria-hidden="true">
        <div class="modal student-modal" role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
          <div class="modal-header">
            <div>
              <h2 class="modal-title" id="student-modal-title">Nuevo Estudiante</h2>
            </div>
            <button type="button" class="modal-close" id="student-modal-close" aria-label="${pageMode ? 'Volver a estudiantes' : 'Cerrar'}">${pageMode ? '←' : '&times;'}</button>
          </div>
          <form id="student-modal-form" class="form" novalidate onsubmit="return false;">
            <div class="modal-body student-modal-body">
              <div class="student-modal-steps" role="tablist" aria-label="Pasos del registro" style="--student-modal-step-count: ${canRegisterPayment ? 4 : 3}">
                <button type="button" class="student-modal-step-tab active" data-step="1">1. Horario</button>
                <button type="button" class="student-modal-step-tab" data-step="2">2. Datos</button>
                <button type="button" class="student-modal-step-tab" data-step="3">3. Documentos</button>
                ${canRegisterPayment ? '<button type="button" class="student-modal-step-tab" data-step="4">4. Pago</button>' : ''}
              </div>

              <section class="student-modal-step" data-step="2">
                <fieldset class="student-registration-types">
                  <legend>¿Qué desea registrar?</legend>
                  <label class="student-registration-type is-selected"><input type="radio" name="registrationMode" value="regular" checked><span class="student-registration-type__check"></span><span><strong>Curso de conducción</strong><small>Matrícula normal con documentos y horarios.</small></span></label>
                  <label class="student-registration-type"><input type="radio" name="registrationMode" value="additional-practice"><span class="student-registration-type__check"></span><span><strong>Horas prácticas</strong><small>Para personas que ya tienen licencia.</small></span></label>
                  <label class="student-registration-type"><input type="radio" name="registrationMode" value="license-renewal"><span class="student-registration-type__check"></span><span><strong>Examen para renovación</strong><small>Solo datos, sin documentos ni horario.</small></span></label>
                  <input type="checkbox" name="additionalPractice" id="additional-practice-toggle" hidden>
                </fieldset>
                <div class="student-modal-section-title">
                  <h3>Datos del estudiante</h3>
                </div>

                <div id="additional-practice-cedula-slot" class="form-row additional-practice-only" hidden></div>

                <div class="form-row" id="student-name-row">
                  <div class="form-group">
                    <label class="form-label required">Nombre</label>
                    <input type="text" class="form-input" name="firstName" placeholder="Juan" required>
                    <div class="form-error"></div>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Apellido</label>
                    <input type="text" class="form-input" name="lastName" placeholder="Pérez" required>
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="form-row" id="student-identity-row">
                  <div class="form-group" id="student-cedula-group">
                    <label class="form-label required">Cédula</label>
                    <input type="text" class="form-input" name="cedula" placeholder="1234567890" required>
                    <div class="form-error"></div>
                    <small id="additional-practice-person-status" class="additional-practice-only" hidden></small>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Fecha de Nacimiento</label>
                    <input type="date" class="form-input" name="birthDate" required>
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" name="email" placeholder="juan@example.com">
                    <div class="form-error"></div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Teléfono</label>
                    <input type="tel" class="form-input" name="phone" placeholder="+1234567890">
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Dirección</label>
                  <textarea class="form-textarea" name="address" placeholder="Calle, número, ciudad..."></textarea>
                  <div class="form-error"></div>
                </div>

                <div class="registration-session-branch" id="registration-session-branch" hidden>
                  <div><small>Sucursal seleccionada</small><strong id="registration-session-branch-name"></strong></div>
                  <button type="button" class="btn btn-light" id="change-registration-branch">Cambiar</button>
                </div>

                <div class="form-row" id="registration-location-row">
                  <div class="form-group">
                    <label class="form-label required">Provincia</label>
                    <select class="form-select" name="province" id="modal-province-select" required>
                      <option value="">Cargando provincias...</option>
                    </select>
                    <div class="form-error"></div>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Cantón</label>
                    <select class="form-select" name="city_id" id="modal-city-select" required>
                      <option value="">Seleccionar cantón...</option>
                    </select>
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="form-row" id="registration-branch-row">
                  <div class="form-group" id="modal-branch-field">
                    <label class="form-label required">Sucursal</label>
                    <select class="form-select" name="branch" id="modal-branch-select" required disabled>
                      <option value="">Seleccionar sucursal...</option>
                    </select>
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="form-row regular-enrollment-only renewal-hidden" id="regular-course-fields">
                  <div class="form-group">
                    <label class="form-label required">Tipo de sangre</label>
                    <select class="form-select" name="bloodType" required>
                      <option value="">Seleccionar...</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                    <div class="form-error"></div>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Curso</label>
                  <select class="form-select" name="course_id" id="modal-course-select" required disabled>
                    <option value="">Seleccione primero una sucursal...</option>
                  </select>
                    <div class="form-error"></div>
                  </div>
                </div>

                <div class="staff-referral-field regular-enrollment-only renewal-hidden">
                  <label class="form-label" for="student-referrer-search">Referido por <small>(opcional)</small></label>
                  <div class="staff-referral-search">
                    <input type="search" class="form-input" id="student-referrer-search" autocomplete="off" placeholder="Buscar personal por nombre...">
                    <input type="hidden" name="referredByUserId" id="student-referrer-id">
                    <div class="staff-referral-results" id="student-referrer-results" hidden></div>
                  </div>
                  <div class="staff-referral-selected" id="student-referrer-selected" hidden></div>
                </div>
                ${observationsField('renewal-observations-field')}
              </section>

              <section class="student-modal-step" data-step="3">
                <div class="student-modal-section-title regular-enrollment-only">
                  <h3>Documentos del estudiante</h3>
                </div>

                <div class="registration-document-options regular-enrollment-only">
                  <label class="registration-document-field">
                    <span class="form-label">Cédula y carnet de la Cruz Roja en una sola hoja <small>(opcional)</small></span>
                    <input type="file" class="form-input" name="registrationDocumentsPdfFile" accept=".pdf,application/pdf">
                  </label>
                  <span class="registration-document-divider">o</span>
                  <button type="button" class="btn btn-primary" id="mobile-registration-package-capture">
                    Capturar documentos desde telefono
                  </button>
                  <input type="hidden" name="registrationDocumentsMobileFileUrl">
                  <input type="hidden" name="registrationDocumentsMobileIncludesBloodCard">
                  <input type="hidden" name="certificadoBachillerMobileFileUrl">
                </div>
                <small class="registration-document-saved-status" id="registration-documents-status"></small>

                <label class="registration-document-field registration-certificate-field regular-enrollment-only">
                  <span class="form-label">Certificado de estudio <small>(opcional)</small></span>
                  <input type="file" class="form-input" name="certificadoBachillerFile" accept=".pdf,.jpg,.jpeg,.png">
                  <small class="registration-certificate-help">
                    Si es titulo de bachiller, puede generarlo
                    <a href="https://servicios.educacion.gob.ec/titulacion25-web/faces/paginas/consulta-titulos-refrendados.xhtml" target="_blank" rel="noopener noreferrer">aqui</a>.
                  </small>
                </label>

                <div class="student-document-grid regular-enrollment-only">
                  ${this.renderTwoSideDocumentUpload('cedula', 'Cédula de Identidad')}
                  ${this.renderTwoSideDocumentUpload('bloodTypeCard', 'Carnet de Tipo de Sangre')}
                  ${this.renderDocumentUpload('certificadoBachillerFile', 'Certificado de estudio', 'PDF, JPG o PNG')}
                </div>
                <div class="form-error" id="cedula-scan-error"></div>
                <div class="form-error" id="blood-type-card-error"></div>
                <div class="additional-practice-only additional-practice-documents" hidden>
                  <div class="alert alert-info" style="display:flex"><div class="alert-content" id="additional-practice-document-help">Busca primero a la persona para conocer los documentos requeridos.</div></div>
                  <span class="form-label required">Documento</span>
                  <div class="registration-document-options">
                    <label class="registration-document-field">
                      <input type="file" class="form-input" name="additionalPracticeDocumentsFile" accept=".pdf,application/pdf,image/jpeg,image/png" capture="environment">
                    </label>
                    <span class="registration-document-divider">o</span>
                    <button type="button" class="btn btn-primary" id="mobile-additional-practice-capture">Capturar desde tel&eacute;fono</button>
                  </div>
                  <input type="hidden" name="additionalPracticeMobileFileUrl">
                  <small class="registration-document-saved-status" id="additional-practice-documents-status"></small>
                  <div class="form-error" id="additional-practice-document-error"></div>
                </div>
              </section>

              <section class="student-modal-step active" data-step="1">
                <div class="student-modal-section-title regular-enrollment-only">
                  <h3>Horario de pr&aacute;cticas</h3>
                </div>

                <div class="regular-enrollment-only schedule-workflow">
                <input type="hidden" name="practicalMode" id="selected-practical-mode" value="classes">
                <div class="schedule-setup-grid">
                <section class="schedule-workflow-card" id="advanced-start-card" aria-labelledby="advanced-start-title">
                <div class="schedule-workflow-heading">
                  <span class="schedule-workflow-step">1</span>
                  <div><h4 id="advanced-start-title">Inicio anticipado</h4></div>
                </div>
                <div class="schedule-preferences-grid">
                <div class="form-group referred-instructor-field" hidden>
                  <label class="form-label" id="preferred-instructor-label">Instructor solicitado <small>(opcional)</small></label>
                  <select class="form-select" name="preferredInstructorId" id="preferred-instructor-select" disabled>
                    <option value="">Asignación automática</option>
                  </select>
                  <button type="button" class="btn btn-light" id="toggle-canton-instructors" hidden>Ver otros instructores del cantón</button>
                </div>
                <div class="advanced-practical-start">
                  <label class="advanced-practical-start-toggle" for="advanced-practical-start-enabled">
                    <input type="checkbox" name="advancedPracticalStartEnabled" id="advanced-practical-start-enabled">
                    <span><strong>Activar inicio anticipado</strong></span>
                  </label>
                  <div class="advanced-practical-start-fields" id="advanced-practical-start-fields" hidden>
                    <label class="form-label" for="practical-start-date">Fecha deseada</label>
                    <input class="form-input" type="date" name="practicalStartDate" id="practical-start-date">
                    <small>El calendario se actualizar&aacute; con la disponibilidad real desde esta fecha.</small>
                    <input type="hidden" name="practicalStartReason" value="Inicio anticipado solicitado durante la matr&iacute;cula">
                  </div>
                </div>
                </div>
                </section>
                <section class="schedule-workflow-card schedule-workflow-card--calendar" aria-labelledby="practice-schedule-title">
                <div class="schedule-workflow-heading schedule-workflow-heading--calendar">
                  <span class="schedule-workflow-step">2</span>
                  <div><h4 id="practice-schedule-title">Fecha y horario</h4><p id="practice-schedule-help">Selecciona una hora disponible. Para el Curso de formación intensiva, pulsa dos veces sobre una celda.</p></div>
                </div>
                ${this.renderScheduleModalitySelector()}
                </section>
                </div>
                <div class="schedule-calendar-fullwidth">
                <div class="practical-schedule-panel">
                <div id="student-schedule-calendar">
                  ${this.renderScheduleCalendar(schedules)}
                </div>
                </div>
                <input type="hidden" name="scheduleId" id="selected-schedule-id">
                <input type="hidden" name="schedulePlan" id="selected-schedule-plan">
                <div class="schedule-selection-summary is-empty" id="schedule-selection-summary" aria-live="polite">
                  <span class="schedule-selection-summary-icon">&#10003;</span>
                  <div><small>Selecci&oacute;n actual</small><strong>A&uacute;n no has elegido un horario</strong></div>
                </div>
                <label class="late-pickup-notice" id="late-pickup-notice" hidden>
                  <input type="checkbox" name="latePickupConfirmed">
                  <span><strong>Punto de encuentro: Flavio Reyes</strong>El horario de las 20:00 s&iacute; est&aacute; disponible. Confirma que informaste al estudiante que el instructor lo recoger&aacute; en la sucursal Flavio Reyes.</span>
                </label>
                <div class="form-error" id="schedule-error"></div>
                </div>
                <section class="schedule-workflow-card schedule-workflow-card--theory" aria-labelledby="theory-schedule-title">
                <div class="schedule-workflow-heading">
                  <span class="schedule-workflow-step">4</span>
                  <div><h4 id="theory-schedule-title">Horario de teor&iacute;a</h4><p>Escoge la modalidad te&oacute;rica del estudiante.</p></div>
                </div>
                <div class="theory-schedule-panel">
                  <div class="enrollment-modality-selector theory-schedule-selector">${this.renderTheoryScheduleOptions()}</div>
                </div>
                <div class="form-error" id="theory-schedule-error"></div>
                </section>
                </div>
                <div class="additional-practice-only additional-practice-schedule" hidden>
                  <div class="student-modal-section-title"><h3>Programar prácticas adicionales</h3></div>
                  <div class="form-row">
                    <div class="form-group"><label class="form-label required">Instructor</label><select class="form-select" name="additionalPracticeInstructor"><option value="">Seleccionar instructor...</option></select><div class="form-error" id="additional-practice-instructor-error"></div></div>
                    <div class="form-group"><label class="form-label required">Fecha de inicio</label><input type="date" class="form-input" name="additionalPracticeStartDate"><div class="form-error" id="additional-practice-date-error"></div></div>
                  </div>
                  <div class="form-row">
                    <div class="form-group"><label class="form-label required">Horario diario</label><select class="form-select" name="additionalPracticeTime"><option value="">Seleccionar horario...</option>${[['06:00','07:40'],['08:00','09:40'],['10:00','11:40'],['12:00','13:40'],['14:00','15:40'],['16:00','17:40'],['18:00','19:40'],['20:00','21:40']].map(([start,end]) => `<option value="${start}">${start} – ${end}</option>`).join('')}</select><div class="form-error" id="additional-practice-time-error"></div></div>
                    <div class="form-group"><label class="form-label required">Duración</label><select class="form-select" name="additionalPracticeDays"><option value="">Seleccionar...</option>${[3,4,5,6,7,8].map(days => `<option value="${days}">${days} días</option>`).join('')}</select></div>
                  </div>
                  <div class="form-row additional-practice-price-row">
                    <div class="additional-practice-price-card"><span>Total de la práctica</span><strong id="additional-practice-total">$0,00</strong><small id="additional-practice-rate">La tarifa se calcula según el historial.</small></div>
                  </div>
                  <div id="additional-practice-availability" class="additional-practice-availability" hidden></div>
                </div>
                ${canRegisterPayment ? '' : observationsField()}
              </section>

              ${canRegisterPayment ? `
                <section class="student-modal-step" data-step="4">
                  <div class="student-modal-section-title regular-enrollment-only">
                    <h3>Registrar pago</h3>
                  </div>
                  <div class="student-modal-section-title additional-practice-only" hidden><h3>Pago de prácticas</h3></div>

                  <label class="payment-registration-toggle">
                    <input type="checkbox" name="collectPayment" id="student-collect-payment" checked>
                    <span>
                      <strong>Registrar un pago ahora</strong>
                    </span>
                  </label>

                  <div id="student-payment-fields">
                    <div class="form-row">
                      <div class="form-group regular-enrollment-only">
                        <label class="form-label">Descuento ($)</label>
                        <input type="number" class="form-input" name="discountAmount" min="0" step="0.01" value="0" placeholder="0.00">
                        <div class="form-error" id="payment-discount-error"></div>
                      </div>
                      <div class="form-group">
                        <label class="form-label required">Valor recibido</label>
                        <input type="number" class="form-input" name="paymentAmount" min="0.01" step="0.01" placeholder="0.00">
                        <div class="form-error" id="payment-amount-error"></div>
                      </div>
                      <div class="form-group">
                        <label class="form-label required">Forma de pago</label>
                        <select class="form-select" name="paymentMethod">
                          <option value="">Seleccionar...</option>
                          ${paymentOptions}
                        </select>
                        <div class="form-error" id="payment-method-error"></div>
                      </div>
                    </div>
                    <div class="payment-registration-summary regular-enrollment-only" id="payment-registration-summary">
                      Selecciona un curso para calcular el valor final.
                    </div>
                    <div class="form-group">
                      <label class="form-label" id="payment-reference-label">Referencia</label>
                      <input class="form-input" name="paymentReference" placeholder="Número de comprobante o referencia">
                      <div class="form-error" id="payment-reference-error"></div>
                    </div>
                  </div>
                  ${observationsField()}
                </section>
              ` : ''}

              <div id="student-modal-alert" class="alert" style="display: none;"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="student-modal-back" style="display: none;">Anterior</button>
              <button type="button" class="btn btn-secondary" id="student-modal-cancel">Cancelar</button>
              <button type="button" class="btn btn-primary" id="student-modal-next">Siguiente</button>
              <button type="submit" class="btn btn-primary" id="student-modal-submit" style="display: none;">${canRegisterPayment ? 'Completar registro' : 'Registrar Estudiante'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async mountStudentModalEvents() {
    const form = document.getElementById('student-modal-form');
    const provinceSelect = document.getElementById('modal-province-select');
    const citySelect = document.getElementById('modal-city-select');
    const branchSelect = document.getElementById('modal-branch-select');
    this.prepareScheduleFirstLayout();

    // Se conecta antes de cualquier await para impedir que el navegador haga
    // un envío HTML tradicional y cierre el modal si una carga inicial tarda.
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await this.handleStudentSubmit(event);
      } catch (error) {
        console.error('Error inesperado al registrar estudiante:', error);
        this.showModalAlert('error', error?.message || 'Ocurrió un error inesperado. El estudiante no fue registrado.');
        this.restoreSubmitButton(document.getElementById('student-modal-submit'));
      }
    });

    // Deben funcionar inmediatamente: la carga de provincias/cantones puede
    // tardar o fallar, pero no debe dejar el formulario sin forma de cerrarse.
    const closeButton = document.getElementById('student-modal-close');
    const cancelButton = document.getElementById('student-modal-cancel');
    
    // Remover listeners anteriores antes de agregar nuevos
    if (closeButton && !closeButton.dataset.listenerAttached) {
      closeButton.addEventListener('click', () => this.closeStudentModal());
      closeButton.dataset.listenerAttached = 'true';
    }
    if (cancelButton && !cancelButton.dataset.listenerAttached) {
      cancelButton.addEventListener('click', () => this.closeStudentModal());
      cancelButton.dataset.listenerAttached = 'true';
    }

    await this.loadModalLocations(provinceSelect, citySelect, branchSelect);

    document.getElementById('student-collect-payment')?.addEventListener('change', event => {
      const fields = document.getElementById('student-payment-fields');
      if (fields) fields.style.display = event.target.checked ? 'block' : 'none';
    });
    document.getElementById('additional-practice-toggle')?.addEventListener('change', event => this.toggleAdditionalPracticeMode(event.target.checked));
    form?.querySelectorAll('[name="registrationMode"]').forEach(input => input.addEventListener('change', event => this.setRegistrationMode(event.target.value)));
    form?.querySelectorAll('[data-practical-mode]').forEach(button => button.addEventListener('click', () => this.setPracticalMode(button.dataset.practicalMode)));
    const referrerSearch = document.getElementById('student-referrer-search');
    referrerSearch?.addEventListener('input', event => this.scheduleReferralStaffSearch(event.target.value));
    referrerSearch?.addEventListener('focus', event => {
      if (event.target.value.trim().length >= 2) this.scheduleReferralStaffSearch(event.target.value, 0);
    });
    document.getElementById('student-referrer-results')?.addEventListener('mousedown', event => {
      const option = event.target.closest('[data-referrer-id]');
      if (!option) return;
      event.preventDefault();
      this.selectReferralStaff(option.dataset.referrerId);
    });
    document.getElementById('student-referrer-selected')?.addEventListener('click', event => {
      if (event.target.closest('[data-clear-referrer]')) this.clearReferralStaff();
    });
    form?.querySelector('[name="cedula"]')?.addEventListener('input', event => {
      if (form.querySelector('[name="additionalPractice"]')?.checked) this.scheduleAdditionalPracticeResolution(event.target.value);
    });
    form?.querySelector('[name="additionalPracticeDays"]')?.addEventListener('change', () => this.updateAdditionalPracticePrice());
    ['additionalPracticeInstructor','additionalPracticeStartDate','additionalPracticeTime','additionalPracticeDays'].forEach(name => {
      form?.querySelector(`[name="${name}"]`)?.addEventListener('change', () => this.scheduleAdditionalPracticeAvailability());
    });

    const nextButton = document.getElementById('student-modal-next');
    const backButton = document.getElementById('student-modal-back');
    
    if (nextButton && !nextButton.dataset.listenerAttached) {
      nextButton.addEventListener('click', () => this.goToNextModalStep());
      nextButton.dataset.listenerAttached = 'true';
    }
    if (backButton && !backButton.dataset.listenerAttached) {
      backButton.addEventListener('click', () => this.goToPreviousModalStep());
      backButton.dataset.listenerAttached = 'true';
    }
    
    document.querySelectorAll('.student-modal-step-tab').forEach(tab => {
      if (!tab.dataset.listenerAttached) {
        tab.addEventListener('click', () => this.goToModalStep(Number(tab.dataset.step)));
        tab.dataset.listenerAttached = 'true';
      }
    });
    document.querySelectorAll('.schedule-option').forEach(option => this.bindScheduleOptionInteraction(option));
    document.getElementById('student-schedule-calendar')?.addEventListener('click', async event => {
      const availabilityToggle = event.target.closest('[data-instructor-availability-toggle]');
      if (availabilityToggle) {
        await this.toggleInstructorAvailabilityStart();
        return;
      }
      const instructorButton = event.target.closest('[data-course-instructor-id]');
      if (!instructorButton) return;
      const branchId = document.getElementById('modal-branch-select')?.selectedOptions?.[0]?.dataset?.branchId;
      if (!branchId || instructorButton.disabled) return;
      const instructorId = instructorButton.dataset.courseInstructorId || null;
      const preferredSelect = document.getElementById('preferred-instructor-select');
      if (preferredSelect && instructorId && [...preferredSelect.options].some(option => option.value === instructorId)) {
        preferredSelect.value = instructorId;
      } else if (preferredSelect && !instructorId) {
        preferredSelect.value = '';
      }
      this.useInstructorFirstAvailability = false;
      this.instructorFirstAvailabilityDate = null;
      const advancedToggle = document.getElementById('advanced-practical-start-enabled');
      const practicalDate = document.getElementById('practical-start-date');
      if (advancedToggle) advancedToggle.checked = false;
      if (practicalDate) practicalDate.value = '';
      await this.reloadModalSchedules(branchId, instructorId, null);
    });
    document.querySelectorAll('.enrollment-modality-button[data-modality]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.enrollment-modality-button[data-modality]').forEach(item => {
          item.classList.toggle('active', item === button);
          item.setAttribute('aria-pressed', String(item === button));
        });
        document.getElementById('selected-enrollment-modality').value = button.dataset.modality;
        document.querySelectorAll('.enrollment-calendar').forEach(calendar => this.resetCalendarSelection(calendar));
        this.syncScheduleOptions();
      });
    });
    this.bindTheoryScheduleOptions();
    document.querySelectorAll('.schedule-rotation-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const calendar = toggle.closest('.enrollment-calendar');
        const enabled = !toggle.classList.contains('active');
        this.resetCalendarSelection(calendar);
        toggle.classList.toggle('active', enabled);
        toggle.setAttribute('aria-pressed', String(enabled));
        this.syncRotationState(calendar);
      });
    });
    document.querySelectorAll('.calendar-window-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.shiftCalendarWindow(button.closest('.enrollment-calendar'), Number(button.dataset.direction));
      });
    });
    document.querySelectorAll('.course-cycle-btn').forEach(button => {
      button.addEventListener('click', () => this.shiftEnrollmentCycle(button, Number(button.dataset.cycleDirection)));
    });
    document.getElementById('mobile-registration-package-capture')?.addEventListener('click', () => this.openRegistrationMobileCapturePackage());
    document.getElementById('mobile-additional-practice-capture')?.addEventListener('click', () => this.openRegistrationMobileCapturePackage({ additionalPractice: true }));
    form?.querySelector('[name="registrationDocumentsPdfFile"]')?.addEventListener('change', event => {
      if (!event.target.files?.[0]) return;
      const file = event.target.files[0];
      if (file.size > 9 * 1024 * 1024) {
        event.target.value = '';
        const error = document.getElementById('cedula-scan-error');
        if (error) error.textContent = 'El PDF no puede superar 9 MB. Comprímelo o captura los documentos desde el teléfono.';
        return;
      }
      const mobileInput = form.querySelector('[name="registrationDocumentsMobileFileUrl"]');
      if (mobileInput) mobileInput.value = '';
      const certificateMobileInput = form.querySelector('[name="certificadoBachillerMobileFileUrl"]');
      if (certificateMobileInput) certificateMobileInput.value = '';
      const status = document.getElementById('registration-documents-status');
      if (status) status.textContent = '';
    });
    form?.querySelector('[name="additionalPracticeDocumentsFile"]')?.addEventListener('change', event => {
      if (!event.target.files?.[0]) return;
      const mobileInput = form.querySelector('[name="additionalPracticeMobileFileUrl"]');
      if (mobileInput) mobileInput.value = '';
      const status = document.getElementById('additional-practice-documents-status');
      if (status) status.textContent = '';
    });
    document.querySelectorAll('.enrollment-calendar').forEach(calendar => this.updateCalendarWindow(calendar));
    form?.querySelector('[name="course_id"]')?.addEventListener('change', async () => {
      this.updateRegistrationPaymentSummary();
      this.useInstructorFirstAvailability = false;
      this.instructorFirstAvailabilityDate = null;
      this.renderModalReferredInstructorOptions();
      const branchId = branchSelect?.selectedOptions?.[0]?.dataset?.branchId;
      if (branchId) await this.reloadModalSchedules(branchId);
      this.syncScheduleOptions();
    });
    form?.querySelector('[name="discountAmount"]')?.addEventListener('input', () => this.updateRegistrationPaymentSummary());
    form?.querySelector('[name="preferredInstructorId"]')?.addEventListener('change', async event => {
      this.scheduleInstructorFilterId = event.target.value || null;
      const branchId = branchSelect?.selectedOptions?.[0]?.dataset?.branchId;
      this.useInstructorFirstAvailability = false;
      this.instructorFirstAvailabilityDate = null;
      const toggle = document.getElementById('advanced-practical-start-enabled');
      const date = document.getElementById('practical-start-date');
      if (toggle) toggle.checked = false;
      if (date) date.value = '';
      if (branchId) await this.reloadModalSchedules(branchId, event.target.value || null, null);
    });
    document.getElementById('toggle-canton-instructors')?.addEventListener('click', () => {
      this.showCantonReferralInstructors = !this.showCantonReferralInstructors;
      this.renderModalReferredInstructorOptions();
    });
    const advancedStartToggle = document.getElementById('advanced-practical-start-enabled');
    const advancedStartFields = document.getElementById('advanced-practical-start-fields');
    const practicalStartInput = document.getElementById('practical-start-date');
    if (practicalStartInput) {
      const now = new Date();
      practicalStartInput.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    advancedStartToggle?.addEventListener('change', async event => {
      if (advancedStartFields) advancedStartFields.hidden = !event.target.checked;
      if (!event.target.checked && practicalStartInput) practicalStartInput.value = '';
      const branchId = branchSelect?.selectedOptions?.[0]?.dataset?.branchId;
      if (branchId) await this.reloadModalSchedules(branchId);
    });
    practicalStartInput?.addEventListener('change', async () => {
      if (!advancedStartToggle?.checked) return;
      const branchId = branchSelect?.selectedOptions?.[0]?.dataset?.branchId;
      if (branchId) await this.reloadModalSchedules(branchId);
    });
  }

  prepareScheduleFirstLayout() {
    const scheduleStep = document.querySelector('.student-modal-step[data-step="1"]');
    const scheduleWorkflow = scheduleStep?.querySelector('.schedule-workflow');
    if (!scheduleStep || !scheduleWorkflow) return;
    const firstStepFields = [
      document.querySelector('.student-registration-types'),
      document.getElementById('registration-session-branch'),
      document.getElementById('registration-location-row'),
      document.getElementById('registration-branch-row'),
    ].filter(Boolean);
    firstStepFields.forEach(element => scheduleStep.insertBefore(element, scheduleWorkflow));
    const courseSelect = document.getElementById('modal-course-select');
    const courseGroup = courseSelect?.closest('.form-group');
    if (courseGroup && !document.getElementById('schedule-course-row')) {
      const courseRow = document.createElement('div');
      courseRow.id = 'schedule-course-row';
      courseRow.className = 'form-row regular-enrollment-only renewal-hidden';
      courseRow.appendChild(courseGroup);
      scheduleStep.insertBefore(courseRow, scheduleWorkflow);
    }
  }

  async prepareInstructorAvailabilityWindow(instructorId) {
    const toggle = document.getElementById('advanced-practical-start-enabled');
    const fields = document.getElementById('advanced-practical-start-fields');
    const input = document.getElementById('practical-start-date');
    if (!toggle || !fields || !input) return null;
    if (!instructorId) {
      toggle.checked = false;
      fields.hidden = true;
      input.value = '';
      return null;
    }
    const form = document.getElementById('student-modal-form');
    const branchId = form?.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId;
    const courseId = form?.querySelector('[name="course_id"]')?.value;
    if (!branchId || !courseId) return null;
    try {
      const result = await ApiService.getInstructorFirstAvailability({ branch_id: branchId, course_id: courseId, instructor_id: instructorId, modality: 'normal' });
      const availability = result.data || null;
      toggle.checked = Boolean(availability?.advanced);
      fields.hidden = !availability?.advanced;
      input.value = availability?.advanced ? availability.date : '';
      return availability;
    } catch (error) {
      console.warn('No se pudo calcular la primera disponibilidad del instructor:', error.message);
      toggle.checked = false;
      fields.hidden = true;
      input.value = '';
      return null;
    }
  }

  async toggleInstructorAvailabilityStart() {
    // Simplemente toggle el estado para mostrar/ocultar la disponibilidad
    this.useInstructorFirstAvailability = !this.useInstructorFirstAvailability;
    
    const instructorId = this.scheduleInstructorFilterId || document.getElementById('preferred-instructor-select')?.value;
    const branchId = document.getElementById('modal-branch-select')?.selectedOptions?.[0]?.dataset?.branchId;
    
    // Si no hay instructor o rama seleccionados, solo actualizar la UI
    if (!instructorId || !branchId) {
      return;
    }
    
    const toggle = document.getElementById('advanced-practical-start-enabled');
    const dateInput = document.getElementById('practical-start-date');
    
    if (!this.useInstructorFirstAvailability) {
      this.instructorFirstAvailabilityDate = null;
      if (toggle) toggle.checked = false;
      if (dateInput) dateInput.value = '';
      await this.reloadModalSchedules(branchId, instructorId, null);
      return;
    }
    
    const availability = await this.prepareInstructorAvailabilityWindow(instructorId);
    if (!availability?.available) {
      this.useInstructorFirstAvailability = false;
      this.instructorFirstAvailabilityDate = null;
      if (toggle) toggle.checked = false;
      if (dateInput) dateInput.value = '';
      const error = document.getElementById('schedule-error');
      if (error) error.textContent = 'Este instructor no tiene una fecha libre anterior al inicio oficial del curso.';
      await this.reloadModalSchedules(branchId, instructorId, null);
      return;
    }
    this.instructorFirstAvailabilityDate = availability?.date || null;
    if (toggle) toggle.checked = Boolean(availability?.date);
    if (dateInput) dateInput.value = availability?.date || '';
    await this.reloadModalSchedules(branchId, instructorId, availability?.date || null);
  }

  async toggleAdditionalPracticeMode(enabled) {
    const form = document.getElementById('student-modal-form');
    this.additionalPracticeStudent = null;
    this.additionalPracticeResolved = false;
    document.querySelectorAll('.regular-enrollment-only').forEach(element => { element.hidden = enabled; });
    document.querySelectorAll('.additional-practice-only').forEach(element => { element.hidden = !enabled; });
    const cedulaGroup = document.getElementById('student-cedula-group');
    const cedulaSlot = document.getElementById('additional-practice-cedula-slot');
    const identityRow = document.getElementById('student-identity-row');
    if (cedulaGroup) {
      if (enabled && cedulaSlot) cedulaSlot.appendChild(cedulaGroup);
      if (!enabled && identityRow) identityRow.insertBefore(cedulaGroup, identityRow.firstChild);
    }
    form?.querySelectorAll('#regular-course-fields select, .regular-enrollment-only input, .regular-enrollment-only select').forEach(field => {
      field.disabled = enabled;
    });
    const title = document.getElementById('student-modal-title');
    if (title) title.textContent = enabled ? 'Registrar prácticas adicionales' : 'Nuevo Estudiante';
    const submit = document.getElementById('student-modal-submit');
    if (submit) submit.textContent = enabled ? 'Registrar prácticas' : (authService.can('PAYMENT_CREATE') ? 'Completar registro' : 'Registrar Estudiante');
    if (enabled) {
      const instructors = await StudentService.getInstructors();
      const select = form?.querySelector('[name="additionalPracticeInstructor"]');
      if (select) select.innerHTML = '<option value="">Seleccionar instructor...</option>' + instructors.map(item => `<option value="${item.id}">${String(item.name || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</option>`).join('');
      const date = form?.querySelector('[name="additionalPracticeStartDate"]');
      if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
      const currentCedula = form?.querySelector('[name="cedula"]')?.value;
      if (currentCedula) this.scheduleAdditionalPracticeResolution(currentCedula);
    }
    this.updateAdditionalPracticePrice();
  }

  async setRegistrationMode(mode = 'regular') {
    const form = document.getElementById('student-modal-form');
    const isAdditionalPractice = mode === 'additional-practice';
    const isRenewal = mode === 'license-renewal';
    const toggle = document.getElementById('additional-practice-toggle');
    if (toggle) toggle.checked = isAdditionalPractice;
    await this.toggleAdditionalPracticeMode(isAdditionalPractice);
    document.querySelectorAll('.student-registration-type').forEach(card => card.classList.toggle('is-selected', card.querySelector('input')?.checked));
    document.querySelectorAll('.renewal-hidden').forEach(element => { element.hidden = isRenewal || isAdditionalPractice; });
    document.querySelectorAll('.renewal-observations-field').forEach(element => { element.hidden = !isRenewal; });
    document.querySelectorAll('.registration-observations-field:not(.renewal-observations-field)').forEach(element => { element.hidden = isRenewal; });
    document.querySelectorAll('.student-modal-step-tab').forEach(tab => { tab.hidden = isRenewal && Number(tab.dataset.step) !== 2; });
    form?.querySelectorAll('.renewal-hidden input, .renewal-hidden select, .renewal-hidden textarea').forEach(field => { field.disabled = isRenewal || isAdditionalPractice; });
    const title = document.getElementById('student-modal-title');
    if (title) title.textContent = isRenewal ? 'Registrar renovación de licencia' : (isAdditionalPractice ? 'Registrar prácticas adicionales' : 'Nuevo Estudiante');
    document.querySelector('.student-modal-steps')?.classList.toggle('renewal-mode', isRenewal);
    this.goToModalStep(isRenewal ? 2 : 1);
  }

  scheduleAdditionalPracticeResolution(value) {
    clearTimeout(this.additionalPracticeLookupTimer);
    const identification = String(value || '').replace(/\D/g, '');
    this.additionalPracticeResolved = false;
    this.additionalPracticeStudent = null;
    const form = document.getElementById('student-modal-form');
    if (this.resolvedAdditionalPracticeIdentification && identification !== this.resolvedAdditionalPracticeIdentification) {
      ['firstName','lastName','birthDate','email','phone','address'].forEach(name => {
        const input = form?.querySelector(`[name="${name}"]`);
        if (input) { input.readOnly = false; input.value = ''; }
      });
      this.resolvedAdditionalPracticeIdentification = '';
    }
    const status = document.getElementById('additional-practice-person-status');
    if (status) {
      status.className = 'additional-practice-only';
      status.textContent = identification.length ? 'Escribe la cédula completa para verificarla.' : '';
    }
    if (identification.length !== 10) return;
    this.additionalPracticeLookupTimer = setTimeout(() => this.resolveAdditionalPracticeStudent(identification), 350);
  }

  async resolveAdditionalPracticeStudent(value = '') {
    const form = document.getElementById('student-modal-form');
    const identification = String(value || form?.querySelector('[name="cedula"]')?.value || '').replace(/\D/g, '');
    const status = document.getElementById('additional-practice-person-status');
    if (identification.length < 8) { if (status) status.textContent = 'Ingresa una cédula válida.'; return; }
    if (status) status.textContent = 'Verificando cédula...';
    const result = await StudentService.resolveAdditionalPracticeStudent(identification);
    if (!result.success) { if (status) status.textContent = result.error || 'No se pudo realizar la búsqueda.'; return; }
    this.additionalPracticeStudent = result.data;
    this.additionalPracticeResolved = true;
    this.resolvedAdditionalPracticeIdentification = identification;
    const fields = result.data ? {
      cedula: result.data.cedula, firstName: result.data.firstName, lastName: result.data.lastName,
      birthDate: result.data.birthDate?.slice?.(0, 10), email: result.data.email,
      phone: result.data.phone, address: result.data.address,
    } : { cedula: identification };
    Object.entries(fields).forEach(([name, value]) => { const input = form?.querySelector(`[name="${name}"]`); if (input && value != null) input.value = value; });
    form?.querySelectorAll('[name="firstName"],[name="lastName"],[name="birthDate"],[name="email"],[name="phone"],[name="address"]').forEach(input => { input.readOnly = Boolean(result.data); });
    if (status) {
      status.className = result.data ? 'additional-practice-person-found' : 'additional-practice-person-new';
      status.textContent = result.data
        ? 'Este usuario ya fue estudiante de la escuela. Sus datos se completaron automáticamente.'
        : 'Esta persona no consta como estudiante. Se creará un nuevo registro al continuar.';
    }
    const help = document.getElementById('additional-practice-document-help');
    if (help) help.textContent = result.data
      ? 'Estudiante registrado: adjunta únicamente su licencia en PDF.'
      : 'Persona externa: adjunta cédula y licencia juntas en un único PDF.';
    this.updateAdditionalPracticePrice();
  }

  updateAdditionalPracticePrice() {
    const form = document.getElementById('student-modal-form');
    const days = Number(form?.querySelector('[name="additionalPracticeDays"]')?.value || 0);
    const former = Boolean(this.additionalPracticeStudent?.former_student);
    const rate = former ? 17 : 20;
    const total = days === 8 ? 136 : days * rate;
    const totalNode = document.getElementById('additional-practice-total');
    const rateNode = document.getElementById('additional-practice-rate');
    if (totalNode) totalNode.textContent = `$${total.toFixed(2).replace('.', ',')}`;
    if (rateNode) rateNode.textContent = days === 8 ? 'Paquete fijo de 8 días para todos.' : `${former ? 'Exestudiante' : 'Persona externa'}: $${rate} por día.`;
    const payment = form?.querySelector('[name="paymentAmount"]');
    if (payment && days) payment.value = total.toFixed(2);
  }

  updateRegistrationPaymentSummary() {
    const form = document.getElementById('student-modal-form');
    const courseOption = form?.querySelector('[name="course_id"]')?.selectedOptions?.[0];
    const price = Number(courseOption?.dataset?.price || 0);
    const isCarCourse = courseOption?.dataset?.courseType === 'carro';
    const minimumFinalAmount = isCarCourse ? 175 : 0;
    const maximumDiscount = Math.max(price - minimumFinalAmount, 0);
    const discountInput = form?.querySelector('[name="discountAmount"]');
    const discount = Math.max(Number(discountInput?.value || 0), 0);
    const summary = document.getElementById('payment-registration-summary');
    if (discountInput) discountInput.max = String(maximumDiscount);
    if (!summary) return;
    if (!price) {
      summary.textContent = 'Selecciona un curso para calcular el valor final.';
      return;
    }
    summary.innerHTML = `Valor del curso: <strong>$${price.toFixed(2)}</strong> · Descuento: <strong>$${Math.min(discount, maximumDiscount).toFixed(2)}</strong> · Total final: <strong>$${Math.max(price - discount, minimumFinalAmount).toFixed(2)}</strong>${isCarCourse ? ' · Mínimo permitido: <strong>$175.00</strong>' : ''}`;
  }

  scheduleAdditionalPracticeAvailability() {
    clearTimeout(this.additionalPracticeAvailabilityTimer);
    this.additionalPracticeAvailabilityTimer = setTimeout(() => this.checkAdditionalPracticeAvailability(), 250);
  }

  async checkAdditionalPracticeAvailability() {
    const form = document.getElementById('student-modal-form');
    const instructorId = form?.querySelector('[name="additionalPracticeInstructor"]')?.value;
    const startDate = form?.querySelector('[name="additionalPracticeStartDate"]')?.value;
    const dailyTime = form?.querySelector('[name="additionalPracticeTime"]')?.value;
    const days = form?.querySelector('[name="additionalPracticeDays"]')?.value;
    const box = document.getElementById('additional-practice-availability');
    if (!box) return;
    if (!instructorId || !startDate || !dailyTime || !days) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'additional-practice-availability checking';
    box.textContent = 'Comprobando disponibilidad del instructor...';
    const result = await StudentService.checkAdditionalPracticeAvailability({
      instructor_id: instructorId, start_date: startDate, daily_start_time: dailyTime,
      number_of_days: days, branch_id: form.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId || authService.getCurrentUser()?.branch_id,
    });
    if (!result.success) { box.className = 'additional-practice-availability unavailable'; box.textContent = result.error || 'No se pudo comprobar la disponibilidad.'; return; }
    const data = result.data;
    if (data.available) {
      box.className = 'additional-practice-availability available';
      box.textContent = `${data.instructor_name || 'El instructor'} está disponible desde el ${this.formatPracticeDate(startDate)} en el horario seleccionado.`;
      return;
    }
    box.className = 'additional-practice-availability unavailable';
    const instructorName = data.instructor_name || 'El instructor';
    const alternativeName = data.alternative_instructor?.name;
    box.textContent = `${instructorName} está ocupado. Estará disponible desde el ${this.formatPracticeDate(data.available_from)}.${alternativeName ? ` Puedes escoger a ${alternativeName} para conservar la fecha y el horario.` : ''}`;

    const actions = document.createElement('div');
    actions.className = 'additional-practice-availability-actions';
    if (data.alternative_instructor?.id) {
      const useAlternative = document.createElement('button');
      useAlternative.type = 'button';
      useAlternative.className = 'btn btn-small btn-secondary';
      useAlternative.textContent = `Usar a ${alternativeName}`;
      useAlternative.addEventListener('click', () => {
        const instructorSelect = form.querySelector('[name="additionalPracticeInstructor"]');
        if (!instructorSelect) return;
        instructorSelect.value = data.alternative_instructor.id;
        instructorSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      actions.appendChild(useAlternative);
    }

    if (data.available_from) {
      const keepInstructor = document.createElement('button');
      keepInstructor.type = 'button';
      keepInstructor.className = 'btn btn-small btn-primary';
      keepInstructor.textContent = `Mantener a ${instructorName} y cambiar fecha`;
      keepInstructor.addEventListener('click', () => {
        const dateInput = form.querySelector('[name="additionalPracticeStartDate"]');
        if (!dateInput) return;
        dateInput.value = data.available_from;
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      actions.appendChild(keepInstructor);
    }
    box.appendChild(actions);
  }

  formatPracticeDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('es-EC', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  renderDocumentUpload(inputName, title, helpText) {
    return `
      <label class="student-document-upload">
        <span class="document-upload-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </span>
        <span class="document-upload-title">${title}</span>
        <span class="document-upload-help">${helpText}</span>
        <input type="file" name="${inputName}" accept=".pdf,.jpg,.jpeg,.png">
      </label>
    `;
  }

  renderTwoSideDocumentUpload(prefix, title) {
    return `
      <div class="student-document-upload cedula-scan-upload">
        <span class="document-upload-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            <line x1="7" y1="9" x2="17" y2="9"></line>
            <line x1="7" y1="13" x2="13" y2="13"></line>
          </svg>
        </span>
        <span class="document-upload-title">${title}</span>
        <span class="document-upload-help">Sube el PDF listo o genera uno con frontal y reverso</span>
        <label class="cedula-side-upload">
          PDF ya generado
          <input type="file" name="${prefix}PdfFile" accept=".pdf">
        </label>
        <span class="cedula-upload-divider">o generar desde imágenes</span>
        <label class="cedula-side-upload">
          Frontal
          <input type="file" name="${prefix}FrontFile" accept=".jpg,.jpeg,.png">
        </label>
        <label class="cedula-side-upload">
          Reverso
          <input type="file" name="${prefix}BackFile" accept=".jpg,.jpeg,.png">
        </label>
      </div>
    `;
  }

  renderScheduleOption(schedule) {
    if (!schedule) {
      return '<div class="enrollment-calendar-empty-cell"></div>';
    }
    if (schedule.empty) {
      return `<div class="enrollment-calendar-empty-cell" data-day-index="${schedule.dayIndex ?? ''}"></div>`;
    }

    const dateCapacity = schedule.availabilityByDate?.[schedule.date] || {};
    const available = Number(dateCapacity.available ?? schedule.available);
    const normalAvailable = Number(schedule.available ?? available);
    const capacity = Number(dateCapacity.capacity ?? schedule.capacity);
    const examCount = Number(dateCapacity.examCount || 0);
    const disabled = available <= 0;
    // En el registro solo se presentan opciones utilizables. Las horas sin
    // cupo permanecen fuera de la vista para reducir ruido y errores.
    if (disabled) return `<div class="enrollment-calendar-empty-cell" data-day-index="${schedule.dayIndex ?? ''}" aria-label="Horario no disponible"></div>`;
    const normalDisabled = normalAvailable <= 0;
    const courseKey = this.getScheduleCourseKey(schedule.course);
    const schedulePayload = JSON.stringify({
      id: schedule.id,
      time: schedule.time,
      date: schedule.date,
      dayLabel: schedule.dayLabel,
      dayIndex: schedule.dayIndex,
      cycleId: schedule.cycleId,
      course: courseKey,
    }).replace(/"/g, '&quot;');
    return `
      <button type="button"
        class="schedule-option ${examCount ? 'has-exam' : ''} ${normalDisabled ? 'normal-slot-unavailable' : ''}"
        data-course="${courseKey}"
        data-schedule="${schedulePayload}"
        data-schedule-id="${schedule.id}"
        data-time="${schedule.time}"
        data-date="${schedule.date || ''}"
        data-day-index="${schedule.dayIndex ?? ''}"
        data-normal-available="${normalAvailable}"
        data-daily-available="${available}"
        data-normal-disabled="${normalDisabled}"
        ${normalDisabled ? 'disabled aria-hidden="true"' : ''}>
        <span class="schedule-option-status available">Disponible</span>
        ${examCount ? `<span class="schedule-option-exams">Intensivo ${examCount}/2</span>` : ''}
        <span class="schedule-option-capacity">${normalAvailable} ${normalAvailable === 1 ? 'cupo disponible' : 'cupos disponibles'}</span>
      </button>
    `;
  }

  renderScheduleModalitySelector() {
    return `
      <div class="enrollment-modality-selector" role="group" aria-label="Tipo de horario">
        <button type="button" class="enrollment-modality-button active" data-modality="normal" aria-pressed="true">
          <strong>Horario normal</strong>
        </button>
        <button type="button" class="enrollment-modality-button" data-modality="intensivo" aria-pressed="false">
          <strong>Horario intensivo</strong>
        </button>
      </div>
      <input type="hidden" id="selected-enrollment-modality" value="normal">
    `;
  }

  renderScheduleCalendar(schedules) {
    const groupedByCourse = schedules.reduce((groups, schedule) => {
      const courseKey = this.getScheduleCourseKey(schedule.course);
      if (!groups[courseKey]) groups[courseKey] = [];
      groups[courseKey].push(schedule);
      return groups;
    }, {});

    const order = ['carro', 'moto'];
    return `
      <div class="enrollment-calendar-stack">
        ${order.flatMap(courseKey => ['normal', 'intensivo'].map(modality =>
          this.renderCourseCalendar(courseKey, groupedByCourse[courseKey] || [], modality)
        )).join('')}
      </div>
    `;
  }

  renderCourseCalendar(courseKey, schedules, modality = 'normal') {
    const title = courseKey === 'moto' ? 'Moto' : 'Automovil';
    schedules = schedules.filter(schedule => (schedule.modality || 'normal') === modality);
    if (!schedules.length) {
      return `
        <div class="enrollment-calendar" data-course="${courseKey}" data-modality="${modality}" style="display: none;">
          <div class="schedule-empty">No hay un curso ${modality} próximo de ${title.toLowerCase()} para inscripción.</div>
        </div>
      `;
    }

    const cycles = [];
    const cycleMap = new Map();
    for (const schedule of schedules) {
      const cycleKey = schedule.cycleId || schedule.day;
      if (!cycleMap.has(cycleKey)) {
        cycleMap.set(cycleKey, {
          key: cycleKey,
          label: schedule.day,
          detail: schedule.cycleLabel || schedule.course,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          officialStartDate: schedule.officialStartDate,
          officialEndDate: schedule.officialEndDate,
          practicalStartAdvanced: schedule.practicalStartAdvanced,
          durationBusinessDays: schedule.durationBusinessDays,
          instructors: schedule.instructors || [],
        });
        cycles.push(cycleMap.get(cycleKey));
      }
    }

    cycles.sort((first, second) => String(first.startDate || first.label).localeCompare(String(second.startDate || second.label)));
    const firstAvailableCycleIndex = cycles.findIndex(cycle => schedules.some(schedule =>
      (schedule.cycleId || schedule.day) === cycle.key
      && Number(schedule.capacity) > 0
      && Number(schedule.available) > 0
    ));
    const activeCycleIndex = firstAvailableCycleIndex >= 0 ? firstAvailableCycleIndex : 0;

    return `
      <div class="enrollment-cycle-set" data-course="${courseKey}" data-modality="${modality}" data-active-cycle-index="${activeCycleIndex}">
        ${cycles.map((cycle, cycleIndex) => this.renderEnrollmentCycleCalendar({
          courseKey,
          modality,
          title,
          schedules,
          cycle,
          cycleIndex,
          cycleCount: cycles.length,
          activeCycleIndex,
        })).join('')}
      </div>
    `;
  }

  renderEnrollmentCycleCalendar({ courseKey, modality, title, schedules, cycle, cycleIndex, cycleCount, activeCycleIndex }) {
    // No se filtran las filas con capacidad cero: cuando se consulta un
    // instructor concreto también debemos mostrar sus bloques ocupados o no
    // habilitados, no solo los que aún tienen cupo.
    const cycleSchedules = schedules.filter(item =>
      (item.cycleId || item.day) === cycle.key
    );
    const times = [...new Set(cycleSchedules.map(schedule => schedule.time))]
      .filter(time => cycleSchedules
        .filter(schedule => schedule.time === time)
        .some(schedule => Object.values(schedule.availabilityByDate || {})
          .some(availability => Number(availability?.available || 0) > 0)))
      .sort((first, second) => first.localeCompare(second));
    const days = this.getCourseBusinessDays(cycle.startDate, cycle.endDate, courseKey, modality);

    return `
      <div class="enrollment-calendar" data-course="${courseKey}" data-modality="${modality}" data-cycle-index="${cycleIndex}" data-day-window-start="0" data-day-count="${days.length}" data-required-classes="${Number(cycle.durationBusinessDays) || days.length}" style="display: ${cycleIndex === activeCycleIndex ? 'block' : 'none'};">
        <div class="enrollment-calendar-head">
          <div>
            <strong>${title} · ${modality === 'intensivo' ? 'Intensivo' : 'Normal'} · ${cycle.detail || ''}</strong>
            <span>${cycle.practicalStartAdvanced ? 'Pr&aacute;cticas anticipadas' : 'Inicio'} ${cycle.startDate || cycle.label} · hasta ${cycle.endDate || 'fin del curso'}</span>
            ${cycle.practicalStartAdvanced ? `<span class="advanced-practical-start-official">Curso oficial: ${cycle.officialStartDate}</span>` : ''}
          </div>
          <div class="calendar-toolbar">
            <div class="course-cycle-controls" aria-label="Cambiar curso próximo">
              <button type="button" class="course-cycle-btn" data-cycle-direction="-1" ${cycleIndex === 0 ? 'disabled' : ''}>Anterior</button>
              <span>Curso ${cycleIndex + 1}${cycleCount > 1 ? ` de ${cycleCount}` : ''}</span>
              <button type="button" class="course-cycle-btn" data-cycle-direction="1" data-load-next="${cycleIndex === cycleCount - 1 ? 'true' : 'false'}">Próximo</button>
            </div>
            <button type="button" class="schedule-rotation-toggle" aria-pressed="false" data-course="${courseKey}">
              <span class="schedule-rotation-switch" aria-hidden="true"></span>
              <span>Horario rotativo</span>
            </button>
          </div>
        </div>
        ${cycle.instructors.length ? `
          <div class="enrollment-cycle-instructors">
            <strong>Instructores de este curso (${cycle.instructors.length})</strong>
            <div class="course-instructor-filters" role="group" aria-label="Filtrar disponibilidad por instructor">
              <button type="button" class="course-instructor-chip ${!this.scheduleInstructorFilterId ? 'active' : ''}" data-course-instructor-id="">Todos</button>
              ${cycle.instructors.map(instructor => `<button type="button" class="course-instructor-chip ${String(this.scheduleInstructorFilterId || '') === String(instructor.id) ? 'active' : ''}" data-course-instructor-id="${escapeHtml(instructor.id)}">${escapeHtml(instructor.name)}</button>`).join('')}
              <button type="button" class="instructor-availability-start-toggle ${this.useInstructorFirstAvailability ? 'active' : ''}" data-instructor-availability-toggle aria-pressed="${Boolean(this.useInstructorFirstAvailability)}">
                <span class="instructor-availability-dot"></span>
                ${this.useInstructorFirstAvailability ? `Desde disponibilidad${this.instructorFirstAvailabilityDate ? ` · ${DateHelper.format(this.instructorFirstAvailabilityDate, 'DD/MM/YYYY')}` : ''}` : 'Cuando inicia el curso'}
              </button>
            </div>
          </div>
        ` : ''}
        <div class="schedule-instructor-preview" aria-live="polite" hidden></div>
        <div class="schedule-rotation-message" hidden>Puedes variar el horario por día y tomar dos bloques consecutivos. Para guardar ahora selecciona mínimo <strong>${Math.ceil((Number(cycle.durationBusinessDays) || days.length) / 2)} clases</strong>; podrás completar hasta ${Number(cycle.durationBusinessDays) || days.length}. Se permiten máximo cuatro días con horario doble. <span class="schedule-selection-count">0/${Number(cycle.durationBusinessDays) || days.length} seleccionadas</span></div>
        <nav class="calendar-window-controls" aria-label="Navegar entre los días del curso">
          <button type="button" class="calendar-window-btn" data-direction="-1" aria-label="Mostrar días anteriores">
            <span aria-hidden="true">&#8592;</span><span>D&iacute;as anteriores</span>
          </button>
          <span class="calendar-window-label" aria-live="polite"></span>
          <button type="button" class="calendar-window-btn" data-direction="1" aria-label="Mostrar días siguientes">
            <span>D&iacute;as siguientes</span><span aria-hidden="true">&#8594;</span>
          </button>
        </nav>
        <div class="enrollment-calendar-grid" style="--cycle-count: ${Math.min(days.length, 5)};">
            <div class="enrollment-calendar-heading">Hora</div>
            ${days.map((day, dayIndex) => {
              const hasAssignedExam = cycleSchedules.some(schedule =>
                Number(schedule.availabilityByDate?.[day.date]?.examCount || 0) > 0
              );
              return `
              <div class="enrollment-calendar-heading ${hasAssignedExam ? 'exam-day' : ''}" data-day-index="${dayIndex}">
                <strong>${day.name}</strong>
                <span>${day.label}</span>
                ${hasAssignedExam ? '<small class="calendar-exam-badge">Intensivo</small>' : ''}
              </div>
            `}).join('')}
            ${times.map(time => {
              const rowSchedule = cycleSchedules.find(item => item.time === time);
              const normalRowUnavailable = !rowSchedule || Number(rowSchedule.available) <= 0;
              return `
              <div class="enrollment-calendar-row ${normalRowUnavailable ? 'normal-row-unavailable' : ''}">
              <div class="enrollment-calendar-time">${time}</div>
              ${days.map((day, dayIndex) => {
                const schedule = rowSchedule;
                const isAvailableThatDay = schedule && Object.prototype.hasOwnProperty.call(schedule.availabilityByDate || {}, day.date);
                return this.renderScheduleOption(isAvailableThatDay
                  ? { ...schedule, date: day.date, dayLabel: day.name, dayIndex, examDay: day.isExamDay }
                  : { empty: true, dayIndex });
              }).join('')}
              </div>
            `}).join('')}
        </div>
      </div>
    `;
  }

  async openRegistrationMobileCapturePackage(options = {}) {
    const isAdditionalPractice = Boolean(options.additionalPractice);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active mobile-registration-capture-overlay';
    overlay.innerHTML = `
      <div class="modal mobile-capture-modal">
        <div class="modal-header">
          <h3 class="modal-title">Capturar desde telefono</h3>
          <button type="button" class="modal-close" data-close-capture>&times;</button>
        </div>
        <div class="modal-body">
          <p>Generando enlace temporal...</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let timer = null;
    let previewObjectUrl = null;
    let certificatePreviewObjectUrl = null;
    let receivedFileUrl = '';
    const close = () => {
      if (timer) window.clearInterval(timer);
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      if (certificatePreviewObjectUrl) URL.revokeObjectURL(certificatePreviewObjectUrl);
      overlay.remove();
    };
    overlay.querySelector('[data-close-capture]')?.addEventListener('click', close);

    try {
      const captureType = isAdditionalPractice
        ? (this.additionalPracticeStudent ? 'practica_adicional_exestudiante' : 'practica_adicional_externo')
        : 'registro_documentos';
      const response = await ApiService.createMobileDocumentUploadToken({
        type: captureType,
        studentId: isAdditionalPractice ? (this.additionalPracticeStudent?.id || null) : undefined,
      });
      if (!response.success) throw new Error(response.error || 'No se pudo crear el enlace.');

      const token = response.data;
      const previousResult = await ApiService.getMobileDocumentUploadResult(token.token);
      const previousCaptureTime = previousResult.data?.usedAt || null;
      const localOrigin = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const uploadUrl = localOrigin && token.localUploadUrl
        ? token.localUploadUrl
        : `${window.location.origin}/mobile-upload/${token.token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(uploadUrl)}`;

      overlay.innerHTML = `
        <div class="modal mobile-capture-modal">
          <div class="modal-header">
            <h3 class="modal-title">Capturar desde telefono</h3>
            <button type="button" class="modal-close" data-close-capture>&times;</button>
          </div>
          <div class="modal-body">
            <div class="mobile-capture-content">
              <div class="mobile-capture-qr">
                <img src="${qrUrl}" alt="QR para capturar documento">
              </div>
              <div class="mobile-capture-instructions">
                <strong>${token.documentName || 'Cedula y carnet de la Cruz Roja'}</strong>
                <span>${isAdditionalPractice ? 'Escanea el QR con el tel&eacute;fono para tomar las fotos.' : 'Este QR sirve para todos los estudiantes durante la jornada.'}</span>
                ${isAdditionalPractice ? `<p>${this.additionalPracticeStudent
                  ? 'Fotograf&iacute;a el frente y reverso de la licencia. El sistema los convertir&aacute; en un solo PDF.'
                  : 'Fotograf&iacute;a el frente y reverso de la c&eacute;dula y de la licencia. El sistema organizar&aacute; las cuatro fotos en un solo PDF.'}</p>` : ''}
                ${isAdditionalPractice ? '' : '<p>Escan&eacute;alo una sola vez. Captura la c&eacute;dula y el carnet. Si el estudiante trae el certificado de estudio, tambi&eacute;n puedes fotografiarlo o seleccionar su PDF.</p>'}
                <small id="registration-mobile-capture-status">Esperando captura desde el telefono...</small>
                <div id="registration-mobile-capture-preview" class="mobile-capture-preview" hidden></div>
              </div>
            </div>
          </div>
          <div class="modal-footer" data-capture-footer>
            <button type="button" class="btn btn-secondary" data-close-capture>Cerrar</button>
          </div>
        </div>
      `;
      overlay.querySelectorAll('[data-close-capture]').forEach(button => button.addEventListener('click', close));

      timer = window.setInterval(async () => {
        try {
          const result = await ApiService.getMobileDocumentUploadResult(token.token);
          if (!result.success || !result.data?.completed || result.data.usedAt === previousCaptureTime) return;
          window.clearInterval(timer);
          timer = null;
          receivedFileUrl = result.data.fileUrl;
          previewObjectUrl = this.createObjectUrlFromDataUrl(receivedFileUrl);
          document.querySelectorAll('.student-document-upload').forEach(card => {
            const title = card.querySelector('.document-upload-title')?.textContent?.toLowerCase() || '';
            if (title.includes('cedula') || title.includes('cÃ©dula') || title.includes('certificado')) {
              card.classList.add('mobile-capture-ready');
            }
          });
          const status = overlay.querySelector('#registration-mobile-capture-status');
          if (status) status.textContent = 'PDF recibido. Revisalo y presiona Guardar PDF.';
          const preview = overlay.querySelector('#registration-mobile-capture-preview');
          if (preview) {
            const certificateUrl = result.data.certificateFileUrl
              ? this.createObjectUrlFromDataUrl(result.data.certificateFileUrl)
              : '';
            certificatePreviewObjectUrl = certificateUrl || null;
            preview.hidden = false;
            preview.innerHTML = `
              <div class="mobile-capture-received-file">
                <strong>C&eacute;dula y carnet: recibidos</strong>
                <iframe src="${previewObjectUrl}" title="PDF de c&eacute;dula y carnet recibido"></iframe>
                <a class="btn btn-small btn-secondary" href="${previewObjectUrl}" target="_blank" rel="noopener">Ver PDF</a>
              </div>
              <div class="mobile-capture-received-file">
                <strong>Certificado de estudio: ${certificateUrl ? 'recibido' : 'no adjuntado'}</strong>
                ${certificateUrl ? `
                  <iframe src="${certificateUrl}" title="PDF del certificado de estudio recibido"></iframe>
                  <a class="btn btn-small btn-secondary" href="${certificateUrl}" target="_blank" rel="noopener">Ver certificado</a>
                ` : '<small>Este documento es opcional.</small>'}
              </div>
            `;
          }
          const footer = overlay.querySelector('[data-capture-footer]');
          if (footer) {
            footer.innerHTML = `
              <button type="button" class="btn btn-secondary" data-close-capture>Cancelar</button>
              <button type="button" class="btn btn-primary" data-save-capture>Guardar PDF</button>
            `;
            footer.querySelector('[data-close-capture]')?.addEventListener('click', close);
            footer.querySelector('[data-save-capture]')?.addEventListener('click', () => {
              if (isAdditionalPractice) {
                const mobileInput = document.querySelector('#student-modal-form [name="additionalPracticeMobileFileUrl"]');
                if (mobileInput) mobileInput.value = receivedFileUrl;
                const fileInput = document.querySelector('#student-modal-form [name="additionalPracticeDocumentsFile"]');
                if (fileInput) fileInput.value = '';
                const savedStatus = document.getElementById('additional-practice-documents-status');
                if (savedStatus) savedStatus.textContent = 'PDF capturado y listo para guardar.';
                const captureButton = document.getElementById('mobile-additional-practice-capture');
                if (captureButton) captureButton.textContent = 'Reemplazar PDF desde teléfono';
                const documentError = document.getElementById('additional-practice-document-error');
                if (documentError) documentError.textContent = '';
                close();
                this.goToModalStep(3);
                return;
              }
              const documentsInput = document.querySelector('#student-modal-form [name="registrationDocumentsMobileFileUrl"]');
              if (documentsInput) documentsInput.value = receivedFileUrl;
              const includesBloodCardInput = document.querySelector('#student-modal-form [name="registrationDocumentsMobileIncludesBloodCard"]');
              if (includesBloodCardInput) includesBloodCardInput.value = result.data.includesBloodCard ? 'true' : 'false';
              const certificateInput = document.querySelector('#student-modal-form [name="certificadoBachillerMobileFileUrl"]');
              if (certificateInput) certificateInput.value = result.data.certificateFileUrl || '';
              const pdfInput = document.querySelector('#student-modal-form [name="registrationDocumentsPdfFile"]');
              if (pdfInput) pdfInput.value = '';
              const savedStatus = document.getElementById('registration-documents-status');
              if (savedStatus) savedStatus.textContent = 'PDF capturado y listo para guardar con el estudiante.';
              const captureButton = document.getElementById('mobile-registration-package-capture');
              if (captureButton) captureButton.textContent = 'Reemplazar PDF desde telefono';
              const documentError = document.getElementById('cedula-scan-error');
              if (documentError) documentError.textContent = '';
              close();
              this.goToModalStep(3);
            });
          }
        } catch (error) {
          const status = overlay.querySelector('#registration-mobile-capture-status');
          if (status) status.textContent = error.message || 'No se pudo consultar el estado.';
        }
      }, 2000);
    } catch (error) {
      const requiresLogin = error.status === 401
        || /token no proporcionado|token invalido|token expirado/i.test(error.message || '');
      overlay.innerHTML = `
        <div class="modal mobile-capture-modal">
          <div class="modal-header">
            <h3 class="modal-title">Capturar desde telefono</h3>
            <button type="button" class="modal-close" data-close-capture>&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-error">${requiresLogin
              ? 'La sesion no tiene acceso a la API o ha expirado. Cierra sesion, vuelve a ingresar e intenta generar el QR nuevamente.'
              : (error.message || 'No se pudo crear el enlace.')}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-close-capture>Cerrar</button>
          </div>
        </div>
      `;
      overlay.querySelectorAll('[data-close-capture]').forEach(button => button.addEventListener('click', close));
    }
  }

  async getSchedulesForModal(branchId = null, instructorId = null, practicalStartDate = null) {
    try {
      const branchFilter = {
        ...(branchId ? { branch_id: branchId } : {}),
        ...(instructorId ? { instructor_id: instructorId } : {}),
        ...(practicalStartDate ? { practical_start_date: practicalStartDate } : {}),
      };
      const results = await Promise.allSettled([
        ApiService.getCourseEnrollmentOptions({ ...branchFilter, vehicle_type: 'carro', modality: 'normal' }),
        ApiService.getCourseEnrollmentOptions({ ...branchFilter, vehicle_type: 'carro', modality: 'intensivo' }),
        ApiService.getCourseEnrollmentOptions({ ...branchFilter, vehicle_type: 'moto', modality: 'normal' }),
        ApiService.getCourseEnrollmentOptions({ ...branchFilter, vehicle_type: 'moto', modality: 'intensivo' }),
        ApiService.getTheoryEnrollmentOptions({ ...(branchId ? { branch_id: branchId } : {}) }),
      ]);
      const responses = results.map((result, index) => {
        if (result.status === 'fulfilled' && result.value?.success) return result.value;
        const reason = result.status === 'rejected' ? result.reason?.message : result.value?.error;
        console.warn(`No se pudo cargar la opción de inscripción ${index + 1}:`, reason || 'Respuesta inválida');
        return null;
      });
      const cycles=responses.slice(0,4).flatMap(result => result?.data || []);
      this.modalTheoryOptions=cycles[0]?.theoryOptions||{regular:true,saturday:true,virtual:true};
      this.modalTheoryGroups=responses[4]?.data||[];
      if (cycles.length) return this.flattenEnrollmentOptions(cycles);
    } catch (error) {
      console.warn('No se pudieron cargar opciones de cursos desde API:', error.message);
    }
    // Si se eligió una sucursal, nunca mostrar horarios de demostración o de otra sede.
    return branchId ? [] : ScheduleService.getAvailableSchedules();
  }

  async reloadModalSchedules(branchId, instructorId = null, practicalStartDate = null) {
    const host = document.getElementById('student-schedule-calendar');
    if (!host || !branchId) return;
    // Al cambiar de instructor se conserva toda la pantalla de inscripción.
    // Solo se refrescan las celdas de disponibilidad del calendario.
    host.setAttribute('aria-busy', 'true');
    host.querySelectorAll('.enrollment-calendar-grid').forEach(grid => grid.classList.add('is-refreshing'));
    const selectedInstructorId = instructorId ?? document.getElementById('preferred-instructor-select')?.value ?? null;
    this.scheduleInstructorFilterId = selectedInstructorId || null;
    const advancedEnabled = document.getElementById('advanced-practical-start-enabled')?.checked;
    const selectedPracticalStart = practicalStartDate ?? (advancedEnabled ? document.getElementById('practical-start-date')?.value : null);
    // Al filtrar por instructor conservamos todos los bloques del curso. La
    // consulta del instructor solo aporta su estado (libre/ocupado), evitando
    // que desaparezcan de la tabla las horas en las que no puede atender.
    let schedules = await this.getSchedulesForModal(branchId, selectedInstructorId || null, selectedPracticalStart || null);
    if (selectedInstructorId) {
      const allSchedules = await this.getSchedulesForModal(branchId, null, selectedPracticalStart || null);
      const selectedBySlot = new Map(schedules.map(schedule => [
        `${schedule.cycleId || schedule.day}|${schedule.time}`,
        schedule,
      ]));
      schedules = allSchedules.map(schedule => {
        const selected = selectedBySlot.get(`${schedule.cycleId || schedule.day}|${schedule.time}`);
        if (selected) return { ...schedule, ...selected, instructors: schedule.instructors || selected.instructors || [] };
        return { ...schedule, capacity: 0, available: 0, occupied: 0, availabilityByDate: {} };
      });
    }
    const nextCalendar = document.createElement('div');
    nextCalendar.innerHTML = this.renderScheduleCalendar(schedules);
    const currentGrids = [...host.querySelectorAll('.enrollment-calendar-grid')];
    const nextGrids = [...nextCalendar.querySelectorAll('.enrollment-calendar-grid')];
    const gridKey = grid => {
      const calendar = grid.closest('.enrollment-calendar');
      return `${calendar?.dataset.course || ''}|${calendar?.dataset.modality || ''}|${calendar?.dataset.cycleIndex || ''}`;
    };
    const nextGridByKey = new Map(nextGrids.map(grid => [gridKey(grid), grid]));
    const currentUsesAdvancedStart = Boolean(host.querySelector('.advanced-practical-start-official'));
    const nextUsesAdvancedStart = Boolean(nextCalendar.querySelector('.advanced-practical-start-official'));
    const canUpdateOnlyGrids = currentGrids.length > 0
      && currentGrids.length === nextGrids.length
      // Al cambiar entre el inicio oficial y la primera disponibilidad debe
      // reconstruirse también el encabezado (fecha inicial y curso oficial),
      // no únicamente las celdas del calendario.
      && currentUsesAdvancedStart === nextUsesAdvancedStart
      && currentGrids.every(grid => nextGridByKey.has(gridKey(grid)));

    if (canUpdateOnlyGrids) {
      currentGrids.forEach(grid => grid.replaceWith(nextGridByKey.get(gridKey(grid))));
      host.querySelectorAll('[data-course-instructor-id]').forEach(button => {
        const selected = String(button.dataset.courseInstructorId || '') === String(selectedInstructorId || '');
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      host.querySelectorAll('[data-instructor-availability-toggle]').forEach(button => {
        const enabled = Boolean(this.useInstructorFirstAvailability);
        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
        button.innerHTML = `<span class="instructor-availability-dot"></span>${enabled
          ? `Desde disponibilidad${this.instructorFirstAvailabilityDate ? ` · ${DateHelper.format(this.instructorFirstAvailabilityDate, 'DD/MM/YYYY')}` : ''}`
          : 'Cuando inicia el curso'}`;
      });
    } else {
      // Si cambia la estructura real de los cursos, se reconstruye únicamente
      // este panel; nunca el formulario completo ni las opciones de teoría.
      host.innerHTML = nextCalendar.innerHTML;
    }
    const form = document.getElementById('student-modal-form');
    if (form?.elements.scheduleId) form.elements.scheduleId.value = '';
    if (form?.elements.schedulePlan) form.elements.schedulePlan.value = '';
    host.querySelectorAll('.schedule-option').forEach(option => this.bindScheduleOptionInteraction(option));
    // Si se actualizó únicamente la tabla, estos controles siguen enlazados.
    // Solo se vuelven a enlazar si la estructura del calendario cambió.
    if (!canUpdateOnlyGrids) host.querySelectorAll('.enrollment-modality-button[data-modality]').forEach(button => button.addEventListener('click', () => {
      host.querySelectorAll('.enrollment-modality-button[data-modality]').forEach(item => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      const modality = host.querySelector('#selected-enrollment-modality');
      if (modality) modality.value = button.dataset.modality;
      host.querySelectorAll('.enrollment-calendar').forEach(calendar => this.resetCalendarSelection(calendar));
      this.syncScheduleOptions();
    }));
    if (!canUpdateOnlyGrids) host.querySelectorAll('.schedule-rotation-toggle').forEach(toggle => toggle.addEventListener('click', () => {
      const calendar = toggle.closest('.enrollment-calendar');
      const enabled = !toggle.classList.contains('active');
      this.resetCalendarSelection(calendar);
      toggle.classList.toggle('active', enabled);
      toggle.setAttribute('aria-pressed', String(enabled));
      this.syncRotationState(calendar);
    }));
    if (!canUpdateOnlyGrids) host.querySelectorAll('.calendar-window-btn').forEach(button => button.addEventListener('click', () => {
      this.shiftCalendarWindow(button.closest('.enrollment-calendar'), Number(button.dataset.direction));
    }));
    if (!canUpdateOnlyGrids) host.querySelectorAll('.course-cycle-btn').forEach(button => button.addEventListener('click', () => {
      this.shiftEnrollmentCycle(button, Number(button.dataset.cycleDirection));
    }));
    host.querySelectorAll('.enrollment-calendar').forEach(calendar => this.updateCalendarWindow(calendar));
    this.syncScheduleOptions();
    this.setPracticalMode(document.getElementById('selected-practical-mode')?.value || 'classes');
    host.removeAttribute('aria-busy');
    host.querySelectorAll('.enrollment-calendar-grid.is-refreshing').forEach(grid => grid.classList.remove('is-refreshing'));
  }

  flattenEnrollmentOptions(cycles) {
    return cycles.flatMap(cycle => (cycle.slots || []).map(slot => {
      const groupLabel = cycle.group?.code ? ` - ${cycle.group.code}` : '';
      return {
        id: `cycle:${cycle.id}:${slot.startTime}-${slot.endTime}`,
        cycleId: cycle.id,
        vehicleType: cycle.vehicleType,
        modality: cycle.modality || 'normal',
        day: `Inicio ${cycle.practicalStartDate || cycle.startDate}`,
        startDate: cycle.practicalStartDate || cycle.startDate,
        endDate: cycle.practicalEndDate || cycle.endDate,
        officialStartDate: cycle.startDate,
        officialEndDate: cycle.endDate,
        practicalStartAdvanced: Boolean(cycle.practicalStartAdvanced),
        durationBusinessDays: cycle.durationBusinessDays,
        time: `${slot.startTime} - ${slot.endTime}`,
        course: cycle.vehicleType === 'moto' ? 'Moto' : 'Automovil',
        cycleLabel: `${cycle.code}${groupLabel}`,
        capacity: slot.capacity,
        available: slot.available,
        occupied: slot.occupied,
        availabilityByDate: slot.occupancyByDate || {},
        instructors: cycle.instructors || [],
      };
    }));
  }

  renderTheoryScheduleOptions(){
    const options=this.modalTheoryOptions||{regular:true,saturday:true,virtual:true},items=[];
    const groups=this.modalTheoryGroups||[];
    const renderGroup=(value,title,fallback)=>{const group=groups.find(item=>item.value===value),shortDate=value=>String(value||'').split('-').reverse().join('/');const full=Boolean(group?.full),available=Number(group?.available);const detail=group?.unavailable?(group.message||'No configurado'):group?(full?`Sin cupos · próximo ${shortDate(group.nextAvailableStartDate)}`:`${group.startTime}–${group.endTime} · ${group.available} cupos`):fallback;const capacityClass=group?.unavailable?'theory-capacity-unavailable':available>20?'theory-capacity-green':available>=5?'theory-capacity-yellow':'theory-capacity-red';return `<label class="enrollment-modality-button ${capacityClass} ${full?'theory-option-full':''}"><input type="radio" name="theorySchedule" value="${value}" required ${group?.unavailable?'disabled':''}><strong>${title}</strong><span>${detail}</span></label>`;};
    if(options.regular!==false)items.push(renderGroup('presencial_regular','Presencial · lunes a viernes','18:00 a 20:00 · 5 días'));
    if(options.saturday!==false){items.push(renderGroup('presencial_intensivo_08','Intensivo · turno de mañana','08:00 a 12:30 · 2 sábados'));items.push(renderGroup('presencial_intensivo_13','Intensivo · turno de tarde','13:00 a 17:30 · 2 sábados'));}
    if(options.virtual!==false)items.push('<label class="enrollment-modality-button"><input type="radio" name="theorySchedule" value="virtual" required><strong>Teoría virtual</strong><span>Sin horario fijo</span></label>');
    return items.join('')||'<div class="schedule-empty">No hay modalidades teóricas habilitadas.</div>';
  }

  bindTheoryScheduleOptions() {
    document.querySelectorAll('[name="theorySchedule"]').forEach(input => {
      input.addEventListener('change', () => {
        document.querySelectorAll('.theory-schedule-selector .enrollment-modality-button').forEach(option =>
          option.classList.toggle('active', option.contains(input)),
        );
        const error = document.getElementById('theory-schedule-error');
        if (error) error.textContent = '';
      });
    });
  }

  async loadModalLocations(provinceSelect, citySelect, branchSelect) {
    if (!provinceSelect || !citySelect || !branchSelect) return;
    try {
      const [citiesResult, branchesResult] = await Promise.all([
        ApiService.getCities(),
        ApiService.getBranches(),
      ]);
      const cities = citiesResult.success ? citiesResult.data : [];
      const branches = branchesResult.success ? branchesResult.data : [];
      const provinces = [...new Set(cities.map(city => city.province).filter(Boolean))];
      this.modalLocationCatalog = { cities, branches };

      const renderCities = async () => {
        const selectedProvince = provinceSelect.value;
        const availableCities = cities.filter(city => !selectedProvince || city.province === selectedProvince);
        citySelect.innerHTML = '<option value="">Seleccionar cantón...</option>' + availableCities
          .map(city => `<option value="${city.id}">${city.name}</option>`)
          .join('');
        citySelect.disabled = !selectedProvince;
        await renderBranches();
      };

      const renderBranches = async () => {
        const selectedCityId = citySelect.value;
        const available = branches.filter(branch => !selectedCityId || branch.city_id === selectedCityId);
        const branchField = document.getElementById('modal-branch-field');

        if (selectedCityId && available.length === 1) {
          const branch = available[0];
          branchSelect.innerHTML = `<option value="${branch.name}" data-branch-id="${branch.id}" selected>${branch.name}</option>`;
          branchSelect.disabled = false;
          if (branchField) branchField.hidden = true;
          await this.loadModalBranchCourses(branchSelect);
          await this.loadModalReferredInstructors(branch.id);
          await this.reloadModalSchedules(branch.id);
          return;
        }

        branchSelect.innerHTML = '<option value="">Seleccionar sucursal...</option>' + available
          .map(branch => `<option value="${branch.name}" data-branch-id="${branch.id}">${branch.name}</option>`)
          .join('');
        branchSelect.disabled = !selectedCityId || available.length === 0;
        if (branchField) branchField.hidden = !selectedCityId || available.length < 2;
        await this.loadModalBranchCourses(branchSelect);
        await this.loadModalReferredInstructors(null);
        const scheduleHost = document.getElementById('student-schedule-calendar');
        if (scheduleHost && selectedCityId) {
          scheduleHost.innerHTML = available.length
            ? '<div class="student-empty">Selecciona una sucursal para consultar sus horarios.</div>'
            : '<div class="student-empty">Este cantón no tiene sucursales disponibles.</div>';
        }
      };

      this.renderModalCities = renderCities;
      this.renderModalBranches = renderBranches;

      provinceSelect.innerHTML = '<option value="">Seleccionar provincia...</option>' + provinces
        .map(province => `<option value="${province}">${province}</option>`)
        .join('');
      provinceSelect.addEventListener('change', () => renderCities());
      citySelect.addEventListener('change', () => renderBranches());
      branchSelect.addEventListener('change', async () => {
        await this.loadModalBranchCourses(branchSelect);
        const branchId = branchSelect.selectedOptions?.[0]?.dataset?.branchId;
        await this.loadModalReferredInstructors(branchId);
        if (branchId) await this.reloadModalSchedules(branchId);
      });

      const sessionBranchId = String(authService.getCurrentUser()?.branch_id || '');
      const sessionBranch = branches.find(branch => String(branch.id) === sessionBranchId);
      const sessionCity = sessionBranch
        ? cities.find(city => String(city.id) === String(sessionBranch.city_id))
        : null;
      if (sessionBranch && sessionCity && provinces.includes(sessionCity.province)) {
        provinceSelect.value = sessionCity.province;
        await renderCities();
        citySelect.value = String(sessionCity.id);
        await renderBranches();

        const sessionBranchOption = [...branchSelect.options]
          .find(option => String(option.dataset.branchId || '') === sessionBranchId);
        if (sessionBranchOption && branchSelect.selectedOptions?.[0] !== sessionBranchOption) {
          sessionBranchOption.selected = true;
          await this.loadModalBranchCourses(branchSelect);
          await this.loadModalReferredInstructors(sessionBranchId);
          await this.reloadModalSchedules(sessionBranchId);
        }
        this.showSessionBranchSummary(sessionBranch);
      } else {
        await renderCities();
      }
    } catch (error) {
      provinceSelect.innerHTML = '<option value="">No se pudieron cargar las provincias</option>';
      citySelect.innerHTML = '<option value="">No se pudieron cargar las ciudades</option>';
      branchSelect.innerHTML = '<option value="">No se pudieron cargar las sucursales</option>';
      console.error('Error al cargar ubicaciones:', error);
    }
  }

  showSessionBranchSummary(branch) {
    const summary = document.getElementById('registration-session-branch');
    const name = document.getElementById('registration-session-branch-name');
    const locationRow = document.getElementById('registration-location-row');
    const branchRow = document.getElementById('registration-branch-row');
    const changeButton = document.getElementById('change-registration-branch');
    if (!summary || !branch) return;
    if (name) name.textContent = branch.name || authService.getCurrentUser()?.branch || 'Sucursal actual';
    summary.hidden = false;
    if (locationRow) locationRow.hidden = true;
    if (branchRow) branchRow.hidden = true;
    if (changeButton && !changeButton.dataset.listenerAttached) {
      changeButton.addEventListener('click', () => {
        summary.hidden = true;
        if (locationRow) locationRow.hidden = false;
        if (branchRow) branchRow.hidden = false;
        document.getElementById('modal-province-select')?.focus();
      });
      changeButton.dataset.listenerAttached = 'true';
    }
  }

  async loadModalBranchCourses(branchSelect) {
    const courseSelect = document.getElementById('modal-course-select');
    if (!courseSelect) return;
    const branchId = branchSelect?.selectedOptions?.[0]?.dataset?.branchId;
    if (!branchId) { courseSelect.innerHTML='<option value="">Seleccione primero una sucursal...</option>'; courseSelect.disabled=true; return; }
    try {
      const response = await ApiService.getBranchCourses(branchId);
      const courses = response.data || [];
      const courseOptions = courses.map(course => `<option value="${course.id}" data-price="${Number(course.price || 0)}" data-course-type="${/moto|motocicleta|clase a/i.test(course.name) ? 'moto' : /auto|automóvil|clase b/i.test(course.name) ? 'carro' : /tipo f/i.test(course.name) ? 'tipo-f' : ''}">${course.name}</option>`).join('');
      const typeFOption = courses.some(course => /tipo f/i.test(course.name))
        ? ''
        : '<option value="tipo-f" data-price="0" data-course-type="tipo-f" disabled>Tipo F</option>';
      courseSelect.innerHTML = '<option value="">Seleccionar curso...</option>' + courseOptions + typeFOption;
      courseSelect.disabled = false;
      this.updateRegistrationPaymentSummary();
    } catch (error) { courseSelect.innerHTML='<option value="">No se pudieron cargar los cursos</option>'; courseSelect.disabled=true; }
  }

  async loadModalReferredInstructors(branchId) {
    const select = document.getElementById('preferred-instructor-select');
    if (!select) return;
    this.modalBranchInstructors = [];
    this.showCantonReferralInstructors = false;
    select.innerHTML = '<option value="">Asignación automática</option>';
    select.disabled = true;
    if (!branchId) return;
    try {
      this.modalBranchInstructors = await StudentService.getInstructors(branchId);
      this.renderModalReferredInstructorOptions();
    } catch (error) {
      console.error('No se pudieron cargar los instructores referidos:', error);
    }
  }

  renderModalReferredInstructorOptions() {
    const select = document.getElementById('preferred-instructor-select');
    const toggle = document.getElementById('toggle-canton-instructors');
    const courseSelect = document.getElementById('modal-course-select');
    if (!select) return;
    const selectedCourseId = courseSelect?.value || '';
    const compatible = selectedCourseId
      ? (this.modalBranchInstructors || []).filter(instructor =>
          (instructor.courses || []).some(course => String(course.id) === String(selectedCourseId)))
      : [];
    const priority = compatible.filter(instructor => instructor.priority_branch);
    const cantonSupport = compatible.filter(instructor => !instructor.priority_branch);
    const reservedInstructorId = this.activatingReservation?.instructor_id || null;
    const reservedInstructor = compatible.find(instructor => String(instructor.id) === String(reservedInstructorId));
    const visible = [...new Map((this.showCantonReferralInstructors
      ? [...priority, ...cantonSupport]
      : [...priority, ...(reservedInstructor ? [reservedInstructor] : [])])
      .map(instructor => [String(instructor.id), instructor])).values()];
    select.innerHTML = '<option value="">Asignación automática</option>'
      + visible.map(instructor => `<option value="${instructor.id}">${escapeHtml(instructor.name || '')}${instructor.priority_branch ? '' : ` · ${escapeHtml(instructor.home_branch || 'Apoyo del cantón')}`}</option>`).join('');
    select.disabled = !selectedCourseId || visible.length === 0;
    if (toggle) {
      toggle.hidden = !selectedCourseId || cantonSupport.length === 0;
      toggle.textContent = this.showCantonReferralInstructors ? 'Mostrar solo prioritarios' : 'Ver otros instructores del cantón';
    }
  }

  openStudentModal() {
    const modal = document.getElementById('student-modal-overlay');
    if (!modal) return;
    
    // Limpiar el estado anterior del overlay
    document.querySelectorAll('.modal-overlay.active, .branch-modal-backdrop').forEach(el => {
      if (el !== modal) {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    });
    
    // El contenido principal puede recortar elementos fijos (por la barra lateral).
    // Mientras está abierto, usamos body como portal para que el modal se adapte
    // al viewport completo y no al ancho del módulo de estudiantes.
    if (modal.parentElement !== document.body) {
      this.studentModalOrigin = {
        parent: modal.parentElement,
        nextSibling: modal.nextSibling
      };
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = '';
    document.body.style.overflow = 'hidden';
    this.goToModalStep(1);
    this.syncScheduleOptions();
    modal.querySelector('[name="province"]')?.focus();
  }

  async openReservationActivation(reservation) {
    const form = document.getElementById('student-modal-form');
    if (!form) return;
    form.reset();
    this.activatingReservation = reservation;
    await this.setRegistrationMode('regular');
    const parts = String(reservation.name || '').trim().split(/\s+/);
    const splitAt = Math.max(Math.ceil(parts.length / 2), 1);
    const values = {
      firstName: parts.slice(0, splitAt).join(' '),
      lastName: parts.slice(splitAt).join(' '),
      cedula: reservation.identification || '',
      phone: reservation.phone || '',
    };
    Object.entries(values).forEach(([name, value]) => {
      const input = form.elements[name];
      if (input) input.value = value;
    });
    const title = document.getElementById('student-modal-title');
    if (title) title.textContent = 'Activar cupo reservado';
    this.openStudentModal();

    const province = form.elements.province;
    if (province && reservation.province) {
      province.value = reservation.province;
      await this.renderModalCities?.();
    }
    const city = form.elements.city_id;
    if (city && reservation.city_id) {
      city.value = reservation.city_id;
      await this.renderModalBranches?.();
    }
    const branch = form.elements.branch;
    if (branch) {
      const option = [...branch.options].find(item => item.dataset.branchId === reservation.branch_id);
      if (option) branch.value = option.value;
      await this.loadModalBranchCourses(branch);
      await this.loadModalReferredInstructors(reservation.branch_id);
    }
    const course = form.elements.course_id;
    if (course && reservation.course_id) {
      course.value = reservation.course_id;
      this.renderModalReferredInstructorOptions();
    }
    const instructor = form.elements.preferredInstructorId;
    if (instructor && [...instructor.options].some(item => item.value === reservation.instructor_id)) {
      instructor.value = reservation.instructor_id;
      this.scheduleInstructorFilterId = reservation.instructor_id;
      await this.reloadModalSchedules(reservation.branch_id, reservation.instructor_id);
    }
    this.selectReservedSchedule(reservation);
    this.syncScheduleOptions();
  }

  selectReservedSchedule(reservation) {
    const expectedTime = `${reservation.start_time || ''} - ${reservation.end_time || ''}`.replace(/\s/g, '');
    document.querySelectorAll('.schedule-option.selected, .schedule-option.reservation-activation-slot').forEach(cell => {
      cell.classList.remove('selected', 'reservation-activation-slot');
    });
    const cells = [...document.querySelectorAll('.schedule-option')].filter(cell => {
      let payload = {};
      try { payload = JSON.parse(cell.dataset.schedule || '{}'); } catch (error) { /* dato inválido */ }
      return String(payload.cycleId || '') === String(reservation.cycle_id)
        && String(cell.dataset.time || '').replace(/\s/g, '') === expectedTime;
    });
    if (!cells.length) return;
    const calendar = cells[0].closest('.enrollment-calendar');
    const cycleSet = calendar?.closest('.enrollment-cycle-set');
    if (cycleSet) {
      const calendars = [...cycleSet.querySelectorAll('.enrollment-calendar')];
      const reservedCycleIndex = calendars.indexOf(calendar);
      if (reservedCycleIndex >= 0) {
        cycleSet.dataset.activeCycleIndex = String(reservedCycleIndex);
        calendars.forEach((item, index) => { item.style.display = index === reservedCycleIndex ? 'block' : 'none'; });
      }
    }
    cells.forEach(cell => {
      cell.disabled = false;
      cell.classList.remove('disabled');
      cell.classList.add('selected', 'reservation-activation-slot');
    });
    this.updateCalendarWindow(calendar);
    this.storeSchedulePlan(calendar);
  }

  closeStudentModal() {
    const modal = document.getElementById('student-modal-overlay');
    const form = document.getElementById('student-modal-form');
    const alert = document.getElementById('student-modal-alert');
    if (!modal) return;
    const shouldReturnToStudents = ['/students/new', '/student-form'].includes(window.location.pathname);
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    document.body.style.overflow = '';
    form?.reset();
    
    // Limpiar estado de celdas de schedule
    document.querySelectorAll('.schedule-option.selected, .schedule-option.reservation-activation-slot').forEach(cell => {
      cell.classList.remove('selected', 'reservation-activation-slot');
      cell.disabled = false;
    });
    
    this.activatingReservation = null;
    this.clearReferralStaff();
    form?.querySelectorAll('[name="firstName"],[name="lastName"],[name="cedula"],[name="birthDate"],[name="email"],[name="phone"],[name="address"]').forEach(input => { input.readOnly = false; });
    this.toggleAdditionalPracticeMode(false);
    form?.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    this.goToModalStep(1);
    if (alert) {
      alert.style.display = 'none';
      alert.innerHTML = '';
    }
    if (this.studentModalOrigin?.parent?.isConnected) {
      const { parent, nextSibling } = this.studentModalOrigin;
      parent.insertBefore(modal, nextSibling?.parentElement === parent ? nextSibling : null);
      this.studentModalOrigin = null;
    }
    if (shouldReturnToStudents) {
      window.history.pushState(null, null, '/students');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  scheduleReferralStaffSearch(value, delay = 250) {
    clearTimeout(this.referralStaffSearchTimer);
    const query = String(value || '').trim();
    const results = document.getElementById('student-referrer-results');
    if (query.length < 2) {
      this.referralStaffResults = [];
      if (results) {
        results.hidden = true;
        results.innerHTML = '';
      }
      return;
    }
    if (results) {
      results.hidden = false;
      results.innerHTML = '<div class="staff-referral-empty">Buscando...</div>';
    }
    this.referralStaffSearchTimer = setTimeout(async () => {
      const staff = await StudentService.searchReferralStaff(query);
      const currentValue = document.getElementById('student-referrer-search')?.value.trim();
      if (currentValue !== query) return;
      this.referralStaffResults = staff;
      this.renderReferralStaffResults(staff);
    }, delay);
  }

  renderReferralStaffResults(staff) {
    const results = document.getElementById('student-referrer-results');
    if (!results) return;
    results.hidden = false;
    results.innerHTML = staff.length
      ? staff.map(person => `
        <button type="button" class="staff-referral-option" data-referrer-id="${escapeHtml(person.id)}">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.role_name || 'Personal')} · ${escapeHtml(person.branch_name || '')}</span>
        </button>`).join('')
      : '<div class="staff-referral-empty">No se encontró personal con ese nombre.</div>';
  }

  selectReferralStaff(userId) {
    const person = (this.referralStaffResults || []).find(item => String(item.id) === String(userId));
    if (!person) return;
    const idInput = document.getElementById('student-referrer-id');
    const search = document.getElementById('student-referrer-search');
    const results = document.getElementById('student-referrer-results');
    const selected = document.getElementById('student-referrer-selected');
    if (idInput) idInput.value = person.id;
    if (search) {
      search.value = '';
      search.hidden = true;
    }
    if (results) results.hidden = true;
    if (selected) {
      selected.hidden = false;
      selected.innerHTML = `<div><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.role_name || 'Personal')} · ${escapeHtml(person.branch_name || '')}</span></div><button type="button" data-clear-referrer aria-label="Quitar referido">&times;</button>`;
    }
  }

  clearReferralStaff() {
    clearTimeout(this.referralStaffSearchTimer);
    this.referralStaffResults = [];
    const idInput = document.getElementById('student-referrer-id');
    const search = document.getElementById('student-referrer-search');
    const results = document.getElementById('student-referrer-results');
    const selected = document.getElementById('student-referrer-selected');
    if (idInput) idInput.value = '';
    if (search) {
      search.value = '';
      search.hidden = false;
    }
    if (results) {
      results.hidden = true;
      results.innerHTML = '';
    }
    if (selected) {
      selected.hidden = true;
      selected.innerHTML = '';
    }
  }

  goToNextModalStep() {
    const currentStep = this.getCurrentModalStep();
    if (currentStep === 1 && !this.validateScheduleFirstStep()) return;
    if (currentStep === 2 && !this.validateStudentFields()) return;
    if (currentStep < this.getStudentModalLastStep()) this.goToModalStep(currentStep + 1);
  }

  validateScheduleFirstStep() {
    const form = document.getElementById('student-modal-form');
    const mode = form?.querySelector('[name="registrationMode"]:checked')?.value || 'regular';
    if (mode === 'license-renewal') {
      this.goToModalStep(2);
      return false;
    }
    if (mode === 'additional-practice') return true;
    const required = [
      ['province', 'Selecciona una provincia.'],
      ['city_id', 'Selecciona un cantón.'],
      ['branch', 'Selecciona una sucursal.'],
      ['course_id', 'Selecciona un curso.'],
    ];
    for (const [name, message] of required) {
      const field = form?.querySelector(`[name="${name}"]`);
      if (!field?.value) {
        field?.parentElement?.querySelector('.form-error')?.replaceChildren(document.createTextNode(message));
        field?.focus();
        return false;
      }
    }
    if (!form?.elements.scheduleId?.value) {
      const error = document.getElementById('schedule-error');
      if (error) error.textContent = 'Selecciona uno de los horarios disponibles.';
      return false;
    }
    return true;
  }

  /* OCR pilot removed */
  async readCedulaAndAutofill(files = null) {
    const form = document.getElementById('student-modal-form');
    const status = document.getElementById('cedula-ocr-status');
    const button = document.getElementById('read-cedula-data');
    const selected = files || [form?.querySelector('[name="cedulaFrontFile"]')?.files?.[0], form?.querySelector('[name="cedulaBackFile"]')?.files?.[0]].filter(Boolean);
    if (!selected.length) {
      if (status) status.textContent = 'Toma o selecciona las fotos frontal y posterior. También puedes continuar sin autocompletar.';
      return;
    }
    try {
      if (button) button.disabled = true;
      if (status) status.textContent = 'Leyendo cédula... 0%';
      const data = await CedulaOcrHelper.recognize(selected, progress => { if (status) status.textContent = `Leyendo cédula... ${progress}%`; });
      this.applyCedulaSuggestions(data);
      const count = [data.identification,data.firstName,data.lastName,data.birthDate,data.bloodType].filter(Boolean).length;
      if (status) status.textContent = count ? `Se encontraron ${count} datos. Revísalos en el paso 2 antes de continuar.` : 'No se reconocieron datos con seguridad. Puedes ingresarlos manualmente.';
      if (count) this.goToModalStep(2);
    } catch (error) {
      if (status) status.textContent = error.message || 'No fue posible leer la cédula. Puedes continuar manualmente.';
    } finally { if (button) button.disabled = false; }
  }

  applyCedulaSuggestions(data = {}) {
    const form = document.getElementById('student-modal-form');
    const values = { cedula:data.identification, firstName:data.firstName, lastName:data.lastName, birthDate:data.birthDate, bloodType:data.bloodType };
    form?.querySelectorAll('.ocr-suggested').forEach(input=>{input.value='';input.classList.remove('ocr-suggested');});
    Object.entries(values).forEach(([name,value]) => { const input=form?.querySelector(`[name="${name}"]`);if(input&&value&&!input.value){input.value=value;input.classList.add('ocr-suggested');input.dispatchEvent(new Event('change',{bubbles:true}));} });
  }

  goToPreviousModalStep() {
    const currentStep = this.getCurrentModalStep();
    if (currentStep > 1) this.goToModalStep(currentStep - 1);
  }

  goToModalStep(step) {
    const lastStep = this.getStudentModalLastStep();
    const targetStep = Math.max(1, Math.min(lastStep, step || 1));
    document.querySelectorAll('.student-modal-step').forEach(section => {
      section.classList.toggle('active', Number(section.dataset.step) === targetStep);
    });
    document.querySelectorAll('.student-modal-step-tab').forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.step) === targetStep);
    });

    const backBtn = document.getElementById('student-modal-back');
    const nextBtn = document.getElementById('student-modal-next');
    const submitBtn = document.getElementById('student-modal-submit');
    const renewal = document.querySelector('#student-modal-form [name="registrationMode"]:checked')?.value === 'license-renewal';
    if (backBtn) backBtn.style.display = targetStep === 1 || renewal ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.style.display = targetStep === lastStep ? 'none' : 'inline-flex';
    if (submitBtn) submitBtn.style.display = targetStep === lastStep ? 'inline-flex' : 'none';
  }

  getStudentModalLastStep() {
    if (document.querySelector('#student-modal-form [name="registrationMode"]:checked')?.value === 'license-renewal') return 2;
    return authService.can('PAYMENT_CREATE') ? 4 : 3;
  }

  getCurrentModalStep() {
    const activeStep = document.querySelector('.student-modal-step.active');
    return Number(activeStep?.dataset.step || 1);
  }

  getVisibleRegistrationNotes() {
    const visibleField = [...document.querySelectorAll('.registration-observations-field')]
      .find(field => !field.hidden && field.offsetParent !== null);
    return String(visibleField?.querySelector('[name="notes"]')?.value || '').trim();
  }

  syncScheduleOptions() {
    const courseSelect = document.querySelector('#student-modal-form [name="course_id"]');
    const selectedCourse = courseSelect?.selectedOptions?.[0]?.dataset?.courseType || '';
    const selectedModality = document.getElementById('selected-enrollment-modality')?.value || 'normal';
    const scheduleError = document.getElementById('schedule-error');
    let visibleCount = 0;
    document.querySelectorAll('.enrollment-calendar').forEach(calendar => {
      const cycleSet = calendar.closest('.enrollment-cycle-set');
      const activeCycleIndex = Number(cycleSet?.dataset.activeCycleIndex || 0);
      const isActiveCycle = !cycleSet || Number(calendar.dataset.cycleIndex || 0) === activeCycleIndex;
      const isCourseMatch = Boolean(selectedCourse)
        && calendar.dataset.course === selectedCourse
        && (calendar.dataset.modality || 'normal') === selectedModality
        && isActiveCycle;
      calendar.style.display = isCourseMatch ? 'block' : 'none';
      if (!isCourseMatch) this.resetCalendarSelection(calendar);
    });

    document.querySelectorAll('.schedule-option').forEach(option => {
      const calendar = option.closest('.enrollment-calendar');
      const isCourseMatch = Boolean(selectedCourse)
        && option.dataset.course === selectedCourse
        && (calendar?.dataset.modality || 'normal') === selectedModality;
      option.style.display = isCourseMatch ? 'flex' : 'none';
      if (isCourseMatch) visibleCount += 1;
    });
    if (scheduleError) {
      scheduleError.textContent = selectedCourse || visibleCount
        ? ''
        : 'Primero selecciona si el estudiante tomara carro o moto.';
    }
    this.updateScheduleSelection();
  }

  async shiftEnrollmentCycle(button, direction) {
    const currentCalendar = button?.closest('.enrollment-calendar');
    const cycleSet = currentCalendar?.closest('.enrollment-cycle-set');
    if (!cycleSet || !Number.isFinite(direction)) return;
    const calendars = [...cycleSet.querySelectorAll(':scope > .enrollment-calendar')];
    const currentIndex = Number(currentCalendar.dataset.cycleIndex || 0);
    const nextIndex = Math.max(0, Math.min(calendars.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex && direction > 0 && button.dataset.loadNext === 'true') {
      await this.loadNextEnrollmentCycle(button, currentIndex);
      return;
    }
    if (nextIndex === currentIndex) return;
    calendars.forEach(calendar => this.resetCalendarSelection(calendar));
    cycleSet.dataset.activeCycleIndex = String(nextIndex);
    const form = document.getElementById('student-modal-form');
    if (form?.elements.scheduleId) form.elements.scheduleId.value = '';
    if (form?.elements.schedulePlan) form.elements.schedulePlan.value = '';
    this.syncScheduleOptions();
  }

  async loadNextEnrollmentCycle(button, currentIndex) {
    const calendar = button.closest('.enrollment-calendar');
    const courseKey = calendar?.dataset.course;
    const modality = calendar?.dataset.modality || 'normal';
    const form = document.getElementById('student-modal-form');
    const branchId = form?.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId;
    const instructorId = form?.querySelector('[name="preferredInstructorId"]')?.value || null;
    const errorHost = document.getElementById('schedule-error');
    if (!branchId || !courseKey) return;

    const originalText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = 'Cargando...';
      const result = await ApiService.getCourseEnrollmentOptions({
        branch_id: branchId,
        vehicle_type: courseKey,
        modality,
        ...(instructorId ? { instructor_id: instructorId } : {}),
        extend: true,
      });
      if (!result.success) throw new Error(result.error || 'No se pudo crear el siguiente curso.');
      await this.reloadModalSchedules(branchId, instructorId);
      const nextSet = document.querySelector(`.enrollment-cycle-set[data-course="${courseKey}"][data-modality="${modality}"]`);
      const availableCalendars = [...(nextSet?.querySelectorAll(':scope > .enrollment-calendar') || [])];
      if (availableCalendars.length <= currentIndex + 1) {
        throw new Error('No fue posible publicar otro curso con los recursos disponibles.');
      }
      nextSet.dataset.activeCycleIndex = String(currentIndex + 1);
      this.syncScheduleOptions();
    } catch (error) {
      if (errorHost) errorHost.textContent = error.message || 'No se pudo cargar el siguiente curso.';
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  updateScheduleSelection() {
    const error = document.getElementById('schedule-error');
    if (error) error.textContent = '';
  }

  bindScheduleOptionInteraction(option) {
    if (!option || option.dataset.listenerAttached) return;
    option.addEventListener('click', () => this.handleScheduleCellClick(option));
    option.addEventListener('dblclick', event => {
      event.preventDefault();
      this.toggleExamOnlyCell(option);
    });
    option.addEventListener('touchend', event => {
      const key = `${option.dataset.date}:${option.dataset.time}`;
      const now = Date.now();
      if (this.lastScheduleTap?.key === key && now - this.lastScheduleTap.time < 450) {
        event.preventDefault();
        this.lastScheduleTap = null;
        this.toggleExamOnlyCell(option);
        return;
      }
      this.lastScheduleTap = { key, time: now };
    }, { passive: false });
    option.dataset.listenerAttached = 'true';
  }

  toggleExamOnlyCell(option) {
    const isSelectedExam = document.getElementById('selected-practical-mode')?.value === 'exam_only'
      && option.classList.contains('selected');
    if (isSelectedExam) {
      this.setPracticalMode('classes');
      return;
    }
    this.setPracticalMode('exam_only');
    this.handleScheduleCellClick(option);
  }

  setPracticalMode(mode) {
    const examOnly = mode === 'exam_only';
    const input = document.getElementById('selected-practical-mode');
    if (input) input.value = examOnly ? 'exam_only' : 'classes';
    document.querySelectorAll('[data-practical-mode]').forEach(button => button.classList.toggle('active', button.dataset.practicalMode === input?.value));
    const help = document.getElementById('exam-only-help');
    if (help) help.hidden = !examOnly;
    const instructor = document.getElementById('preferred-instructor-select');
    if (instructor) instructor.required = examOnly;
    const instructorLabel = document.getElementById('preferred-instructor-label');
    if (instructorLabel) instructorLabel.innerHTML = examOnly
      ? 'Instructor de formación intensiva <span aria-hidden="true">*</span>'
      : 'Instructor solicitado <small>(opcional)</small>';
    const instructorHelp = document.getElementById('practice-instructor-help');
    if (instructorHelp) instructorHelp.textContent = examOnly
      ? 'Para la formación intensiva es obligatorio seleccionar el instructor.'
      : 'Puedes elegirlo o dejar que el sistema lo asigne.';
    const scheduleHelp = document.getElementById('practice-schedule-help');
    if (scheduleHelp) scheduleHelp.textContent = examOnly
      ? 'Selecciona una sola celda para la formación intensiva, incluso si el bloque ya tiene una clase.'
      : 'Selecciona una hora disponible en el curso correspondiente.';
    document.querySelectorAll('.schedule-option').forEach(option => {
      option.disabled = !examOnly && option.dataset.normalDisabled === 'true';
      option.classList.toggle('exam-selectable', examOnly);
    });
    document.querySelectorAll('.schedule-rotation-toggle').forEach(toggle => {
      toggle.hidden = examOnly;
      if (examOnly) { toggle.classList.remove('active'); toggle.setAttribute('aria-pressed', 'false'); }
    });
    document.querySelectorAll('.enrollment-calendar').forEach(calendar => this.resetCalendarSelection(calendar));
  }

  shiftCalendarWindow(calendar, direction) {
    if (!calendar) return;
    const dayCount = Number(calendar.dataset.dayCount || 0);
    const maximumStart = Math.max(0, Math.floor((dayCount - 1) / 5) * 5);
    const currentStart = Number(calendar.dataset.dayWindowStart || 0);
    const nextStart = direction > 0
      ? Math.min(maximumStart, currentStart + 5)
      : Math.max(0, currentStart - 5);
    calendar.dataset.dayWindowStart = String(nextStart);
    this.updateCalendarWindow(calendar);
  }

  updateCalendarWindow(calendar) {
    if (!calendar) return;
    const dayCount = Number(calendar.dataset.dayCount || 0);
    const start = Number(calendar.dataset.dayWindowStart || 0);
    const end = Math.min(dayCount, start + 5);
    const grid = calendar.querySelector('.enrollment-calendar-grid');
    if (grid) grid.style.setProperty('--cycle-count', String(Math.max(1, end - start)));
    calendar.querySelectorAll('[data-day-index]').forEach(element => {
      const dayIndex = Number(element.dataset.dayIndex);
      element.classList.toggle('calendar-day-hidden', dayIndex < start || dayIndex >= end);
    });
    const label = calendar.querySelector('.calendar-window-label');
    if (label) label.textContent = dayCount > 5
      ? `Días ${start + 1} al ${end} de ${dayCount}`
      : `${dayCount} ${dayCount === 1 ? 'día' : 'días'}`;
    const previous = calendar.querySelector('.calendar-window-btn[data-direction="-1"]');
    const next = calendar.querySelector('.calendar-window-btn[data-direction="1"]');
    if (previous) previous.disabled = start <= 0;
    if (next) next.disabled = end >= dayCount;
  }

  handleScheduleCellClick(option) {
    const examOnly = document.getElementById('selected-practical-mode')?.value === 'exam_only';
    if (!option || (!examOnly && option.classList.contains('disabled'))) return;
    const calendar = option.closest('.enrollment-calendar');
    const rotationEnabled = this.isRotationEnabled(calendar);
    const error = document.getElementById('schedule-error');
    if (error) error.textContent = '';

    if (examOnly) {
      document.querySelectorAll('.schedule-option.selected').forEach(cell => cell.classList.remove('selected'));
      option.classList.add('selected');
      this.storeSchedulePlan(calendar);
      return;
    }

    if (!rotationEnabled) {
      calendar.querySelectorAll('.schedule-option').forEach(cell => {
        cell.classList.toggle('selected', cell.dataset.time === option.dataset.time);
      });
      this.storeSchedulePlan(calendar);
      return;
    }

    const selectedForDay = [...calendar.querySelectorAll(`.schedule-option.selected[data-date="${option.dataset.date}"]`)];
    if (option.classList.contains('selected')) {
      option.classList.remove('selected');
      this.storeSchedulePlan(calendar);
      return;
    }
    if (selectedForDay.length >= 2) {
      if (error) error.textContent = 'Solo puedes escoger dos bloques por día.';
      return;
    }
    if (selectedForDay.length === 1 && !this.areConsecutiveScheduleOptions(calendar, selectedForDay[0], option)) {
      if (error) error.textContent = 'Para doblar horas, los dos bloques del día deben ser consecutivos.';
      return;
    }
    const requiredClasses = Number(calendar.dataset.requiredClasses || calendar.dataset.dayCount || 8);
    const selectedCount = calendar.querySelectorAll('.schedule-option.selected').length;
    if (selectedCount >= requiredClasses) {
      if (error) error.textContent = `El curso requiere exactamente ${requiredClasses} clases. Quita una selección antes de agregar otra.`;
      return;
    }
    option.classList.add('selected');
    if (!this.hasValidConsecutiveDoubleDays(calendar)) {
      option.classList.remove('selected');
      if (error) error.textContent = 'Puedes doblar horas en máximo cuatro días. Selecciona hasta 8 clases (2 bloques por día máximo en 4 días diferentes).';
      return;
    }
    const selectedTimes = new Set([...calendar.querySelectorAll('.schedule-option.selected')].map(cell => cell.dataset.time));
    if (selectedTimes.size > 2) {
      option.classList.remove('selected');
      if (error) error.textContent = 'En horario rotativo solo puedes escoger maximo dos horas distintas.';
      return;
    }
    this.storeSchedulePlan(calendar);
  }

  areConsecutiveScheduleOptions(calendar, first, second) {
    const orderedTimes = [...new Set([...calendar.querySelectorAll('.schedule-option')].map(cell => cell.dataset.time))]
      .sort((left, right) => left.localeCompare(right));
    return Math.abs(orderedTimes.indexOf(first.dataset.time) - orderedTimes.indexOf(second.dataset.time)) === 1;
  }

  hasValidConsecutiveDoubleDays(calendar) {
    const selectionsByDate = new Map();
    calendar.querySelectorAll('.schedule-option.selected').forEach(cell => {
      const items = selectionsByDate.get(cell.dataset.date) || [];
      items.push(cell);
      selectionsByDate.set(cell.dataset.date, items);
    });
    const doubledDays = [...selectionsByDate.values()]
      .filter(items => items.length === 2)
      .map(items => Number(items[0].dataset.dayIndex))
      .sort((left, right) => left - right);
    // Solo validar que no haya más de 4 días dobles. Permitir días no consecutivos.
    if (doubledDays.length > 4) return false;
    return true;
  }

  resetCalendarSelection(calendar) {
    if (!calendar) return;
    calendar.querySelectorAll('.schedule-option.selected').forEach(option => option.classList.remove('selected'));
    calendar.querySelectorAll('.schedule-rotation-toggle').forEach(toggle => {
      toggle.classList.remove('active');
      toggle.setAttribute('aria-pressed', 'false');
    });
    this.syncRotationState(calendar);
    this.storeSchedulePlan(calendar);
  }

  syncRotationState(calendar) {
    if (!calendar) return;
    const enabled = this.isRotationEnabled(calendar);
    calendar.classList.toggle('rotation-enabled', enabled);
    const message = calendar.querySelector('.schedule-rotation-message');
    if (message) message.hidden = !enabled;
    calendar.querySelectorAll('.schedule-option').forEach(option => {
      const normalDisabled = option.dataset.normalDisabled === 'true';
      const available = Number(enabled ? option.dataset.dailyAvailable : option.dataset.normalAvailable);
      option.disabled = !enabled && normalDisabled;
      option.classList.toggle('normal-slot-unavailable', !enabled && normalDisabled);
      option.setAttribute('aria-hidden', String(!enabled && normalDisabled));
      const capacity = option.querySelector('.schedule-option-capacity');
      if (capacity) capacity.textContent = `${available} ${available === 1 ? 'cupo disponible' : 'cupos disponibles'}`;
    });
  }

  storeSchedulePlan(calendar) {
    const selected = calendar
      ? [...calendar.querySelectorAll('.schedule-option.selected')]
      : [];
    const plan = selected.map(option => {
      try {
        return JSON.parse(option.dataset.schedule || '{}');
      } catch (error) {
        return { id: option.dataset.scheduleId, time: option.dataset.time, date: option.dataset.date };
      }
    });
    const scheduleIdInput = document.getElementById('selected-schedule-id');
    const schedulePlanInput = document.getElementById('selected-schedule-plan');
    if (scheduleIdInput) scheduleIdInput.value = plan[0]?.id || '';
    if (schedulePlanInput) schedulePlanInput.value = JSON.stringify({
      rotation: this.isRotationEnabled(calendar),
      practicalMode: document.getElementById('selected-practical-mode')?.value || 'classes',
      selections: plan,
    });
    this.syncLatePickupNotice(plan);
    const count = calendar?.querySelector('.schedule-selection-count');
    if (count) {
      const requiredClasses = document.getElementById('selected-practical-mode')?.value === 'exam_only'
        ? 1
        : Number(calendar.dataset.requiredClasses || calendar.dataset.dayCount || 8);
      const minimumClasses = this.isRotationEnabled(calendar) ? Math.ceil(requiredClasses / 2) : requiredClasses;
      count.textContent = `${plan.length}/${requiredClasses} seleccionadas · mínimo ${minimumClasses}`;
    }
    this.updateReferredInstructorBlockPreview(calendar);
    this.updateInstructorAssignmentPreview(calendar, plan);
    this.updateScheduleSelectionSummary(plan);
  }

  updateScheduleSelectionSummary(plan = []) {
    const summary = document.getElementById('schedule-selection-summary');
    if (!summary) return;
    const examOnly = document.getElementById('selected-practical-mode')?.value === 'exam_only';
    const instructor = document.getElementById('preferred-instructor-select');
    const instructorName = instructor?.value
      ? instructor.options[instructor.selectedIndex]?.textContent?.trim()
      : '';
    let title = 'Aún no has elegido un horario';
    if (plan.length) {
      title = examOnly
        ? `Curso de formación intensiva · ${plan[0]?.date || ''} · ${plan[0]?.time || ''}`
        : `${plan.length} ${plan.length === 1 ? 'clase seleccionada' : 'clases seleccionadas'}${plan[0]?.time ? ` · ${plan[0].time}` : ''}`;
    }
    summary.classList.toggle('is-empty', plan.length === 0);
    summary.querySelector('strong').textContent = title;
    let detail = summary.querySelector('.schedule-selection-instructor');
    if (instructorName && !detail) {
      detail = document.createElement('span');
      detail.className = 'schedule-selection-instructor';
      summary.querySelector('div').append(detail);
    }
    if (detail) {
      detail.textContent = instructorName;
      detail.hidden = !instructorName;
    }
  }

  async updateInstructorAssignmentPreview(calendar, plan = []) {
    const preview = calendar?.querySelector('.schedule-instructor-preview');
    if (!preview) return;
    const requestId = String(Date.now());
    preview.dataset.requestId = requestId;
    if (!plan.length) {
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }

    const preferredSelect = document.getElementById('preferred-instructor-select');
    const preferredInstructorId = preferredSelect?.value || null;
    const preferredName = preferredInstructorId
      ? preferredSelect.selectedOptions?.[0]?.textContent?.trim()
      : '';
    const isReservedInstructor = this.activatingReservation
      && String(preferredInstructorId || '') === String(this.activatingReservation.instructor_id || '');
    if (isReservedInstructor && preferredName) {
      preview.hidden = false;
      preview.className = 'schedule-instructor-preview available';
      preview.innerHTML = `<span>Instructor de la reserva</span><strong>${escapeHtml(preferredName)}</strong><small>Se conservar&aacute; al registrar al estudiante.</small>`;
      return;
    }
    preview.hidden = false;
    preview.className = 'schedule-instructor-preview loading';
    preview.innerHTML = '<span>Buscando instructor disponible...</span>';
    try {
      const response = await ApiService.previewCourseCycleInstructor({
        cycleId: plan[0]?.cycleId,
        selections: plan,
        preferredInstructorId,
        reservationId: this.activatingReservation?.id || null,
      });
      if (preview.dataset.requestId !== requestId) return;
      const instructorName = response.data?.instructorName || preferredName;
      preview.className = `schedule-instructor-preview ${instructorName ? 'available' : 'unavailable'}`;
      preview.innerHTML = instructorName
        ? `<span>Instructor previsto</span><strong>${escapeHtml(instructorName)}</strong><small>Se confirmar&aacute; al completar el registro.</small>`
        : '<strong>No hay un instructor disponible para toda la selecci&oacute;n.</strong>';
    } catch (error) {
      if (preview.dataset.requestId !== requestId) return;
      preview.className = 'schedule-instructor-preview unavailable';
      preview.innerHTML = `<strong>${escapeHtml(error.message || 'No se pudo comprobar el instructor.')}</strong>`;
    }
  }

  syncLatePickupNotice(plan = []) {
    const notice = document.getElementById('late-pickup-notice');
    if (!notice) return;
    const branchName = document.querySelector('#student-modal-form [name="branch"]')
      ?.selectedOptions?.[0]?.textContent?.trim() || '';
    const requiresFlavioPickup = /manta\s*2000/i.test(branchName)
      && plan.some(selection => String(selection.time || '').startsWith('20:00'));
    notice.hidden = !requiresFlavioPickup;
    if (!requiresFlavioPickup) {
      const confirmation = notice.querySelector('input[name="latePickupConfirmed"]');
      if (confirmation) confirmation.checked = false;
    }
  }

  updateReferredInstructorBlockPreview(calendar) {
    if (!calendar) return;
    calendar.querySelectorAll('.schedule-option').forEach(option => {
      option.classList.remove('referred-block-preview', 'rotation-block-preview');
      const capacityLabel = option.querySelector('.schedule-option-capacity');
      if (capacityLabel?.dataset.originalText) {
        capacityLabel.textContent = capacityLabel.dataset.originalText;
        delete capacityLabel.dataset.originalText;
      }
    });
    // Un examen es una cita aislada: no reserva visualmente la misma fila en
    // los demás días ni descuenta cupos de las clases prácticas.
    const examOnly = document.getElementById('selected-practical-mode')?.value === 'exam_only';
    if (examOnly) return;
    const rotationEnabled = this.isRotationEnabled(calendar);
    const selectedTimes = new Set(
      [...calendar.querySelectorAll('.schedule-option.selected')].map(option => option.dataset.time)
    );
    calendar.querySelectorAll('.schedule-option').forEach(option => {
      // En horario normal y rotativo, cada franja utilizada queda reservada
      // durante todo el ciclo para el instructor seleccionado. Las celdas
      // elegidas indican las clases reales; la fila completa refleja cupos.
      const isReserved = selectedTimes.has(option.dataset.time);
      if (isReserved) {
        option.classList.add('referred-block-preview');
        if (rotationEnabled) option.classList.add('rotation-block-preview');
        const capacityLabel = option.querySelector('.schedule-option-capacity');
        if (capacityLabel) {
          capacityLabel.dataset.originalText = capacityLabel.textContent;
          const match = capacityLabel.textContent.match(/(\d+)\/(\d+)/);
          if (match) capacityLabel.textContent = `${Math.max(Number(match[1]) - 1, 0)}/${match[2]} cupos tras reservar`;
        }
      }
    });
  }

  isRotationEnabled(calendar) {
    return Boolean(calendar?.querySelector('.schedule-rotation-toggle.active'));
  }

  getScheduleCourseKey(course) {
    const normalized = (course || '').toLowerCase();
    return normalized.includes('moto') || normalized.includes('clase a') ? 'moto' : 'carro';
  }

  getCourseBusinessDays(startDate, endDate, courseKey = 'carro', modality = 'normal') {
    if (!startDate || !endDate) return [];
    if (modality === 'intensivo') {
      const start = new Date(`${startDate}T00:00:00`);
      const names = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
      const offsets = courseKey === 'carro' ? [0, 1, 7, 8] : [0, 1, 7];
      return offsets.map((offset, index) => {
        const date = new Date(start);
        date.setDate(date.getDate() + offset);
        return {
          date: date.toISOString().slice(0, 10),
          name: names[date.getDay()],
          label: date.toISOString().slice(5, 10),
          isExamDay: index === offsets.length - 1,
        };
      });
    }
    const days = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const names = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        const date = cursor.toISOString().slice(0, 10);
        days.push({
          date,
          name: names[day],
          label: date.slice(5),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (days.length) days[days.length - 1].isExamDay = true;
    return days;
  }

  validateStudentFields() {
    const form = document.getElementById('student-modal-form');
    if (!form) return false;
    const formData = new FormData(form);
    const additionalPractice = formData.get('additionalPractice') === 'on';
    const renewal = formData.get('registrationMode') === 'license-renewal';
    form.querySelectorAll('.form-error').forEach(el => el.textContent = '');

    const validations = {
      firstName: [{ type: 'required', message: 'El nombre es requerido' }],
      lastName: [{ type: 'required', message: 'El apellido es requerido' }],
      cedula: [
        { type: 'required', message: 'La cédula es requerida' },
        { type: 'cedula', message: 'Formato de cédula inválido' },
      ],
      birthDate: [{ type: 'birthDate', message: 'Debes ser mayor de 16 años' }],
      email: formData.get('email') ? [{ type: 'email', message: 'Email inválido' }] : [],
      phone: formData.get('phone') ? [{ type: 'phone', message: 'Teléfono inválido' }] : [],
      bloodType: additionalPractice || renewal ? [] : [{ type: 'required', message: 'Debes seleccionar el tipo de sangre' }],
      course_id: additionalPractice || renewal ? [] : [{ type: 'required', message: 'Debes seleccionar un curso' }],
      city_id: [{ type: 'required', message: 'Debes seleccionar una ciudad' }],
      branch: [{ type: 'required', message: 'Debes seleccionar una sucursal' }],
    };

    let hasErrors = false;
    for (const [fieldName, rules] of Object.entries(validations)) {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (!input) continue;
      const result = Validator.validate(input.value.trim(), rules);
      if (!result.isValid) {
        input.parentElement.querySelector('.form-error').textContent = result.errors[0];
        hasErrors = true;
      }
    }
    return !hasErrors;
  }

  async handleStudentSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const alert = document.getElementById('student-modal-alert');
    const submitBtn = document.getElementById('student-modal-submit');
    if (alert) alert.style.display = 'none';

    if (!this.validateStudentFields()) {
      this.goToModalStep(2);
      return;
    }

    if (formData.get('additionalPractice') === 'on') {
      await this.handleAdditionalPracticeSubmit(form, formData, submitBtn);
      return;
    }

    if (formData.get('registrationMode') === 'license-renewal') {
      await this.handleLicenseRenewalSubmit(form, formData, submitBtn);
      return;
    }

    const registrationDocumentsUrl = formData.get('registrationDocumentsMobileFileUrl');
    const registrationDocumentsPdf = formData.get('registrationDocumentsPdfFile');
    const hasRegistrationPdf = Boolean(registrationDocumentsPdf?.name);
    if (hasRegistrationPdf && !this.isPdfFile(registrationDocumentsPdf)) {
      const documentError = document.getElementById('cedula-scan-error');
      if (documentError) documentError.textContent = 'El documento de cedula y carnet debe ser un archivo PDF.';
      this.goToModalStep(3);
      return;
    }
    if (hasRegistrationPdf && registrationDocumentsPdf.size > 9 * 1024 * 1024) {
      const documentError = document.getElementById('cedula-scan-error');
      if (documentError) documentError.textContent = 'El PDF no puede superar 9 MB. Comprímelo o captura los documentos desde el teléfono.';
      this.goToModalStep(3);
      return;
    }
    let cedulaDoc, bloodTypeCardDoc;
    if (registrationDocumentsUrl) cedulaDoc = bloodTypeCardDoc = { hasMobile: true, mobileFileUrl: registrationDocumentsUrl };
    else if (hasRegistrationPdf) cedulaDoc = bloodTypeCardDoc = { hasPdf: true, pdfFile: registrationDocumentsPdf };
    else {
      cedulaDoc = this.validateTwoSideDocument(formData, 'cedula', 'cedula-scan-error', false);
      if (!cedulaDoc.valid) return;
      bloodTypeCardDoc = this.validateTwoSideDocument(formData, 'bloodTypeCard', 'blood-type-card-error', false);
      if (!bloodTypeCardDoc.valid) return;
    }

    const scheduleId = formData.get('scheduleId');
    const schedulePlan = this.parseSchedulePlan(formData.get('schedulePlan'));
    const theorySchedule = formData.get('theorySchedule');
    const preferredInstructorId = formData.get('preferredInstructorId') || null;
    const advancedPracticalStartEnabled = formData.get('advancedPracticalStartEnabled') === 'on';
    const practicalStartDate = advancedPracticalStartEnabled ? String(formData.get('practicalStartDate') || '') : '';
    if (advancedPracticalStartEnabled && !practicalStartDate) {
      const scheduleError = document.getElementById('schedule-error');
      if (scheduleError) scheduleError.textContent = 'Selecciona la fecha real en que comenzarán las prácticas.';
      this.goToModalStep(1);
      return;
    }
    const activeCalendar = [...document.querySelectorAll('.enrollment-calendar')]
      .find(calendar => calendar.style.display !== 'none');
    const examOnly = formData.get('practicalMode') === 'exam_only';
    const requiredClasses = examOnly ? 1 : Number(activeCalendar?.dataset.requiredClasses || activeCalendar?.dataset.dayCount || 8);
    const rotationEnabled = Boolean(schedulePlan.rotation) && !examOnly;
    const minimumClasses = rotationEnabled ? Math.ceil(requiredClasses / 2) : requiredClasses;
    const invalidSelectionCount = examOnly
      ? schedulePlan.selections.length !== 1
      : schedulePlan.selections.length < minimumClasses || schedulePlan.selections.length > requiredClasses;
    if (invalidSelectionCount) {
      const scheduleError = document.getElementById('schedule-error');
      if (scheduleError) scheduleError.textContent = examOnly
        ? 'Para formación intensiva debes seleccionar una única fecha y horario.'
        : rotationEnabled
          ? `En horario rotativo debes seleccionar entre ${minimumClasses} y ${requiredClasses} clases prácticas.`
          : `Debes seleccionar exactamente ${requiredClasses} clases prácticas en total.`;
      this.goToModalStep(1);
      return;
    }
    const latePickupNotice = document.getElementById('late-pickup-notice');
    if (latePickupNotice && !latePickupNotice.hidden && !formData.get('latePickupConfirmed')) {
      const scheduleError = document.getElementById('schedule-error');
      if (scheduleError) scheduleError.textContent = 'Confirma que informaste al estudiante que a las 20:00 debe acudir a la sucursal Flavio Reyes.';
      this.goToModalStep(1);
      return;
    }
    const selectedBranchId = form.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId || null;
    const availableSchedules = await this.getSchedulesForModal(selectedBranchId, preferredInstructorId, practicalStartDate || null);
    if (examOnly && !preferredInstructorId) {
      const scheduleError = document.getElementById('schedule-error');
      if (scheduleError) scheduleError.textContent = 'Selecciona el instructor de la formación intensiva.';
      this.goToModalStep(1);
      return;
    }
    const selectedCellsAreAvailable = examOnly ? schedulePlan.selections.length === 1 : this.activatingReservation
      ? schedulePlan.selections.length > 0 && schedulePlan.selections.every(selection => String(selection.cycleId) === String(this.activatingReservation.cycle_id))
      : schedulePlan.selections.length > 0
      && schedulePlan.selections.every(selection => {
        const schedule = availableSchedules.find(item =>
          String(item.cycleId) === String(selection.cycleId)
          && item.time === selection.time);
        const dateAvailability = schedule?.availabilityByDate?.[selection.date];
        return schedule && dateAvailability && Number(dateAvailability.available) > 0;
      });
    if (!scheduleId || !selectedCellsAreAvailable) {
      const scheduleError = document.getElementById('schedule-error');
      if (scheduleError) scheduleError.textContent = 'Uno de los días y horas seleccionados ya no está disponible';
      this.goToModalStep(1);
      return;
    }
    if (!theorySchedule) {
      const theoryError = document.getElementById('theory-schedule-error');
      if (theoryError) theoryError.textContent = 'Debes seleccionar la modalidad de teoría';
      this.goToModalStep(1);
      return;
    }
    schedulePlan.theorySchedule = theorySchedule;
    schedulePlan.practicalMode = examOnly ? 'exam_only' : 'classes';
    schedulePlan.preferredInstructorId = preferredInstructorId;
    schedulePlan.practicalStartDate = practicalStartDate || null;
    schedulePlan.practicalStartReason = practicalStartDate ? String(formData.get('practicalStartReason') || '').trim() : null;

    const shouldCollectPayment = authService.can('PAYMENT_CREATE') && formData.get('collectPayment') === 'on';
    const discountAmount = Number(formData.get('discountAmount') || 0);
    const selectedCourseOption = form.querySelector('[name="course_id"]')?.selectedOptions?.[0];
    const selectedCoursePrice = Number(selectedCourseOption?.dataset?.price || 0);
    const minimumFinalAmount = selectedCourseOption?.dataset?.courseType === 'carro' ? 175 : 0;
    const maximumDiscount = Math.max(selectedCoursePrice - minimumFinalAmount, 0);
    const discountError = document.getElementById('payment-discount-error');
    if (discountError) discountError.textContent = '';
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > maximumDiscount) {
      if (discountError) discountError.textContent = selectedCourseOption?.dataset?.courseType === 'carro'
        ? `El curso de automóvil no puede quedar por debajo de $175.00. Descuento máximo: $${maximumDiscount.toFixed(2)}.`
        : `El descuento debe estar entre $0 y $${maximumDiscount.toFixed(2)}.`;
      this.goToModalStep(4);
      return;
    }
    if (shouldCollectPayment) {
      const amount = Number(formData.get('paymentAmount'));
      const method = formData.get('paymentMethod');
      const methodOption = document.querySelector('[name="paymentMethod"]')?.selectedOptions?.[0];
      const reference = String(formData.get('paymentReference') || '').trim();
      const amountError = document.getElementById('payment-amount-error');
      const methodError = document.getElementById('payment-method-error');
      if (amountError) amountError.textContent = '';
      if (methodError) methodError.textContent = '';
      if (!Number.isFinite(amount) || amount <= 0) {
        if (amountError) amountError.textContent = 'Ingresa un valor mayor a cero.';
        this.goToModalStep(4);
        return;
      }
      if (amount > selectedCoursePrice - discountAmount) {
        if (amountError) amountError.textContent = 'El valor recibido no puede superar el total después del descuento.';
        this.goToModalStep(4);
        return;
      }
      if (!method) {
        if (methodError) methodError.textContent = 'Selecciona la forma de pago.';
        this.goToModalStep(4);
        return;
      }
      if (methodOption?.dataset.requiresReference === 'true' && !reference) {
        const referenceError = document.getElementById('payment-reference-error');
        if (referenceError) referenceError.textContent = 'Ingresa la referencia de este pago.';
        this.goToModalStep(4);
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando estudiante...';
    }

    const result = await StudentService.createStudent({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      cedula: formData.get('cedula'),
      birthDate: formData.get('birthDate'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      address: formData.get('address'),
      bloodType: formData.get('bloodType'),
      course_id: formData.get('course_id'),
      city_id: formData.get('city_id'),
      branch: formData.get('branch'),
      referredByUserId: formData.get('referredByUserId') || null,
      reservationId: this.activatingReservation?.id || null,
      discount: discountAmount,
      notes: this.getVisibleRegistrationNotes(),
    });

    if (!result.success) {
      this.showModalAlert('error', result.error || 'No se pudo registrar el estudiante');
      this.restoreSubmitButton(submitBtn);
      return;
    }

    const student = result.data;

    try {
      if (submitBtn) submitBtn.textContent = 'Guardando documentos...';
      if (registrationDocumentsUrl || hasRegistrationPdf) {
        await this.uploadRegistrationDocumentPackage(
          student.id,
          registrationDocumentsUrl || registrationDocumentsPdf,
          registrationDocumentsUrl
            ? formData.get('registrationDocumentsMobileIncludesBloodCard') === 'true'
            : true
        );
      } else {
        await this.saveTwoSideDocument(student.id, 'cedula', cedulaDoc, `cedula-${student.id}.pdf`, 'Cédula de Identidad');
        await this.saveTwoSideDocument(student.id, 'carnet_tipo_sangre', bloodTypeCardDoc, `carnet-tipo-sangre-${student.id}.pdf`, 'Carnet de Tipo de Sangre');
      }
      if (formData.get('certificadoBachillerMobileFileUrl')) {
        await this.uploadModalDocumentFromDataUrl(student.id, 'certificado_bachiller', formData.get('certificadoBachillerMobileFileUrl'), 'Certificado de estudio');
      } else {
        await this.uploadModalDocument(student.id, 'certificado_bachiller', formData.get('certificadoBachillerFile'), 'Certificado de estudio');
      }
      if (submitBtn) submitBtn.textContent = 'Reservando horario...';
      const scheduleReservation = await this.selectStudentSchedule(student.id, scheduleId, schedulePlan);
      student.assignedInstructor = scheduleReservation?.instructor || null;
    } catch (error) {
      this.showModalAlert('error', error.message || 'El estudiante se registró, pero hubo un problema guardando documentos u horario.');
      this.restoreSubmitButton(submitBtn);
      return;
    }


    if (shouldCollectPayment) {
      if (submitBtn) submitBtn.textContent = 'Registrando pago...';
      const paymentResult = await PaymentService.registerPayment({
        studentId: student.id,
        cedula: student.cedula || student.identification || formData.get('cedula'),
        amount: formData.get('paymentAmount'),
        method: formData.get('paymentMethod'),
        reference: formData.get('paymentReference'),
        cashier: authService.getCurrentUser()?.name || 'Secretaría de sucursal',
      });
      if (!paymentResult.success) {
        this.showModalAlert(
          'error',
          `El estudiante y su horario se registraron correctamente, pero el pago quedó pendiente: ${paymentResult.error || 'no se pudo completar el cobro'}.`
        );
        if (submitBtn) submitBtn.textContent = 'Registro guardado';
        setTimeout(() => {
          const url = `/student-profile/${student.id}`;
          window.history.pushState(null, null, url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, 5000);
        return;
      }
    }

    NotificationService.createNotification(
      student.id,
      'Registro Completado',
      'El registro fue completado con documentos y horario seleccionados.',
      'info'
    );

    if (student.access?.created) {
      this.showStudentAccess(student);
    } else {
      this.showModalAlert('success', shouldCollectPayment
        ? 'Estudiante, horario y pago registrados exitosamente'
        : 'Estudiante registrado exitosamente');
      setTimeout(() => {
        const url = `/student-profile/${student.id}`;
        window.history.pushState(null, null, url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, 5000);
    }
  }

  async handleAdditionalPracticeSubmit(form, formData, submitBtn) {
    if (!this.additionalPracticeResolved) {
      this.showModalAlert('error', 'Primero busca la cédula para comprobar si la persona ya existe.');
      this.goToModalStep(2);
      return;
    }
    const documentFile = formData.get('additionalPracticeDocumentsFile');
    const mobileDocumentUrl = formData.get('additionalPracticeMobileFileUrl');
    const hasMobileDocument = typeof mobileDocumentUrl === 'string' && mobileDocumentUrl.startsWith('data:application/pdf');
    const instructorId = formData.get('additionalPracticeInstructor');
    const startDate = formData.get('additionalPracticeStartDate');
    const dailyTime = formData.get('additionalPracticeTime');
    const days = Number(formData.get('additionalPracticeDays'));
    if (!hasMobileDocument && !this.isPdfFile(documentFile) && !this.isImageFile(documentFile)) {
      const error = document.getElementById('additional-practice-document-error');
      if (error) error.textContent = 'Selecciona un PDF o toma una foto del documento.';
      this.goToModalStep(3);
      return;
    }
    if (!instructorId || !startDate || !dailyTime || !Number.isInteger(days) || days < 3 || days > 8) {
      if (!instructorId) document.getElementById('additional-practice-instructor-error').textContent = 'Selecciona un instructor.';
      if (!startDate) document.getElementById('additional-practice-date-error').textContent = 'Selecciona la fecha de inicio.';
      if (!dailyTime) document.getElementById('additional-practice-time-error').textContent = 'Selecciona un horario.';
      this.showModalAlert('error', 'Completa la programación de las prácticas.');
      this.goToModalStep(1);
      return;
    }
    const availability = await StudentService.checkAdditionalPracticeAvailability({
      instructor_id: instructorId,
      start_date: startDate,
      daily_start_time: dailyTime,
      number_of_days: days,
      branch_id: form.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId || authService.getCurrentUser()?.branch_id,
    });
    if (!availability.success || !availability.data?.available) {
      this.showModalAlert('error', availability.error || 'El instructor no está disponible. Acepta una sugerencia de instructor o cambia la fecha antes de continuar.');
      this.goToModalStep(1);
      await this.checkAdditionalPracticeAvailability();
      return;
    }
    const collectPayment = authService.can('PAYMENT_CREATE') && formData.get('collectPayment') === 'on';
    const method = collectPayment ? formData.get('paymentMethod') : 'pendiente';
    if (collectPayment && !method) {
      document.getElementById('payment-method-error').textContent = 'Selecciona la forma de pago.';
      this.goToModalStep(4);
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando prácticas...'; }

    let student = this.additionalPracticeStudent;
    if (!student) {
      const creation = await StudentService.createStudent({
        firstName: formData.get('firstName'), lastName: formData.get('lastName'), cedula: formData.get('cedula'),
        birthDate: formData.get('birthDate'), email: formData.get('email'), phone: formData.get('phone'),
        address: formData.get('address'), bloodType: 'N/D', city_id: formData.get('city_id'), branch: formData.get('branch'),
        registrationType: 'ADDITIONAL_PRACTICE',
        notes: this.getVisibleRegistrationNotes(),
      });
      if (!creation.success) { this.showModalAlert('error', creation.error || 'No se pudo registrar la persona.'); this.restoreSubmitButton(submitBtn); return; }
      student = creation.data;
    }
    try {
      const documentTitle = this.additionalPracticeStudent
        ? 'Licencia para prácticas adicionales'
        : 'Cédula y licencia para prácticas adicionales';
      if (hasMobileDocument) {
        await this.uploadModalDocumentFromDataUrl(student.id, 'licencia', mobileDocumentUrl, documentTitle);
      } else {
        let documentToUpload = documentFile;
        if (this.isImageFile(documentFile)) {
          const pdfBlob = await this.createSinglePhotoPdf(documentFile, 'Documento para prácticas adicionales');
          documentToUpload = new File([pdfBlob], `practicas-adicionales-${student.id}.pdf`, { type: 'application/pdf', lastModified: Date.now() });
        }
        await this.uploadModalDocument(student.id, 'licencia', documentToUpload, documentTitle);
      }
      const practice = await StudentService.createAdditionalPractice(student.id, {
        branch_id: form.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId || authService.getCurrentUser()?.branch_id,
        instructor_id: instructorId, number_of_days: days,
        start_date: startDate, daily_start_time: dailyTime, payment_method: method,
        customer_type: this.additionalPracticeStudent?.former_student ? 'FORMER_STUDENT' : 'EXTERNAL',
        notes: this.getVisibleRegistrationNotes(),
      });
      if (!practice.success) throw new Error(practice.error || 'No se pudo registrar la práctica adicional.');
    } catch (error) {
      this.showModalAlert('error', error.message || 'No se pudo completar el registro de prácticas.');
      this.restoreSubmitButton(submitBtn);
      return;
    }
    this.showModalAlert('success', `Prácticas registradas por ${days} días. Total: $${days === 8 ? 136 : days * (this.additionalPracticeStudent?.former_student ? 17 : 20)}.`);
    setTimeout(() => {
      window.history.pushState(null, null, `/student-profile/${student.id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 5000);
  }

  async handleLicenseRenewalSubmit(form, formData, submitBtn) {
    const branchId = form.querySelector('[name="branch"]')?.selectedOptions?.[0]?.dataset?.branchId;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Registrando renovación...'; }
    const result = await StudentService.createLicenseRenewal({
      identification: formData.get('cedula'), firstName: formData.get('firstName'), lastName: formData.get('lastName'),
      birthDate: formData.get('birthDate'), email: formData.get('email'), phone: formData.get('phone'),
      address: formData.get('address'), city_id: formData.get('city_id'), branch_id: branchId,
      notes: this.getVisibleRegistrationNotes(),
    });
    if (!result.success) {
      this.showModalAlert('error', result.error || 'No se pudo registrar la renovación de licencia.');
      this.restoreSubmitButton(submitBtn);
      return;
    }
    this.showModalAlert('success', 'Renovación de licencia registrada correctamente.');
    setTimeout(() => { window.history.pushState(null, null, '/students'); window.dispatchEvent(new PopStateEvent('popstate')); }, 1500);
  }

  parseSchedulePlan(value) {
    try {
      const parsed = JSON.parse(value || '{}');
      return {
        rotation: Boolean(parsed.rotation),
        selections: Array.isArray(parsed.selections) ? parsed.selections : [],
        preferredInstructorId: parsed.preferredInstructorId || null,
      };
    } catch (error) {
      return { rotation: false, selections: [] };
    }
  }

  validateTwoSideDocument(formData, prefix, errorId, required) {
    const pdfFile = formData.get(`${prefix}PdfFile`);
    const frontFile = formData.get(`${prefix}FrontFile`);
    const backFile = formData.get(`${prefix}BackFile`);
    const mobileFileUrl = formData.get(`${prefix}MobileFileUrl`);
    const error = document.getElementById(errorId);
    if (error) error.textContent = '';

    const hasMobile = typeof mobileFileUrl === 'string' && mobileFileUrl.startsWith('data:application/pdf');
    const hasPdf = this.isPdfFile(pdfFile);
    const hasFront = this.isImageFile(frontFile);
    const hasBack = this.isImageFile(backFile);
    const hasImages = hasFront && hasBack;
    const hasPartialImages = hasFront || hasBack;

    if (required && !hasMobile && !hasPdf && !hasImages) {
      if (error) error.textContent = 'Sube el PDF o las imágenes frontal y reverso.';
      this.goToModalStep(3);
      return { valid: false };
    }

    if (!hasPdf && hasPartialImages && !hasImages) {
      if (error) error.textContent = 'Para generar el PDF debes subir frontal y reverso.';
      this.goToModalStep(3);
      return { valid: false };
    }

    return { valid: true, hasMobile, mobileFileUrl, hasPdf, hasImages, pdfFile, frontFile, backFile };
  }

  async saveTwoSideDocument(studentId, type, doc, filename, title) {
    if (!doc.hasMobile && !doc.hasPdf && !doc.hasImages) return;
    if (doc.hasMobile) {
      await this.uploadModalDocumentFromDataUrl(studentId, type, doc.mobileFileUrl, title);
      return;
    }
    if (doc.hasPdf) {
      await this.uploadModalDocument(studentId, type, doc.pdfFile, title);
      return;
    }
    const pdfBlob = await this.createScanPdf(doc.frontFile, doc.backFile, title);
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() });
    await this.uploadModalDocument(studentId, type, pdfFile, title);
  }

  async uploadModalDocumentFromDataUrl(studentId, type, fileUrl, name) {
    const response = await ApiService.createDocument(studentId, { type, name, fileUrl });
    if (!response.success) throw new Error(response.error || `No se pudo guardar ${name}`);
  }

  async uploadRegistrationDocumentPackage(studentId, source, includesBloodCard = true) {
    const fileUrl = typeof source === 'string' ? source : await this.readFileAsDataUrl(source);
    if (fileUrl.length > 12 * 1024 * 1024) {
      throw new Error('El PDF combinado es demasiado grande. El máximo permitido es 9 MB.');
    }
    const response = await ApiService.createDocument(studentId, {
      type: 'registro_documentos',
      name: includesBloodCard ? 'Cédula y carnet de tipo sanguíneo' : 'Cédula de identidad',
      fileUrl,
      includesBloodCard,
    });
    if (!response.success) throw new Error(response.error || 'No se pudo guardar el PDF combinado');
  }

  async uploadModalDocument(studentId, type, file, name) {
    if (!file || !file.name) return;
    const fileUrl = await this.readFileAsDataUrl(file);
    const response = await ApiService.createDocument(studentId, { type, name: name || file.name, fileUrl });
    if (!response.success) throw new Error(response.error || `No se pudo guardar ${name || file.name}`);
  }

  async selectStudentSchedule(studentId, scheduleId, schedulePlan = null) {
    if (String(scheduleId).startsWith('cycle:')) {
      const response = await ApiService.reserveCourseCycleSchedule({ studentId, schedulePlan });
      if (!response.success) throw new Error(response.error || 'No se pudo reservar el cupo del curso');
      NotificationService.notifyScheduleSelected(studentId);
      return response.data || null;
    }

    try {
      const response = await ApiService.selectSchedule(scheduleId, studentId);
      if (!response.success) throw new Error(response.error || 'No se pudo seleccionar el horario');
    } catch (error) {
      const fallback = ScheduleService.selectSchedule(studentId, scheduleId);
      if (!fallback.success) throw new Error(fallback.error || 'No se pudo seleccionar el horario');
      await StudentService.updateStudentStatus(studentId, 'horario_seleccionado');
    }
    NotificationService.notifyScheduleSelected(studentId);
    return null;
  }

  showModalAlert(type, message) {
    const isSuccess = type === 'success';
    if (isSuccess) this.closeStudentModal();

    const alert = document.getElementById('student-modal-alert');
    if (alert && !isSuccess) {
      alert.className = `alert alert-${type}`;
      alert.innerHTML = `<div class="alert-content">${message}</div>`;
      alert.style.display = 'flex';
    }

    document.getElementById('student-registration-result-modal')?.remove();
    const layer = document.createElement('div');
    layer.id = 'student-registration-result-modal';
    layer.className = 'branch-modal-backdrop student-registration-result-backdrop';
    layer.innerHTML = `
      <section class="branch-modal" role="alertdialog" aria-modal="true" aria-labelledby="student-result-title" style="max-width:460px;text-align:center;">
        <div style="font-size:44px;margin-bottom:12px;">${isSuccess ? '✓' : '!'}</div>
        <h2 id="student-result-title">${isSuccess ? 'Registro exitoso' : 'No se pudo completar el registro'}</h2>
        <p style="margin:12px 0 18px;">${message}</p>
        <small>Este mensaje se cerrará en 5 segundos.</small>
      </section>`;
    document.body.appendChild(layer);
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      layer.remove();
      document.body.style.overflow = '';
    }, 5000);
  }

  showStudentAccess(student) {
    this.closeStudentModal();
    document.getElementById('student-registration-result-modal')?.remove();
    const layer = document.createElement('div');
    layer.id = 'student-registration-result-modal';
    layer.className = 'branch-modal-backdrop student-registration-result-backdrop';
    const instructorSummary = student.assignedInstructor?.name
      ? `<div class="student-registration-success__notice"><strong>Instructor asignado</strong><small>${escapeHtml(student.assignedInstructor.name)}</small></div>`
      : '';
    layer.innerHTML = `<section class="branch-modal student-registration-success" role="dialog" aria-modal="true" aria-labelledby="student-access-title"><div class="student-registration-success__icon">✓</div><div class="student-registration-success__title"><span>Registro completado</span><h2 id="student-access-title">Estudiante y acceso creados</h2><p>El estudiante, su horario, instructor y cuenta fueron registrados correctamente.</p></div>${instructorSummary}<div class="student-registration-success__notice"><strong>Credenciales de ingreso</strong><small>Entrégalas al estudiante. La contraseña deberá cambiarse al ingresar por primera vez.</small></div><div class="student-access-credentials"><label>Usuario<strong>${escapeHtml(student.access.username)}</strong></label><label>Contraseña temporal<strong>${escapeHtml(student.access.temporaryPassword)}</strong></label></div><p class="student-copy-status" id="student-copy-status" aria-live="polite"></p><div class="student-registration-success__actions"><button type="button" class="btn btn-light" id="copy-student-access">Copiar credenciales</button><button type="button" class="btn btn-primary" id="accept-student-access">Abrir expediente</button></div></section>`;
    document.body.appendChild(layer);
    document.body.style.overflow = 'hidden';
    layer.querySelector('#copy-student-access').onclick = async event => {
      const text = `Usuario: ${student.access.username}\nContraseña temporal: ${student.access.temporaryPassword}`;
      const status = layer.querySelector('#student-copy-status');
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
          const helper=document.createElement('textarea');helper.value=text;helper.style.position='fixed';helper.style.opacity='0';document.body.appendChild(helper);helper.select();document.execCommand('copy');helper.remove();
        }
        event.currentTarget.textContent = '✓ Credenciales copiadas';
        status.textContent = 'Listas para enviarlas al estudiante.';
      } catch {
        status.textContent = 'No se pudieron copiar automáticamente. Puedes seleccionar el usuario y la contraseña.';
      }
    };
    layer.querySelector('#accept-student-access').onclick = () => {
      // Remover completamente el layer de credenciales
      layer.remove();
      
      // Remover COMPLETAMENTE todos los overlays, modales y backdrops del DOM
      document.querySelectorAll('.modal-overlay, .branch-modal-backdrop, .student-modal-overlay, [class*="backdrop"], [class*="overlay"]').forEach(el => {
        if (el !== layer && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      
      // Limpiar estilos
      document.body.style.overflow = '';
      
      // Asegurar que el layout principal esté visible
      const layout = document.querySelector('.layout');
      if (layout) {
        layout.style.display = '';
        layout.style.visibility = 'visible';
      }
      
      // Navegar al perfil del estudiante
      setTimeout(() => {
        window.history.pushState(null, null, `/student-profile/${student.id}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, 50);
    };
  }

  restoreSubmitButton(submitBtn) {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.textContent = authService.can('PAYMENT_CREATE') ? 'Completar registro' : 'Registrar Estudiante';
  }

  isImageFile(file) {
    if (!file || !file.name) return false;
    return ['image/jpeg', 'image/png'].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  }

  isPdfFile(file) {
    if (!file || !file.name) return false;
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  async createScanPdf(frontFile, backFile, title) {
    const [front, back] = await Promise.all([
      this.prepareImageForPdf(frontFile),
      this.prepareImageForPdf(backFile),
    ]);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 48;
    const maxImageWidth = pageWidth - (margin * 2);
    const maxImageHeight = 290;
    const frontBox = this.fitImageInBox(front.width, front.height, maxImageWidth, maxImageHeight);
    const backBox = this.fitImageInBox(back.width, back.height, maxImageWidth, maxImageHeight);
    const frontX = (pageWidth - frontBox.width) / 2;
    const backX = (pageWidth - backBox.width) / 2;
    const frontY = 455;
    const backY = 95;
    const content = [
      `BT /F1 18 Tf 48 805 Td (${this.escapePdfText(title)}) Tj ET`,
      'BT /F1 10 Tf 48 785 Td (Documento generado desde fotografias del frontal y reverso.) Tj ET',
      'BT /F1 12 Tf 48 755 Td (Frontal) Tj ET',
      `q ${frontBox.width.toFixed(2)} 0 0 ${frontBox.height.toFixed(2)} ${frontX.toFixed(2)} ${frontY.toFixed(2)} cm /Im1 Do Q`,
      'BT /F1 12 Tf 48 420 Td (Reverso) Tj ET',
      `q ${backBox.width.toFixed(2)} 0 0 ${backBox.height.toFixed(2)} ${backX.toFixed(2)} ${backY.toFixed(2)} cm /Im2 Do Q`,
    ].join('\n');

    const encoder = new TextEncoder();
    const objects = [
      encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R /Im2 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 7 0 R >>'),
      this.buildPdfImageObject(front),
      this.buildPdfImageObject(back),
      encoder.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
      this.buildPdfStreamObject(encoder.encode(content)),
    ];

    const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = [0];
    let position = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(position);
      const header = encoder.encode(`${index + 1} 0 obj\n`);
      const footer = encoder.encode('\nendobj\n');
      chunks.push(header, object, footer);
      position += header.length + object.length + footer.length;
    });
    const xrefPosition = position;
    const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
      .concat(offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
      .concat(['trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xrefPosition), '%%EOF', ''])
      .join('\n');
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async createSinglePhotoPdf(file, title) {
    const image = await this.prepareImageForPdf(file);
    const pageWidth = 595;
    const pageHeight = 842;
    const box = this.fitImageInBox(image.width, image.height, 515, 700);
    const x = (pageWidth - box.width) / 2;
    const y = (pageHeight - box.height) / 2 - 15;
    const encoder = new TextEncoder();
    const content = [
      `BT /F1 18 Tf 40 805 Td (${this.escapePdfText(title)}) Tj ET`,
      `q ${box.width.toFixed(2)} 0 0 ${box.height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`,
    ].join('\n');
    const objects = [
      encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 5 0 R >> >> /Contents 6 0 R >>'),
      this.buildPdfImageObject(image),
      encoder.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
      this.buildPdfStreamObject(encoder.encode(content)),
    ];
    const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = [0];
    let position = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(position);
      const header = encoder.encode(`${index + 1} 0 obj\n`);
      const footer = encoder.encode('\nendobj\n');
      chunks.push(header, object, footer);
      position += header.length + object.length + footer.length;
    });
    const xrefPosition = position;
    chunks.push(encoder.encode(['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
      .concat(offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
      .concat(['trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xrefPosition), '%%EOF', '']).join('\n')));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async prepareImageForPdf(file) {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Una de las fotos no es una imagen válida.'));
        element.src = imageUrl;
      });
      const maximumSide = 1600;
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      return { width, height, bytes: this.base64ToBytes(jpegDataUrl.split(',')[1]) };
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  fitImageInBox(width, height, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return { width: width * scale, height: height * scale };
  }

  buildPdfImageObject(image) {
    const encoder = new TextEncoder();
    const header = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    const footer = encoder.encode('\nendstream');
    return this.concatBytes([header, image.bytes, footer]);
  }

  buildPdfStreamObject(bytes) {
    const encoder = new TextEncoder();
    return this.concatBytes([
      encoder.encode(`<< /Length ${bytes.length} >>\nstream\n`),
      bytes,
      encoder.encode('\nendstream'),
    ]);
  }

  createObjectUrlFromDataUrl(dataUrl) {
    const [metadata, base64] = String(dataUrl || '').split(',');
    if (!base64) throw new Error('El PDF recibido no es valido.');
    const mimeType = metadata.match(/^data:([^;]+)/)?.[1] || 'application/pdf';
    return URL.createObjectURL(new Blob([this.base64ToBytes(base64)], { type: mimeType }));
  }

  base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  concatBytes(chunks) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    chunks.forEach(chunk => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const timeoutId = window.setTimeout(() => {
        reader.abort();
        reject(new Error('El archivo tardó demasiado en procesarse. Intenta con un archivo de menor tamaño.'));
      }, 30000);
      reader.onload = () => { window.clearTimeout(timeoutId); resolve(reader.result); };
      reader.onerror = () => { window.clearTimeout(timeoutId); reject(new Error('No se pudo leer el archivo seleccionado.')); };
      reader.onabort = () => window.clearTimeout(timeoutId);
      reader.readAsDataURL(file);
    });
  }

  escapePdfText(text) {
    return String(text).replace(/[()\\]/g, '\\$&');
  }

  renderStudentRows(students) {
    let previousBranch = null;
    return students.map(student => {
      const groupTitle = this.groupBy === 'instructor'
        ? (student.instructorName || 'Sin instructor') !== previousBranch
          ? `<div class="student-branch-group">Instructor: ${student.instructorName || 'Sin instructor'}</div>`
          : ''
        : student.branch !== previousBranch
          ? `<div class="student-branch-group">${student.city || 'Ciudad no registrada'} · ${student.branch || 'Sucursal no registrada'}</div>`
          : '';
      previousBranch = this.groupBy === 'instructor' ? (student.instructorName || 'Sin instructor') : student.branch;
      return `${groupTitle}
        <div class="table-row clickable-row" data-student-id="${student.id}" style="cursor:pointer;">
          <div class="table-cell"><div class="student-name"><div class="avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">${this.getInitials(student.firstName + ' ' + student.lastName)}</div><div><div class="font-weight-600">${student.firstName} ${student.lastName}</div><div class="text-sm text-gray-500">${student.email || 'N/A'}</div></div></div></div>
          <div class="table-cell">${StringHelper.normalizeCedula(student.cedula)}</div>
          <div class="table-cell">${student.createdByName || 'No registrado'}</div>
          <div class="table-cell">${student.branch || 'N/A'}</div>
          <div class="table-cell">${student.instructorName || 'Sin instructor'}</div>
          <div class="table-cell">${DateHelper.format(student.createdAt, 'DD/MM/YYYY')}</div>
          <div class="table-cell"><span class="badge ${this.getStatusBadgeClass(student.status)}">${this.getStatusLabel(student.status)}</span></div>
        </div>`;
    }).join('');
  }

  renderReservationRows(reservations = []) {
    return reservations.map(reservation => `
      <div class="table-row student-reservation-table-row">
        <div class="table-cell"><div class="student-name"><div class="avatar" style="width:32px;height:32px;font-size:.75rem;">${this.getInitials(reservation.name || 'CR')}</div><div><div class="font-weight-600">${escapeHtml(reservation.name || 'Nombre pendiente')}</div><div class="text-sm text-gray-500">Cupo protegido</div></div></div></div>
        <div class="table-cell">${escapeHtml(reservation.identification || 'Cédula pendiente')}${reservation.phone ? `<br>${escapeHtml(reservation.phone)}` : ''}</div>
        <div class="table-cell">${escapeHtml(reservation.instructor_name || 'Sin instructor')}</div>
        <div class="table-cell"><div><strong>${escapeHtml(reservation.course_name || 'Curso pendiente')}</strong><div class="text-sm text-gray-500">${escapeHtml(reservation.cycle_code || '')}</div></div></div>
        <div class="table-cell">${DateHelper.format(reservation.start_date, 'DD/MM/YYYY')}</div>
        <div class="table-cell">${reservation.start_time ? `${escapeHtml(reservation.start_time)}–${escapeHtml(reservation.end_time)}` : 'Pendiente'}</div>
        <div class="table-cell"><span class="badge student-reservation-status">Reservado</span></div>
        <div class="table-cell"><button type="button" class="btn btn-primary btn-small" data-activate-reservation="${escapeHtml(reservation.id)}">Activar</button></div>
      </div>`).join('');
  }

  getResultCountLabel(count, reservations = false) {
    if (reservations) return `${count} ${count === 1 ? 'reservado' : 'reservados'}`;
    return `${count} ${count === 1 ? 'estudiante' : 'estudiantes'}`;
  }

  renderStudentSummary(students, reservations = [], activeStatus = '') {
    const enrolledStatuses = new Set(['matriculado', 'en_curso', 'active', 'activo']);
    const paymentStatuses = new Set(['pendiente_pago', 'pago_parcial', 'pending_payment']);
    const documentStatuses = new Set(['pendiente_documentacion', 'pendiente_documentos', 'pendiente_doc', 'pending_documents']);
    const enrolled = students.filter(student => enrolledStatuses.has(String(student.status || '').toLowerCase())).length;
    const pendingPayment = students.filter(student => paymentStatuses.has(String(student.status || '').toLowerCase())).length;
    const pendingDocuments = students.filter(student => documentStatuses.has(String(student.status || '').toLowerCase())).length;

    return `
      <button type="button" class="student-summary-card student-summary-card--total ${!activeStatus ? 'is-active' : ''}" data-status="" aria-pressed="${!activeStatus}">
        <span class="student-summary-icon">E</span>
        <div><strong>${students.length}</strong><span>Estudiantes visibles</span></div>
      </button>
      <button type="button" class="student-summary-card student-summary-card--enrolled ${activeStatus === 'active' ? 'is-active' : ''}" data-status="active" aria-pressed="${activeStatus === 'active'}">
        <span class="student-summary-icon">✓</span>
        <div><strong>${enrolled}</strong><span>Matriculados o en curso</span></div>
      </button>
      <button type="button" class="student-summary-card student-summary-card--payment ${activeStatus === 'payment_pending' ? 'is-active' : ''}" data-status="payment_pending" aria-pressed="${activeStatus === 'payment_pending'}">
        <span class="student-summary-icon">$</span>
        <div><strong>${pendingPayment}</strong><span>Con pago pendiente</span></div>
      </button>
      <button type="button" class="student-summary-card student-summary-card--documents ${activeStatus === 'documents_pending' ? 'is-active' : ''}" data-status="documents_pending" aria-pressed="${activeStatus === 'documents_pending'}">
        <span class="student-summary-icon">D</span>
        <div><strong>${pendingDocuments}</strong><span>Con documentos pendientes</span></div>
      </button>
      <button type="button" class="student-summary-card student-summary-card--reservations ${activeStatus === 'reservado' ? 'is-active' : ''}" data-status="reservado" aria-pressed="${activeStatus === 'reservado'}">
        <span class="student-summary-icon">R</span>
        <div><strong>${reservations.length}</strong><span>Cupos reservados</span></div>
      </button>`;
  }

  compareStudentsByCreationDate(first, second) {
    const firstCreatedAt = new Date(first.createdAt || 0).getTime() || 0;
    const secondCreatedAt = new Date(second.createdAt || 0).getTime() || 0;
    return secondCreatedAt - firstCreatedAt
      || `${first.firstName} ${first.lastName}`.localeCompare(`${second.firstName} ${second.lastName}`);
  }

  startAutomaticRefresh() {
    this.refreshTimer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const reservationParams = { ...(this.listParams || {}) };
        delete reservationParams.status;
        const [students, reservations] = await Promise.all([
          StudentService.getAllStudents(this.listParams || {}),
          StudentService.getActiveReservations(reservationParams),
        ]);
        const nextSnapshot = this.createSnapshot(students);
        const nextReservationsSnapshot = this.createReservationsSnapshot(reservations);
        if (nextSnapshot !== this.studentsSnapshot || nextReservationsSnapshot !== this.reservationsSnapshot) {
          const form = document.getElementById('student-filter-form');
          if (form) {
            const page = Number(new URLSearchParams(window.location.search).get('page')) || 1;
            await this.refreshStudentTable(this.getStudentListParams(Object.fromEntries(new FormData(form))), page);
          }
        }
      } catch (error) {
        console.warn('No se pudo actualizar automáticamente la lista de estudiantes:', error.message);
      }
    }, 15000);
  }

  createSnapshot(students) {
    return students
      .map(student => `${student.id}:${student.status}`)
      .sort()
      .join('|');
  }

  createReservationsSnapshot(reservations) {
    return reservations
      .map(reservation => `${reservation.id}:${reservation.start_time || ''}:${reservation.end_time || ''}`)
      .sort()
      .join('|');
  }

  unmount() {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    super.unmount();
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      const unreadCount = NotificationService.getAllNotifications().filter(n => !n.read).length;
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  getInitials(name) {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getStatusLabel(status) {
    const labels = {
      pendiente_documentacion: 'Pendiente Doc.',
      pendiente_pago: 'Pendiente Pago',
      pago_parcial: 'Pago Parcial',
      pago_confirmado: 'Pago Confirmado',
      horario_seleccionado: 'Horario seleccionado',
      matriculado: 'Matriculado',
      en_curso: 'En Curso',
    };
    return labels[status] || status;
  }

  getStatusBadgeClass(status) {
    const classes = {
      pendiente_documentacion: 'badge-warning',
      pendiente_pago: 'badge-danger',
      pago_parcial: 'badge-warning',
      pago_confirmado: 'badge-info',
      horario_seleccionado: 'badge-info',
      matriculado: 'badge-success',
      en_curso: 'badge-success',
    };
    return classes[status] || 'badge-primary';
  }

  cleanup() {
    // Cerrar el modal de estudiantes si está abierto
    const modal = document.getElementById('student-modal-overlay');
    if (modal && modal.classList.contains('active')) {
      this.closeStudentModal();
    }
    // Limpiar todos los overlays de modales
    document.querySelectorAll('.modal-overlay, .branch-modal-backdrop, .student-modal-overlay').forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    // Restaurar estado de overflow
    document.body.style.overflow = '';
    // Limpiar timers
    clearTimeout(this.referralStaffSearchTimer);
    clearTimeout(this.additionalPracticeResolutionTimer);
    clearTimeout(this.additionalPracticeAvailabilityTimer);
  }
}

export default StudentsView;
