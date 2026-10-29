const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

// Todas las rutas requieren autenticación
router.use(authMiddleware);
router.get('/methods', requirePermission('PAYMENT_VIEW',{branchSource:'branchId'}), PaymentController.getMethods);

// GET /api/payments/pending - Pagos pendientes
router.get('/pending', requirePermission('PAYMENT_VIEW'), PaymentController.getPendingPayments);

// GET /api/payments/statistics - Estadísticas
router.get('/statistics', requirePermission('PAYMENT_VIEW'), PaymentController.getStatistics);
router.get('/history', requirePermission('PAYMENT_VIEW'), PaymentController.getHistory);
router.get('/cash-workspace', requirePermission('PAYMENT_VIEW'), PaymentController.getCashWorkspace);
router.get('/sales-report', requirePermission('PAYMENT_VIEW'), async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({success:true,data:await require('../services/CashSalesReportService').preview(req.user,req.authorization,req.query)});}catch(error){next(error);}});
router.get('/sales-report/export', requirePermission('PAYMENT_VIEW'), async(req,res,next)=>{try{const file=await require('../services/CashSalesReportService').export(req.user,req.authorization,req.query,req.requestContext);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${file.filename}"`);res.send(Buffer.from(file.buffer));}catch(error){next(error);}});
router.get('/transfer-verifications/export', requirePermission('TRANSFER_EXPORT'), PaymentController.exportTransfers);
router.post('/transfer-verifications', requirePermission('PAYMENT_CREATE'), PaymentController.createTransferVerification);
router.get('/transfer-verifications/:id/receipt', requirePermission('PAYMENT_VIEW',{anyOf:['PAYMENT_CREATE','STUDENT_CREATE']}), PaymentController.transferReceipt);
router.put('/transfer-verifications/:id/review', requirePermission('TRANSFER_VERIFY'), PaymentController.reviewTransferVerification);
router.put('/transfer-verifications/:id/approve', requirePermission('TRANSFER_APPROVE'), (req, res, next) => {
  req.authorization.transferApproval = true;
  return PaymentController.reviewTransferVerification(req, res, next);
});
router.put('/details/:id/correct', requirePermission('PAYMENT_CREATE'), PaymentController.correctPayment);

// POST /api/payments/register - Registrar pago (solo caja)
router.post('/register', requirePermission('PAYMENT_CREATE'), PaymentController.registerPayment);

// PUT /api/payments/:id/cancel - Anular pago (solo secretaria)
router.put('/:id/cancel', requirePermission('PAYMENT_VOID'), PaymentController.cancelPayment);
router.get('/void-requests/pending', PaymentController.pendingVoidRequests);
router.put('/void-requests/:id/review', PaymentController.reviewVoidRequest);
router.get('/void-requests/mine/reviewed', PaymentController.myReviewedVoidRequests);
router.put('/void-requests/:id/acknowledge', PaymentController.acknowledgeVoidRequest);
// Compatibilidad con Caja: esta ruta crea una solicitud; nunca anula sin aprobación.
router.put('/:id/void-direct', requirePermission('PAYMENT_VOID'), PaymentController.voidPaymentAsCashier);

module.exports = router;
