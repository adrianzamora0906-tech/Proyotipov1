/**
 * Notification Service
 * Servicio de gestión de notificaciones
 */

import { storageService } from '../core/storage/StorageService.js';

class NotificationService {
  /**
   * Crea una notificación
   */
  static createNotification(studentId, title, message, type = 'info') {
    const notification = storageService.insert('notifications', {
      studentId,
      title,
      message,
      type, // info, success, warning, error
      read: false,
      createdAt: new Date().toISOString(),
    });

    return notification;
  }

  /**
   * Obtiene notificaciones de un estudiante
   */
  static getStudentNotifications(studentId) {
    return storageService.findBy('notifications', { studentId }).reverse();
  }

  /**
   * Obtiene todas las notificaciones no leídas
   */
  static getUnreadNotifications(studentId) {
    return storageService.findBy('notifications', { studentId, read: false });
  }

  /**
   * Marca una notificación como leída
   */
  static markAsRead(notificationId) {
    return storageService.update('notifications', notificationId, { read: true });
  }

  /**
   * Marca todas las notificaciones como leídas
   */
  static markAllAsRead(studentId) {
    const notifications = this.getUnreadNotifications(studentId);
    notifications.forEach(notif => {
      storageService.update('notifications', notif.id, { read: true });
    });
  }

  /**
   * Cuenta notificaciones no leídas
   */
  static countUnread(studentId) {
    return this.getUnreadNotifications(studentId).length;
  }

  /**
   * Crea notificaciones automáticas según eventos
   */
  static notifyPaymentRequired(studentId) {
    this.createNotification(
      studentId,
      'Pago Requerido',
      'Tu pago está pendiente de confirmación',
      'warning'
    );
  }

  static notifyPaymentConfirmed(studentId) {
    this.createNotification(
      studentId,
      'Pago Confirmado',
      'Tu pago ha sido procesado correctamente',
      'success'
    );
  }

  static notifyScheduleSelected(studentId) {
    this.createNotification(
      studentId,
      'Horario Seleccionado',
      'Tu horario de clases ha sido confirmado',
      'success'
    );
  }

  static notifyEnrollmentComplete(studentId) {
    this.createNotification(
      studentId,
      'Matrícula Completada',
      '¡Bienvenido! Tu matrícula ha sido completada',
      'success'
    );
  }

  static notifyScheduleChange(studentId) {
    this.createNotification(
      studentId,
      'Cambio de Horario Requerido',
      'Existe una solicitud de cambio de horario para revisar',
      'info'
    );
  }

  /**
   * Obtiene todas las notificaciones
   */
  static getAllNotifications() {
    return storageService.findAll('notifications').reverse();
  }
}

export default NotificationService;
