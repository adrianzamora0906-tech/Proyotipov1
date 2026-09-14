const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/studentController');
const DocumentController = require('../controllers/documentController');
const PaymentController = require('../controllers/paymentController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/students/search - Buscar estudiantes (debe ir antes de /:id)
router.get('/search', requirePermission('STUDENT_VIEW'), StudentController.search);
router.get('/locations/cities', StudentController.getCities);
router.get('/branches/all', StudentController.getBranches);
router.get('/branches/:branchId/courses', StudentController.getBranchCourses);
router.get('/instructors/branch', requirePermission('STUDENT_VIEW'), StudentController.getInstructors);
router.get('/referral-staff', requirePermission('STUDENT_CREATE'), StudentController.searchReferralStaff);
router.get('/additional-practices/resolve', requirePermission('STUDENT_VIEW'), StudentController.resolveAdditionalPracticeStudent);
router.get('/additional-practices/availability', requirePermission('STUDENT_VIEW'), StudentController.checkAdditionalPracticeAvailability);
router.get('/reservations', requirePermission('STUDENT_VIEW'), StudentController.getReservations);
router.post('/reservations', requirePermission('STUDENT_CREATE'), StudentController.createTemporaryReservation);
router.delete('/reservations/:reservationId', requirePermission('STUDENT_CREATE'), StudentController.cancelReservation);
router.post('/license-renewals', requirePermission('STUDENT_CREATE'), StudentController.createLicenseRenewal);

// GET /api/students - Obtener todos los estudiantes
router.get('/', requirePermission('STUDENT_VIEW'), StudentController.getAll);

// POST /api/students - Crear estudiante (solo secretaria)
router.post('/', requirePermission('STUDENT_CREATE'), StudentController.create);
router.post('/:id/additional-practices', requirePermission('STUDENT_CREATE'), StudentController.createAdditionalPractice);

// GET /api/students/:id - Obtener estudiante por ID
router.get('/:id', requirePermission('STUDENT_VIEW'), StudentController.getById);

// Genera una nueva clave temporal; la clave se devuelve una sola vez.
router.post('/:id/reset-access', requirePermission('STUDENT_UPDATE'), StudentController.resetAccess);

// PUT /api/students/:id - Actualizar estudiante
router.put('/:id', requirePermission('STUDENT_UPDATE'), StudentController.update);

// PUT /api/students/:id/status - Actualizar estado
router.put('/:id/status', requirePermission('STUDENT_STATUS_UPDATE'), StudentController.updateStatus);

// GET /api/students/:id/history - Historial del estudiante
router.get('/:id/history', requirePermission('STUDENT_VIEW'), StudentController.getHistory);

// Documentos del estudiante
router.get('/:studentId/documents', requirePermission('DOCUMENT_VIEW'), DocumentController.getByStudent);
router.post('/:studentId/documents', requirePermission('DOCUMENT_CREATE'), DocumentController.create);
router.post(
  '/:studentId/documents/append-blood-card',
  requirePermission('DOCUMENT_UPDATE'),
  DocumentController.appendBloodCard
);

// Pagos del estudiante
router.get('/:studentId/balance', requirePermission('PAYMENT_VIEW'), PaymentController.getStudentBalance);
router.get('/:studentId/payments', requirePermission('PAYMENT_VIEW'), PaymentController.getStudentPayments);

module.exports = router;
