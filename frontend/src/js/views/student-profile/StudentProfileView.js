/**
 * Student Profile View
 * Expediente del estudiante con pestañas
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import StudentService from '../../services/StudentService.js';
import ApiService from '../../core/api/apiService.js';
import PaymentService from '../../services/PaymentService.js?v=voucher-pago-20260824';
import ScheduleService from '../../services/ScheduleService.js';
import NotificationService from '../../services/NotificationService.js';
import DateHelper from '../../helpers/DateHelper.js';
import StringHelper from '../../helpers/StringHelper.js';
import { authService } from '../../core/auth/AuthService.js';

class StudentProfileView extends Component {
  async render() {
    const studentId = this.props.studentId;
    try {
      await authService.refreshAuthorization();
    } catch (error) {
      console.warn('No se pudieron actualizar los permisos del perfil:', error.message);
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId);
    if (!isUuid) {
      return `
        <div class="error-page">
          <h1>Registro temporal no disponible</h1>
          <p>Vuelve al listado y registra nuevamente el estudiante.</p>
          <button class="btn btn-primary" onclick="window.history.pushState(null, null, '/students'); window.dispatchEvent(new PopStateEvent('popstate'))">Volver a estudiantes</button>
        </div>
      `;
    }

    const student = await StudentService.getStudent(studentId);
    this.student = student;

    if (!student) {
      return `<div class="error-page"><h1>Estudiante no encontrado</h1></div>`;
    }

    let documents = [];
    try {
      const result = await ApiService.getStudentDocuments(studentId);
      documents = result.success ? result.data.filter(document => document.type !== 'foto') : [];
    } catch (error) {
      console.warn('No se pudieron cargar los documentos:', error.message);
    }

    const payments = await PaymentService.getStudentPayments(studentId);
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    let balanceInfo = { total: 0, paid: totalPaid, balance: 0 };
    try {
      balanceInfo = await PaymentService.getStudentBalance(studentId);
    } catch (error) {
      console.warn('No se pudo cargar el saldo del estudiante:', error.message);
    }
    let schedule = ScheduleService.getStudentSchedule(studentId);
    try {
      const result = await ApiService.getStudentSchedule(studentId);
      if (result.success) schedule = result.data;
    } catch (error) {
      console.warn('No se pudo cargar el horario desde la API:', error.message);
    }
    const history = await StudentService.getStudentHistory(studentId);
    const pendingBalance = Math.max(0, Number(balanceInfo?.balance || 0));
    const paidAmount = Number(balanceInfo?.paid ?? totalPaid);
    const canProcessPayments = authService.can('PAYMENT_CREATE');
    const canVoidPayments = authService.can('PAYMENT_VOID');
    const activeEnrollment = (student.enrollments || []).find(enrollment => enrollment.status === 'activo') || (student.enrollments || [])[0] || null;
    const classStartDate = activeEnrollment?.practical_start_date
      || activeEnrollment?.practicalStartDate
      || student.assignment_start_date
      || student.assignmentStartDate
      || schedule?.startDate
      || null;
    const classStartDateLabel = classStartDate
      ? DateHelper.format(`${String(classStartDate).slice(0, 10)}T12:00:00`, 'DD/MM/YYYY')
      : 'Sin fecha asignada';
    const isExamOnly = schedule?.type === 'exam_only' || schedule?.appointmentType === 'EXAM_ONLY';
    const isAdditionalPracticeOnly = student.registrationType === 'ADDITIONAL_PRACTICE'
      || ((student.additionalPractices || []).length > 0 && !(student.enrollments || []).length);
    const accessAccount = student.accessAccount;
    const canResetStudentAccess = authService.can('STUDENT_UPDATE');

    const profileContent = `
      <div class="student-profile">
        <div class="profile-back-row">
          <button type="button" class="btn btn-secondary profile-back-btn" data-route="/students">
            <span aria-hidden="true">←</span> Regresar a estudiantes
          </button>
        </div>
        <!-- Header -->
        <div class="profile-header">
          <div class="profile-header-content">
            <div class="profile-avatar">${StringHelper.getInitials(student.firstName + ' ' + student.lastName)}</div>
            <div>
              <h1>${student.firstName} ${student.lastName}</h1>
              <p>Cédula: <strong>${StringHelper.normalizeCedula(student.cedula)}</strong></p>
              <span class="badge ${isAdditionalPracticeOnly ? 'badge-info' : this.getStatusBadgeClass(student.status)}">${isAdditionalPracticeOnly ? 'Prácticas adicionales' : this.getStatusLabel(student.status)}</span>
              ${isExamOnly ? '<span class="badge badge-info student-exam-badge">Formaci&oacute;n intensiva</span>' : ''}
            </div>
          </div>
          <div class="profile-header-actions">
            <button class="btn btn-secondary" id="edit-student-btn">Editar</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
          <button class="tab-button active" data-tab="personal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Información Personal
          </button>

          <button class="tab-button" data-tab="documents">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            Documentación
          </button>

          <button class="tab-button" data-tab="financial">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            Estado Financiero
          </button>

          <button class="tab-button" data-tab="access">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Credenciales
          </button>

          <button class="tab-button" data-tab="schedule">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Horario
          </button>

          <button class="tab-button" data-tab="history">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Historial
          </button>

          <button class="tab-button" data-tab="notes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Observaciones
          </button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          <!-- Personal Info -->
          <div class="tab-pane active" data-tab="personal">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Información Personal</h3>
              </div>
              <div class="card-body">
                <div class="info-grid personal-info-grid">
                  <div class="info-item">
                    <span class="info-label">Nombre Completo</span>
                    <span class="info-value">${student.firstName} ${student.lastName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Cédula</span>
                    <span class="info-value">${StringHelper.normalizeCedula(student.cedula)}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Fecha de Nacimiento</span>
                    <span class="info-value">${DateHelper.format(student.birthDate, 'DD/MM/YYYY')}</span>
                  </div>
                  <div class="info-item info-item-wide">
                    <span class="info-label">Email</span>
                    <span class="info-value info-value-email">${student.email || 'N/A'}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Teléfono</span>
                    <span class="info-value">${student.phone || 'N/A'}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Tipo de Sangre</span>
                    <span class="info-value">${student.bloodType}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Dirección</span>
                    <span class="info-value">${student.address || 'N/A'}</span>
                  </div>
                  ${isAdditionalPracticeOnly ? `
                    <div class="info-item">
                      <span class="info-label">Tipo de registro</span>
                      <span class="info-value">Solo prácticas adicionales</span>
                    </div>
                  ` : `
                    <div class="info-item"><span class="info-label">Curso</span><span class="info-value">${student.course || 'Sin curso asignado'}</span></div>
                    <div class="info-item"><span class="info-label">Instructor</span><span class="info-value">${student.instructorName || schedule?.instructor || 'Sin instructor asignado'}${isExamOnly ? ' <span class="student-exam-inline">Intensivo</span>' : ''}</span></div>
                    <div class="info-item"><span class="info-label">Inicio de clases</span><span class="info-value">${classStartDateLabel}</span></div>
                  `}
                  <div class="info-item">
                    <span class="info-label">Estado</span>
                    <span class="badge ${isAdditionalPracticeOnly ? 'badge-info' : this.getStatusBadgeClass(student.status)}">${isAdditionalPracticeOnly ? 'Prácticas adicionales' : this.getStatusLabel(student.status)}</span>
                  </div>
                </div>
              </div>
            </div>
            ${(student.additionalPractices || []).length ? `
              <div class="card additional-practices-card">
                <div class="card-header">
                  <div>
                    <h3 class="card-title">Prácticas adicionales</h3>
                    <p class="card-subtitle">Horas prácticas contratadas fuera del curso regular.</p>
                  </div>
                  <span class="badge badge-info">${student.additionalPractices.length} registro${student.additionalPractices.length === 1 ? '' : 's'}</span>
                </div>
                <div class="card-body additional-practices-list">
                  ${student.additionalPractices.map(practice => `
                    <article class="additional-practice-profile-item">
                      <div class="additional-practice-profile-heading">
                        <div>
                          <strong>${practice.instructor_name || 'Instructor sin asignar'}</strong>
                          <span>${practice.branch_name || student.branch || ''}</span>
                        </div>
                        <span class="badge ${this.getAdditionalPracticeBadgeClass(practice.status)}">${this.getAdditionalPracticeStatusLabel(practice.status)}</span>
                      </div>
                      <div class="info-grid additional-practice-profile-grid">
                        <div class="info-item"><span class="info-label">Periodo</span><span class="info-value">${DateHelper.format(practice.start_date, 'DD/MM/YYYY')} al ${DateHelper.format(practice.end_date, 'DD/MM/YYYY')}</span></div>
                        <div class="info-item"><span class="info-label">Horario diario</span><span class="info-value">${this.formatAdditionalPracticeTime(practice.daily_start_time)}</span></div>
                        <div class="info-item"><span class="info-label">Duración</span><span class="info-value">${practice.number_of_days} días · 1 h 40 min por día</span></div>
                        <div class="info-item"><span class="info-label">Avance</span><span class="info-value">${practice.completed_days || 0} de ${practice.number_of_days} días</span></div>
                        <div class="info-item"><span class="info-label">Valor</span><span class="info-value">$${Number(practice.total_amount || 0).toFixed(2)}</span></div>
                      </div>
                    </article>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Access credentials -->
          <div class="tab-pane" data-tab="access">
            <div class="card student-access-card">
              <div class="card-header student-access-header">
                <div>
                  <h3 class="card-title">Credenciales de acceso</h3>
                  <p class="card-subtitle">Cuenta para que el estudiante ingrese a su portal.</p>
                </div>
                ${accessAccount && canResetStudentAccess ? '<button type="button" class="btn btn-secondary" id="reset-student-access-btn">Nueva contraseña temporal</button>' : ''}
              </div>
              <div class="card-body">
                ${accessAccount ? `
                  <div class="info-grid student-access-grid">
                    <div class="info-item"><span class="info-label">Usuario</span><span class="info-value credential-username">${accessAccount.username}</span></div>
                    <div class="info-item"><span class="info-label">Estado</span><span class="badge ${accessAccount.active ? 'badge-success' : 'badge-danger'}">${accessAccount.active ? 'Activo' : 'Inactivo'}</span></div>
                    <div class="info-item"><span class="info-label">Contraseña</span><span class="info-value">${accessAccount.must_change_password ? 'Cambio obligatorio al ingresar' : 'Definida por el estudiante'}</span></div>
                    <div class="info-item"><span class="info-label">Último acceso</span><span class="info-value">${accessAccount.last_login_at ? DateHelper.format(accessAccount.last_login_at, 'DD/MM/YYYY') : 'Aún no ha ingresado'}</span></div>
                  </div>
                  <p class="credential-security-note">Por seguridad, la contraseña actual no se almacena ni se puede consultar. Una nueva contraseña temporal se muestra una sola vez al restablecerla.</p>
                ` : '<p class="empty-state-text">Este estudiante todavía no tiene una cuenta de acceso creada.</p>'}
              </div>
            </div>
          </div>

          <!-- Documents -->
          <div class="tab-pane" data-tab="documents">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Documentación</h3>
              </div>
              <div class="card-body">
                <div class="form-row" style="margin-bottom: 1.5rem;">
                  ${this.renderCedulaPdfUpload(documents)}
                  ${this.renderDocumentUpload('certificado_bachiller', 'Certificado de estudio', 'application/pdf,image/*', documents)}
                </div>
                ${documents.length > 0 ? `
                  <div class="documents-list">
                    ${documents.map(doc => `
                      <div class="document-item">
                        <div class="document-info">
                          <div class="document-name">${doc.name}</div>
                        </div>
                        <div class="document-actions">
                          ${doc.file_url ? `<a class="btn btn-small btn-secondary view-document-btn" href="#" data-file-url="${doc.file_url}">Ver archivo</a>` : ''}
                          <label class="btn btn-small btn-secondary" style="cursor:pointer;">
                            Editar
                            <input type="file" class="replace-document-input" data-document-type="${doc.type}"
                              accept="application/pdf,image/jpeg,image/png" hidden>
                          </label>
                          <button type="button" class="btn btn-small btn-danger delete-document-btn"
                            data-document-id="${doc.id}" data-document-name="${doc.name}">
                            Eliminar
                          </button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <p style="color: var(--gray-500); text-align: center;">No hay documentos</p>
                `}
              </div>
            </div>
          </div>

          <!-- Financial -->
          <div class="tab-pane" data-tab="financial">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Estado Financiero</h3>
              </div>
              <div class="card-body">
                <div class="financial-info">
                  <div class="financial-item">
                    <span>Total Pagado</span>
                    <span class="financial-value" style="color: var(--success);">$${paidAmount.toFixed(2)}</span>
                  </div>
                  <div class="financial-item">
                    <span>Estado</span>
                    <span class="badge ${this.getStatusBadgeClass(student.status)}">
                      ${this.getStatusLabel(student.status)}
                    </span>
                  </div>
                </div>

                ${pendingBalance > 0 && canProcessPayments ? `
                  <button class="btn btn-primary mt-4" id="record-payment-btn"
                    data-cedula="${student.cedula}" data-balance="${pendingBalance}">
                    Procesar pago ($${pendingBalance.toFixed(2)} pendiente)
                  </button>
                ` : pendingBalance === 0 ? `
                  <p class="mt-4" style="color: var(--success); font-weight: 600;">Pago completado. No existen valores pendientes.</p>
                ` : `
                  <p class="mt-4" style="color: var(--gray-500);">Saldo pendiente: $${pendingBalance.toFixed(2)}. Debe procesarlo el personal de caja.</p>
                `}

                ${payments.length > 0 ? `
                  <div class="payments-history mt-4">
                    <h4>Historial de Pagos</h4>
                    ${payments.map(payment => `
                      <div class="payment-item">
                        <div>
                          <div class="payment-concept">${payment.concept || payment.payment_method || payment.method || 'Pago registrado'}</div>
                          <div class="payment-date">${DateHelper.format(payment.created_at || payment.date, 'DD/MM/YYYY HH:MM')}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:.75rem;">
                          <div style="font-weight: 600; color: var(--success);">$${Number(payment.amount || 0).toFixed(2)}</div>
                          ${payment.void_pending ? '<span class="badge badge-warning">Anulación pendiente</span>' : canVoidPayments && String(payment.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? `
                            <button type="button" class="btn btn-small btn-danger void-payment-btn"
                              data-payment-id="${payment.id}" data-payment-amount="${Number(payment.amount || 0).toFixed(2)}">
                              Anular
                            </button>
                          ` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div class="tab-pane" data-tab="schedule">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Horario</h3>
              </div>
              <div class="card-body">
                ${isAdditionalPracticeOnly && (student.additionalPractices || []).length ? `
                  <div class="additional-practices-list">
                    ${student.additionalPractices.map(practice => `
                      <article class="additional-practice-profile-item">
                        <div class="additional-practice-profile-heading"><div><strong>${practice.instructor_name}</strong><span>${practice.branch_name}</span></div><span class="badge ${this.getAdditionalPracticeBadgeClass(practice.status)}">${this.getAdditionalPracticeStatusLabel(practice.status)}</span></div>
                        <div class="info-grid additional-practice-profile-grid">
                          <div class="info-item"><span class="info-label">Desde</span><span class="info-value">${DateHelper.format(practice.start_date, 'DD/MM/YYYY')}</span></div>
                          <div class="info-item"><span class="info-label">Hasta</span><span class="info-value">${DateHelper.format(practice.end_date, 'DD/MM/YYYY')}</span></div>
                          <div class="info-item"><span class="info-label">Horario diario</span><span class="info-value">${this.formatAdditionalPracticeTime(practice.daily_start_time)}</span></div>
                          <div class="info-item"><span class="info-label">Duración</span><span class="info-value">${practice.number_of_days} días</span></div>
                        </div>
                      </article>
                    `).join('')}
                  </div>
                ` : schedule ? `
                  <div class="schedule-info">
                    ${isExamOnly ? '<div class="student-exam-schedule-heading"><span class="badge badge-info">Formaci&oacute;n intensiva</span><strong>Jornada intensiva programada</strong></div>' : ''}
                    <div class="info-grid">
                      <div class="info-item">
                        <span class="info-label">${isExamOnly ? 'Fecha de formación intensiva' : 'Día'}</span>
                        <span class="info-value">${schedule.day}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Hora</span>
                        <span class="info-value">${schedule.time}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Instructor</span>
                        <span class="info-value">${schedule.instructor}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Curso</span>
                        <span class="info-value">${schedule.course}</span>
                      </div>
                    </div>
                  ${isExamOnly ? '' : '<button class="btn btn-secondary mt-4" id="change-schedule-btn">Cambiar Horario</button>'}
                  </div>
                ` : `
                  <p style="color: var(--gray-500); margin-bottom: 1rem;">No tiene horario asignado</p>
                  <button class="btn btn-primary" id="select-schedule-btn">Seleccionar Horario</button>
                `}
                ${!isAdditionalPracticeOnly && !activeEnrollment ? '<div class="alert alert-warning mt-4">Este estudiante aun no tiene una matricula activa para seleccionar horario.</div>' : ''}
              </div>
            </div>
          </div>

          <!-- History -->
          <div class="tab-pane" data-tab="history">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Historial</h3>
              </div>
              <div class="card-body">
                ${history.length > 0 ? `
                  <div class="timeline">
                    ${history.map(item => `
                      <div class="timeline-item">
                        <div class="timeline-time">${DateHelper.format(item.timestamp, 'HH:MM')}</div>
                        <div class="timeline-content">${item.action}</div>
                        <div class="timeline-date">${DateHelper.format(item.timestamp, 'DD/MM/YYYY')}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <p style="color: var(--gray-500); text-align: center;">Sin historial</p>
                `}
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="tab-pane" data-tab="notes">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Observaciones</h3>
              </div>
              <div class="card-body">
                <textarea class="form-textarea" id="notes-textarea" placeholder="Añade observaciones sobre este estudiante...">${student.notes || ''}</textarea>
                <button class="btn btn-primary mt-4" id="save-notes-btn">Guardar Observaciones</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="profile-action-modal" class="modal-overlay"></div>
    `;

    const layout = await SidebarLayout.render(profileContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const studentId = this.props.studentId;

    // Tabs
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.querySelector(`.tab-pane[data-tab="${tabName}"]`)?.classList.add('active');
      });
    });

    // Buttons
    document.getElementById('edit-student-btn')?.addEventListener('click', () => {
      this.openEditStudentModal(studentId);
    });

    document.getElementById('reset-student-access-btn')?.addEventListener('click', () => {
      this.openResetStudentAccessModal(studentId);
    });

    document.getElementById('record-payment-btn')?.addEventListener('click', event => {
      this.openPaymentModal({
        studentId,
        cedula: event.currentTarget.dataset.cedula,
        balance: Number(event.currentTarget.dataset.balance || 0),
      });
    });

    document.querySelectorAll('.void-payment-btn').forEach(button => {
      button.addEventListener('click', () => this.openVoidPaymentModal({
        paymentId: button.dataset.paymentId,
        amount: Number(button.dataset.paymentAmount || 0),
      }));
    });

    document.querySelectorAll('.document-upload-input').forEach(input => {
      input.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('El archivo no puede superar 5 MB.');
          event.target.value = '';
          return;
        }
        try {
          const fileUrl = await this.readFileAsDataUrl(file);
          const response = await ApiService.createDocument(studentId, {
            type: event.target.dataset.documentType,
            name: file.name,
            fileUrl,
          });
          if (!response.success) throw new Error('No se pudo guardar el documento');
          window.dispatchEvent(new CustomEvent('erp:dataChanged', { detail: { collection: 'documents', action: 'upload' } }));
        } catch (error) {
          alert(error.message || 'No se pudo cargar el documento.');
        }
      });
    });

    document.querySelectorAll('.replace-document-input').forEach(input => {
      input.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('El archivo no puede superar 5 MB.');
          event.target.value = '';
          return;
        }
        try {
          event.target.disabled = true;
          const fileUrl = await this.readFileAsDataUrl(file);
          const response = await ApiService.createDocument(studentId, {
            type: event.target.dataset.documentType,
            name: file.name,
            fileUrl,
          });
          if (!response.success) throw new Error('No se pudo reemplazar el documento.');
          window.history.replaceState(null, null, `/student-profile/${studentId}`);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
          event.target.disabled = false;
          alert(error.message || 'No se pudo reemplazar el documento.');
        }
      });
    });

    document.querySelectorAll('.delete-document-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const name = button.dataset.documentName || 'este documento';
        if (!window.confirm(`¿Eliminar ${name} del expediente?`)) return;
        try {
          button.disabled = true;
          const response = await ApiService.deleteDocument(button.dataset.documentId);
          if (!response.success) throw new Error('No se pudo eliminar el documento.');
          window.history.replaceState(null, null, `/student-profile/${studentId}`);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
          button.disabled = false;
          alert(error.message || 'No se pudo eliminar el documento.');
        }
      });
    });

    document.querySelector('.append-blood-card-input')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      const status = document.querySelector('.append-blood-card-status');
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        if (status) status.textContent = 'El archivo no puede superar 5 MB.';
        event.target.value = '';
        return;
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
        if (status) status.textContent = 'Selecciona un PDF, JPG o PNG.';
        event.target.value = '';
        return;
      }
      try {
        event.target.disabled = true;
        if (status) status.textContent = 'Actualizando el PDF consolidado...';
        const fileUrl = await this.readFileAsDataUrl(file);
        const response = await ApiService.appendBloodCardToRegistrationPdf(studentId, { fileUrl });
        if (!response.success) throw new Error('No se pudo actualizar el PDF.');
        if (status) status.textContent = 'Carnet agregado correctamente al PDF.';
        window.history.replaceState(null, null, `/student-profile/${studentId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (error) {
        event.target.disabled = false;
        if (status) status.textContent = error.message || 'No se pudo agregar el carnet.';
      }
    });

    this.setupDocumentPreviews();
    this.setupCedulaPdfUpload(studentId);
    document.getElementById('mobile-cedula-capture')?.addEventListener('click', () => {
      this.openMobileDocumentCaptureModal(studentId, 'cedula');
    });
    document.getElementById('mobile-blood-card-capture')?.addEventListener('click', () => {
      this.openBloodCardCompletionCapture(studentId);
    });

    document.getElementById('save-notes-btn')?.addEventListener('click', () => {
      const notes = document.getElementById('notes-textarea').value;
      StudentService.updateStudent(studentId, { notes });
      alert('Observaciones guardadas');
    });

    const openScheduleModal = () => this.openScheduleModal(studentId);
    document.getElementById('select-schedule-btn')?.addEventListener('click', openScheduleModal);
    document.getElementById('change-schedule-btn')?.addEventListener('click', openScheduleModal);

    this.updateNotificationBadge();
  }

  closeProfileModal(refresh = false) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.innerHTML = '';
    if (refresh) {
      window.dispatchEvent(new CustomEvent('erp:dataChanged', {
        detail: { collection: 'student-profile', action: 'updated' },
      }));
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  async openResetStudentAccessModal(studentId) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal student-access-modal" role="dialog" aria-modal="true" aria-labelledby="student-access-title">
        <div class="modal-header">
          <div><h2 id="student-access-title">Nueva contraseña temporal</h2><p>La sesión actual del estudiante se cerrará.</p></div>
          <button type="button" class="modal-close" data-close-student-access>&times;</button>
        </div>
        <div class="modal-body">
          <p>Genera una clave nueva y entrégasela únicamente al estudiante. Tendrá que cambiarla al iniciar sesión.</p>
          <div id="student-access-result"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-student-access>Cancelar</button>
          <button type="button" class="btn btn-primary" id="confirm-reset-student-access">Generar contraseña</button>
        </div>
      </div>`;
    modal.classList.add('active');
    modal.querySelectorAll('[data-close-student-access]').forEach(button => button.addEventListener('click', () => this.closeProfileModal(false)));
    modal.querySelector('#confirm-reset-student-access')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Generando...';
      const response = await StudentService.resetStudentAccess(studentId);
      if (!response.success) {
        button.disabled = false;
        button.textContent = 'Generar contraseña';
        modal.querySelector('#student-access-result').innerHTML = `<div class="credential-error">${response.error || 'No se pudo generar la contraseña.'}</div>`;
        return;
      }
      const credentials = response.data;
      modal.querySelector('#student-access-result').innerHTML = `
        <div class="credential-result">
          <span>Usuario</span><strong>${credentials.username}</strong>
          <span>Contraseña temporal</span><strong id="temporary-student-password">${credentials.temporaryPassword}</strong>
          <button type="button" class="btn btn-secondary" id="copy-student-credentials">Copiar credenciales</button>
        </div>`;
      button.remove();
      const cancel = modal.querySelector('.modal-footer [data-close-student-access]');
      if (cancel) cancel.textContent = 'Cerrar';
      modal.querySelector('#copy-student-credentials')?.addEventListener('click', async copyEvent => {
        await navigator.clipboard.writeText(`Usuario: ${credentials.username}\nContraseña temporal: ${credentials.temporaryPassword}`);
        copyEvent.currentTarget.textContent = 'Credenciales copiadas';
      });
    });
  }

  async openEditStudentModal(studentId) {
    const modal = document.getElementById('profile-action-modal');
    const student = this.student || await StudentService.getStudent(studentId);
    if (!modal || !student) return;

    const bloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
    modal.innerHTML = `
      <div class="modal" style="max-width: 640px;">
        <div class="modal-header">
          <h3 class="modal-title">Editar estudiante</h3>
          <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="modal-body">
          <form id="edit-student-form" class="form" novalidate>
            <div class="form-row">
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label required">Nombre</label>
                <input type="text" class="form-input" name="firstName" value="${student.firstName || ''}" required>
              </div>
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label required">Apellido</label>
                <input type="text" class="form-input" name="lastName" value="${student.lastName || ''}" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label required">Cédula</label>
                <input type="text" class="form-input" name="cedula" value="${student.cedula || ''}" required>
              </div>
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label">Fecha de nacimiento</label>
                <input type="date" class="form-input" name="birthDate" value="${student.birthDate || ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" name="email" value="${student.email || ''}">
              </div>
              <div class="form-group" style="flex:1; min-width:180px;">
                <label class="form-label">Teléfono</label>
                <input type="text" class="form-input" name="phone" value="${student.phone || ''}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Dirección</label>
              <input type="text" class="form-input" name="address" value="${student.address || ''}">
            </div>

            <div class="form-group">
              <label class="form-label">Tipo de sangre</label>
              <select class="form-input" name="bloodType">
                ${bloodTypes.map(type => `<option value="${type}" ${student.bloodType === type ? 'selected' : ''}>${type}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Curso</label>
              <input type="text" class="form-input" name="course" value="${student.course || ''}">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
          <button type="button" class="btn btn-primary" id="edit-student-save-btn">Guardar cambios</button>
        </div>
      </div>
    `;
    modal.classList.add('active');
    this.bindProfileModalClose(modal);

    modal.querySelector('#edit-student-save-btn')?.addEventListener('click', async () => {
      const form = modal.querySelector('#edit-student-form');
      if (!form || !form.reportValidity()) return;

      const formData = new FormData(form);
      const updates = {
        firstName: (formData.get('firstName') || '').toString().trim(),
        lastName: (formData.get('lastName') || '').toString().trim(),
        cedula: (formData.get('cedula') || '').toString().trim(),
        birthDate: (formData.get('birthDate') || '').toString() || null,
        email: (formData.get('email') || '').toString().trim() || null,
        phone: (formData.get('phone') || '').toString().trim() || null,
        address: (formData.get('address') || '').toString().trim() || null,
        bloodType: (formData.get('bloodType') || '').toString().trim() || null,
        course: (formData.get('course') || '').toString().trim() || null,
      };

      const button = modal.querySelector('#edit-student-save-btn');
      if (button) {
        button.disabled = true;
        button.textContent = 'Guardando...';
      }

      try {
        const updatedStudent = await StudentService.updateStudent(studentId, updates);
        if (!updatedStudent) throw new Error('No se pudo actualizar el estudiante.');
        this.student = updatedStudent;
        this.closeProfileModal(true);
      } catch (error) {
        if (button) {
          button.disabled = false;
          button.textContent = 'Guardar cambios';
        }
        alert(error.message || 'No se pudieron guardar los cambios.');
      }
    });
  }

  openPaymentModal({ studentId, cedula, balance }) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal || balance <= 0) return;
    modal.innerHTML = `
      <div class="modal" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Procesar pago</h3>
          <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0">Saldo pendiente: <strong>$${balance.toFixed(2)}</strong></p>
          <form id="profile-payment-form">
            <div class="form-group">
              <label class="form-label">Monto a cobrar</label>
              <input class="form-input" name="amount" type="number" min="0.01" max="${balance}" step="0.01" value="${balance.toFixed(2)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Método de pago</label>
              <select class="form-input" name="method" required>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal>Cancelar</button>
          <button class="btn btn-primary" id="profile-pay-submit">Registrar pago</button>
        </div>
      </div>
    `;
    modal.classList.add('active');
    this.bindProfileModalClose(modal);

    modal.querySelector('#profile-pay-submit')?.addEventListener('click', async () => {
      const form = modal.querySelector('#profile-payment-form');
      if (!form.reportValidity()) return;
      const amount = Number(new FormData(form).get('amount'));
      if (amount > balance) {
        alert(`El monto no puede superar el saldo pendiente de $${balance.toFixed(2)}.`);
        return;
      }
      const submit = modal.querySelector('#profile-pay-submit');
      submit.disabled = true;
      submit.textContent = 'Registrando…';
      const result = await PaymentService.registerPayment({
        studentId,
        cedula,
        amount,
        method: new FormData(form).get('method'),
        cashier: JSON.parse(sessionStorage.getItem('erp_session') || '{}').username || 'caja',
        notify: false,
      });
      if (!result.success) {
        submit.disabled = false;
        submit.textContent = 'Registrar pago';
        alert(result.error || 'No se pudo registrar el pago.');
        return;
      }
      await this.showReceiptInProfileModal(result.receipt?.id);
    });
  }

  openVoidPaymentModal({ paymentId, amount }) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal || !paymentId) return;
    modal.innerHTML = `
      <div class="modal" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Anular pago</h3>
          <button type="button" class="modal-close" data-close-modal>&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0">Solicitarás anular el movimiento de <strong>$${amount.toFixed(2)}</strong>. El saldo no cambiará hasta que el Administrador de Sucursal lo apruebe.</p>
          <form id="void-payment-form">
            <div class="form-group">
              <label class="form-label required">Motivo de la anulación</label>
              <textarea class="form-textarea" name="reason" minlength="5" required
                placeholder="Ej.: valor ingresado incorrectamente"></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
          <button type="button" class="btn btn-danger" id="void-payment-submit">Enviar solicitud</button>
        </div>
      </div>
    `;
    modal.classList.add('active');
    this.bindProfileModalClose(modal);
    modal.querySelector('#void-payment-submit')?.addEventListener('click', async () => {
      const form = modal.querySelector('#void-payment-form');
      if (!form.reportValidity()) return;
      const submit = modal.querySelector('#void-payment-submit');
      const reason = String(new FormData(form).get('reason') || '').trim();
      submit.disabled = true;
      submit.textContent = 'Enviando…';
      try {
        const result = await ApiService.cancelPayment(paymentId, reason);
        if (!result.success) throw new Error(result.error || 'No se pudo anular el pago.');
        this.closeProfileModal(true);
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Enviar solicitud';
        alert(error.message || 'No se pudo anular el pago.');
      }
    });
  }

  async showReceiptInProfileModal(receiptId) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal || !receiptId) {
      this.closeProfileModal(true);
      return;
    }
    try {
      const result = await ApiService.getReceiptPrintHTML(receiptId);
      if (!result.success || !result.html) throw new Error('Comprobante no disponible');
      modal.innerHTML = `
        <div class="modal" style="max-width: 520px;">
          <div class="modal-header"><h3 class="modal-title">Comprobante de pago</h3><button class="modal-close" data-close-modal>×</button></div>
          <div class="modal-body">${result.html}</div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-close-modal>Cerrar</button>
            <button class="btn btn-primary" id="profile-receipt-print">Imprimir comprobante</button>
          </div>
        </div>
      `;
      this.bindProfileModalClose(modal, true);
      modal.querySelector('#profile-receipt-print')?.addEventListener('click', () => {
        const printWindow = window.open('', '_blank', 'width=460,height=720');
        if (!printWindow) {
          alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta nuevamente.');
          return;
        }
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Voucher de pago</title><style>body{margin:0;padding:18px;background:#fff}.receipt{max-width:340px!important}@page{size:80mm auto;margin:5mm}@media print{body{padding:0}}</style></head><body>${result.html}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`);
        printWindow.document.close();
      });
    } catch (error) {
      alert('El pago fue registrado, pero no se pudo cargar el comprobante.');
      this.closeProfileModal(true);
    }
  }

  bindProfileModalClose(modal, refreshOnClose = false) {
    modal.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => this.closeProfileModal(refreshOnClose));
    });
    modal.onclick = event => {
      if (event.target === modal) this.closeProfileModal(refreshOnClose);
    };
  }

  async openScheduleModal(studentId) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal) return;
    modal.innerHTML = '<div class="modal"><div class="modal-body">Cargando horarios disponibles…</div></div>';
    modal.classList.add('active');
    try {
      return await this.openCourseCycleScheduleModal(studentId, modal);
      const result = await ApiService.getSchedules();
      const schedules = result.success ? result.data : [];
      const schedulesByDay = this.groupSchedulesByDay(schedules);
      modal.innerHTML = `
        <div class="modal" style="max-width: min(1180px, 94vw); width: 100%;">
          <div class="modal-header"><h3 class="modal-title">Horarios disponibles</h3><button class="modal-close" data-close-modal>×</button></div>
          <div class="modal-body">
            ${schedules.length ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:1rem; align-items:start;">
                ${Object.entries(schedulesByDay).map(([day, daySchedules]) => `
                  <section style="border:1px solid var(--gray-200); border-radius:10px; overflow:hidden; background:#fff;">
                    <h4 style="margin:0; padding:.85rem; text-align:center; background:var(--primary); color:#fff; font-size:1rem;">${day}</h4>
                    <div style="padding:.7rem; display:grid; gap:.65rem;">
                      ${daySchedules.map(schedule => `
                        <article style="padding:.75rem; border:1px solid var(--gray-200); border-radius:7px; background:var(--gray-50);">
                          <strong style="display:block; margin-bottom:.35rem;">${schedule.time}</strong>
                          <small style="display:block; color:var(--primary); font-weight:600;">${schedule.course || 'Curso'}</small>
                          <small style="display:block; margin:.25rem 0 .5rem;">${schedule.instructor || 'Instructor por asignar'}</small>
                          <small style="display:block; margin-bottom:.65rem; font-weight:600;">${schedule.available}/${schedule.capacity} cupos</small>
                          <button class="btn btn-primary btn-block select-profile-schedule" data-schedule-id="${schedule.id}" ${Number(schedule.available) <= 0 ? 'disabled' : ''}>${Number(schedule.available) <= 0 ? 'Completo' : 'Seleccionar'}</button>
                        </article>
                      `).join('')}
                    </div>
                  </section>
                `).join('')}
              </div>
            ` : '<p>No hay horarios disponibles.</p>'}
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Cerrar</button></div>
        </div>
      `;
      this.bindProfileModalClose(modal);
      modal.querySelectorAll('.select-profile-schedule').forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          const selection = await ApiService.selectSchedule(button.dataset.scheduleId, studentId);
          if (!selection.success) {
            button.disabled = false;
            alert(selection.error || 'No se pudo asignar el horario.');
            return;
          }
          this.closeProfileModal(true);
        });
      });
    } catch (error) {
      const hasNoCurrentSchedule = error?.status === 404
        && /horario asignado|curso vigente/i.test(error.message || '');
      if (hasNoCurrentSchedule) {
        return this.openInitialCourseScheduleModal(studentId, modal);
      }
      modal.innerHTML = `<div class="modal"><div class="modal-body"><div class="form-error">${error.message || 'No se pudieron cargar los horarios.'}</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Cerrar</button></div></div>`;
      this.bindProfileModalClose(modal);
    }
  }

  async openInitialCourseScheduleModal(studentId, modal) {
    const student = this.student || {};
    const activeEnrollment = (student.enrollments || []).find(enrollment => enrollment.status === 'activo')
      || (student.enrollments || [])[0];
    if (!activeEnrollment || !student.branchId) {
      throw new Error('El estudiante no tiene una matrícula activa o una sucursal asignada.');
    }

    const courseLabel = String(student.course || '').toLowerCase();
    const vehicleType = /moto|motocicleta|clase a/.test(courseLabel) ? 'moto' : 'carro';
    const filters = { branch_id: student.branchId, vehicle_type: vehicleType };
    const [normalResult, intensiveResult] = await Promise.all([
      ApiService.getCourseEnrollmentOptions({ ...filters, modality: 'normal' }),
      ApiService.getCourseEnrollmentOptions({ ...filters, modality: 'intensivo' }),
    ]);
    const cycles = [
      ...(normalResult.success ? normalResult.data || [] : []),
      ...(intensiveResult.success ? intensiveResult.data || [] : []),
    ];

    modal.innerHTML = `
      <div class="modal profile-schedule-modal">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Asignar horario inicial</h3>
            <p style="margin:.25rem 0 0;color:var(--gray-600);">${student.firstName || ''} ${student.lastName || ''} · ${student.course || 'Curso'}</p>
          </div>
          <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="modal-body">
          ${cycles.length ? `
            <p style="margin-top:0;">Selecciona una hora. Se reservará el mismo bloque durante todos los días del curso.</p>
            <div class="profile-initial-cycles">
              ${cycles.map(cycle => this.renderInitialCycleOption(cycle)).join('')}
            </div>
            <div class="form-group" style="margin-top:1rem;">
              <label class="form-label">Horario de teoría *</label>
              <div class="theory-schedule-selector" id="profile-theory-options"></div>
            </div>
            <label class="late-pickup-notice" id="profile-late-pickup" hidden>
              <input type="checkbox" id="profile-late-pickup-confirmed">
              <span><strong>Confirmar punto de recogida</strong> A las 20:00 el instructor recoge al estudiante en la sucursal Flavio Reyes.</span>
            </label>
          ` : '<div class="student-empty">No hay un próximo curso disponible para esta sucursal.</div>'}
          <div class="form-error" id="profile-schedule-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal>Cancelar</button>
          <button class="btn btn-primary" id="confirm-initial-profile-schedule" ${cycles.length ? '' : 'disabled'}>Asignar horario</button>
        </div>
      </div>
    `;
    this.bindProfileModalClose(modal);
    if (!cycles.length) return;

    const theoryHost = modal.querySelector('#profile-theory-options');
    const renderTheoryOptions = cycle => {
      const options = cycle?.theoryOptions || { regular: true, saturday: true, virtual: true };
      const items = [];
      if (options.regular !== false) items.push('<label class="enrollment-modality-button"><input type="radio" name="profileTheorySchedule" value="presencial_regular"><strong>Presencial · lunes a viernes</strong><span>18:00 a 20:00</span></label>');
      if (options.saturday !== false) items.push('<label class="enrollment-modality-button"><input type="radio" name="profileTheorySchedule" value="presencial_intensivo"><strong>Presencial · sábado</strong><span>08:00 a 12:30</span></label>');
      if (options.virtual !== false) items.push('<label class="enrollment-modality-button"><input type="radio" name="profileTheorySchedule" value="virtual"><strong>Teoría virtual</strong><span>Sin horario fijo</span></label>');
      theoryHost.innerHTML = items.join('');
      theoryHost.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
        theoryHost.querySelectorAll('.enrollment-modality-button').forEach(label => label.classList.toggle('active', label.contains(input)));
      }));
    };
    renderTheoryOptions(cycles[0]);

    modal.querySelectorAll('[data-initial-schedule]').forEach(button => {
      button.addEventListener('click', () => {
        modal.querySelectorAll('[data-initial-schedule]').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        const cycle = cycles.find(item => item.id === button.dataset.cycleId);
        renderTheoryOptions(cycle);
        const isLateManta = /manta\s*2000/i.test(student.branch || '') && button.dataset.startTime === '20:00';
        const warning = modal.querySelector('#profile-late-pickup');
        warning.hidden = !isLateManta;
        if (!isLateManta) warning.querySelector('input').checked = false;
        modal.querySelector('#profile-schedule-error').textContent = '';
      });
    });

    modal.querySelector('#confirm-initial-profile-schedule')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const selected = modal.querySelector('[data-initial-schedule].selected');
      const theorySchedule = modal.querySelector('[name="profileTheorySchedule"]:checked')?.value;
      const errorHost = modal.querySelector('#profile-schedule-error');
      errorHost.textContent = '';
      if (!selected) {
        errorHost.textContent = 'Selecciona una hora disponible.';
        return;
      }
      if (!theorySchedule) {
        errorHost.textContent = 'Selecciona el horario de teoría.';
        return;
      }
      const lateWarning = modal.querySelector('#profile-late-pickup');
      if (!lateWarning.hidden && !modal.querySelector('#profile-late-pickup-confirmed')?.checked) {
        errorHost.textContent = 'Confirma que se informó el punto de recogida de las 20:00.';
        return;
      }
      try {
        const cycle = cycles.find(item => item.id === selected.dataset.cycleId);
        const slot = (cycle?.slots || []).find(item => item.startTime === selected.dataset.startTime && item.endTime === selected.dataset.endTime);
        const requiredClasses = Math.max(Number(cycle?.durationBusinessDays) || 0, 1);
        const dates = Object.entries(slot?.occupancyByDate || {})
          .filter(([, availability]) => Number(availability.available) > 0)
          .map(([date]) => date)
          .sort()
          .slice(0, requiredClasses);
        if (dates.length !== requiredClasses) throw new Error('Esa hora ya no tiene cupo durante todos los días del curso.');
        const time = `${slot.startTime} - ${slot.endTime}`;
        const schedulePlan = {
          rotation: false,
          theorySchedule,
          selections: dates.map(date => ({
            id: `cycle:${cycle.id}:${slot.startTime}-${slot.endTime}`,
            cycleId: cycle.id,
            time,
            date,
            course: cycle.vehicleType,
          })),
        };
        button.disabled = true;
        button.textContent = 'Asignando...';
        const response = await ApiService.reserveCourseCycleSchedule({ studentId, schedulePlan });
        if (!response.success) throw new Error(response.error || 'No se pudo asignar el horario.');
        this.closeProfileModal(true);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Asignar horario';
        errorHost.textContent = error.message || 'No se pudo asignar el horario.';
      }
    });
  }

  renderInitialCycleOption(cycle) {
    const slots = (cycle.slots || []).map(slot => {
      const dates = Object.values(slot.occupancyByDate || {});
      const required = Math.max(Number(cycle.durationBusinessDays) || 0, 1);
      const available = dates.length >= required
        ? Math.min(...dates.map(item => Number(item.available || 0)))
        : 0;
      return `
        <button type="button" class="schedule-option profile-initial-slot ${available > 0 ? '' : 'disabled'}"
          data-initial-schedule data-cycle-id="${cycle.id}" data-start-time="${slot.startTime}" data-end-time="${slot.endTime}"
          ${available > 0 ? '' : 'disabled'}>
          <strong>${slot.startTime} - ${slot.endTime}</strong>
          <span class="schedule-option-status ${available > 0 ? 'available' : 'full'}">${available > 0 ? `${available} cupo${available === 1 ? '' : 's'}` : 'Completo'}</span>
        </button>`;
    }).join('');
    return `
      <section class="profile-initial-cycle">
        <div class="profile-initial-cycle-head">
          <div><strong>${cycle.modality === 'intensivo' ? 'Intensivo' : 'Normal'} · ${cycle.code}</strong><span>${cycle.startDate} al ${cycle.endDate}</span></div>
        </div>
        <div class="profile-initial-slot-grid">${slots}</div>
      </section>`;
  }

  async openCourseCycleScheduleModal(studentId, modal) {
    const result = await ApiService.getStudentScheduleChangeOptions(studentId);
    const cycle = result.success ? result.data : null;
    modal.innerHTML = `
      <div class="modal profile-schedule-modal">
        <div class="modal-header">
          <h3 class="modal-title">Cambiar horarios</h3>
          <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="modal-body">
          ${cycle ? `${this.renderProfileScheduleCalendar(cycle)}
            <label class="profile-schedule-observation" for="profile-schedule-observation">
              <span>Observación del cambio <strong>*</strong></span>
              <textarea id="profile-schedule-observation" class="form-textarea" maxlength="1000" rows="3"
                placeholder="Escribe el motivo del cambio de horario..."></textarea>
              <small>Esta observación se guardará en el historial y se mostrará al instructor.</small>
            </label>` : `<p>${result.error || 'El estudiante no tiene un curso vigente con horario asignado.'}</p>`}
          <div class="form-error" id="profile-schedule-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal>Cerrar</button>
          <button class="btn btn-primary" id="confirm-profile-schedule" ${cycle ? '' : 'disabled'}>Guardar cambios</button>
        </div>
      </div>
    `;
    this.bindProfileModalClose(modal);
    if (cycle) this.mountProfileScheduleModal(modal, studentId);
  }

  renderProfileScheduleCalendar(cycle) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const days = this.getProfileBusinessDays(cycle.startDate, cycle.endDate)
      .filter(day => day.date >= today);
    const slots = [...(cycle.slots || [])]
      .sort((first, second) => String(first.startTime || '').localeCompare(String(second.startTime || '')));
    const instructorName = (cycle.currentAssignments || []).find(item => item.instructorName)?.instructorName || '';
    return `
      <div class="enrollment-calendar" data-course="${cycle.vehicleType}" data-cycle-id="${cycle.id}" data-day-window-start="0" data-day-count="${days.length}">
        <div class="enrollment-calendar-head">
          <div>
            <strong>${cycle.course || (cycle.vehicleType === 'moto' ? 'Moto' : 'Automovil')} · ${cycle.code || ''}</strong>
            <span>Inicio ${cycle.startDate} · hasta ${cycle.endDate}</span>
          </div>
          <div class="calendar-toolbar">
            <div class="calendar-window-controls">
              <button type="button" class="calendar-window-btn" data-direction="-1" aria-label="Dias anteriores">&lt;</button>
              <span class="calendar-window-label"></span>
              <button type="button" class="calendar-window-btn" data-direction="1" aria-label="Dias siguientes">&gt;</button>
            </div>
          </div>
        </div>
        <div class="schedule-rotation-message">Puedes cambiar uno, varios o todos los d&iacute;as siguientes. El instructor se mantendr&aacute;${instructorName ? `: <strong>${instructorName}</strong>` : ''}.</div>
        <div class="enrollment-calendar-grid" style="--cycle-count: ${Math.min(days.length, 5)};">
          <div class="enrollment-calendar-heading">Hora</div>
          ${days.map((day, dayIndex) => `
            <div class="enrollment-calendar-heading ${day.isExamDay ? 'exam-day' : ''}" data-day-index="${dayIndex}">
              <strong>${day.name}</strong>
              <span>${day.isExamDay ? `${day.label} · Intensivo` : day.label}</span>
            </div>
          `).join('')}
          ${slots.map(slot => {
            const time = `${slot.startTime} - ${slot.endTime}`;
            return `
              <div class="enrollment-calendar-time">${time}</div>
              ${days.map((day, dayIndex) => this.renderProfileScheduleCell(cycle, slot, day, dayIndex)).join('')}
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderProfileScheduleCell(cycle, slot, day, dayIndex) {
    const availability = slot.occupancyByDate?.[day.date] || {};
    const available = Number(availability.available ?? slot.available ?? 0);
    const assignment = (cycle.currentAssignments || []).find(item => item.date === day.date);
    const isCurrent = Boolean(assignment
      && assignment.startTime === slot.startTime
      && assignment.endTime === slot.endTime);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isPast = day.date < today;
    const disabled = available <= 0 || !assignment || isPast || isCurrent;
    const time = `${slot.startTime} - ${slot.endTime}`;
    const payload = JSON.stringify({
      id: `cycle:${cycle.id}:${slot.startTime}-${slot.endTime}`,
      cycleId: cycle.id,
      time,
      date: day.date,
      dayLabel: day.name,
      dayIndex,
      course: cycle.vehicleType,
    }).replace(/"/g, '&quot;');
    return `
      <button type="button"
        class="schedule-option ${day.isExamDay ? 'exam-day' : ''} ${isCurrent ? 'current' : ''} ${disabled ? 'disabled' : ''}"
        data-schedule="${payload}"
        data-time="${time}"
        data-date="${day.date}"
        data-day-index="${dayIndex}"
        ${disabled ? 'disabled' : ''}>
        <span class="schedule-option-status ${isCurrent ? 'available' : (disabled ? 'full' : 'available')}">${isCurrent ? 'Actual' : (isPast ? 'Pasado' : (!assignment ? 'Sin asignación' : (available <= 0 ? 'Completo' : 'Disponible')))}</span>
        <span class="schedule-option-capacity">${available}/${slot.capacity} cupos</span>
      </button>
    `;
  }

  mountProfileScheduleModal(modal, studentId) {
    modal.querySelectorAll('.schedule-option').forEach(option => {
      option.addEventListener('click', () => this.handleProfileScheduleCellClick(modal, option));
    });
    modal.querySelectorAll('.calendar-window-btn').forEach(button => {
      button.addEventListener('click', () => this.shiftProfileCalendarWindow(button.closest('.enrollment-calendar'), Number(button.dataset.direction)));
    });
    modal.querySelectorAll('.enrollment-calendar').forEach(calendar => this.updateProfileCalendarWindow(calendar));
    modal.querySelector('#confirm-profile-schedule')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const calendar = modal.querySelector('.enrollment-calendar');
      const selections = this.getProfileScheduleSelections(calendar);
      const observationField = modal.querySelector('#profile-schedule-observation');
      const observation = observationField?.value.trim() || '';
      const error = modal.querySelector('#profile-schedule-error');
      if (error) error.textContent = '';
      if (!selections.length) {
        if (error) error.textContent = 'Debes seleccionar un horario disponible.';
        return;
      }
      if (!observation) {
        if (error) error.textContent = 'Debes escribir una observación para informar al instructor.';
        observationField?.focus();
        return;
      }
      try {
        button.disabled = true;
        button.textContent = 'Guardando...';
        const response = await ApiService.changeStudentScheduleDay({
          studentId,
          cycleId: selections[0].cycleId,
          changes: selections.map(selection => ({
            date: selection.date,
            time: selection.time,
          })),
          observation,
        });
        if (!response.success) throw new Error(response.error || 'No se pudo cambiar el horario.');
        this.closeProfileModal(true);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Guardar cambios';
        if (error) modal.querySelector('#profile-schedule-error').textContent = error.message || 'No se pudo cambiar el horario.';
      }
    });
  }

  handleProfileScheduleCellClick(modal, option) {
    if (!option || option.classList.contains('disabled')) return;
    const calendar = option.closest('.enrollment-calendar');
    const error = modal.querySelector('#profile-schedule-error');
    if (error) error.textContent = '';
    if (option.classList.contains('selected')) {
      option.classList.remove('selected');
      return;
    }
    calendar.querySelectorAll(`.schedule-option.selected[data-date="${option.dataset.date}"]`)
      .forEach(cell => cell.classList.remove('selected'));
    option.classList.add('selected');
  }

  getProfileScheduleSelections(calendar) {
    return [...(calendar?.querySelectorAll('.schedule-option.selected') || [])].map(option => JSON.parse(option.dataset.schedule || '{}'));
  }

  shiftProfileCalendarWindow(calendar, direction) {
    const dayCount = Number(calendar?.dataset.dayCount || 0);
    const maximumStart = Math.max(0, dayCount - 5);
    const currentStart = Number(calendar?.dataset.dayWindowStart || 0);
    calendar.dataset.dayWindowStart = String(Math.max(0, Math.min(maximumStart, currentStart + direction)));
    this.updateProfileCalendarWindow(calendar);
  }

  updateProfileCalendarWindow(calendar) {
    if (!calendar) return;
    const dayCount = Number(calendar.dataset.dayCount || 0);
    const start = Number(calendar.dataset.dayWindowStart || 0);
    const end = Math.min(dayCount, start + 5);
    calendar.querySelectorAll('[data-day-index]').forEach(element => {
      const dayIndex = Number(element.dataset.dayIndex);
      element.classList.toggle('calendar-day-hidden', dayIndex < start || dayIndex >= end);
    });
    const label = calendar.querySelector('.calendar-window-label');
    if (label) label.textContent = dayCount > 5 ? `${start + 1}-${end} de ${dayCount}` : `${dayCount} dias`;
    const previous = calendar.querySelector('.calendar-window-btn[data-direction="-1"]');
    const next = calendar.querySelector('.calendar-window-btn[data-direction="1"]');
    if (previous) previous.disabled = start <= 0;
    if (next) next.disabled = end >= dayCount;
  }

  getProfileBusinessDays(startDate, endDate) {
    const days = [];
    const names = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        const date = cursor.toISOString().slice(0, 10);
        days.push({ date, name: names[day], label: date.slice(5) });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (days.length) days[days.length - 1].isExamDay = true;
    return days;
  }

  getStudentVehicleType(student) {
    const text = JSON.stringify(student || {}).toLowerCase();
    return text.includes('moto') || text.includes('clase-a') || text.includes('clase a') ? 'moto' : 'carro';
  }

  groupSchedulesByDay(schedules) {
    const order = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const grouped = schedules.reduce((groups, schedule) => {
      const day = schedule.day || 'Sin día';
      if (!groups[day]) groups[day] = [];
      groups[day].push(schedule);
      return groups;
    }, {});
    return Object.fromEntries(
      Object.entries(grouped).sort(([firstDay], [secondDay]) => {
        const firstIndex = order.indexOf(firstDay);
        const secondIndex = order.indexOf(secondDay);
        return (firstIndex === -1 ? 99 : firstIndex) - (secondIndex === -1 ? 99 : secondIndex);
      })
    );
  }

  renderDocumentUpload(type, label, accept, documents) {
    const uploaded = documents.find(document => document.type === type && document.file_url);
    if (uploaded) {
      return `
        <div class="form-group" style="flex: 1; min-width: 220px;">
          <label class="form-label">${label}</label>
          <small style="display:block; color:#047857; font-weight:700;">Documento cargado</small>
        </div>
      `;
    }
    return `
      <div class="form-group" style="flex: 1; min-width: 220px;">
        <label class="form-label">${label}</label>
        <input type="file" class="form-input document-upload-input"
          data-document-type="${type}" accept="${accept}">
        <small style="color: var(--gray-500);">${uploaded ? `Archivo cargado: ${uploaded.name}` : 'Pendiente de carga'}</small>
      </div>
    `;
  }

  renderCedulaPdfUpload(documents) {
    const uploaded = documents.find(document => document.type === 'cedula' && document.file_url);
    const bloodCard = documents.find(document => document.type === 'carnet_tipo_sangre' && document.file_url);
    if (uploaded) {
      return `
        <div class="form-group" style="flex: 1 1 100%;">
          <label class="form-label">Cedula de identidad y carnet de tipo sanguineo</label>
          <small style="display:block; color:#047857; font-weight:700;">
            ${bloodCard ? 'Documento consolidado completo' : 'Cedula cargada; falta agregar el carnet'}
          </small>
          ${uploaded.file_url ? `<a class="btn btn-small btn-secondary view-document-btn" style="margin-top:.5rem; display:inline-block" href="#" data-file-url="${uploaded.file_url}">Ver PDF actual</a>` : ''}
          ${!bloodCard ? `
            <label class="form-label" style="display:block; margin-top:1rem;">Agregar carnet al PDF existente</label>
            <input type="file" class="form-input append-blood-card-input" accept="application/pdf,image/jpeg,image/png">
            <button type="button" class="btn btn-primary" id="mobile-blood-card-capture" style="margin-top:.65rem;">
              Capturar carnet desde telefono
            </button>
            <small class="append-blood-card-status" style="display:block; margin-top:.4rem; color:var(--gray-500);">
              Sube el carnet en PDF, JPG o PNG. Se anexara al PDF de cedula ya guardado.
            </small>
          ` : ''}
        </div>
      `;
    }
    return `
      <div class="form-group" style="flex: 1 1 100%;">
        <label class="form-label">Cédula de identidad (PDF escaneado)</label>
        <div class="form-row">
          <div class="form-group" style="flex: 1;">
            <label class="form-label">Foto del anverso</label>
            <input type="file" class="form-input" id="cedula-front" accept="image/*">
          </div>
          <div class="form-group" style="flex: 1;">
            <label class="form-label">Foto del reverso</label>
            <input type="file" class="form-input" id="cedula-back" accept="image/*">
          </div>
        </div>
        <button type="button" class="btn btn-secondary" id="generate-cedula-pdf">Generar PDF de cédula</button>
        <button type="button" class="btn btn-primary" id="mobile-cedula-capture" style="margin-left:.5rem;">Capturar desde telefono</button>
        <small id="cedula-pdf-status" style="display:block; margin-top:.5rem; color:var(--gray-500);">
          ${uploaded ? `PDF cargado: ${uploaded.name}` : 'Sube ambas fotos; el sistema generará el PDF.'}
        </small>
        ${uploaded ? `<a class="btn btn-small btn-secondary view-document-btn" style="margin-top:.5rem; display:inline-block" href="#" data-file-url="${uploaded.file_url}">Ver PDF actual</a>` : ''}
      </div>
    `;
  }

  setupCedulaPdfUpload(studentId) {
    const frontInput = document.getElementById('cedula-front');
    const backInput = document.getElementById('cedula-back');
    const button = document.getElementById('generate-cedula-pdf');
    const status = document.getElementById('cedula-pdf-status');
    if (!frontInput || !backInput || !button) return;

    button.addEventListener('click', async () => {
      const front = frontInput.files?.[0];
      const back = backInput.files?.[0];
      if (!front || !back) {
        status.textContent = 'Selecciona las fotos del anverso y reverso.';
        return;
      }
      if (front.size > 5 * 1024 * 1024 || back.size > 5 * 1024 * 1024) {
        status.textContent = 'Cada imagen debe pesar como máximo 5 MB.';
        return;
      }
      try {
        button.disabled = true;
        status.textContent = 'Generando PDF de cédula…';
        const pdfBlob = await this.createCedulaPdf(front, back);
        const fileUrl = await this.readFileAsDataUrl(pdfBlob);
        const response = await ApiService.createDocument(studentId, {
          type: 'cedula', name: `cedula-${studentId}.pdf`, fileUrl,
        });
        if (!response.success) throw new Error('No se pudo guardar el PDF de cédula.');
        status.textContent = 'PDF de cédula generado y guardado correctamente.';
        window.dispatchEvent(new CustomEvent('erp:dataChanged', { detail: { collection: 'documents', action: 'cedula-pdf-created' } }));
      } catch (error) {
        status.textContent = error.message || 'No se pudo generar el PDF.';
      } finally {
        button.disabled = false;
      }
    });
  }

  async openBloodCardCompletionCapture(studentId) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.innerHTML = '<div class="modal"><div class="modal-body">Generando QR para este estudiante...</div></div>';
    let timer = null;
    const close = (refresh = false) => {
      if (timer) window.clearInterval(timer);
      this.closeProfileModal(refresh);
    };

    try {
      const response = await ApiService.createMobileDocumentUploadToken({ studentId, type: 'completar_carnet' });
      if (!response.success) throw new Error(response.error || 'No se pudo crear el enlace.');
      const token = response.data;
      const localOrigin = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const uploadUrl = localOrigin && token.localUploadUrl
        ? token.localUploadUrl
        : `${window.location.origin}/mobile-upload/${token.token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(uploadUrl)}`;

      modal.innerHTML = `
        <div class="modal mobile-capture-modal">
          <div class="modal-header">
            <h3 class="modal-title">Capturar carnet desde telefono</h3>
            <button type="button" class="modal-close" data-close-blood-card>&times;</button>
          </div>
          <div class="modal-body">
            <div class="mobile-capture-content">
              <div class="mobile-capture-qr"><img src="${qrUrl}" alt="QR para capturar el carnet"></div>
              <div class="mobile-capture-instructions">
                <strong>${token.studentName}</strong>
                <span>QR exclusivo para este estudiante</span>
                <p>Escanea el QR y toma una foto del carnet de tipo sanguineo. Al recibirla podras agregarla al PDF de cedula.</p>
                <small id="blood-card-capture-status">Esperando la foto desde el telefono...</small>
                <div id="blood-card-capture-preview" class="mobile-capture-preview" hidden></div>
              </div>
            </div>
          </div>
          <div class="modal-footer" data-blood-card-footer>
            <button type="button" class="btn btn-secondary" data-close-blood-card>Cancelar</button>
          </div>
        </div>
      `;
      modal.querySelectorAll('[data-close-blood-card]').forEach(button => button.addEventListener('click', () => close(false)));

      timer = window.setInterval(async () => {
        try {
          const result = await ApiService.getMobileDocumentUploadResult(token.token);
          if (!result.success || !result.data?.completed) return;
          window.clearInterval(timer);
          timer = null;
          const fileUrl = result.data.fileUrl;
          const status = modal.querySelector('#blood-card-capture-status');
          if (status) status.textContent = 'Foto recibida. Revisala y agregala al PDF.';
          const preview = modal.querySelector('#blood-card-capture-preview');
          if (preview) {
            preview.hidden = false;
            preview.innerHTML = `<img src="${fileUrl}" alt="Carnet recibido" style="max-width:100%; border-radius:8px;">`;
          }
          const footer = modal.querySelector('[data-blood-card-footer]');
          if (footer) {
            footer.innerHTML = `
              <button type="button" class="btn btn-secondary" data-cancel-blood-card>Cancelar</button>
              <button type="button" class="btn btn-primary" data-save-blood-card>Agregar al PDF</button>
            `;
            footer.querySelector('[data-cancel-blood-card]')?.addEventListener('click', () => close(false));
            footer.querySelector('[data-save-blood-card]')?.addEventListener('click', async event => {
              const button = event.currentTarget;
              button.disabled = true;
              button.textContent = 'Actualizando PDF...';
              try {
                const merged = await ApiService.appendBloodCardToRegistrationPdf(studentId, { fileUrl });
                if (!merged.success) throw new Error('No se pudo actualizar el PDF.');
                close(true);
              } catch (error) {
                button.disabled = false;
                button.textContent = 'Agregar al PDF';
                if (status) status.textContent = error.message || 'No se pudo actualizar el PDF.';
              }
            });
          }
        } catch (error) {
          const status = modal.querySelector('#blood-card-capture-status');
          if (status) status.textContent = error.message || 'No se pudo consultar la captura.';
        }
      }, 2000);
    } catch (error) {
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header"><h3 class="modal-title">Capturar carnet</h3></div>
          <div class="modal-body"><div class="form-error">${error.message || 'No se pudo generar el QR.'}</div></div>
          <div class="modal-footer"><button class="btn btn-secondary" data-close-blood-card>Cerrar</button></div>
        </div>`;
      modal.querySelector('[data-close-blood-card]')?.addEventListener('click', () => close(false));
    }
  }

  async openMobileDocumentCaptureModal(studentId, type) {
    const modal = document.getElementById('profile-action-modal');
    if (!modal) return;
    let resultTimer = null;

    modal.classList.add('active');
    modal.innerHTML = `
      <div class="modal mobile-capture-modal">
        <div class="modal-header">
          <h3 class="modal-title">Capturar desde telefono</h3>
          <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="modal-body">
          <p>Generando enlace temporal...</p>
        </div>
      </div>
    `;
    this.bindProfileModalClose(modal);

    try {
      const response = await ApiService.createMobileDocumentUploadToken({ studentId, type });
      if (!response.success) throw new Error(response.error || 'No se pudo crear el enlace.');

      const token = response.data;
      const localOrigin = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const uploadUrl = localOrigin && token.localUploadUrl
        ? token.localUploadUrl
        : `${window.location.origin}/mobile-upload/${token.token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(uploadUrl)}`;

      modal.innerHTML = `
        <div class="modal mobile-capture-modal">
          <div class="modal-header">
            <h3 class="modal-title">Capturar desde telefono</h3>
            <button class="modal-close" data-close-modal>×</button>
          </div>
          <div class="modal-body">
            <div class="mobile-capture-content">
              <div class="mobile-capture-qr">
                <img src="${qrUrl}" alt="QR para capturar documento">
              </div>
              <div class="mobile-capture-instructions">
                <strong>${token.studentName}</strong>
                <span>${token.documentName || 'Documento'}</span>
                <p>Escanea el QR con el telefono, toma ambas fotos y guarda el PDF. El enlace vence en 15 minutos.</p>
                <a href="${uploadUrl}" target="_blank" rel="noopener">${uploadUrl}</a>
                <small id="individual-document-capture-status" style="display:block;margin-top:.75rem;">Esperando el documento desde el teléfono...</small>
                <div id="individual-document-capture-preview" class="mobile-capture-preview" hidden></div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-close-modal>Cerrar y actualizar</button>
          </div>
        </div>
      `;
      this.bindProfileModalClose(modal, true);
      resultTimer = window.setInterval(async () => {
        if (!modal.classList.contains('active')) {
          window.clearInterval(resultTimer);
          resultTimer = null;
          return;
        }
        try {
          const result = await ApiService.getMobileDocumentUploadResult(token.token);
          if (!result.success || !result.data?.completed || !result.data.fileUrl) return;
          window.clearInterval(resultTimer);
          resultTimer = null;
          const status = modal.querySelector('#individual-document-capture-status');
          if (status) status.textContent = 'Documento recibido. Revisa la vista previa antes de cerrar.';
          const preview = modal.querySelector('#individual-document-capture-preview');
          if (preview) {
            const fileResponse = await fetch(result.data.fileUrl);
            const pdfBlob = await fileResponse.blob();
            const previewUrl = URL.createObjectURL(pdfBlob);
            preview.hidden = false;
            preview.innerHTML = `
              <iframe src="${previewUrl}" title="Vista previa del documento recibido"></iframe>
              <div class="mobile-capture-preview-actions">
                <a class="btn btn-small btn-secondary" href="${previewUrl}" target="_blank" rel="noopener">Abrir PDF completo</a>
                <button type="button" class="btn btn-small btn-primary" data-retake-document>Volver a tomar fotos</button>
              </div>
            `;
            preview.querySelector('[data-retake-document]')?.addEventListener('click', () => {
              URL.revokeObjectURL(previewUrl);
              preview.hidden = true;
              preview.innerHTML = '';
              if (status) status.textContent = 'Generando un nuevo enlace para repetir la captura...';
              this.openMobileDocumentCaptureModal(studentId, type);
            });
            window.setTimeout(() => URL.revokeObjectURL(previewUrl), 120000);
          }
        } catch (pollError) {
          const status = modal.querySelector('#individual-document-capture-status');
          if (status) status.textContent = pollError.message || 'No se pudo consultar el documento recibido.';
        }
      }, 2000);
    } catch (error) {
      if (resultTimer) window.clearInterval(resultTimer);
      modal.innerHTML = `
        <div class="modal mobile-capture-modal">
          <div class="modal-header">
            <h3 class="modal-title">Capturar desde telefono</h3>
            <button class="modal-close" data-close-modal>×</button>
          </div>
          <div class="modal-body">
            <div class="form-error">${error.message || 'No se pudo crear el enlace.'}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-close-modal>Cerrar</button>
          </div>
        </div>
      `;
      this.bindProfileModalClose(modal);
    }
  }

  setupDocumentPreviews() {
    document.querySelectorAll('.view-document-btn').forEach(link => {
      link.addEventListener('click', async event => {
        event.preventDefault();
        const dataUrl = link.dataset.fileUrl;
        if (!dataUrl) return;

        const preview = window.open('', '_blank');
        try {
          const response = await fetch(dataUrl);
          const file = await response.blob();
          const fileUrl = URL.createObjectURL(file);
          if (preview) preview.location.replace(fileUrl);
          else window.location.assign(fileUrl);
          setTimeout(() => URL.revokeObjectURL(fileUrl), 120000);
        } catch (error) {
          if (preview) preview.close();
          alert('No se pudo abrir el documento. Intenta descargarlo nuevamente.');
        }
      });
    });
  }

  async createCedulaPdf(frontFile, backFile) {
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
      'BT /F1 18 Tf 48 805 Td (Cedula de identidad) Tj ET',
      'BT /F1 10 Tf 48 785 Td (Documento generado desde fotografias del anverso y reverso.) Tj ET',
      'BT /F1 12 Tf 48 755 Td (Anverso) Tj ET',
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
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsDataURL(file);
    });
  }

  getStatusLabel(status) {
    const labels = {
      pendiente_documentacion: 'Pendiente Documentación',
      pendiente_pago: 'Pendiente Pago',
      pago_parcial: 'Pago Parcial',
      pago_confirmado: 'Pago Confirmado',
      horario_seleccionado: 'Horario Seleccionado',
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

  getAdditionalPracticeStatusLabel(status) {
    return ({
      SCHEDULED: 'Programada',
      IN_PROGRESS: 'En prácticas',
      COMPLETED: 'Finalizada',
      CANCELLED: 'Cancelada',
    })[String(status || '').toUpperCase()] || status || 'Sin estado';
  }

  getAdditionalPracticeBadgeClass(status) {
    return ({
      SCHEDULED: 'badge-info',
      IN_PROGRESS: 'badge-success',
      COMPLETED: 'badge-primary',
      CANCELLED: 'badge-danger',
    })[String(status || '').toUpperCase()] || 'badge-primary';
  }

  formatAdditionalPracticeTime(value) {
    const match = String(value || '').match(/^(\d{2}):(\d{2})/);
    if (!match) return 'Sin horario';
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    const endMinutes = startMinutes + 100;
    const format = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return `${format(startMinutes)} – ${format(endMinutes)}`;
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      const unreadCount = NotificationService.getAllNotifications().filter(n => !n.read).length;
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      }
    }
  }
}

export default StudentProfileView;
