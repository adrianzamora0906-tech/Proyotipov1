/**
 * Notifications View
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import NotificationService from '../../services/NotificationService.js';
import DateHelper from '../../helpers/DateHelper.js';
import { registrationUploadQueue } from '../../services/RegistrationUploadQueue.js';

class NotificationsView extends Component {
  async render() {
    let loadError = '';
    let notifications = [];
    try { notifications = await NotificationService.getPersonalNotifications(); }
    catch (_) { loadError = 'No se pudieron cargar tus notificaciones. Vuelve a abrir esta pantalla para reintentar.'; }
    this.notifications = notifications;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

    const notificationsContent = `
      <div class="notifications-page">
        <div class="page-header">
          <div>
            <h1>Notificaciones</h1>
            <p>Tus avisos y alertas personales</p>
          </div>
          ${notifications.some(n => !n.read) ? `
            <button class="btn btn-secondary" id="mark-all-read">Marcar todas como leídas</button>
          ` : ''}
        </div>

        <p id="notification-error" role="alert">${loadError}</p>
        <div class="card">
          ${notifications.length > 0 ? `
            <div class="notifications-list">
              ${notifications.map(notif => `
                <div class="notification-item ${!notif.read ? 'unread' : ''}" data-notification-id="${escape(notif.id)}">
                  <div class="notification-icon" style="background-color: ${this.getTypeColor(notif.type)};">
                    ${this.getTypeIcon(notif.type)}
                  </div>
                  <div class="notification-content">
                    <div class="notification-title">${escape(notif.title)}</div>
                    <div class="notification-message">${escape(notif.message)}</div>
                    <div class="notification-time">${DateHelper.formatRelative(notif.createdAt)}</div>
                  </div>
                  ${!notif.read ? `
                    <button class="mark-read-btn" data-notif-id="${notif.id}">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align: center; padding: 3rem;">
              <p style="color: var(--gray-500);">No hay notificaciones</p>
            </div>
          `}
        </div>
      </div>
    `;

    const layout = await SidebarLayout.render(notificationsContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    this.updateDocumentUploads = event => {
      if (event && event.detail?.collection !== 'notifications') return;
      for (const notification of NotificationService.getAllNotifications().filter(item => item.uploadJobId)) {
        const item = [...document.querySelectorAll('[data-notification-id]')].find(element => element.dataset.notificationId === String(notification.id));
        if (!item) continue;
        item.querySelector('.notification-title').textContent = notification.title;
        item.querySelector('.notification-message').textContent = notification.message;
        const icon = item.querySelector('.notification-icon');
        icon.style.backgroundColor = this.getTypeColor(notification.type);
        icon.textContent = this.getTypeIcon(notification.type);
        item.classList.toggle('unread', !notification.read);
        const old = this.notifications.find(row => row.id === notification.id);
        if (old) Object.assign(old, notification);
        item.querySelector('.document-upload-retry')?.remove();
        if (notification.uploadStatus === 'error') {
          const retry = document.createElement('button');
          retry.className = 'btn btn-secondary document-upload-retry'; retry.textContent = 'Reintentar carga';
          retry.addEventListener('click', async () => {
            retry.disabled = true;
            try { await registrationUploadQueue.retry(notification.uploadJobId); }
            catch (_) { retry.disabled = false; document.getElementById('notification-error').textContent = 'No se pudo reintentar. Revisa tu conexion.'; }
          });
          item.querySelector('.notification-content').append(retry);
        }
      }
    };
    window.addEventListener('erp:dataChanged', this.updateDocumentUploads);
    this.updateDocumentUploads();
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const notifId = e.currentTarget.dataset.notifId;
        const notification = this.notifications.find(item => String(item.id) === notifId);
        if (!notification) return;
        btn.disabled = true;
        try {
          const saved = await NotificationService.markPersonalAsRead(notification);
          if (!saved) throw new Error('Notificacion no disponible');
          notification.read = true;
          btn.closest('.notification-item')?.classList.remove('unread');
          btn.remove();
          if (this.notifications.every(item => item.read)) document.getElementById('mark-all-read')?.remove();
          SidebarLayout.updateNotificationBadge();
        } catch (_) {
          btn.disabled = false;
          document.getElementById('notification-error').textContent = 'No se pudo marcar el aviso. Intenta nuevamente.';
        }
      });
    });

    document.getElementById('mark-all-read')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        for (const notification of this.notifications.filter(item => !item.read)) {
          const saved = await NotificationService.markPersonalAsRead(notification);
          if (!saved) throw new Error('Notificacion no disponible');
          notification.read = true;
          const control = [...document.querySelectorAll('.mark-read-btn')].find(btn => btn.dataset.notifId === String(notification.id));
          control?.closest('.notification-item')?.classList.remove('unread');
          control?.remove();
        }
        button.remove();
      } catch (_) {
        button.disabled = false;
        document.getElementById('notification-error').textContent = 'Algunos avisos no pudieron marcarse. Intenta nuevamente.';
      }
      SidebarLayout.updateNotificationBadge();
    });
  }

  getTypeColor(type) {
    const colors = {
      success: 'rgba(16, 185, 129, 0.1)',
      warning: 'rgba(245, 158, 11, 0.1)',
      error: 'rgba(239, 68, 68, 0.1)',
      info: 'rgba(59, 130, 246, 0.1)',
    };
    return colors[type] || colors.info;
  }

  unmount() {
    window.removeEventListener('erp:dataChanged', this.updateDocumentUploads);
    super.unmount();
  }

  getTypeIcon(type) {
    const icons = {
      success: '✓',
      warning: '⚠',
      error: '✕',
      info: 'ℹ',
    };
    return icons[type] || icons.info;
  }
}

export default NotificationsView;
