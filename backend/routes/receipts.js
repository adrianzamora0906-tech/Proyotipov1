const express = require('express');
const router = express.Router();
const ReceiptController = require('../controllers/receiptController');
const { authMiddleware } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/receipts - Todos los comprobantes
router.get('/', requirePermission('RECEIPT_VIEW'), ReceiptController.getAll);

// GET /api/receipts/:id - Comprobante por ID
router.get('/:id', requirePermission('RECEIPT_VIEW'), ReceiptController.getById);

// GET /api/receipts/:id/print - HTML para impresión
router.get('/:id/print', requirePermission('RECEIPT_VIEW'), ReceiptController.getPrintHTML);

// GET /api/receipts/student/:studentId - Comprobantes de estudiante
router.get('/student/:studentId', requirePermission('RECEIPT_VIEW'), ReceiptController.getByStudent);

module.exports = router;
