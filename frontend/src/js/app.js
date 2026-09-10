/**
 * App.js
 * Archivo principal que inicializa el sistema
 */

import Router from "./core/router/Router.js";
import { authService } from "./core/auth/AuthService.js";
import { storageService } from "./core/storage/StorageService.js";
import StudentService from "./services/StudentService.js";
import "./data/DemoDataGenerator.js";

// Views
import LoginView from "./views/auth/LoginView.js?v=perfil-profesor-teoria-20260907";
import DashboardView from "./views/dashboard/DashboardView.js?v=consultas-optimizadas-20260811";
import StudentsView from "./views/students/StudentsView.js?v=credenciales-copiar-cerrar-20260910";
import StudentProfileView from "./views/student-profile/StudentProfileView.js?v=regresar-fuera-tarjeta-20260910";
import DocumentsView from "./views/documents/DocumentsView.js?v=expedientes-por-estudiante-20260811";
import ScheduleView from "./views/schedule/ScheduleView.js?v=proximo-curso-disponible-20260825";
import NotificationsView from "./views/notifications/NotificationsView.js";
import HistoryView from "./views/history/HistoryView.js";
import ProfileView from "./views/profile/ProfileView.js";
// Cash module views
import CashDashboardView from "./views/cash/CashDashboardView.js?v=caja-cobro-directo-20260825";
import RegisterPaymentView from "./views/cash/RegisterPaymentView.js";
import PendingPaymentsView from "./views/cash/PendingPaymentsView.js?v=caja-cobro-modal-20260825";
import CashHistoryView from "./views/cash/CashHistoryView.js";
import CashOperationsView from "./views/cash/CashOperationsView.js";
import InstructorDashboardView from "./views/instructor/InstructorDashboardView.js?v=privacidad-telefono-20260903";
import InstructorAgendaView from "./views/instructor/InstructorAgendaView.js?v=privacidad-telefono-20260903";
import InstructorTheoryView from "./views/instructor/InstructorTheoryView.js?v=dashboard-profesor-teoria-20260907";
import InstructorStudentsView from "./views/instructor/InstructorStudentsView.js?v=filtro-etapa-20260812";
import InstructorReferralsView from "./views/instructor/InstructorReferralsView.js?v=privacidad-telefono-20260903";
import InstructorEvaluationsView from "./views/instructor/InstructorEvaluationsView.js?v=examen-final-20260903";
import InstructorIncidentsView from "./views/instructor/InstructorIncidentsView.js";
import InstructorProfileView from "./views/instructor/InstructorProfileView.js";
import MobileDocumentUploadView from "./views/mobile-upload/MobileDocumentUploadView.js?v=certificado-orientacion-20260824";
import SidebarLayout from "./layouts/SidebarLayout.js?v=aviso-cambio-horario-20260910";
import AdminDashboardView from "./views/admin/AdminDashboardView.js";
import AdminSecurityView from "./views/admin/AdminSecurityView.js?v=tipo-instructor-20260819";
import AdminWorkspaceView from "./views/admin/AdminWorkspaceView.js";
import AdminBranchesView from "./views/admin/AdminBranchesView.js?v=clave-temporal-segura-20260907";
import ManagerReportsView from "./views/manager/ManagerReportsView.js?v=modal-ciclo-ancho-completo-20260812";
import AtmAuthorizationView from "./views/admin/AtmAuthorizationView.js?v=permiso-sin-filtro-pago-20260820";
import AdminSettingsView from "./views/admin/AdminSettingsView.js";
import AdminReferralCampaignView from "./views/admin/AdminReferralCampaignView.js";
import ManagerWorkspaceView from "./views/manager/ManagerWorkspaceView.js";
import ManagerBranchesView from "./views/manager/ManagerBranchesView.js?v=indicadores-conversion-pago-20260812";
import ManagerDashboardView from "./views/manager/ManagerDashboardView.js";
import ManagerFinanceView from "./views/manager/ManagerFinanceView.js";
import ManagerAcademicView from "./views/manager/ManagerAcademicView.js";
import ManagerAuditView from "./views/manager/ManagerAuditView.js?v=auditoria-responsables-20260812";
import ManagerEnrollmentMonitorView from "./views/manager/ManagerEnrollmentMonitorView.js?v=monitor-inscripciones-20260824";
import StudentPortalView from "./views/student-portal/StudentPortalView.js?v=cambio-clave-obligatorio-20260909";

class App {
  constructor() {
    this.router = new Router();
    this.registerRoutes();
    this.setupMiddleware();
  }

