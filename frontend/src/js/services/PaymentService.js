/**
 * PaymentService
 * Versión híbrida: intenta API REST primero, fallback a localStorage
 */

import { storageService } from '../core/storage/StorageService.js';
import ApiService from '../core/api/apiService.js';
import { authService } from '../core/auth/AuthService.js';

class PaymentService {
  static useApi = true;

  static notifyPaymentChanged(payment = null) {
    const detail = { payment, timestamp: Date.now() };

    // Actualiza la pestaña actual de inmediato.
    window.dispatchEvent(new CustomEvent('erp:dataChanged', {
      detail: { collection: 'payments', action: 'payment-registered', ...detail },
    }));

    // Notifica a las demás pestañas abiertas con la misma aplicación.
    localStorage.setItem(`${storageService.prefix}payment_sync`, JSON.stringify(detail));
  }

  static async findStudentByCedula(cedula) {
    if (this.useApi) {
      try {
        const result = await ApiService.searchStudents(cedula);
        if (result.success && result.data.length > 0) return result.data[0];
      } catch (e) {
        console.warn('API no disponible para findStudentByCedula:', e.message);
      }
    }
    const students = storageService.findAll('students');
    const clean = cedula.replace(/\D/g, '');
    return students.find(s => {
      const sCedula = (s.cedula || s.identification || '').toString().replace(/\D/g, '');
      return sCedula === clean;
    });
  }

  static async getStudentBalance(studentId) {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudentBalance(studentId);
        if (result.success) return result.data;
        // Si result.success es false (403/401), cae al fallback sin advertencia
      } catch (e) {
        // Capturar otros errores (red, servidor, etc)
        if (e?.status !== 403 && e?.status !== 401) {
          console.warn('API no disponible para getStudentBalance:', e.message);
        }
      }
    }
    const student = storageService.findById('students', studentId);
    const coursePrices = { 'clase-b': 300, 'clase-a': 200 };
    const total = coursePrices[student?.course] || 0;
    const payments = storageService.findAll('payments').filter(p => p.studentId === studentId && p.status !== 'anulado');
    const paid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    return { total, paid, balance: Math.max(0, total - paid) };
  }

  static async getStudentPayments(studentId) {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudentPayments(studentId);
        if (result.success) return result.data;
        // Si result.success es false (403/401), cae al fallback sin advertencia
      } catch (e) {
        // Capturar otros errores (red, servidor, etc)
        if (e?.status !== 403 && e?.status !== 401) {
          console.warn('API no disponible para getStudentPayments:', e.message);
        }
      }
    }
    return storageService.findAll('payments')
      .filter(p => p.studentId === studentId && p.status !== 'anulado')
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  static async registerPayment({ studentId, serviceTransactionId, amount, method, reference, cedula, cashier, notify = true }) {
    if (this.useApi) {
      try {
        const result = await ApiService.registerPayment({
          cedula: cedula || '',
          amount: Number(amount),
          method,
          reference: reference || null,
          cashier: cashier || 'Cajero',
          serviceTransactionId: serviceTransactionId || null,
        });
        if (result.success) {
          const response = {
            success: true,
            payment: result.data.payment,
            receipt: result.data.receipt,
            newBalance: result.data.newBalance,
          };
          if (notify) this.notifyPaymentChanged(response.payment);
          return response;
        }
        return result;
      } catch (error) {
        return { success: false, error: error.message || 'Error al registrar pago' };
      }
    }

    // Fallback localStorage
    const payment = storageService.insert('payments', {
      studentId,
      amount: Number(amount),
      method,
      reference: reference || null,
      cashier,
      date: new Date().toISOString(),
      status: 'confirmado',
    });

    storageService.insert('paymentHistory', {
      studentId,
      paymentId: payment.id,
      action: 'Pago registrado',
      amount: Number(amount),
      date: new Date().toISOString(),
    });

    const receipt = {
      number: `RCT-${Date.now()}`,
      studentId,
      paymentId: payment.id,
      amount: Number(amount),
      method,
      cashier,
      date: new Date().toISOString(),
    };

    const response = { success: true, payment, receipt, newBalance: 0 };
    if (notify) this.notifyPaymentChanged(payment);
    return response;
  }

  static async getAvailableMethods(branchId = '') {
    try {
      const currentUser = authService.getCurrentUser();
      const queryBranchId = currentUser?.scope === 'GLOBAL' ? branchId : '';
      const result = await ApiService.getPaymentMethods(queryBranchId);
      return result.success ? result.data : [];
    } catch (error) {
      console.warn('No se pudieron cargar los métodos de pago:', error.message);
      return [];
    }
  }

  static async getPendingPayments() {
    if (this.useApi) {
      try {
        const result = await ApiService.getPendingPayments();
        if (result.success) {
          return result.data.map(payment => ({
            ...payment,
            branchId: payment.branchId || payment.student?.branchId || payment.branch_id || payment.student?.branch_id || null,
            student: {
              id: payment.studentId,
              cedula: payment.cedula || '',
              firstName: (payment.studentName || '').split(' ')[0] || '',
              lastName: (payment.studentName || '').split(' ').slice(1).join(' '),
              course: payment.course || '',
              branchId: payment.branchId || payment.student?.branchId || payment.branch_id || payment.student?.branch_id || null,
            },
          }));
        }
        // Si result.success es false (403/401), cae al fallback sin advertencia
      } catch (e) {
        // Capturar otros errores (red, servidor, etc)
        if (e?.status !== 403 && e?.status !== 401) {
          console.warn('API no disponible para getPendingPayments:', e.message);
        }
      }
    }
    const students = storageService.findAll('students');
    return students
      .filter(s => ['pendiente_pago', 'pago_parcial'].includes(s.status))
      .map(s => {
        const total = 300;
        const payments = storageService.findAll('payments').filter(p => p.studentId === s.id && p.status !== 'anulado');
        const paid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        return {
          studentId: s.id,
          studentName: `${s.firstName} ${s.lastName}`,
          cedula: s.cedula || '',
          student: {
            id: s.id,
            cedula: s.cedula || '',
            firstName: s.firstName || '',
            lastName: s.lastName || '',
            course: s.course || '',
          },
          total,
          paid,
          balance: Math.max(0, total - paid),
        };
      });
  }

  static async getStatistics() {
    if (this.useApi) {
      try {
        const result = await ApiService.getPaymentStatistics();
        if (result.success) return result.data;
        // Si result.success es false (403/401), cae al fallback sin advertencia
      } catch (e) {
        // Capturar otros errores (red, servidor, etc)
        if (e?.status !== 403 && e?.status !== 401) {
          console.warn('API no disponible para getStatistics:', e.message);
        }
      }
    }
    const payments = storageService.findAll('payments');
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return {
      totalPayments: payments.length,
      totalAmount,
      averagePayment: payments.length > 0 ? totalAmount / payments.length : 0,
      pendingCount: 0,
    };
  }
}

export default PaymentService;
