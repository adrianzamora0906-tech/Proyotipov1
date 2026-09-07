/**
 * Dashboard Service
 * Servicio de datos para el dashboard
 */

import StudentService from './StudentService.js';
import PaymentService from './PaymentService.js';
import { storageService } from '../core/storage/StorageService.js';

class DashboardService {
  /**
   * Obtiene estadísticas del dashboard
   */
  static async getDashboardStats(loadedStudents = null, documentSummaries = [], options = {}) {
    const students = loadedStudents || await StudentService.getAllStudents();
    const canViewPayments = Boolean(options.canViewPayments);

    return {
      totalStudents: students.length,
      missingDocuments: documentSummaries.filter(student => Number(student.missingCount || 0) > 0).length,
      pendingPayments: canViewPayments ? students.filter(s => s.status === 'pendiente_pago' || s.status === 'pago_parcial').length : 0,
      scheduleChanges: storageService.count('enrollments'),
      enrolledToday: this.countEnrolledToday(),
      recentActivity: this.getRecentActivity(10, students),
      studentsByStatus: await this.getStudentsByStatus(students),
      paymentStats: canViewPayments ? await PaymentService.getStatistics() : null,
    };
  }

  /**
   * Cuenta matrículas de hoy
   */
  static countEnrolledToday() {
    const enrollments = storageService.findAll('enrollments');
    const today = new Date().toISOString().split('T')[0];
    return enrollments.filter(e => e.enrolledAt.startsWith(today)).length;
  }

  /**
   * Obtiene actividad reciente
   */
  static getRecentActivity(limit = 10, loadedStudents = null) {
    const history = storageService.findAll('history');
    if (!Array.isArray(loadedStudents)) return history.slice(-limit).reverse();

    const currentStudentIds = new Set(loadedStudents.map(student => String(student.id)));
    return history
      .filter(item => !item.studentId || currentStudentIds.has(String(item.studentId)))
      .slice(-limit)
      .reverse();
  }

  /**
   * Agrupa estudiantes por estado
   */
  static async getStudentsByStatus(loadedStudents = null) {
    const students = loadedStudents || await StudentService.getAllStudents();
    return {
      pendiente_documentacion: students.filter(s => s.status === 'pendiente_documentacion').length,
      pendiente_pago: students.filter(s => s.status === 'pendiente_pago').length,
      pago_parcial: students.filter(s => s.status === 'pago_parcial').length,
      pago_confirmado: students.filter(s => s.status === 'pago_confirmado').length,
      horario_seleccionado: students.filter(s => s.status === 'horario_seleccionado').length,
      matriculado: students.filter(s => s.status === 'matriculado').length,
      en_curso: students.filter(s => s.status === 'en_curso').length,
    };
  }

  /**
   * Obtiene acciones rápidas
   */
  static async getQuickActions(loadedStudents = null, documentSummaries = [], options = {}) {
    const canViewPayments = Boolean(options.canViewPayments);
    const pendingPayments = canViewPayments ? await PaymentService.getPendingPayments() : [];
    const students = loadedStudents || await StudentService.getAllStudents();

    const actions = [
      {
        id: 'documents',
        title: 'Documentos Faltantes',
        count: documentSummaries.filter(student => Number(student.missingCount || 0) > 0).length,
        icon: 'file-text',
        color: 'warning',
      },
      ...(canViewPayments ? [{
        id: 'payments',
        title: 'Pagos Pendientes',
        count: pendingPayments.length,
        icon: 'credit-card',
        color: 'danger',
      }] : []),
      {
        id: 'notifications',
        title: 'Notificaciones',
        count: storageService.findBy('notifications', { read: false }).length,
        icon: 'bell',
        color: 'info',
      },
      {
        id: 'students',
        title: 'Estudiantes Activos',
        count: students.length,
        icon: 'users',
        color: 'success',
      },
    ];

    return actions;
  }

  /**
   * Obtiene gráficos de datos
   */
  static async getChartData() {
    const students = await StudentService.getAllStudents();
    const byStatus = await this.getStudentsByStatus();
    const byCourse = await this.getStudentsByCourse();

    return {
      statusChart: {
        labels: Object.keys(byStatus),
        data: Object.values(byStatus),
      },
      courseChart: {
        labels: Object.keys(byCourse),
        data: Object.values(byCourse),
      },
    };
  }

  /**
   * Agrupa estudiantes por curso
   */
  static async getStudentsByCourse() {
    const students = await StudentService.getAllStudents();
    const byCourse = {};

    students.forEach(student => {
      if (!byCourse[student.course]) {
        byCourse[student.course] = 0;
      }
      byCourse[student.course]++;
    });

    return byCourse;
  }
}

export default DashboardService;
