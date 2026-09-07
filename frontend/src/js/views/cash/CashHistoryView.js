import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import ApiService from '../../core/api/apiService.js';

class CashHistoryView extends Component {
  async render() {
    let history = [];
    try {
      const result = await ApiService.getPaymentHistory();
      history = result.success ? result.data : [];
    } catch (error) {
      console.warn('No se pudo cargar el historial de cobros:', error.message);
    }

    const items = history.map(h => `
      <div class="timeline-item">
        <div class="timeline-time">${new Date(h.date).toLocaleString()}</div>
        <div class="timeline-content">
          <strong>${h.studentName}</strong> (${h.cedula})<br>
          ${h.action} - Monto: $${Number(h.amount).toFixed(2)}
        </div>
      </div>
    `).join('');

    const content = `
      <div class="card">
        <div class="card-header"><h3>Historial de Cobros</h3></div>
        <div class="card-body">
          <div class="timeline">${items || '<p style="color: var(--gray-500);">No hay cobros registrados.</p>'}</div>
        </div>
      </div>
    `;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }
}

export default CashHistoryView;