  /**
   * Registra todas las rutas de la aplicación
   */
  registerRoutes() {
    // Auth
    this.router.register("/login", LoginView, "login");
    this.router.register(
      "/mobile-upload/:token",
      MobileDocumentUploadView,
      "mobile-upload",
    );

    // Dashboard
    this.router.register("/dashboard", DashboardView, "dashboard");

    // Students
    this.router.register("/students", StudentsView, "students");
    this.router.register("/students/new", StudentsView, "student-registration");
    // Compatibilidad con enlaces antiguos al formulario.
    this.router.register("/student-form", StudentsView, "student-registration");
    this.router.register(
      "/student-profile/:studentId",
      StudentProfileView,
      "student-profile",
    );

    // Documents
    this.router.register("/documents", DocumentsView, "documents");

    // Schedule
    this.router.register("/schedule", ScheduleView, "schedule");

    // Notifications
    this.router.register("/notifications", NotificationsView, "notifications");

    // History
    this.router.register("/history", HistoryView, "history");

    // Profile
    this.router.register("/profile", ProfileView, "profile");
    this.router.register("/student", StudentPortalView, "student-portal");

    // Cash module
    this.router.register("/cash", CashDashboardView, "cash");
    this.router.register(
      "/cash/register",
      RegisterPaymentView,
      "cash-register",
    );
    this.router.register("/cash/pending", PendingPaymentsView, "cash-pending");
    this.router.register("/cash/history", CashHistoryView, "cash-history");
    this.router.register("/cash/operations", CashOperationsView, "cash-operations");
    this.router.register("/history", HistoryView, "history");

    // Instructor module
    this.router.register(
      "/instructor",
      InstructorDashboardView,
      "instructor-dashboard",
    );
    this.router.register(
      "/instructor/agenda",
      InstructorAgendaView,
      "instructor-agenda",
    );
    this.router.register("/instructor/theory", InstructorTheoryView, "instructor-theory");
    this.router.register(
      "/instructor/students",
      InstructorStudentsView,
      "instructor-students",
    );
    this.router.register("/instructor/referrals", InstructorReferralsView, "instructor-referrals");
    this.router.register(
      "/instructor/evaluations",
      InstructorEvaluationsView,
      "instructor-evaluations",
    );
    this.router.register(
      "/instructor/incidents",
      InstructorIncidentsView,
      "instructor-incidents",
    );
    this.router.register(
      "/instructor/profile",
      InstructorProfileView,
      "instructor-profile",
    );
    this.router.register("/admin-system", AdminDashboardView, "admin-system");
    this.router.register(
      "/admin-system/security",
      AdminSecurityView,
      "admin-security",
    );
    this.router.register(
      "/admin-system/branches",
      AdminBranchesView,
      "admin-branches",
    );
    this.router.register(
      "/admin-system/reports",
      ManagerReportsView,
      "admin-reports",
    );
    this.router.register(
      "/admin-system/settings",
      AdminSettingsView,
      "admin-settings",
    );
    this.router.register('/admin-system/referrals', AdminReferralCampaignView, 'admin-referrals');
    this.router.register('/referrals', AdminReferralCampaignView, 'referrals');
    this.router.register('/manager/referrals', AdminReferralCampaignView, 'manager-referrals');
    this.router.register("/reports", ManagerReportsView, "course-reports");
    this.router.register("/branch-access", AdminBranchesView, "branch-access");
    this.router.register(
      "/atm-authorizations",
      AtmAuthorizationView,
      "atm-authorizations",
    );
    ["people", "finance", "academic", "audit"].forEach((section) =>
      this.router.register(
        `/admin-system/${section}`,
        AdminWorkspaceView,
        `admin-${section}`,
      ),
    );
    this.router.register("/manager", ManagerDashboardView, "manager-dashboard");
    this.router.register(
      "/manager/finance",
      ManagerFinanceView,
      "manager-finance",
    );
    this.router.register(
      "/manager/academic",
      ManagerAcademicView,
      "manager-academic",
    );
    this.router.register(
      "/manager/reports",
      ManagerReportsView,
      "manager-reports",
    );
    this.router.register(
      "/manager/branches",
      ManagerBranchesView,
      "manager-branches",
    );
    this.router.register(
      "/manager/audit",
      ManagerAuditView,
      "manager-audit",
    );
    this.router.register(
      "/manager/monitor",
      ManagerEnrollmentMonitorView,
      "manager-enrollment-monitor",
    );
  }

