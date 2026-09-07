/**
 * Demo Data Generator
 * Script para cargar datos de demo en el sistema
 */

import { storageService } from '../core/storage/StorageService.js';

class DemoDataGenerator {
  static generateDemoData() {
    // Generar estudiantes de demo
    const demoStudents = [
      {
        firstName: 'Carlos',
        lastName: 'Mendez',
        cedula: '1234567890',
        birthDate: '1998-05-15',
        province: 'Pichincha',
        branch: 'Sucursal Centro',
        email: 'carlos.mendez@email.com',
        phone: '+1234567890',
        address: 'Calle Principal 123, Ciudad',
        bloodType: 'O+',
        vehicle: 'automovil',
        course: 'clase-b',
        status: 'matriculado',
      },
      {
        firstName: 'Ana',
        lastName: 'Rodriguez',
        cedula: '9876543210',
        birthDate: '2000-03-22',
        province: 'Guayas',
        branch: 'Sucursal Norte',
        email: 'ana.rodriguez@email.com',
        phone: '+0987654321',
        address: 'Avenida Central 456, Ciudad',
        bloodType: 'A+',
        vehicle: 'moto',
        course: 'clase-a',
        status: 'en_curso',
      },
      {
        firstName: 'Juan',
        lastName: 'Perez',
        cedula: '4567891230',
        birthDate: '1999-07-10',
        province: 'Azuay',
        branch: 'Sucursal Sur',
        email: 'juan.perez@email.com',
        phone: '+1122334455',
        address: 'Calle Secundaria 789, Ciudad',
        bloodType: 'B+',
        vehicle: 'automovil',
        course: 'clase-b',
        status: 'pendiente_pago',
      },
      {
        firstName: 'María',
        lastName: 'Garcia',
        cedula: '3216549870',
        birthDate: '2001-01-05',
        province: 'Loja',
        branch: 'Sucursal Centro',
        email: 'maria.garcia@email.com',
        phone: '+5544332211',
        address: 'Avenida Norte 321, Ciudad',
        bloodType: 'AB+',
        vehicle: 'automovil',
        course: 'clase-b',
        status: 'pago_confirmado',
      },
      {
        firstName: 'Pedro',
        lastName: 'Lopez',
        cedula: '6541237890',
        birthDate: '1997-11-30',
        province: 'Manabí',
        branch: 'Sucursal Occidente',
        email: 'pedro.lopez@email.com',
        phone: '+9988776655',
        address: 'Calle Sur 654, Ciudad',
        bloodType: 'O-',
        vehicle: 'moto',
        course: 'clase-a',
        status: 'horario_seleccionado',
      },
    ];

    // Generar estudiantes
    const students = storageService.findAll('students');
    if (students.length === 0) {
      demoStudents.forEach(student => {
        const created = storageService.insert('students', student);
        
        // Crear documentos para cada estudiante
        storageService.insert('documents', {
          studentId: created.id,
          type: 'cedula',
          name: 'Cédula de Identidad',
          status: 'aprobado',
          uploadedAt: new Date().toISOString(),
        });

        storageService.insert('documents', {
          studentId: created.id,
          type: 'foto',
          name: 'Fotografía',
          status: Math.random() > 0.5 ? 'aprobado' : 'pendiente',
          uploadedAt: new Date().toISOString(),
        });

        // Crear notificaciones
        if (created.status === 'pendiente_pago') {
          storageService.insert('notifications', {
            studentId: created.id,
            title: 'Pago Pendiente',
            message: 'Tu pago está pendiente de confirmación',
            type: 'warning',
            read: false,
            createdAt: new Date().toISOString(),
          });
        }

        // Crear pagos si está pagado
        if (created.status !== 'pendiente_pago' && created.status !== 'pendiente_documentacion') {
          storageService.insert('payments', {
            studentId: created.id,
            amount: 250,
            concept: 'Matrícula',
            date: new Date().toISOString(),
            status: 'confirmado',
            method: 'transferencia',
            reference: `PAY-${Date.now()}-ABC123`,
          });
        }

        // Registrar en historial
        storageService.insert('history', {
          studentId: created.id,
          action: 'Estudiante registrado (Demo)',
          timestamp: new Date().toISOString(),
        });
      });

      console.log('%c✅ Datos de demo cargados', 'color: #10B981; font-weight: bold;');
    }
  }

  static clearDemoData() {
    storageService.clear();
    console.log('%c🗑️  Base de datos limpiada', 'color: #F59E0B; font-weight: bold;');
  }
}

// Cargar demo data al iniciar si no hay estudiantes
if (typeof window !== 'undefined') {
  try {
    const existing = storageService.findAll('students');
    if (!existing || existing.length === 0) {
      DemoDataGenerator.generateDemoData();
    }
  } catch (err) {
    // Ignorar en entornos sin localStorage
  }
}

// Exponer en window para debug
window.DemoDataGenerator = DemoDataGenerator;

export default DemoDataGenerator;
