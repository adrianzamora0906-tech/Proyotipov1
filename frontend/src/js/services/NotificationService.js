/**
 * Notification Service
 * Servicio de gestión de notificaciones
 */

import { storageService } from '../core/storage/StorageService.js';
import { authService } from '../core/auth/AuthService.js';
import ApiService from '../core/api/apiService.js';

class NotificationService {
  /**
   * Crea una notificación
   */
  static createNotification(studentId, title, message, type = 'info') {
    const userId = authService.getCurrentUser()?.userId;
    if (!userId) return null;
    const notification = storageService.insert('notifications', {
      userId,
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
    return this.getAllNotifications().filter(item => item.studentId === studentId);
  }

  /**
   * Obtiene todas las notificaciones no leídas
   */
  static getUnreadNotifications(studentId) {
    return this.getStudentNotifications(studentId).filter(item => !item.read);
  }

  /**
   * Marca una notificación como leída
   */
  static markAsRead(notificationId) {
    if (!this.getAllNotifications().some(item => item.id === notificationId)) return null;
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
    const userId = authService.getCurrentUser()?.userId;
    if (!userId) return [];
    return storageService.findBy('notifications', { userId }).reverse();
  }

  static async getPersonalNotifications() {
    const userId = authService.getCurrentUser()?.userId;
    if (!userId) return [];
    let response;
    try { response = await ApiService.getNotifications(); }
    catch (error) {
      if (authService.getCurrentUser()?.userId !== userId) return [];
      const local = this.getAllNotifications();
      if (local.length) return local;
      throw error;
    }
    if (authService.getCurrentUser()?.userId !== userId) return [];
    if (!response.success) throw new Error('No se pudieron consultar tus notificaciones');
    const remote = (response.data || []).filter(item => item.user_id === userId)
      .map(item => ({ ...item, createdAt: item.created_at, remote: true }));
    return [...this.getAllNotifications(), ...remote]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async markPersonalAsRead(notification) {
    if (!notification.remote) return this.markAsRead(notification.id);
    const response = await ApiService.markNotificationAsRead(notification.id);
    if (!response.success) throw new Error('No se pudo marcar la notificacion');
    return response.data;
  }
}

export default NotificationService;