  /**
   * Configura middleware (guards, hooks, etc)
   */
  setupMiddleware() {
    // Guard: Verificar autenticación antes de navegar
    this.router.before(async (route) => {
      const isAuthenticated = authService.isAuthenticated();
      const isLoginPage = route.name === "login";
      const isPublicPage = route.name === "mobile-upload";

      let currentUser = authService.getCurrentUser();
      if (isAuthenticated && !isLoginPage && !isPublicPage) {
        const contextualBranchId = new URLSearchParams(
          window.location.search,
        ).get("branchId");
        try {
          currentUser =
            (await authService.refreshAuthorization(
              contextualBranchId || currentUser?.branch_id || null,
            )) || currentUser;
        } catch (error) {
          console.warn(
            "No se pudieron refrescar los permisos efectivos:",
            error.message,
          );
        }
      }
      const currentRole = String(currentUser?.role || "")
        .trim()
        .toLowerCase();
      const isTheoryInstructor = currentRole === "instructor" && currentUser?.practiceArea === "teoria";
      const isAdminSystem = currentUser?.roles?.includes("ADMIN_SYSTEM");
      const isGeneralManager = currentUser?.roles?.includes("GENERAL_MANAGER");
      const isStudent = currentUser?.roles?.includes("STUDENT") || currentRole === "estudiante";
      const routePermissions = {
        students: "STUDENT_VIEW",
        "student-registration": "STUDENT_VIEW",
        "student-profile": "STUDENT_VIEW",
        documents: "DOCUMENT_VIEW",
        schedule: "SCHEDULE_VIEW",
        cash: "PAYMENT_VIEW",
        "cash-register": "PAYMENT_CREATE",
        "cash-pending": "PAYMENT_VIEW",
        "cash-history": "PAYMENT_VIEW",
        "cash-operations": "PAYMENT_VIEW",
        "course-reports": "REPORT_VIEW",
        "branch-access": "GESTION_PERSONAL",
        "atm-authorizations": "ATM_DOCUMENT_GENERATE",
        "instructor-dashboard": "CLASS_VIEW",
        "instructor-agenda": "CLASS_VIEW",
        "instructor-students": "STUDENT_VIEW",
        "instructor-evaluations": "EVALUATION_VIEW",
        "instructor-incidents": "INCIDENT_VIEW",
        "admin-branches": "BRANCH_VIEW",
        "admin-finance": "PAYMENT_VIEW",
        "admin-academic": "SCHEDULE_VIEW",
        "admin-reports": "REPORT_VIEW",
        "admin-audit": "AUDIT_VIEW",
        "admin-settings": "SETTING_VIEW",
        "admin-referrals": "REFERRAL_REPORT_VIEW",
        referrals: "REFERRAL_REPORT_VIEW",
        "manager-referrals": "REFERRAL_REPORT_VIEW",
      };

      // Si no está autenticado y no es la página de login
      if (!isAuthenticated && !isLoginPage && !isPublicPage) {
        this.router.navigate("/login");
        return false;
      }

      // Si está autenticado y trata de ir a login
      if (isAuthenticated && isLoginPage) {
        if (isAdminSystem) {
          this.router.navigate("/admin-system");
          return false;
        }
        if (isGeneralManager) {
          this.router.navigate("/manager");
          return false;
        }
        if (isStudent) {
          this.router.navigate("/student");
          return false;
        }
        // Si es usuario de caja, llevar a /cash en lugar de /dashboard
        if (currentRole === "caja") {
          this.router.navigate("/cash");
          return false;
        }
        if (currentRole === "instructor") {
          this.router.navigate(isTheoryInstructor ? "/instructor/theory" : "/instructor");
          return false;
        }
        this.router.navigate("/dashboard");
        return false;
      }

      if (
        isAuthenticated &&
        currentRole === "instructor" &&
        !route.name.startsWith("instructor-") &&
        !["notifications", "course-reports"].includes(route.name) &&
        !isPublicPage
      ) {
        this.router.navigate(isTheoryInstructor ? "/instructor/theory" : "/instructor");
        return false;
      }
      if (isAuthenticated && isTheoryInstructor && route.name.startsWith("instructor-")
        && !["instructor-theory","instructor-profile"].includes(route.name)) {
        this.router.navigate("/instructor/theory");
        return false;
      }
      if (isAuthenticated && isStudent && route.name !== "student-portal" && !isPublicPage) {
        this.router.navigate("/student");
        return false;
      }

      if (
        isAuthenticated &&
        route.name.startsWith("admin-") &&
        !isAdminSystem
      ) {
        this.router.navigate("/dashboard");
        return false;
      }
      if (
        isAuthenticated &&
        route.name.startsWith("manager-") &&
        !isGeneralManager
      ) {
        this.router.navigate(isAdminSystem ? "/admin-system" : "/dashboard");
        return false;
      }
      if (
        isAuthenticated &&
        isGeneralManager &&
        !route.name.startsWith("manager-") &&
        route.name !== "profile" &&
        !isPublicPage
      ) {
        this.router.navigate("/manager");
        return false;
      }
      const requiredPermission = routePermissions[route.name];
      if (
        isAuthenticated &&
        requiredPermission &&
        !currentUser?.permissions?.includes(requiredPermission)
      ) {
        const fallback = isAdminSystem
            ? "/admin-system"
            : currentRole === "instructor"
              ? (isTheoryInstructor ? "/instructor/theory" : "/instructor")
              : "/dashboard";
        // Una asignación de rol inconsistente no debe redirigir hacia la misma
        // URL indefinidamente ni saturar /auth/authorization.
        if (window.location.pathname === fallback) {
          console.error(`El usuario no tiene el permiso requerido: ${requiredPermission}`);
          return true;
        }
        this.router.navigate(fallback);
        return false;
      }

      return true;
    });

    // After: Actualizar título y realizar acciones post-navegación
    this.router.after(async (route) => {
      document.title = `SportmancarERP - ${this.getTitleByRoute(route.name)}`;
      window.scrollTo(0, 0);
    });
  }

