/**
 * Student Service
 * Versión híbrida: intenta API REST primero, fallback a localStorage
 */

import { storageService } from '../core/storage/StorageService.js';
import ApiService from '../core/api/apiService.js';
import Validator from '../helpers/Validator.js';
import StringHelper from '../helpers/StringHelper.js';

class StudentService {
  static useApi = true;

  // Convierte los nombres de campos de PostgreSQL/API al formato que usa la UI.
  static normalizeStudent(student) {
    if (!student) return student;
    return {
      ...student,
      cedula: student.cedula || student.identification || '',
      firstName: student.firstName || student.first_name || '',
      lastName: student.lastName || student.last_name || '',
      birthDate: student.birthDate || student.birth_date || null,
      bloodType: student.bloodType || student.blood_type || '',
      branch: student.branch || student.branch_name || '',
      branchId: student.branchId || student.branch_id || null,
      city: student.city || student.city_name || '',
      createdAt: student.createdAt || student.created_at || null,
      createdByName: student.createdByName || student.created_by_name || '',
      referredByUserId: student.referredByUserId || student.referred_by_user_id || null,
      referredByName: student.referredByName || student.referred_by_name || '',
      referredByBranchName: student.referredByBranchName || student.referred_by_branch_name || '',
      instructorId: student.instructorId || student.instructor_id || null,
      instructorName: student.instructorName || student.instructor_name || '',
      additionalPractices: student.additionalPractices || student.additional_practices || [],
      registrationType: student.registrationType || student.registration_type || 'REGULAR',
      accessAccount: student.accessAccount || student.access_account || null,
    };
  }

  /**
   * Crea un nuevo estudiante
   */
  static async createStudent(studentData) {
    // Validaciones locales
    if (!studentData.cedula && !studentData.identification) {
      return { success: false, error: 'La cédula/identificación es requerida' };
    }
    if (!studentData.firstName || !studentData.lastName) {
      return { success: false, error: 'Nombre y apellido son requeridos' };
    }

    // API
    if (this.useApi) {
      try {
        const payload = {
          identification: studentData.cedula || studentData.identification,
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          birthDate: studentData.birthDate || null,
          email: studentData.email || null,
          phone: studentData.phone || null,
          address: studentData.address || null,
          bloodType: studentData.bloodType || 'N/D',
          city_id: studentData.city_id || null,
          branch_id: studentData.branch_id || null,
          course_id: studentData.course_id || null,
          branch: studentData.branch || null,
          course: studentData.course || null,
          registrationType: studentData.registrationType || 'REGULAR',
          referredByUserId: studentData.referredByUserId || null,
          reservationId: studentData.reservationId || null,
          discount: Number(studentData.discount || 0),
          notes: studentData.notes || null,
        };

        const result = await ApiService.createStudent(payload);
        if (result.success) {
          // Registrar en historial local también
          this.recordHistory('Estudiante registrado', result.data.id);
          return { success: true, data: result.data };
        }
        return result;
      } catch (error) {
        if (error.status === 409) return { success: false, error: 'Ya existe un estudiante con esta identificación' };
        if (error.code === 'REQUEST_TIMEOUT') return { success: false, error: error.message };
        if (error.status) {
          return {
            success: false,
            error: error.data?.error?.message || 'No se pudo registrar el estudiante en el servidor',
          };
        }
        console.error('API no disponible para createStudent:', error.message);
        return {
          success: false,
          error: 'No se pudo conectar con el servidor. El estudiante no fue registrado; revisa la conexión e inténtalo nuevamente.',
        };
      }
    }

    // Fallback localStorage
    const cleanCedula = (studentData.cedula || studentData.identification).toString().replace(/\D/g, '');
    const existing = storageService.findAll('students').filter(
      s => s.cedula?.toString().replace(/\D/g, '') === cleanCedula
    );
    if (existing.length > 0) {
      return { success: false, error: 'Ya existe un estudiante con esta cédula' };
    }

    if (studentData.email && !Validator.isValidEmail(studentData.email)) {
      return { success: false, error: 'Email inválido' };
    }

    const student = storageService.insert('students', {
      firstName: studentData.firstName,
      lastName: studentData.lastName,
      cedula: cleanCedula,
      birthDate: studentData.birthDate,
      email: studentData.email || '',
      phone: studentData.phone || '',
      address: studentData.address || '',
      province: studentData.province || '',
      branch: studentData.branch || '',
      branch_id: studentData.branch_id || null,
      bloodType: studentData.bloodType || 'O+',
      vehicle: studentData.vehicle || 'automovil',
      course: studentData.course || '',
      status: 'pendiente_documentacion',
      notes: studentData.notes || '',
    });

    this.recordHistory('Estudiante registrado', student.id);
    return { success: true, data: student };
  }

