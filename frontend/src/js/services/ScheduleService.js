/**
 * Schedule Service
 * Servicio de gestión de horarios
 */

import { storageService } from '../core/storage/StorageService.js';

class ScheduleService {
  /**
   * Obtiene todos los horarios disponibles
   */
  static getAvailableSchedules() {
    const schedules = storageService.findAll('schedules');
    if (schedules.length === 0) {
      return this.initializeDefaultSchedules();
    }
    return schedules;
  }

  /**
   * Inicializa horarios por defecto
   */
  static initializeDefaultSchedules() {
    const defaultSchedules = [
      {
        day: 'Lunes',
        time: '08:00 - 10:00',
        course: 'Automóvil',
        instructor: 'Juan Rodríguez',
        capacity: 5,
        available: 3,
      },
      {
        day: 'Martes',
        time: '10:00 - 12:00',
        course: 'Automóvil',
        instructor: 'María García',
        capacity: 5,
        available: 2,
      },
      {
        day: 'Miércoles',
        time: '14:00 - 16:00',
        course: 'Automóvil',
        instructor: 'Carlos López',
        capacity: 5,
        available: 5,
      },
      {
        day: 'Jueves',
        time: '16:00 - 18:00',
        course: 'Automóvil',
        instructor: 'Ana Martínez',
        capacity: 5,
        available: 4,
      },
      {
        day: 'Viernes',
        time: '08:00 - 10:00',
        course: 'Moto',
        instructor: 'Pedro Sánchez',
        capacity: 4,
        available: 2,
      },
      {
        day: 'Sábado',
        time: '10:00 - 12:00',
        course: 'Moto',
        instructor: 'Roberto Díaz',
        capacity: 4,
        available: 4,
      },
    ];

    defaultSchedules.forEach((schedule, index) => {
      storageService.insert('schedules', {
        ...schedule,
        index,
      });
    });

    return storageService.findAll('schedules');
  }

  /**
   * Obtiene horarios por curso
   */
  static getSchedulesByCourse(course) {
    return storageService.findBy('schedules', { course });
  }

  /**
   * Selecciona un horario para un estudiante
   */
  static selectSchedule(studentId, scheduleId) {
    const schedule = storageService.findById('schedules', scheduleId);
    if (!schedule || schedule.available <= 0) {
      return { success: false, error: 'Horario no disponible' };
    }

    // Registrar matrícula
    storageService.insert('enrollments', {
      studentId,
      scheduleId,
      status: 'activa',
      enrolledAt: new Date().toISOString(),
    });

    // Disminuir disponibilidad
    storageService.update('schedules', scheduleId, {
      available: schedule.available - 1,
    });

    return { success: true, message: 'Horario seleccionado' };
  }

  /**
   * Obtiene el horario seleccionado de un estudiante
   */
  static getStudentSchedule(studentId) {
    const enrollments = storageService.findBy('enrollments', { studentId });
    if (enrollments.length === 0) return null;

    const enrollment = enrollments[0];
    const schedule = storageService.findById('schedules', enrollment.scheduleId);
    return { ...schedule, enrollment };
  }

  /**
   * Cambia el horario de un estudiante
   */
  static changeSchedule(studentId, newScheduleId) {
    // Obtener inscripción actual
    const currentEnrollment = storageService.findBy('enrollments', { studentId })[0];
    if (!currentEnrollment) return null;

    const currentSchedule = storageService.findById('schedules', currentEnrollment.scheduleId);
    const newSchedule = storageService.findById('schedules', newScheduleId);

    if (!newSchedule || newSchedule.available <= 0) {
      return null;
    }

    // Liberar cupo anterior
    storageService.update('schedules', currentEnrollment.scheduleId, {
      available: currentSchedule.available + 1,
    });

    // Asignar nuevo horario
    storageService.update('enrollments', currentEnrollment.id, {
      scheduleId: newScheduleId,
    });

    storageService.update('schedules', newScheduleId, {
      available: newSchedule.available - 1,
    });

    return { success: true };
  }

  /**
   * Obtiene horarios llenos
   */
  static getFullSchedules() {
    return storageService.findAll('schedules').filter(s => s.available === 0);
  }

  /**
   * Obtiene estudiantes inscritos en un horario
   */
  static getEnrolledStudents(scheduleId) {
    return storageService.findBy('enrollments', { scheduleId });
  }
}

export default ScheduleService;