  /**
   * Obtiene el título por nombre de ruta
   */
  getTitleByRoute(routeName) {
    const titles = {
      login: "Iniciar Sesión",
      dashboard: "Dashboard",
      students: "Estudiantes",
      "student-form": "Nuevo Estudiante",
      "student-profile": "Expediente",
      documents: "Documentación",
      schedule: "Horarios",
      notifications: "Notificaciones",
      history: "Historial",
      profile: "Mi Perfil",
      "student-portal": "Portal del estudiante",
      "instructor-dashboard": "Instructor",
      "instructor-agenda": "Mi Agenda",
      "instructor-students": "Mis Estudiantes",
      "instructor-evaluations": "Evaluaciones",
      "instructor-incidents": "Incidencias",
      "instructor-profile": "Mi Perfil",
      "manager-dashboard": "Resumen ejecutivo",
      "manager-finance": "Financiero",
      "manager-courses": "Cursos",
      "manager-evaluations": "Evaluaciones",
      "manager-recoveries": "Recuperaciones",
      "manager-branches": "Sucursales",
      "manager-reports": "Reportes",
      "manager-referrals": "Campaña de referidos",
      "admin-referrals": "Campaña de referidos",
      referrals: "Campaña de referidos",
      "admin-reports": "Reportes de sucursal",
      "course-reports": "Reportes",
      "manager-audit": "Auditoría gerencial",
      "manager-enrollment-monitor": "Monitoreo de inscripciones",
    };
    return titles[routeName] || "SportmancarERP";
  }

  /**
   * Inicia la aplicación
   */
  start() {
    // El interceptor SPA debe existir para todas las vistas, incluidas las administrativas.
    SidebarLayout.attachEventListeners();
    // Inicializar StorageService
    storageService.initializeDatabase();

    // Inicializar AuthService
    authService.initializeUsers();

    // Normalizar cédulas existentes en estudiantes
    StudentService.normalizeStoredCedulas();

    // Sincronizar estados de pago con student.status para que Caja y Secretaría compartan el mismo origen de verdad
    // Sincronizar cambios en datos locales entre vistas y pestañas
    this.setupDataSync();

    // Iniciar router
    this.router.init();

    console.log(
      "%c🏫 SportmancarERP Iniciado",
      "font-size: 16px; color: #4F46E5; font-weight: bold;",
    );
    console.log(
      "%cAplicación lista para usar",
      "color: #10B981; font-weight: bold;",
    );
  }

  setupDataSync() {
    window.addEventListener("storage", (event) => {
      if (!event.key || !event.key.startsWith(storageService.prefix)) return;
      this.refreshCurrentRoute();
    });

    window.addEventListener("erp:dataChanged", () => {
      this.refreshCurrentRoute();
    });
  }

  refreshCurrentRoute() {
    const currentRoute = this.router.getCurrentRoute();
    if (!currentRoute || currentRoute.name === "login") return;
    this.router.renderRoute(currentRoute);
  }
}

// Iniciar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.start();
});

export default App;
