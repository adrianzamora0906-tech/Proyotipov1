/**
 * History View
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import { storageService } from '../../core/storage/StorageService.js';
import DateHelper from '../../helpers/DateHelper.js';

class HistoryView extends Component {
  async render() {
    const history = storageService.findAll('history').reverse();

    const historyContent = `
      <div class="history-page">
        <div class="page-header">
          <h1>Historial</h1>
          <p>Registro de todas las actividades</p>
        </div>

        <div class="card">
          ${history.length > 0 ? `
            <div class="timeline">
              ${history.map((item, index) => `
                <div class="timeline-item ${index === 0 ? 'latest' : ''}">
                  <div class="timeline-marker"></div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <div class="timeline-action">${item.action}</div>
                      <div class="timeline-badges">
                        <span class="badge badge-info">${item.studentId.substring(0, 8)}</span>
                      </div>
                    </div>
                    <div class="timeline-time">${DateHelper.format(item.timestamp, 'DD/MM/YYYY HH:MM:SS')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align: center; padding: 3rem; color: var(--gray-500);">
              No hay historial
            </div>
          `}
        </div>
      </div>
    `;

    const layout = await SidebarLayout.render(historyContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }
}

export default HistoryView;
