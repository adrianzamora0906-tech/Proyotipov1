const PaymentService = require('../services/PaymentService');
const CashOperationsService = require('../services/CashOperationsService');
const StudentService = require('../services/StudentService');

const effectiveCollectionBranchId = (req) => req.authorization?.operationalCoverage?.operational_branch_id || req.authorization?.branchId || req.user.branch_id;

class PaymentController {
  static async checkInstructorStudent(req, data) {
    if (req.user.role !== 'instructor' || req.authorization?.global) return;
    const branchId = effectiveCollectionBranchId(req);
    const students = await StudentService.search(data.cedula || '', { branch_id:branchId });
    const student = students.find(item => item.identification === data.cedula);
    if (!student || (data.studentId && String(data.studentId) !== String(student.id))) {
      const error = new Error('Solo puedes cobrar a estudiantes de tu sucursal');
      error.status = 403;
      throw error;
    }
  }
  static async getCashWorkspace(req,res,next){try{return res.json({success:true,data:await CashOperationsService.workspace(req.user,req.authorization)});}catch(error){next(error);}}
  static async createTransferVerification(req,res,next){try{await PaymentController.checkInstructorStudent(req, req.body);return res.status(201).json({success:true,data:await CashOperationsService.createTransfer(req.body,req.user,req.authorization,req.requestContext)});}catch(error){next(error);}}
  static async reviewTransferVerification(req,res,next){try{return res.json({success:true,data:await CashOperationsService.reviewTransfer(req.params.id,req.body.decision,req.body.note,req.user,req.authorization,req.requestContext)});}catch(error){next(error);}}
  static async correctPayment(req,res,next){try{return res.json({success:true,data:await CashOperationsService.correctPayment(req.params.id,req.body,req.user,req.authorization,req.requestContext)});}catch(error){next(error);}}
  static async exportTransfers(req,res,next){try{const file=await CashOperationsService.exportTransfers(req.query.date,req.user,req.authorization);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${file.filename}"`);return res.send(Buffer.from(file.buffer));}catch(error){next(error);}}
  static async getMethods(req, res, next) {
    try {
      const branchId = req.authorization?.global ? req.query.branchId : effectiveCollectionBranchId(req);
      return res.json({ success:true, data:await PaymentService.getAvailableMethods(branchId) });
    } catch (error) { next(error); }
  }
  static async getPendingPayments(req, res, next) {
    try {
      const pending = await PaymentService.getPendingPayments({
        global: Boolean(req.authorization?.global),
        collectionBranchId: req.authorization?.global ? null : effectiveCollectionBranchId(req),
      });

      return res.json({
        success: true,
        data: req.user.role === 'instructor' && !req.authorization?.global
          ? pending.filter(payment => String(payment.branchId) === String(effectiveCollectionBranchId(req))) : pending,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStudentBalance(req, res, next) {
    try {
      if (req.user.role === 'instructor' && !req.authorization?.global) {
        await StudentService.getById(req.params.studentId, { branch_id:effectiveCollectionBranchId(req) });
      }
      const balance = await PaymentService.getStudentBalance(req.params.studentId,req.query.enrollmentId || null);

      return res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStudentPayments(req, res, next) {
    try {
      if (req.user.role === 'instructor' && !req.authorization?.global) {
        await StudentService.getById(req.params.studentId, { branch_id:effectiveCollectionBranchId(req) });
      }
      const payments = await PaymentService.getStudentPayments(req.params.studentId);

      return res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  }

  static async registerPayment(req, res, next) {
    try {
      await PaymentController.checkInstructorStudent(req, req.body);
      const { cedula, amount, method, reference, cardBatch, serviceTransactionId,enrollmentId } = req.body;

      if (!cedula || !amount || !method) {
        return res.status(422).json({
          success: false,
          error: 'Campos requeridos: cedula, amount, method',
        });
      }

      if (String(method).trim().toLowerCase() === 'transferencia') {
        const transfer = await CashOperationsService.createTransfer({ cedula, enrollmentId,serviceTransactionId, amount, reference, transferDate: req.body.transferDate || new Date().toISOString().slice(0,10), bank: req.body.bank, proofUrl:req.body.proofUrl }, req.user, req.authorization, req.requestContext);
        return res.status(202).json({ success:true, data:{ pendingTransfer:true, transfer } });
      }
      const result = await PaymentService.registerPayment({
        cedula,
        amount,
        method,
        reference,
        cardBatch,
        serviceTransactionId,
        enrollmentId,
        cashier: req.user.name,
        cashierUserId: req.user.id,
        cashierRole: req.user.role,
        globalAccess: Boolean(req.authorization?.global),
        collectionBranchId: req.authorization?.global ? null : effectiveCollectionBranchId(req),
        requestContext: req.requestContext,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(req, res, next) {
    try {
      const stats = await PaymentService.getStatistics(req.authorization?.global ? null : effectiveCollectionBranchId(req));

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancelPayment(req, res, next) {
    try {
      const { reason } = req.body;
      const payment = await PaymentService.requestPaymentVoid(req.params.id, reason, req.user, req.requestContext);

      return res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req, res, next) {
    try {
      const history = await PaymentService.getHistory(req.user.role === 'instructor' && !req.authorization?.global ? effectiveCollectionBranchId(req) : null);
      return res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }

  static async pendingVoidRequests(req, res, next) {
    try { return res.json({ success: true, data: await PaymentService.getPendingVoidRequests(req.user) }); }
    catch (error) { next(error); }
  }

  static async reviewVoidRequest(req, res, next) {
    try {
      const data = await PaymentService.reviewPaymentVoid(req.params.id, req.body.decision, req.body.note, req.user, req.requestContext);
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  static async myReviewedVoidRequests(req, res, next) {
    try { return res.json({ success: true, data: await PaymentService.getMyReviewedVoidRequests(req.user) }); }
    catch (error) { next(error); }
  }

  static async acknowledgeVoidRequest(req, res, next) {
    try { return res.json({ success: true, data: await PaymentService.acknowledgeVoidRequest(req.params.id, req.user) }); }
    catch (error) { next(error); }
  }

  static async voidPaymentAsCashier(req, res, next) {
    try { return res.json({ success: true, data: await PaymentService.voidPaymentAsCashier(req.params.id, req.body.reason, req.user, req.requestContext) }); }
    catch (error) { next(error); }
  }
}

module.exports = PaymentController;
