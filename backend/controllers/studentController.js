const StudentService = require('../services/StudentService');
const PaymentService = require('../services/PaymentService');
const db = require('../config/database');
const AdditionalPracticeService = require('../services/AdditionalPracticeService');
const StudentAccountService = require('../services/StudentAccountService');
const LicenseRenewalService = require('../services/LicenseRenewalService');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function getStudentScope(req, useDefaultBranch = true) {
  if (req.authorization?.global) {
    return req.query.branch_id ? { branch_id: req.query.branch_id } : {};
  }
  const location = await db.query('SELECT city_id FROM branches WHERE id = $1', [req.user.branch_id]);
  const cityId = location.rows[0]?.city_id || null;
  if (req.query.scope === 'created') {
    return { created_only: true, created_by: req.user.id };
  }
  if (req.query.scope === 'all') {
    return { city_id: cityId };
  }
  if (req.query.branch_id) {
    const allowed = await db.query('SELECT id FROM branches WHERE id = $1 AND city_id = $2', [req.query.branch_id, cityId]);
    if (allowed.rows.length) return { branch_id: req.query.branch_id };
  }
  if (useDefaultBranch) return { branch_id: req.user.branch_id };
  return {
    city_id: cityId,
    created_by: req.user.id,
    updated_by: req.user.id,
  };
}

class StudentController {
  static async createLicenseRenewal(req,res,next) {
    try { return res.status(201).json({success:true,data:await LicenseRenewalService.create(req.body,req.user)}); }
    catch(error) { next(error); }
  }
  static async resolveAdditionalPracticeStudent(req, res, next) {
    try {
      const student = await AdditionalPracticeService.resolveByIdentification(req.query.identification);
      return res.json({ success: true, data: student });
    } catch (error) { next(error); }
  }

  static async createAdditionalPractice(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante inválido' });
      const practice = await AdditionalPracticeService.create(req.params.id, req.body, req.user);
      return res.status(201).json({ success: true, data: practice });
    } catch (error) { next(error); }
  }

  static async checkAdditionalPracticeAvailability(req, res, next) {
    try {
      const data = await AdditionalPracticeService.checkAvailability(req.query, req.query.branch_id || req.user.branch_id);
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  }
  static async getAll(req, res, next) {
    try {
      const { status, search, province, city, instructor_id, date_from, date_to, created_date, registration_type, course_type } = req.query;
      const students = await StudentService.getAll({ status, search, province, city, instructor_id, date_from, date_to, created_date, registration_type, course_type, ...await getStudentScope(req) });
      return res.json({ success: true, data: students });
    } catch (error) { next(error); }
  }

  static async getReservations(req, res, next) {
    try {
      if (req.query.status && req.query.status !== 'reservado') {
        return res.json({ success: true, data: [] });
      }
      const reservations = await StudentService.getActiveSeatReservations({
        search: req.query.search,
        province: req.query.province,
        city: req.query.city,
        course_type: req.query.course_type,
        ...await getStudentScope(req),
      });
      return res.json({ success: true, data: reservations });
    } catch (error) { next(error); }
  }

  static async createTemporaryReservation(req, res, next) {
    try {
      const reservation = await StudentService.createTemporarySeatReservation(req.body, req.user, {
        global: Boolean(req.authorization?.global),
      });
      return res.status(201).json({ success: true, data: reservation });
    } catch (error) { next(error); }
  }

  static async cancelReservation(req, res, next) {
    try {
      if (!isUuid(req.params.reservationId)) {
        return res.status(400).json({ success: false, error: 'Reserva invalida' });
      }
      const reservation = await StudentService.cancelSeatReservation(
        req.params.reservationId,
        req.user,
        { global: Boolean(req.authorization?.global) },
      );
      return res.json({ success: true, data: reservation });
    } catch (error) { next(error); }
  }

  static async getById(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante invÃ¡lido' });
      const student = await StudentService.getById(req.params.id, await getStudentScope(req, false));
      return res.json({ success: true, data: student });
    } catch (error) { next(error); }
  }

  static async resetAccess(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante inválido' });
      // La consulta también valida que el usuario tenga alcance sobre este expediente.
      await StudentService.getById(req.params.id, await getStudentScope(req, false));
      const credentials = await StudentAccountService.resetTemporaryPassword(
        req.params.id,
        req.user,
        req.requestContext
      );
      return res.json({ success: true, data: credentials });
    } catch (error) { next(error); }
  }

  static async search(req, res, next) {
    try {
      const { query } = req.query;
      if (!query) return res.status(422).json({ success: false, error: 'Parámetro de búsqueda requerido' });
      const students = await StudentService.search(query, await getStudentScope(req));
      return res.json({ success: true, data: students });
    } catch (error) { next(error); }
  }

  static async create(req, res, next) {
    try {
      const { identification, firstName, lastName } = req.body;
      if (!identification || !firstName || !lastName) {
        return res.status(422).json({ success: false, error: 'Campos requeridos: identification, firstName, lastName' });
      }
      const studentData = { ...req.body };
      const student = await StudentService.create(studentData, req.user.id, {
        allowDiscount: req.authorization?.permissions?.includes('PAYMENT_CREATE') || false,
      });
      return res.status(201).json({ success: true, data: student });
    } catch (error) { next(error); }
  }

  static async update(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante invÃ¡lido' });
      const student = await StudentService.update(req.params.id, req.body, req.user.id);
      return res.json({ success: true, data: student });
    } catch (error) { next(error); }
  }

  static async updateStatus(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante invÃ¡lido' });
      const { status } = req.body;
      if (!status) return res.status(422).json({ success: false, error: 'Estado requerido' });
      const student = await StudentService.updateStatus(req.params.id, status, req.user.id);
      return res.json({ success: true, data: student });
    } catch (error) { next(error); }
  }

  static async getHistory(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, error: 'ID de estudiante invÃ¡lido' });
      const history = await StudentService.getHistory(req.params.id);
      return res.json({ success: true, data: history });
    } catch (error) { next(error); }
  }

  static async getBranches(req, res, next) {
    try {
      const branches = await StudentService.getBranches();
      return res.json({ success: true, data: branches });
    } catch (error) { next(error); }
  }

  static async getInstructors(req, res, next) {
    try {
      const requestedBranchId = req.query.branch_id || req.user.branch_id;
      if (!isUuid(requestedBranchId)) return res.status(400).json({ success: false, error: 'Sucursal invÃƒÂ¡lida' });
      const instructors = await StudentService.getInstructors(requestedBranchId);
      return res.json({ success: true, data: instructors });
    } catch (error) { next(error); }
  }

  static async searchReferralStaff(req, res, next) {
    try {
      const query = String(req.query.query || '').trim();
      if (query.length < 2) return res.json({ success: true, data: [] });
      const staff = await StudentService.searchReferralStaff(query);
      return res.json({ success: true, data: staff });
    } catch (error) { next(error); }
  }

  static async getCities(req, res, next) {
    try {
      const cities = await StudentService.getCities();
      return res.json({ success: true, data: cities });
    } catch (error) { next(error); }
  }
  static async getBranchCourses(req, res, next) {
    try { return res.json({ success:true,data:await StudentService.getActiveBranchCourses(req.params.branchId) }); }
    catch (error) { next(error); }
  }
}

module.exports = StudentController;
