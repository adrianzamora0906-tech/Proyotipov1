const ReceiptService = require('../services/ReceiptService');
const instructorBranch = req => req.user.role === 'instructor' && !req.authorization?.global
  ? req.authorization?.branchId || req.user.branch_id : null;

class ReceiptController {
  static async getAll(req, res, next) {
    try {
      const receipts = await ReceiptService.getAll(instructorBranch(req));

      return res.json({
        success: true,
        data: receipts,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const receipt = await ReceiptService.getById(req.params.id, instructorBranch(req));

      return res.json({
        success: true,
        data: receipt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPrintHTML(req, res, next) {
    try {
      const html = await ReceiptService.getPrintHTML(req.params.id, instructorBranch(req));

      return res.json({
        success: true,
        html,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByStudent(req, res, next) {
    try {
      const receipts = await ReceiptService.getByStudent(req.params.studentId, instructorBranch(req));

      return res.json({
        success: true,
        data: receipts,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReceiptController;
