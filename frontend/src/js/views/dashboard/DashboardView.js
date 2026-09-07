/**
 * Dashboard View
 * Pantalla principal del sistema
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import DashboardService from '../../services/DashboardService.js';
import NotificationService from '../../services/NotificationService.js';
import StudentService from '../../services/StudentService.js';
import StudentsView from '../students/StudentsView.js';
import { authService } from '../../core/auth/AuthService.js';
import DateHelper from '../../helpers/DateHelper.js';
import ApiService from '../../core/api/apiService.js';

class DashboardView extends Component {
  constructor(props = {}) {
    super(props);
    this.studentsView = new StudentsView();
  }

  async render() {
    try { await authService.refreshAuthorization(); }
    catch (error) { console.warn('No se pudieron actualizar los permisos del Dashboard:', error.message); }
    const user = authService.getCurrentUser();
    const canViewPayments = authService.can('PAYMENT_VIEW');
    if (String(user?.role || '').trim().toLowerCase() === 'instructor') {
      window.history.replaceState(null, null, '/instructor');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return '';
    }
    const students = await StudentService.getAllStudents();
    let documentSummaries = [];
    try {
      const result = await ApiService.getDocumentStudentSummaries();
      documentSummaries = result.success ? result.data : [];
    } catch (error) {
      console.warn('No se pudo cargar el resumen de documentacion:', error.message);
    }
    const [stats, quickActions] = await Promise.all([
      DashboardService.getDashboardStats(students, documentSummaries, { canViewPayments }),
      DashboardService.getQuickActions(students, documentSummaries, { canViewPayments }),
    ]);
    const recentActivity = DashboardService.getRecentActivity(8, students);
    const isBranchAdmin = (user.roles || []).includes('BRANCH_ADMIN');
    let voidRequests = [];
    let reviewedRequests = [];
    if (isBranchAdmin) {
      try { voidRequests = (await ApiService.getPendingPaymentVoidRequests()).data || []; }
      catch (error) { console.warn('No se cargaron solicitudes críticas:', error.message); }
    }
    if (canViewPayments) {
      try { reviewedRequests = (await ApiService.getMyReviewedPaymentVoidRequests()).data || []; }
      catch (error) { console.warn('No se cargaron respuestas de anulación:', error.message); }
    }
    const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));

    const dashboardContent = `
      <div class="dashboard">
        <!-- Header -->
        <div class="dashboard-header">
          <div>
            <h1>Bienvenido, ${user.name}</h1>
            <p class="dashboard-subtitle">Aquí está el resumen de tu actividad</p>
          </div>
          <button class="btn btn-primary" id="new-student-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Registrar Estudiante
          </button>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card" data-route="/students">
            <div class="stat-icon" style="background-color: rgba(79, 70, 229, 0.1); color: var(--primary);">👥</div>
            <div>
              <div class="stat-number">${stats.totalStudents}</div>
              <div class="stat-label">Estudiantes Registrados</div>
            </div>
          </div>

          <div class="stat-card" data-route="/documents">
            <div class="stat-icon" style="background-color: rgba(245, 158, 11, 0.1); color: var(--warning);">📄</div>
            <div>
              <div class="stat-number">${stats.missingDocuments}</div>
              <div class="stat-label">Documentos Faltantes</div>
            </div>
          </div>

          ${canViewPayments ? `<div class="stat-card">
            <div class="stat-icon" style="background-color: rgba(239, 68, 68, 0.1); color: var(--danger);">💳</div>
            <div>
              <div class="stat-number">${stats.pendingPayments}</div>
              <div class="stat-label">Pagos Pendientes</div>
            </div>
          </div>` : ''}

          <div class="stat-card">
            <div class="stat-icon" style="background-color: rgba(16, 185, 129, 0.1); color: var(--success);">✅</div>
            <div>
              <div class="stat-number">${stats.enrolledToday}</div>
              <div class="stat-label">Matriculados Hoy</div>
            </div>
          </div>
        </div>


        ${canViewPayments && stats.paymentStats ? `
          <div class="card" style="margin-bottom: 1.5rem;">
            <div class="card-header"><h3 class="card-title">Resumen financiero de mi sucursal</h3></div>
            <div class="card-body">
              <div class="stats-grid">
                <div class="stat-card"><div><div class="stat-number">$${Number(stats.paymentStats.totalAmount || 0).toFixed(2)}</div><div class="stat-label">Cobrado</div></div></div>
                <div class="stat-card"><div><div class="stat-number">${stats.paymentStats.totalPayments || 0}</div><div class="stat-label">Pagos registrados</div></div></div>
                <div class="stat-card"><div><div class="stat-number">${stats.paymentStats.pendingCount || 0}</div><div class="stat-label">Pagos pendientes</div></div></div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Main Grid -->
        <div class="dashboard-grid">
          <!-- Quick Actions -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Acciones Rápidas</h3>
            </div>
            <div class="card-body">
              ${quickActions.map(action => `
                <a href="/${action.id === 'students' ? 'students' : action.id}" class="quick-action">
                  <div class="quick-action-icon" style="background-color: rgba(79, 70, 229, 0.1);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </div>
                  <div class="quick-action-content">
                    <div class="quick-action-title">${action.title}</div>
                    <div class="quick-action-count">${action.count}</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </a>
              `).join('')}
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Actividad Reciente</h3>
            </div>
            <div class="card-body">
              ${recentActivity.length > 0 ? `
                <div class="timeline">
                  ${recentActivity.map(activity => `
                    <div class="timeline-item">
                      <div class="timeline-time">${DateHelper.format(activity.timestamp, 'HH:MM')}</div>
                      <div class="timeline-content">
                        ${activity.action}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                  No hay actividad reciente
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Students by Status -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Estudiantes por Estado</h3>
          </div>
          <div class="card-body">
            <div class="status-grid">
              <div class="status-item">
                <span class="status-label">Pendiente Documentación</span>
                <span class="status-value">${stats.studentsByStatus.pendiente_documentacion}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Pendiente Pago</span>
                <span class="status-value">${stats.studentsByStatus.pendiente_pago}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Pago Confirmado</span>
                <span class="status-value">${stats.studentsByStatus.pago_confirmado}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Horario Seleccionado</span>
                <span class="status-value">${stats.studentsByStatus.horario_seleccionado}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Matriculado</span>
                <span class="status-value">${stats.studentsByStatus.matriculado}</span>
              </div>
              <div class="status-item">
                <span class="status-label">En Curso</span>
                <span class="status-value">${stats.studentsByStatus.en_curso}</span>
              </div>
            </div>
          </div>
        </div>
        ${await this.studentsView.renderStudentModal()}
        ${isBranchAdmin && voidRequests[0] ? `<div class="modal-overlay active" id="void-review-modal"><div class="modal" style="max-width:600px">
          <div class="modal-header"><div><h3 class="modal-title">Acción financiera crítica</h3><p class="modal-subtitle">Requiere decisión del Administrador de Sucursal</p></div></div>
          <div class="modal-body"><div class="alert alert-warning" style="display:block"><strong>${safe(voidRequests[0].requested_by_name)} solicitó anular un pago de $${Number(voidRequests[0].amount).toFixed(2)}</strong><p>Estudiante: ${safe(voidRequests[0].student_name)} (${safe(voidRequests[0].identification)})</p><p>Motivo: ${safe(voidRequests[0].reason)}</p></div>
          <label class="form-label">Observación de la decisión</label><textarea class="form-textarea" id="void-review-note" placeholder="Obligatoria si rechaza la solicitud"></textarea></div>
          <div class="modal-footer"><button class="btn btn-secondary void-review-btn" data-id="${voidRequests[0].id}" data-decision="REJECTED">Rechazar</button><button class="btn btn-danger void-review-btn" data-id="${voidRequests[0].id}" data-decision="APPROVED">Aprobar anulación</button></div>
        </div></div>` : reviewedRequests[0] ? `<div class="modal-overlay active" id="void-result-modal"><div class="modal" style="max-width:560px">
          <div class="modal-header"><h3 class="modal-title">Respuesta a solicitud de anulación</h3></div><div class="modal-body"><div class="alert ${reviewedRequests[0].status === 'APPROVED' ? 'alert-success' : 'alert-warning'}" style="display:block"><strong>La anulación del pago de $${Number(reviewedRequests[0].amount).toFixed(2)} fue ${reviewedRequests[0].status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA'}.</strong><p>Estudiante: ${safe(reviewedRequests[0].student_name)}</p><p>Decidido por: ${safe(reviewedRequests[0].reviewed_by_name || 'Administrador de Sucursal')}</p>${reviewedRequests[0].review_note ? `<p>Observación: ${safe(reviewedRequests[0].review_note)}</p>` : ''}</div></div><div class="modal-footer"><button class="btn btn-primary" id="void-result-accept" data-id="${reviewedRequests[0].id}">Aceptar</button></div>
        </div></div>` : ''}
      </div>
    `;

    const layout = await SidebarLayout.render(dashboardContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const newStudentBtn = document.getElementById('new-student-btn');
    if (newStudentBtn) {
      newStudentBtn.addEventListener('click', () => {
        this.studentsView.openStudentModal();
      });
    }
    await this.studentsView.mountStudentModalEvents();

    document.querySelectorAll('.void-review-btn').forEach(button => button.addEventListener('click', async () => {
      const approved = button.dataset.decision === 'APPROVED';
      const note = document.getElementById('void-review-note')?.value?.trim() || '';
      if (!approved && !note.trim()) return;
      button.disabled = true;
      try {
        await ApiService.reviewPaymentVoidRequest(button.dataset.id, button.dataset.decision, note.trim());
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (error) {
        button.disabled = false;
        alert(error.message || 'No se pudo procesar la solicitud.');
      }
    }));
    document.getElementById('void-result-accept')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await ApiService.acknowledgePaymentVoidRequest(event.currentTarget.dataset.id); window.dispatchEvent(new PopStateEvent('popstate')); }
      catch (error) { event.currentTarget.disabled = false; alert(error.message || 'No se pudo confirmar el mensaje.'); }
    });

    // Hacer que las tarjetas de estadísticas naveguen a las rutas correspondientes
    const statCards = document.querySelectorAll('.stat-card[data-route]');
    statCards.forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        const route = card.getAttribute('data-route');
        if (route) {
          window.history.pushState(null, null, route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      });
    });

    // Interceptar quick-action (anchors) para navegación SPA sin recarga
    const quickActions = document.querySelectorAll('.quick-action');
    quickActions.forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const href = a.getAttribute('href');
        if (href) {
          window.history.pushState(null, null, href);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      });
    });

    // Actualizar badge de notificaciones
    this.updateNotificationBadge();
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
}

export default DashboardView;
