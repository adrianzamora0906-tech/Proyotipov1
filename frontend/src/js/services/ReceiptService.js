/**
 * ReceiptService
 * Genera y guarda comprobantes
 */

import { storageService } from '../core/storage/StorageService.js';
import StudentService from './StudentService.js';
import StringHelper from '../helpers/StringHelper.js';

class ReceiptService {
  static createReceipt({ studentId, paymentId, amount, method, cashier }) {
    const student = StudentService.getStudent(studentId);
    const receipt = storageService.insert('receipts', {
      number: `RCT-${Date.now()}`,
      studentId,
      paymentId,
      amount,
      method,
      cashier,
      date: new Date().toISOString(),
    });
    return receipt;
  }

  static getAllReceipts() {
    return storageService.findAll('receipts').reverse();
  }

  static getReceiptById(receiptId) {
    return storageService.findAll('receipts').find(r => r.id === receiptId);
  }

  static renderReceiptHTML(receipt) {
    const student = StudentService.getStudent(receipt.studentId);
    const date = new Date(receipt.date);
    const time = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;

    return `
      <div class="receipt-ticket">
        <div class="ticket-header">
          <div class="ticket-brand">SportmancarERP</div>
          <div class="ticket-subtitle">Comprobante de Pago</div>
        </div>
        <div class="ticket-line"></div>
        <div class="ticket-row"><span>Fecha</span><span>${date.toLocaleDateString()} ${time}</span></div>
        <div class="ticket-row"><span>Comprobante</span><span>${receipt.number}</span></div>
        <div class="ticket-row"><span>Cajero</span><span>${receipt.cashier}</span></div>
        <div class="ticket-line"></div>
        <div class="ticket-row"><span>Estudiante</span><span>${StudentService.getFullName(student)}</span></div>
        <div class="ticket-row"><span>Cédula</span><span>${StringHelper.normalizeCedula(student.cedula)}</span></div>
        <div class="ticket-row"><span>Curso</span><span>${student.course}</span></div>
        <div class="ticket-line"></div>
        <div class="ticket-row"><span>Monto</span><span>${receipt.amount}</span></div>
        <div class="ticket-row"><span>Método</span><span>${receipt.method}</span></div>
        <div class="ticket-line"></div>
        <div class="ticket-footer">Gracias por su pago</div>
      </div>
    `;
  }
}

export default ReceiptService;
