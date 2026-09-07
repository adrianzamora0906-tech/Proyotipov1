/**
 * Sidebar Layout
 * Layout con sidebar y contenido principal
 */

import { authService } from '../core/auth/AuthService.js';
import InstructorTheoryService from '../services/instructorTheoryService.js';

class SidebarLayout {
  static async render(content) {
    const user = authService.getCurrentUser();
    const currentPath = window.location.pathname;
    const currentTheorySection = new URLSearchParams(window.location.search).get('section') || 'dashboard';
    const role = String(user?.role || '').trim().toLowerCase();
    const isInstructor = role === 'instructor';
    const isTheoryInstructor = isInstructor && user?.practiceArea === 'teoria';
    let canTakeTheoryAttendance = false;
    if (isInstructor) {
      try {
        const response = await InstructorTheoryService.groups();
        canTakeTheoryAttendance = Array.isArray(response?.data) && response.data.length > 0;
      } catch (_error) {
        // Si no se puede comprobar la asignación, el acceso queda oculto.
        canTakeTheoryAttendance = false;
      }
    }
    const isCashOnly = role === 'caja';
    const isBranchSecretary = role === 'secretaria_sucursal';
    const canViewPayments = user?.permissions?.includes('PAYMENT_VIEW');
    const isAdminSystem = user?.roles?.includes('ADMIN_SYSTEM');
    const isGeneralManager = user?.roles?.includes('GENERAL_MANAGER');
    const adminIcons = {
      '/admin-system': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      '/admin-system/branches': '<path d="M3 21h18"/><path d="M6 21V7l6-4 6 4v14"/><path d="M9 10h1M14 10h1M9 14h1M14 14h1"/>',
      '/admin-system/reports': '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
      '/admin-system/referrals': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
      '/admin-system/audit': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      '/admin-system/settings': '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6.2L14.7 4h-4L10.4 6.2a8 8 0 0 0-1.5.9l-2.4-1-2 3.4L6.5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.5.9l.3 2.2h4l.3-2.2a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/>',
    };
    const managerItems = [
      ['/manager', 'Resumen ejecutivo', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'],
      ['/manager/finance', 'Financiero', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h2"/>'],
      ['/manager/academic', 'Operación académica', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 5.5v14"/><path d="M9 8h7M9 12h7"/>'],
      ['/manager/monitor', 'Monitoreo en vivo', '<path d="M3 12h4l2-6 4 12 2-6h6"/><circle cx="12" cy="12" r="10"/>'],
      ['/manager/branches', 'Sucursales', '<path d="M3 21h18"/><path d="M6 21V7l6-4 6 4v14"/><path d="M9 10h1M14 10h1M9 14h1M14 14h1"/>'],
      ['/manager/reports', 'Reportes', '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'],
      ['/manager/referrals', 'Referidos', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>'],
      ['/manager/audit', 'Auditoría gerencial', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ];

    return `
      <div class="layout ${isInstructor ? 'instructor-layout' : ''} ${isTheoryInstructor ? 'theory-instructor-layout' : ''} ${isGeneralManager ? 'manager-mobile-layout' : ''}">
        <!-- Sidebar -->
        <aside class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-logo">
              <img
                class="brand-logo"
                src="/src/assets/branding/sportmancar-logo.png"
                alt="Escuela de Conducción Sportmancar"
              >
            </div>
          </div>

          <nav class="sidebar-nav">
            ${isAdminSystem ? `
              ${[
                ['/admin-system','Inicio'],['/admin-system/branches','Sucursales'],
                ['/admin-system/reports','Reportes'],['/admin-system/referrals','Referidos'],
                ['/admin-system/audit','Auditoría'],['/admin-system/settings','Configuración']
              ].map(([href, label]) => `
                <a href="${href}" class="nav-item ${currentPath === href ? 'active' : ''}" title="${label}" ${currentPath === href ? 'aria-current="page"' : ''}>
                  <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${adminIcons[href]}
                  </svg>
                  <span class="nav-text">${label}</span>
                </a>`).join('')}
            ` : isGeneralManager ? `
              ${managerItems.map(([href, label, icon]) => `
                <a href="${href}" class="nav-item ${currentPath === href ? 'active' : ''}" title="${label}" ${currentPath === href ? 'aria-current="page"' : ''}>
                  <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
                  <span class="nav-text">${label}</span>
                </a>`).join('')}
            ` : isInstructor ? `
              <a href="${isTheoryInstructor ? '/instructor/theory?section=dashboard' : '/instructor'}" class="nav-item ${isTheoryInstructor ? (currentPath === '/instructor/theory' && currentTheorySection === 'dashboard' ? 'active' : '') : (currentPath === '/instructor' ? 'active' : '')}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span class="nav-text">${isTheoryInstructor ? 'Teoría' : 'Inicio'}</span>
              </a>
              ${isTheoryInstructor ? `<a href="/instructor/theory?section=attendance" class="nav-item ${currentPath === '/instructor/theory' && currentTheorySection === 'attendance' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M9 3v3h6V3"></path><path d="m8 13 2 2 5-5"></path>
                </svg>
                <span class="nav-text">Asistencia</span>
              </a>` : ''}
              ${isTheoryInstructor ? `<a href="/instructor/theory?section=groups" class="nav-item ${currentPath === '/instructor/theory' && currentTheorySection === 'groups' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span class="nav-text">Mis grupos</span>
              </a>` : ''}
              ${!isTheoryInstructor ? `<a href="/instructor/agenda" class="nav-item ${currentPath === '/instructor/agenda' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span class="nav-text">Mi agenda</span>
              </a>` : ''}
              ${!isTheoryInstructor && canTakeTheoryAttendance ? `<a href="/instructor/theory" class="nav-item ${currentPath === '/instructor/theory' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="m9 10 2 2 4-4"></path></svg>
                <span class="nav-text">Asistencia teoría</span>
              </a>` : ''}
              ${!isTheoryInstructor ? `<a href="/instructor/referrals" class="nav-item ${currentPath === '/instructor/referrals' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
                <span class="nav-text">Mis referidos</span>
              </a>
              <a href="/instructor/evaluations" class="nav-item ${currentPath === '/instructor/evaluations' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span class="nav-text">Evaluaciones</span>
              </a>
              <a href="/instructor/incidents" class="nav-item ${currentPath === '/instructor/incidents' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span class="nav-text">Incidencias</span>
              </a>` : ''}
            ` : isCashOnly ? `
              <a href="/cash" class="nav-item ${currentPath === '/cash' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"></path>
                  <rect x="3" y="8" width="18" height="12" rx="2"></rect>
                  <path d="M16 12a4 4 0 0 1-8 0"></path>
                </svg>
                <span class="nav-text">Cobro</span>
              </a>
              <a href="/cash/pending" class="nav-item ${currentPath === '/cash/pending' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 8v4"></path>
                  <path d="M12 16h.01"></path>
                  <path d="M4 4h16v16H4z"></path>
                </svg>
                <span class="nav-text">Pagos</span>
              </a>
              ${user?.permissions?.includes('STUDENT_VIEW') ? `<a href="/students" class="nav-item ${currentPath === '/students' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span class="nav-text">Estudiantes</span>
              </a>` : ''}
            ` : `
              <a href="/dashboard" class="nav-item ${currentPath === '/dashboard' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span class="nav-text">Dashboard</span>
              </a>
              ${user?.permissions?.includes('STUDENT_VIEW') ? `<a href="/students" class="nav-item ${currentPath === '/students' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span class="nav-text">Estudiantes</span>
              </a>` : ''}
              ${user?.permissions?.includes('DOCUMENT_VIEW') ? `<a href="/documents" class="nav-item ${currentPath === '/documents' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="11" x2="12" y2="17"></line>
                  <line x1="9" y1="14" x2="15" y2="14"></line>
                </svg>
                <span class="nav-text">Documentación</span>
              </a>` : ''}
              ${user?.permissions?.includes('SCHEDULE_VIEW') ? `<a href="/schedule" class="nav-item ${currentPath === '/schedule' ? 'active' : ''}">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span class="nav-text">Horarios</span>
              </a>` : ''}
              ${canViewPayments ? `
                <a href="/cash/pending" class="nav-item ${currentPath === '/cash/pending' ? 'active' : ''}">
                  <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 8v4"></path><path d="M12 16h.01"></path><path d="M4 4h16v16H4z"></path>
                  </svg>
                  <span class="nav-text">Pagos</span>
                </a>
              ` : ''}
            `}

            ${!isAdminSystem && !isGeneralManager && user?.permissions?.includes('REPORT_VIEW') ? `<a href="/reports" class="nav-item ${currentPath === '/reports' ? 'active' : ''}">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path></svg><span class="nav-text">Reportes</span>
            </a>` : ''}
            ${!isAdminSystem && !isGeneralManager && user?.permissions?.includes('REFERRAL_REPORT_VIEW') ? `<a href="/referrals" class="nav-item ${currentPath === '/referrals' ? 'active' : ''}">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4"></path><circle cx="9" cy="7" r="4"></circle><path d="m17 11 2 2 4-4"></path></svg><span class="nav-text">Campaña de referidos</span>
            </a>` : ''}
            ${!isAdminSystem && !isGeneralManager && user?.permissions?.includes('GESTION_PERSONAL') ? `<a href="/branch-access" class="nav-item ${currentPath === '/branch-access' ? 'active' : ''}">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg><span class="nav-text">Personal y accesos</span>
            </a>` : ''}
            ${!isAdminSystem && !isGeneralManager && !isTheoryInstructor ? `<a href="/history" class="nav-item ${currentPath === '/history' ? 'active' : ''}">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 7 12 12 15 14"></polyline>
              </svg>
              <span class="nav-text">Historial</span>
            </a>` : ''}
            ${!isAdminSystem && !isGeneralManager && user?.permissions?.includes('ATM_DOCUMENT_GENERATE') ? `<a href="/atm-authorizations" class="nav-item ${currentPath === '/atm-authorizations' ? 'active' : ''}" title="Autorizaciones ATM" ${currentPath === '/atm-authorizations' ? 'aria-current="page"' : ''}>
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13h8M8 17h6"></path></svg><span class="nav-text">Autorizaciones ATM</span>
            </a>` : ''}
            <div class="nav-divider"></div>
            <a href="${isInstructor ? '/instructor/profile' : '/profile'}" class="nav-item ${currentPath === (isInstructor ? '/instructor/profile' : '/profile') ? 'active' : ''}">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span class="nav-text">Mi Perfil</span>
            </a>

            ${isTheoryInstructor ? '' : `<button class="nav-item logout-btn" id="logout-btn">
              <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span class="nav-text">Cerrar sesión</span>
            </button>`}
          </nav>
        </aside>

        <!-- Main Content -->
        <div class="main-container">
          <!-- Topbar -->
          <header class="topbar">
            <div class="topbar-left">
              ${isTheoryInstructor ? '' : `<input type="text" class="search-input" id="search-input" placeholder="${isInstructor ? 'Buscar mis estudiantes...' : 'Buscar estudiantes...'}">`}
            </div>

            <div class="topbar-right">
              <div class="topbar-item">
                <span class="branch">${user.scope === 'GLOBAL' ? 'Todas las sucursales' : user.branch}</span>
              </div>

              <div class="topbar-item">
                <span class="time" id="current-time"></span>
              </div>

              <button class="topbar-item notifications-btn" id="notifications-btn" ${isInstructor ? 'style="display:none;"' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span class="notification-badge" id="notification-badge"></span>
              </button>

              <div class="topbar-account">
                <button type="button" class="user-profile" id="account-menu-trigger" aria-haspopup="menu" aria-expanded="false">
                  <div class="avatar">${user.avatar}</div>
                  <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-role">${isTheoryInstructor ? 'profesor de teoría' : user.role}</div>
                  </div>
                  <svg class="account-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="account-menu" id="account-menu" role="menu">
                  <div class="account-menu-summary"><strong>${user.name}</strong><span>${isTheoryInstructor ? 'Profesor de teoría' : user.role}</span></div>
                  <a href="${isInstructor ? '/instructor/profile' : '/profile'}" class="account-menu-item" role="menuitem">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    Mi perfil
                  </a>
                  <button type="button" class="account-menu-item account-menu-logout" data-logout role="menuitem">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </div>
          </header>

          <!-- Content -->
          <main class="content">
            ${content}
          </main>
        </div>
      </div>
    `;
  }

  static initializeEventListeners() {
    if (document.body.dataset.sidebarListenersInitialized === 'true') {
      this._initialized = true;
      return;
    }
    document.body.dataset.sidebarListenersInitialized = 'true';
    this._initialized = true;

    // Global click handling for SPA navigation and buttons
    document.body.addEventListener('click', (e) => {
      const anchor = e.target.closest('a');
      const logoutBtn = e.target.closest('#logout-btn, [data-logout]');
      const accountMenuTrigger = e.target.closest('#account-menu-trigger');
      const accountMenu = document.getElementById('account-menu');
      const notificationsBtn = e.target.closest('#notifications-btn');
      const statCard = e.target.closest('.stat-card[data-route]');
      const routedElement = e.target.closest('[data-route]');

      if (accountMenuTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const opened = accountMenu?.classList.toggle('active') || false;
        accountMenuTrigger.setAttribute('aria-expanded', String(opened));
        return;
      }

      if (accountMenu && !e.target.closest('#account-menu')) {
        accountMenu.classList.remove('active');
        document.getElementById('account-menu-trigger')?.setAttribute('aria-expanded', 'false');
      }

      if (logoutBtn) {
        authService.logout().finally(() => {
          window.history.pushState(null, null, '/login');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        return;
      }

      if (notificationsBtn) {
        window.history.pushState(null, null, '/notifications');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      if (routedElement && !statCard) {
        e.preventDefault();
        const route = routedElement.getAttribute('data-route');
        if (route) {
          window.history.pushState(null, null, route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }

      if (statCard) {
        e.preventDefault();
        const route = statCard.getAttribute('data-route');
        if (route) {
          window.history.pushState(null, null, route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }

      if (anchor) {
        const href = anchor.getAttribute('href');
        const target = anchor.getAttribute('target');
        if (href && href.startsWith('/') && (!target || target === '_self')) {
          e.preventDefault();
          window.history.pushState(null, null, href);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }
    });

    document.body.addEventListener('change', (e) => {
      const target = e.target;
      if (target && target.id === 'search-input') {
        const value = target.value.trim();
        if (value) {
          const user = authService.getCurrentUser();
          const role = String(user?.role || '').trim().toLowerCase();
          const url = role === 'instructor'
            ? `/instructor/agenda?student=${encodeURIComponent(value)}`
            : `/students?q=${encodeURIComponent(value)}`;
          window.history.pushState(null, null, url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }
    });

    this.updateTime();
    this._timeIntervalId = setInterval(() => this.updateTime(), 1000);
  }

  static attachEventListeners() {
    if (!this._initialized) {
      this.initializeEventListeners();
    }
    this.updateNotificationBadge();
  }

  static updateTime() {
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      timeElement.textContent = `${hours}:${minutes}`;
    }
  }

  static updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      const NotificationService = import('../services/NotificationService.js').then(module => module.default);
      // Will be updated from views
    }
  }
}

export default SidebarLayout;
