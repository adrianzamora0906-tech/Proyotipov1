import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import { authService } from '../../core/auth/AuthService.js';
import { cashDepositPanel, mountCashDepositPanel } from '../../helpers/CashDepositPanel.js';

export default class CashDepositsView extends Component {
  async render() {
    await authService.refreshAuthorization();
    const content = authService.can('PAYMENT_VIEW') ? `
      <link rel="stylesheet" href="/src/assets/css/pages/cash-operations.css?v=deposits-20261110">
      <div class="dashboard cash-deposits-page">
        <div class="dashboard-header"><div><h1>Depósitos al banco</h1><p>Registra los envíos de Caja y consulta el historial de tu sucursal.</p></div></div>
        ${cashDepositPanel()}
      </div>` : '<div class="alert">No tienes permiso para consultar depósitos.</div>';
    return SidebarLayout.render(content);
  }

  async mount() {
    SidebarLayout.attachEventListeners();
    if (authService.can('PAYMENT_VIEW')) mountCashDepositPanel();
  }
}
