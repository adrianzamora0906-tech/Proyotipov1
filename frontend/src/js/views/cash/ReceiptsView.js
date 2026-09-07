import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import { storageService } from '../../core/storage/StorageService.js';
import ReceiptService from '../../services/ReceiptService.js';

class ReceiptsView extends Component {
  async render() {
    const receipts = storageService.findAll('receipts').reverse();

    const rows = receipts.map(r => `
      <tr>
        <td>${r.number}</td>
        <td>${new Date(r.date).toLocaleString()}</td>
        <td>${r.amount}</td>
        <td>${r.method}</td>
        <td><button class="btn btn-secondary view-receipt" data-id="${r.id}">Ver</button></td>
      </tr>
    `).join('');

    const content = `
      <div class="card">
        <div class="card-header"><h3>Comprobantes</h3></div>
        <div class="card-body">
          <table class="table">
            <thead><tr><th>Número</th><th>Fecha</th><th>Monto</th><th>Método</th><th>Acción</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div id="receipt-modal"></div>
    `;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    document.querySelectorAll('.view-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const receipts = storageService.findAll('receipts');
        const receipt = receipts.find(r => r.id === id);
        if (!receipt) return;
        const html = ReceiptService.renderReceiptHTML(receipt);
        const modal = document.getElementById('receipt-modal');
        modal.innerHTML = `
          <div class="modal-overlay active" id="receipt-modal-overlay">
            <div class="modal">
              <div class="modal-header">
                <h3 class="modal-title">Comprobante ${receipt.number}</h3>
                <button class="modal-close" id="receipt-close">×</button>
              </div>
              <div class="modal-body">
                ${html}
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" id="receipt-close-btn">Cerrar</button>
                <button class="btn btn-primary" id="print-btn">Imprimir</button>
              </div>
            </div>
          </div>
        `;

        const overlay = document.getElementById('receipt-modal-overlay');
        overlay?.addEventListener('click', (event) => {
          if (event.target === overlay) {
            modal.innerHTML = '';
          }
        });

        modal.querySelector('#receipt-close')?.addEventListener('click', () => {
          modal.innerHTML = '';
        });

        modal.querySelector('#receipt-close-btn')?.addEventListener('click', () => {
          modal.innerHTML = '';
        });

        modal.querySelector('#print-btn')?.addEventListener('click', () => window.print());
      });
    });
  }
}

export default ReceiptsView;
