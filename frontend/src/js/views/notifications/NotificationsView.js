/**
 * Notifications View
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import NotificationService from '../../services/NotificationService.js';
import DateHelper from '../../helpers/DateHelper.js';

class NotificationsView extends Component {
  async render() {
    const notifications = NotificationService.getAllNotifications();

    const notificationsContent = `
      <div class="notifications-page">
        <div class="page-header">
          <div>
            <h1>Notificaciones</h1>
            <p>Centro de notificaciones</p>
          </div>
          ${notifications.some(n => !n.read) ? `
            <button class="btn btn-secondary" id="mark-all-read">Marcar todas como leídas</button>
          ` : ''}
        </div>

        <div class="card">
          ${notifications.length > 0 ? `
            <div class="notifications-list">
              ${notifications.map(notif => `
                <div class="notification-item ${!notif.read ? 'unread' : ''}">
                  <div class="notification-icon" style="background-color: ${this.getTypeColor(notif.type)};">
                    ${this.getTypeIcon(notif.type)}
                  </div>
                  <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-message">${notif.message}</div>
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
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const notifId = e.currentTarget.dataset.notifId;
        NotificationService.markAsRead(notifId);
        location.reload();
      });
    });

    document.getElementById('mark-all-read')?.addEventListener('click', () => {
      const notifications = NotificationService.getAllNotifications();
      notifications.forEach(n => {
        if (!n.read) {
          NotificationService.markAsRead(n.id);
        }
      });
      location.reload();
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
