const AttendanceQrService = require('../services/AttendanceQrService');
const AttendanceAudit = require('../services/AttendanceAuditService');

class AttendanceController {
  static async getChallenge(req, res, next) {
    try {
      const data = await AttendanceQrService.getPublic(req.params.token);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async confirm(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'confirm', () => AttendanceQrService.confirm(req.params.token, req.body.lastFour, req.user.id, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
      }));
      res.json({
        success: true,
        message: data.exited ? 'Salida registrada correctamente' : 'Entrada registrada. La clase ha iniciado',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async confirmCode(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'confirm', () => AttendanceQrService.confirmByCode(req.params.code, req.body.lastFour, req.user.id, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
      }));
      res.json({
        success: true,
        message: data.exited ? 'Salida registrada correctamente' : 'Entrada registrada. La clase ha iniciado',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async claim(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'scan', () => AttendanceQrService.claim(req.params.token, req.user.id));
      res.json({ success: true, message: 'QR validado para este estudiante', data });
    } catch (error) {
      next(error);
    }
  }

  static async claimCode(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'scan', () => AttendanceQrService.claimByCode(req.params.code, req.user.id));
      res.json({ success: true, message: 'Codigo validado para este estudiante', data });
    } catch (error) {
      next(error);
    }
  }

  static async validateLocation(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'location', () => AttendanceQrService.validateLocation(req.params.token, req.user.id, {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
      }));
      res.json({ success: true, message: 'UbicaciÃ³n autorizada', data });
    } catch (error) {
      next(error);
    }
  }

  static async validateLocationCode(req, res, next) {
    try {
      const data = await AttendanceAudit.run(req, 'location', () => AttendanceQrService.validateLocationByCode(req.params.code, req.user.id, {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
      }));
      res.json({ success: true, message: 'Ubicacion autorizada', data });
    } catch (error) {
      next(error);
    }
  }

  static async syncOffline(req, res, next) {
    try {
      const data = await AttendanceQrService.syncOfflineEvidence(req.user.id, req.body);
      res.json({
        success: true,
        message: data.status === 'SINCRONIZADO'
          ? 'Asistencia offline sincronizada'
          : 'Evidencia offline enviada a revision',
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AttendanceController;
