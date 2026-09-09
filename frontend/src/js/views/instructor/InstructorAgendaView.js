import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import InstructorAgendaService from '../../services/instructorAgendaService.js';
import InstructorStudentService from '../../services/instructorStudentService.js';
import { badgeClass, escapeHtml, formatDateTime, formatTime, stateMessage } from './InstructorHelpers.js';
import { openAttendanceQrModal } from './AttendanceQrModal.js';
import { openCompleteSessionModal } from './CompleteSessionModal.js';
import PracticalSessionService from '../../services/practicalSessionService.js';

class InstructorAgendaView extends Component {
  async render() {
    const params = new URLSearchParams(window.location.search);
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const date = params.get('date') || today;
    const view = params.get('view') || 'day';
    const range = view === 'week' ? this.getWeekRange(date) : view === 'upcoming' ? this.getUpcomingRange(date) : { date };
    const examRangeEnd = new Date(`${today}T12:00:00`);
    examRangeEnd.setFullYear(examRangeEnd.getFullYear() + 1);

    try {
      const [result, studentResult, examResult] = await Promise.all([
        InstructorAgendaService.getAgenda({
          ...range,
          status: params.get('status') || '',
          course: params.get('course') || '',
          student: params.get('student') || '',
        }),
        InstructorStudentService.getStudents({ limit: 100 }),
        InstructorAgendaService.getAgenda({
          startDate: today,
          endDate: examRangeEnd.toISOString().slice(0, 10),
          appointmentType: 'EXAM_ONLY',
        }),
      ]);
      const sessions = result.data || [];
      this.agendaSessions = sessions;
      this.agendaStudents = studentResult.data || [];
      this.upcomingExams = examResult.data || [];
      const nextSession = sessions.find(item => ['PROGRAMADA','PROXIMA','EN_CURSO'].includes(item.status) && !item.isExpired) || null;
      const practicalClassCount = sessions.filter(item => !item.isExamOnly).length;
      const periodLabel = view === 'upcoming' ? 'Próximos 30 días' : view === 'week' ? 'Semana seleccionada' : new Date(`${date}T12:00:00`).toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long'});

      const content = `
        <div class="instructor-page instructor-agenda-page">
          <header class="agenda-hero">
            <div>
              <span class="agenda-eyebrow">Plan de trabajo</span>
              <h1>Mi agenda</h1>
              <p>${escapeHtml(periodLabel)} · organiza tus clases, rutas y estudiantes desde un solo lugar.</p>
            </div>
            <div class="agenda-hero__actions"><a href="/instructor/agenda?view=day&date=${today}" class="btn btn-secondary">Hoy</a><a href="/instructor/agenda?view=upcoming" class="btn btn-primary">Próximas clases</a></div>
          </header>

          <section class="agenda-summary">
            <article><span class="agenda-summary__icon is-blue">▦</span><div><small>Clases en el periodo</small><strong>${practicalClassCount}</strong></div></article>
            <article class="agenda-summary__students" id="open-agenda-students" role="button" tabindex="0"><span class="agenda-summary__icon is-violet">●</span><div><small>Mis estudiantes</small><strong>${this.agendaStudents.length}</strong></div><span class="agenda-summary__open">Ver</span></article>
            <article class="agenda-summary__exams" id="open-agenda-exams" role="button" tabindex="0"><span class="agenda-summary__icon is-green" aria-hidden="true">✓</span><div><small>Ex&aacute;menes</small><strong>${this.upcomingExams.length}</strong></div><span class="agenda-summary__open">Ver</span></article>
            <article><span class="agenda-summary__icon is-orange">→</span><div><small>Próxima clase</small><strong>${nextSession ? formatDateTime(nextSession.scheduledStart) : 'Sin clases'}</strong></div></article>
          </section>

          <section class="agenda-filter-card"><div class="agenda-filter-card__title"><div><strong>Buscar en la agenda</strong><small>Los resultados cambian automáticamente.</small></div><button class="agenda-clear" type="button" id="clear-agenda-filters">Limpiar</button></div><form class="instructor-filters" id="agenda-filter-form">
            <div class="form-group">
              <label class="form-label">Vista</label>
              <select class="form-select" name="view">
                <option value="upcoming" ${view === 'upcoming' ? 'selected' : ''}>Próximas clases</option>
                <option value="day" ${view === 'day' ? 'selected' : ''}>Diaria</option>
                <option value="week" ${view === 'week' ? 'selected' : ''}>Semanal</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input class="form-input" type="date" name="date" value="${date}">
            </div>
            <div class="form-group">
              <label class="form-label">Estado</label>
              <select class="form-select" name="status">
                <option value="">Todos</option>
                ${['PROGRAMADA', 'PROXIMA', 'EN_CURSO', 'COMPLETADA', 'AUSENTE', 'CANCELADA', 'REPROGRAMADA'].map(status => `<option value="${status}" ${params.get('status') === status ? 'selected' : ''}>${status}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Estudiante</label>
              <input class="form-input" name="student" value="${escapeHtml(params.get('student') || '')}" placeholder="Nombre, apellido o cédula">
            </div>
            <div class="form-group">
              <label class="form-label">Curso</label>
              <input class="form-input" name="course" value="${escapeHtml(params.get('course') || '')}" placeholder="Automovil o moto">
            </div>
          </form></section>

          ${nextSession ? `<section class="agenda-next"><div><span>Próxima clase</span><strong>${escapeHtml(nextSession.studentName)}</strong><small>${escapeHtml(nextSession.course)} · Clase ${escapeHtml(nextSession.sessionNumber || 'N/A')} · ${formatDateTime(nextSession.scheduledStart)}</small></div><div class="agenda-next__route"><small>Ruta</small><strong>${escapeHtml(nextSession.recommendedRoute?.name || 'Pendiente de asignar')}</strong></div><a class="btn btn-primary" href="/instructor/agenda?view=day&date=${String(nextSession.scheduledStart).slice(0,10)}">Ver jornada</a></section>` : ''}

          <section class="agenda-list-card">
            <div class="agenda-list-card__header">
              <div><span class="agenda-eyebrow">Programación</span><h2>Clases asignadas</h2></div>
              <span class="agenda-result-count">${sessions.length} ${sessions.length===1?'clase':'clases'}</span>
            </div>
            <div class="agenda-list-card__body">
              ${sessions.length ? this.renderSessions(sessions) : `<div class="instructor-empty"><strong>No hay clases en este periodo.</strong><span>${view === 'day' ? 'Selecciona otra fecha o cambia a “Próximas clases”.' : 'No existen clases futuras con los filtros seleccionados.'}</span></div>`}
            </div>
          </section>
          ${this.renderClassDetailModal()}
          ${this.renderStudentsModal(this.agendaStudents)}
          ${this.renderExamsModal(this.upcomingExams)}
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

  renderClassDetailModal() {
    return `<div class="agenda-class-modal" id="agenda-class-modal" hidden>
      <section class="agenda-class-sheet" role="dialog" aria-modal="true" aria-labelledby="agenda-class-title">
        <header class="agenda-class-sheet__header">
          <div><small>Resumen de la clase</small><h2 id="agenda-class-title">Detalle</h2></div>
          <button type="button" class="agenda-class-close" aria-label="Cerrar">×</button>
        </header>
        <div class="agenda-class-sheet__body">
          <div class="agenda-class-student">
            <span class="agenda-class-student__avatar" id="agenda-class-avatar"></span>
            <div><small>Estudiante</small><strong id="agenda-class-student"></strong><span id="agenda-class-course"></span></div>
            <span class="badge" id="agenda-class-status"></span>
          </div>
          <dl class="agenda-class-grid">
            <div><dt>Fecha y horario</dt><dd id="agenda-class-schedule"></dd></div>
            <div><dt>Número de clase</dt><dd id="agenda-class-number"></dd></div>
            <div><dt>Punto de encuentro</dt><dd>Sportmancar Flavio Reyes</dd></div>
            <div><dt>Ruta recomendada</dt><dd id="agenda-class-route"></dd></div>
          </dl>
          <div class="agenda-class-recommendation" id="agenda-class-recommendation" hidden>
            <small>Recomendaciones de Secretaría</small>
            <p></p>
          </div>
          <div class="agenda-class-observation" id="agenda-class-observation" hidden><small>Observaciones</small><p></p></div>
          <section class="agenda-class-evaluation" id="agenda-class-evaluation" hidden>
            <div><small>Temas trabajados</small><div class="agenda-class-topic-list"></div></div>
            <div class="agenda-class-evaluation__summary"><span><small>Desempeño</small><strong></strong></span><span><small>Asistencia</small><b></b></span></div>
            <div class="agenda-class-evaluation__note" hidden><small>Observación del instructor</small><p></p></div>
          </section>
        </div>
        <footer class="agenda-class-sheet__footer">
          <button type="button" class="btn btn-secondary" id="agenda-class-evaluation-toggle" hidden>Ver evaluación</button>
          <a class="btn btn-primary" id="agenda-class-map" href="#" target="_blank" rel="noopener">Abrir ruta</a>
        </footer>
      </section>
    </div>`;
  }

  renderStudentsModal(students) {
    const courses = [...new Set(students.map(item => item.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return `<div class="instructor-modal-overlay agenda-students-modal" id="agenda-students-modal" hidden>
      <section class="instructor-modal agenda-students-sheet" role="dialog" aria-modal="true" aria-labelledby="agenda-students-title">
        <header class="agenda-students-sheet__header">
          <div><small>Alumnos asignados</small><h2 id="agenda-students-title">Mis estudiantes</h2></div>
          <button type="button" class="agenda-students-close" aria-label="Cerrar">×</button>
        </header>
        <div class="agenda-students-controls">
          <label><span>Consultar</span><select id="agenda-students-mode" class="form-select"><option value="course">Por curso</option><option value="month">Por mes</option></select></label>
          <label><span id="agenda-students-filter-label">Curso</span><select id="agenda-students-filter" class="form-select"><option value="">Todos los cursos</option>${courses.map(course => `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`).join('')}</select></label>
        </div>
        <div class="agenda-students-results"><span id="agenda-students-total">${students.length} estudiantes</span></div>
        <div class="agenda-students-list" id="agenda-students-list">${this.renderStudentCards(students)}</div>
      </section>
    </div>`;
  }

  renderExamsModal(exams) {
    return `<div class="instructor-modal-overlay agenda-students-modal" id="agenda-exams-modal" hidden>
      <section class="instructor-modal agenda-students-sheet agenda-exams-sheet" role="dialog" aria-modal="true" aria-labelledby="agenda-exams-title">
        <header class="agenda-students-sheet__header">
          <div><small>Agenda independiente</small><h2 id="agenda-exams-title">Pr&oacute;ximos ex&aacute;menes</h2></div>
          <button type="button" class="agenda-exams-close" aria-label="Cerrar">&times;</button>
        </header>
        <div class="agenda-exams-results">${exams.length} ${exams.length === 1 ? 'formaci&oacute;n intensiva programada' : 'formaciones intensivas programadas'}</div>
        <div class="agenda-exams-list">
          ${exams.length ? exams.map((exam, index) => `<article class="agenda-exam-item ${index === 0 ? 'is-next' : ''}">
            <div class="agenda-exam-date"><small>${index === 0 ? 'Siguiente intensivo' : 'Formaci&oacute;n intensiva'}</small><strong>${formatDateTime(exam.scheduledStart)}</strong><span>${formatTime(exam.scheduledStart)}&ndash;${formatTime(exam.scheduledEnd)}</span></div>
            <div class="agenda-exam-student"><strong>${escapeHtml(exam.studentName)}</strong><span>${escapeHtml(exam.course)}</span><small>${escapeHtml(exam.secretaryRecommendations || 'Sin observaciones de Secretaría')}</small></div>
            <span class="exam-only-badge">Curso de formaci&oacute;n intensiva</span>
            ${this.isExamToday(exam)
              ? `<a class="btn btn-primary btn-small" href="/instructor/evaluations?session=${encodeURIComponent(exam.id)}&enrollment=${encodeURIComponent(exam.enrollmentId)}">Evaluar</a>`
              : `<span class="agenda-exam-wait">Disponible el ${new Date(exam.scheduledStart).toLocaleDateString('es-EC')}</span>`}
          </article>`).join('') : '<div class="instructor-empty"><strong>No tienes ex&aacute;menes futuros asignados.</strong></div>'}
        </div>
      </section>
    </div>`;
  }

  renderStudentCards(students) {
    if (!students.length) return '<div class="instructor-empty"><strong>No hay estudiantes en esta selección.</strong></div>';
    return students.map(item => `<article class="agenda-student-item">
      <div class="agenda-student-item__avatar">${escapeHtml(item.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase())}</div>
      <div class="agenda-student-item__info"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.course)}</span><small>${item.completedSessions}/${item.totalSessions} clases · ${item.progress}% de avance</small></div>
      <a class="btn btn-secondary btn-small" href="/instructor/students?enrollment=${item.enrollmentId}">Ver seguimiento</a>
    </article>`).join('');
  }

  renderSessions(items) {
    const groups=items.reduce((result,item)=>{const key=String(item.scheduledStart).slice(0,10);(result[key]||=[]).push(item);return result;},{});
    return Object.entries(groups).map(([date,sessions])=>`<section class="agenda-day"><header><div class="agenda-day__date"><strong>${new Date(`${date}T12:00:00`).toLocaleDateString('es-EC',{weekday:'long'})}</strong><span>${new Date(`${date}T12:00:00`).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})}</span></div><em>${sessions.length} actividades</em></header><div class="agenda-session-list">${sessions.map(item=>`<article class="agenda-session ${item.isExamOnly?'exam-only-session':''}"><time><strong>${formatTime(item.scheduledStart)}</strong><span>${formatTime(item.scheduledEnd)}</span></time><div class="agenda-session__student"><strong>${escapeHtml(item.studentName)}</strong><span>${escapeHtml(item.course)} · ${item.isExamOnly?'<b class="exam-only-badge">Formación intensiva</b>':`Clase ${escapeHtml(item.sessionNumber||'N/A')}`}</span><small>${escapeHtml(item.branch||'')}</small></div><div class="agenda-session__details">${item.isExamOnly?'<span><small>Tipo</small><strong>Curso intensivo</strong></span>':`<span><small>Vehículo</small><strong>${escapeHtml(item.vehicle||'Sin asignar')}</strong></span><span><small>Ruta</small>${item.recommendedRoute?`<a href="${item.recommendedRoute.mapsUrl}" target="_blank" rel="noopener">${escapeHtml(item.recommendedRoute.name)}</a>`:'<strong class="is-pending">Sin ruta</strong>'}</span>`}</div><span class="badge ${badgeClass(item.status)}">${escapeHtml(item.status)}</span><div class="agenda-session__actions">${this.renderActions(item)}</div></article>`).join('')}</div></section>`).join('');
  }

  renderActions(item) {
    const buttons = [`<button class="btn btn-secondary btn-small js-session-detail" data-id="${item.id}">Detalle</button>`];
    if (item.isExamOnly) {
      if (this.isExamToday(item)) buttons.push(`<a class="btn btn-primary btn-small" href="/instructor/evaluations?session=${encodeURIComponent(item.id)}&enrollment=${encodeURIComponent(item.enrollmentId)}">Evaluar</a>`);
      else buttons.push(`<span class="agenda-exam-wait">Disponible el ${new Date(item.scheduledStart).toLocaleDateString('es-EC')}</span>`);
      return `<div class="instructor-actions">${buttons.join('')}</div>`;
    }
    if (item.isExpired) buttons.push(`<span class="badge badge-warning">Horario vencido</span>`);
    else if (item.canStart) buttons.push(`<button class="btn btn-primary btn-small js-start-session" data-id="${item.id}">Iniciar</button>`);
    if (item.status === 'EN_CURSO') buttons.push(`<button class="btn btn-success btn-small js-complete-session" data-id="${item.id}">Registrar salida</button>`);
    const sessionDay = String(item.scheduledStart || '').slice(0, 10);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (sessionDay <= today && !['CANCELADA', 'REPROGRAMADA'].includes(item.status)) {
      buttons.push(`<a class="btn btn-secondary btn-small" href="/instructor/evaluations?mode=exoneration&session=${encodeURIComponent(item.id)}&enrollment=${encodeURIComponent(item.enrollmentId)}">Exonerar</a>`);
    }
    if (item.isQrTest) buttons.push(`<button class="btn btn-secondary btn-small js-reset-qr-test" data-id="${item.id}">Restablecer prueba</button>`);
    return `<div class="instructor-actions">${buttons.join('')}</div>`;
  }

  isExamToday(item) {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const examDate = String(item?.scheduledStart || '').slice(0, 10);
    return examDate === localToday;
  }

  getWeekRange(date) {
    const current = new Date(`${date}T12:00:00`);
    const day = current.getDay() || 7;
    const start = new Date(current);
    start.setDate(current.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  getUpcomingRange(date) {
    const start = new Date(`${date}T12:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 30);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  async mount() {
    const agendaForm = document.getElementById('agenda-filter-form');
    const applyAgendaFilters = () => {
      const values = new FormData(agendaForm);
      const qs = new URLSearchParams({
        view: values.get('view'),
        date: values.get('date'),
        status: values.get('status'),
        course: values.get('course'),
        student: values.get('student'),
      });
      window.history.pushState(null, null, `/instructor/agenda?${qs}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    agendaForm?.addEventListener('submit', event => event.preventDefault());
    agendaForm?.querySelectorAll('select,input[type="date"]').forEach(field => field.addEventListener('change', applyAgendaFilters));
    let agendaFilterTimer;
    [agendaForm?.elements.course,agendaForm?.elements.student].filter(Boolean).forEach(field=>field.addEventListener('input', () => { clearTimeout(agendaFilterTimer); agendaFilterTimer = setTimeout(applyAgendaFilters, 350); }));
    document.getElementById('clear-agenda-filters')?.addEventListener('click', () => { window.history.pushState(null, null, '/instructor/agenda'); window.dispatchEvent(new PopStateEvent('popstate')); });

    const examModal = document.getElementById('agenda-exams-modal');
    const openExams = () => {
      examModal.hidden = false;
      document.body.classList.add('modal-open');
    };
    const closeExams = () => {
      examModal.hidden = true;
      document.body.classList.remove('modal-open');
    };
    document.getElementById('open-agenda-exams')?.addEventListener('click', openExams);
    document.getElementById('open-agenda-exams')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openExams();
      }
    });
    examModal?.querySelector('.agenda-exams-close')?.addEventListener('click', closeExams);
    examModal?.addEventListener('click', event => {
      if (event.target === examModal) closeExams();
    });
    examModal?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => document.body.classList.remove('modal-open')));

    const studentModal = document.getElementById('agenda-students-modal');
    const studentMode = document.getElementById('agenda-students-mode');
    const studentFilter = document.getElementById('agenda-students-filter');
    const reportYear = Number(new URLSearchParams(window.location.search).get('date')?.slice(0, 4)) || new Date().getFullYear();
    const monthLabel = value => new Date(`${value}-01T12:00:00`).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    const renderFilteredStudents = () => {
      const selected = studentFilter.value;
      const filtered = !selected
        ? this.agendaStudents
        : this.agendaStudents.filter(item => studentMode.value === 'month'
          ? (item.sessionMonths || []).includes(selected)
          : item.course === selected);
      document.getElementById('agenda-students-list').innerHTML = this.renderStudentCards(filtered);
      const period = studentMode.value === 'month' && selected ? ` · ${monthLabel(selected)}` : '';
      document.getElementById('agenda-students-total').textContent = `${filtered.length} ${filtered.length === 1 ? 'estudiante' : 'estudiantes'}${period}`;
    };
    const refreshStudentFilter = () => {
      const values = studentMode.value === 'month'
        ? Array.from({ length: 12 }, (_, index) => `${reportYear}-${String(index + 1).padStart(2, '0')}`)
        : [...new Set(this.agendaStudents.map(item => item.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
      document.getElementById('agenda-students-filter-label').textContent = studentMode.value === 'month' ? 'Mes' : 'Curso';
      studentFilter.innerHTML = `<option value="">${studentMode.value === 'month' ? `Todos los meses de ${reportYear}` : 'Todos los cursos'}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(studentMode.value === 'month' ? monthLabel(value) : value)}</option>`).join('')}`;
      renderFilteredStudents();
    };
    const openStudents = () => {
      studentModal.hidden = false;
      document.body.classList.add('modal-open');
    };
    document.getElementById('open-agenda-students')?.addEventListener('click', openStudents);
    document.getElementById('open-agenda-students')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openStudents();
      }
    });
    studentModal?.querySelector('.agenda-students-close')?.addEventListener('click', () => {
      studentModal.hidden = true;
      document.body.classList.remove('modal-open');
    });
    studentModal?.addEventListener('click', event => {
      if (event.target === studentModal) {
        studentModal.hidden = true;
        document.body.classList.remove('modal-open');
      }
    });
    studentMode?.addEventListener('change', refreshStudentFilter);
    studentFilter?.addEventListener('change', renderFilteredStudents);
    studentModal?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => document.body.classList.remove('modal-open')));

    const classModal = document.getElementById('agenda-class-modal');
    const closeClassModal = () => {
      classModal.hidden = true;
      document.body.classList.remove('modal-open');
    };
    document.querySelectorAll('.js-session-detail').forEach(button => {
      button.addEventListener('click', () => {
        const item = this.agendaSessions.find(session => String(session.id) === String(button.dataset.id));
        if (!item) return;
        const initials = item.studentName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
        document.getElementById('agenda-class-title').textContent = item.isExamOnly ? 'Curso de formación intensiva' : `Clase ${item.sessionNumber || ''}`;
        document.getElementById('agenda-class-avatar').textContent = initials;
        document.getElementById('agenda-class-student').textContent = item.studentName;
        document.getElementById('agenda-class-course').textContent = item.course;
        const status = document.getElementById('agenda-class-status');
        status.textContent = item.status;
        status.className = `badge ${badgeClass(item.status)}`;
        document.getElementById('agenda-class-schedule').textContent = `${formatDateTime(item.scheduledStart)} – ${formatTime(item.scheduledEnd)}`;
        document.getElementById('agenda-class-number').textContent = item.isExamOnly ? 'Curso intensivo' : (item.sessionNumber ? `Clase ${item.sessionNumber}` : 'Sin especificar');
        document.getElementById('agenda-class-route').textContent = item.recommendedRoute?.name || 'Pendiente de asignar';
        const recommendation = document.getElementById('agenda-class-recommendation');
        recommendation.hidden = !item.secretaryRecommendations;
        recommendation.querySelector('p').textContent = item.secretaryRecommendations || '';
        const observation = document.getElementById('agenda-class-observation');
        observation.hidden = !item.observations;
        observation.querySelector('p').textContent = item.observations || '';
        const evaluation = document.getElementById('agenda-class-evaluation');
        const evaluationButton = document.getElementById('agenda-class-evaluation-toggle');
        const hasEvaluation = Boolean(item.performanceLevel || item.topics?.length);
        evaluation.hidden = true;
        evaluationButton.hidden = !hasEvaluation;
        evaluationButton.textContent = 'Ver evaluación';
        evaluation.querySelector('.agenda-class-topic-list').innerHTML = '';
        (item.topics || []).forEach(topic => {
          const chip = document.createElement('span');
          chip.textContent = topic.name;
          evaluation.querySelector('.agenda-class-topic-list').appendChild(chip);
        });
        const performanceLabels = { REQUIERE_ACOMPANAMIENTO:'Requiere acompañamiento', EN_DESARROLLO:'En desarrollo', CUMPLIO_OBJETIVO:'Cumplió el objetivo', DOMINO_PRACTICADO:'Dominó lo practicado' };
        evaluation.querySelector('.agenda-class-evaluation__summary strong').textContent = performanceLabels[item.performanceLevel] || item.performanceLevel || 'Sin registro';
        evaluation.querySelector('.agenda-class-evaluation__summary b').textContent = item.attendanceStatus || 'Asistió';
        const evaluationNote = evaluation.querySelector('.agenda-class-evaluation__note');
        evaluationNote.hidden = !item.observations;
        evaluationNote.querySelector('p').textContent = item.observations || '';
        const map = document.getElementById('agenda-class-map');
        map.hidden = !item.recommendedRoute?.mapsUrl;
        map.href = item.recommendedRoute?.mapsUrl || '#';
        classModal.hidden = false;
        document.body.classList.add('modal-open');
      });
    });
    classModal?.querySelector('.agenda-class-close')?.addEventListener('click', closeClassModal);
    classModal?.querySelector('#agenda-class-evaluation-toggle')?.addEventListener('click', event => {
      const evaluation = document.getElementById('agenda-class-evaluation');
      evaluation.hidden = !evaluation.hidden;
      event.currentTarget.textContent = evaluation.hidden ? 'Ver evaluación' : 'Ocultar evaluación';
    });
    classModal?.addEventListener('click', event => {
      if (event.target === classModal) closeClassModal();
    });
    document.querySelectorAll('.js-start-session').forEach(button => {
      button.addEventListener('click', () => openAttendanceQrModal(
        button.dataset.id,
        () => window.dispatchEvent(new PopStateEvent('popstate')),
      ));
    });
    document.querySelectorAll('.js-complete-session').forEach(button => {
      button.addEventListener('click', () => openAttendanceQrModal(
        button.dataset.id,
        () => openCompleteSessionModal(
          button.dataset.id,
          () => window.dispatchEvent(new PopStateEvent('popstate')),
        ),
        'EXIT',
      ));
    });
    document.querySelectorAll('.js-reset-qr-test').forEach(button => {
      button.addEventListener('click', () => {
        if (!window.confirm('¿Restablecer esta clase de prueba para generar otro QR?')) return;
        this.runAction(button, () => PracticalSessionService.resetQrTestSession(button.dataset.id));
      });
    });
  }

  async runAction(button, action) {
    try {
      button.disabled = true;
      await action();
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      window.alert(stateMessage(error));
      button.disabled = false;
    }
  }
}

export default InstructorAgendaView;
