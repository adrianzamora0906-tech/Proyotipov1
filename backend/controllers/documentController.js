const DocumentService = require('../services/DocumentService');
const db = require('../config/database');
const os = require('os');

function getLocalFrontendUrl(token) {
  const port = process.env.FRONTEND_PORT || '8080';
  const blockedNames = /virtual|vmware|vbox|virtualbox|vethernet|wsl|loopback|bluetooth/i;
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, values]) => {
    return (values || [])
      .filter(item => item && item.family === 'IPv4' && !item.internal)
      .filter(item => !item.address.startsWith('169.254.') && item.address !== '127.0.0.1')
      .map(item => ({
        name,
        address: item.address,
        score: /wi-?fi|wlan|wireless/i.test(name) ? 3 : (/ethernet|lan/i.test(name) ? 2 : 1),
      }));
  }).filter(item => !blockedNames.test(item.name));
  const address = addresses.sort((first, second) => second.score - first.score)[0]?.address;
  return address ? `http://${address}:${port}/mobile-upload/${token}` : null;
}

class DocumentController {
  static async getStudentSummaries(req, res, next) {
    try {
      let cityId = null;
      let branchId = null;
      if (!req.authorization?.global) {
        branchId = req.authorization?.operationalCoverage?.operational_branch_id || req.authorization?.branchId || req.user.branch_id;
        if (!branchId) throw require('../middleware/errorHandler').createError(403,'Sucursal no disponible');
        const branch = await db.query('SELECT city_id FROM branches WHERE id = $1', [branchId]);
        if (!branch.rows.length) throw require('../middleware/errorHandler').createError(403,'Sucursal no disponible');
        cityId = branch.rows[0]?.city_id || null;
        if (cityId) branchId = null;
      }
      const summaries = await DocumentService.getStudentSummaries({ cityId, branchId });
      return res.json({ success: true, data: summaries });
    } catch (error) { next(error); }
  }

  static async getContent(req,res,next) {
    try {
      const scope = await require('./studentController').readScope(req);
      await DocumentService.assertStudentAccess(req.params.studentId,scope);
      res.set('Cache-Control','private, no-store');
      return res.json({success:true,data:await DocumentService.getContent(req.params.studentId,req.params.documentId)});
    } catch(error) { next(error); }
  }

  static async getByStudent(req, res, next) {
    try {
      const metadata = req.query.metadata === 'true';
      await DocumentService.assertStudentAccess(req.params.studentId,await require('./studentController').readScope(req));
      const documents = await DocumentService.getByStudent(req.params.studentId,metadata);

      return res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      const { type, name } = req.body;

      if (!type) {
        return res.status(422).json({
          success: false,
          error: 'Tipo de documento requerido',
        });
      }

      await DocumentService.assertStudentAccess(req.params.studentId,await require('./studentController').writeScope(req));
      const document = await DocumentService.create(req.params.studentId, req.body, req.user, req.requestContext);

      return res.status(201).json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  }

  static async appendBloodCard(req, res, next) {
    try {
      await DocumentService.assertStudentAccess(req.params.studentId,await require('./studentController').writeScope(req));
      const document = await DocumentService.appendBloodCardToRegistrationPdf(req.params.studentId, req.body);
      return res.json({ success: true, data: document });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req, res, next) {
    try {
      const studentId = await DocumentService.studentIdForDocument(req.params.id);
      await DocumentService.assertStudentAccess(studentId,await require('./studentController').writeScope(req));
      await DocumentService.delete(req.params.id, req.user, req.requestContext);
      return res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  static async createMobileUploadToken(req, res, next) {
    try {
      if (req.body.studentId) await DocumentService.assertStudentAccess(req.body.studentId,await require('./studentController').writeScope(req));
      const token = await DocumentService.createMobileUploadToken(req.user, req.body);
      token.localUploadUrl = getLocalFrontendUrl(token.token);
      return res.status(201).json({ success: true, data: token });
    } catch (error) {
      next(error);
    }
  }

  static async getMobileUploadToken(req, res, next) {
    try {
      const token = await DocumentService.getMobileUploadToken(req.params.token);
      return res.json({ success: true, data: token });
    } catch (error) {
      next(error);
    }
  }

  static async completeMobileUpload(req, res, next) {
    try {
      const document = await DocumentService.completeMobileUpload(req.params.token, req.body);
      return res.status(201).json({ success: true, data: document });
    } catch (error) {
      next(error);
    }
  }

  static async getMobileUploadResult(req, res, next) {
    try {
      const result = await DocumentService.getMobileUploadResult(req.params.token,req.user,Boolean(req.authorization?.global));
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DocumentController;