  /**
   * Obtiene un estudiante por ID
   */
  static async getStudent(id) {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudent(id);
        if (result.success) return this.normalizeStudent(result.data);
        return null;
      } catch (e) {
        console.error('No se pudo consultar el estudiante:', e.message);
        return null;
      }
    }
    return storageService.findById('students', id);
  }

  /**
   * Obtiene todos los estudiantes
   */
  static async getAllStudents(params = {}) {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudents(params);
        if (result.success) return result.data.map(student => this.normalizeStudent(student));
        return [];
      } catch (e) {
        console.error('No se pudo consultar el listado de estudiantes:', e.message);
        return [];
      }
    }
    return storageService.findAll('students');
  }

  static async getInstructors(branchId = null) {
    try {
      const result = await ApiService.getStudentInstructors(branchId);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('No se pudo consultar los instructores:', error.message);
      return [];
    }
  }

  static async getActiveReservations(params = {}) {
    try {
      const result = await ApiService.getStudentReservations(params);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('No se pudieron consultar los cupos reservados:', error.message);
      return [];
    }
  }

  static async searchReferralStaff(query) {
    try {
      const result = await ApiService.searchReferralStaff(query);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('No se pudo buscar el personal referido:', error.message);
      return [];
    }
  }

  static async resetStudentAccess(id) {
    try {
      return await ApiService.resetStudentAccess(id);
    } catch (error) {
      return { success: false, error: error.data?.error || error.message || 'No se pudo restablecer el acceso' };
    }
  }

  static async resolveAdditionalPracticeStudent(identification) {
    try {
      const result = await ApiService.resolveAdditionalPracticeStudent(identification);
      return { success: true, data: result.data ? this.normalizeStudent(result.data) : null };
    } catch (error) {
      return { success: false, error: error.data?.error?.message || error.message };
    }
  }

  static async createAdditionalPractice(studentId, data) {
    try { return await ApiService.createAdditionalPractice(studentId, data); }
    catch (error) { return { success: false, error: error.data?.error?.message || error.message }; }
  }
  static async createLicenseRenewal(data) {
    try { return await ApiService.createLicenseRenewal(data); }
    catch (error) { return { success: false, error: error.data?.error?.message || error.data?.error || error.message }; }
  }

  static async checkAdditionalPracticeAvailability(data) {
    try { return await ApiService.checkAdditionalPracticeAvailability(data); }
    catch (error) { return { success: false, error: error.data?.error?.message || error.message }; }
  }

  /**
   * Busca estudiantes por nombre o identificación
   */
  static async searchStudents(query, params = {}) {
    if (this.useApi) {
      try {
        const result = await ApiService.searchStudents(query, params);
        if (result.success) return result.data.map(student => this.normalizeStudent(student));
        return [];
      } catch (e) {
        console.error('No se pudo buscar estudiantes:', e.message);
        return [];
      }
    }

    // Fallback localStorage
    const students = storageService.findAll('students');
    const normalizedQuery = query.toString().replace(/\D/g, '').toLowerCase();
    return students.filter(student => {
      const cedula = (student.cedula || student.identification || '').toString().replace(/\D/g, '').toLowerCase();
      return (student.firstName || '').toLowerCase().includes(query.toLowerCase()) ||
        (student.lastName || '').toLowerCase().includes(query.toLowerCase()) ||
        cedula.includes(normalizedQuery);
    });
  }

  /**
   * Actualiza un estudiante
   */
  static async updateStudent(id, updates) {
    if (this.useApi) {
      try {
        const result = await ApiService.updateStudent(id, updates);
        if (result.success) {
          this.recordHistory('Estudiante actualizado', id);
          return result.data;
        }
      } catch (e) {
        console.warn('API no disponible para updateStudent:', e.message);
      }
    }
    const student = storageService.update('students', id, updates);
    if (student) this.recordHistory('Estudiante actualizado', id);
    return student;
  }

  /**
   * Actualiza el estado del estudiante
   */
  static async updateStudentStatus(id, newStatus) {
    if (this.useApi) {
      try {
        const result = await ApiService.updateStudentStatus(id, newStatus);
        if (result.success) {
          this.recordHistory(`Estado cambiado a: ${newStatus}`, id);
          return result.data;
        }
      } catch (e) {
        console.warn('API no disponible para updateStudentStatus:', e.message);
      }
    }
    const student = storageService.update('students', id, { status: newStatus });
    if (student) this.recordHistory(`Estado cambiado a: ${newStatus}`, id);
    return student;
  }

  /**
   * Obtiene estudiante por estado
   */
  static getStudentsByStatus(status) {
    return storageService.findBy('students', { status });
  }

  static getFullName(student) {
    if (!student) return '';
    return `${student.firstName || student.first_name || ''} ${student.lastName || student.last_name || ''}`;
  }

  static recordHistory(action, studentId) {
    storageService.insert('history', {
      studentId,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  static async getStudentHistory(studentId) {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudentHistory(studentId);
        if (result.success) return result.data;
      } catch (e) {
        console.warn('API no disponible para getStudentHistory:', e.message);
      }
    }
    return storageService.findBy('history', { studentId }).reverse();
  }

  static async getStatistics() {
    if (this.useApi) {
      try {
        const result = await ApiService.getStudents();
        if (result.success) {
          const students = result.data;
          return {
            total: students.length,
            pendingDocumentation: students.filter(s => s.status === 'pendiente_documentacion').length,
            pendingPayment: students.filter(s => ['pendiente_pago', 'pago_parcial'].includes(s.status)).length,
            enrolled: students.filter(s => s.status === 'matriculado').length,
            inCourse: students.filter(s => s.status === 'en_curso').length,
          };
        }
      } catch (e) {
        console.warn('API no disponible para getStatistics:', e.message);
      }
    }

    const students = storageService.findAll('students');
    return {
      total: students.length,
      pendingDocumentation: students.filter(s => s.status === 'pendiente_documentacion').length,
      pendingPayment: students.filter(s => ['pendiente_pago', 'pago_parcial'].includes(s.status)).length,
      enrolled: students.filter(s => s.status === 'matriculado').length,
      inCourse: students.filter(s => s.status === 'en_curso').length,
    };
  }

  static normalizeStoredCedulas() {
    const students = storageService.findAll('students');
    if (Array.isArray(students)) {
      students.forEach(student => {
        const cleanCedula = StringHelper.normalizeCedula(student.cedula || student.identification);
        if (student.cedula && student.cedula !== cleanCedula) {
          storageService.update('students', student.id, { cedula: cleanCedula });
        }
      });
    }
  }

  static deleteStudent(id) {
    return storageService.delete('students', id);
  }

  static async getBranches() {
    if (this.useApi) {
      try {
        const result = await ApiService.getBranches();
        if (result.success) return result.data;
      } catch (e) {
        console.warn('API no disponible para getBranches:', e.message);
      }
    }
    return [];
  }
}

export default StudentService;
