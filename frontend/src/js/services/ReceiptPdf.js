import { apiClient } from '../core/api/ApiClient.js';

export async function downloadReceiptPDF(id, { transfer = false, button } = {}) {
  if (button) button.disabled = true;
  try {
    const endpoint = transfer
      ? `/payments/transfer-verifications/${encodeURIComponent(id)}/receipt/pdf`
      : `/receipts/${encodeURIComponent(id)}/pdf`;
    const result = await apiClient.downloadGet(endpoint);
    if (!result.blob) throw new Error(result.error || 'No se pudo descargar el comprobante PDF.');
    const { blob, filename } = result;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'comprobante.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    window.alert(error.message || 'No se pudo descargar el comprobante PDF.');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
