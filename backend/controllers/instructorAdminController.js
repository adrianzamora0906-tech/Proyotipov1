const InstructorAdminService = require('../services/InstructorAdminService');
const ExcelJS = require('exceljs');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

class InstructorAdminController {
  static async list(req, res, next) {
    try {
      const instructors = await InstructorAdminService.listInstructors(req.user, req.query);
      res.json({ success: true, data: instructors });
    } catch (error) {
      next(error);
    }
  }

  static async assign(req, res, next) {
    try {
      const { enrollmentId, instructorId } = req.body;
      if (!isUuid(enrollmentId) || !isUuid(instructorId)) {
        return res.status(422).json({ success: false, error: 'Matricula e instructor son requeridos' });
      }

      const result = await InstructorAdminService.assignInstructor(req.user, enrollmentId, instructorId);
      res.status(201).json({
        success: true,
        message: 'Instructor asignado y proxima clase creada',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateGroupAssignments(req, res, next) {
    try {
      const result = await InstructorAdminService.updateGroupAssignments(req.user, req.body?.changes);
      res.json({ success: true, message: 'Grupos actualizados correctamente', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async availabilityOverrides(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      const data = await InstructorAdminService.getAvailabilityOverrides(req.user, req.params.instructorId, req.query.startDate, req.query.endDate);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  static async saveAvailabilityOverrides(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      const data = await InstructorAdminService.saveAvailabilityOverrides(
        req.user,
        req.params.instructorId,
        req.body?.overrides,
        req.body?.startDate,
        req.body?.endDate,
        req.body?.scope,
        req.body?.slots,
      );
      res.json({ success: true, message: 'Disponibilidad actualizada correctamente', data });
    } catch (error) { next(error); }
  }

  static async reserveCalendarSeat(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      const data = await InstructorAdminService.reserveCalendarSeat(req.user, req.params.instructorId, req.body || {});
      res.status(201).json({ success: true, message: 'Cupo reservado correctamente', data });
    } catch (error) { next(error); }
  }

  static async calendar(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) {
        return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      }

      const calendar = await InstructorAdminService.getInstructorCalendar(req.user, req.params.instructorId, req.query.cycleId, req.query.modality || 'normal');
      res.json({ success: true, data: calendar });
    } catch (error) {
      next(error);
    }
  }

  static async monthlyAvailability(req, res, next) {
    try {
      const calendar = await InstructorAdminService.getMonthlyAvailability(req.user, req.query.month, req.query.modality, req.query.vehicleType);
      res.json({ success: true, data: calendar });
    } catch (error) { next(error); }
  }

  static async performance(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) {
        return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      }
      const report = await InstructorAdminService.getMonthlyPerformance(req.user, req.params.instructorId, req.query.month);
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  static async performanceReport(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      const report = await InstructorAdminService.getMonthlyPerformanceReport(req.user, req.params.instructorId, req.query.month);
      res.json({ success: true, data: report });
    } catch (error) { next(error); }
  }

  static async exportPerformanceReport(req, res, next) {
    try {
      if (!isUuid(req.params.instructorId)) return res.status(400).json({ success: false, error: 'ID de instructor invalido' });
      const report = await InstructorAdminService.getMonthlyPerformanceReport(req.user, req.params.instructorId, req.body.month);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Rendimiento mensual');
      sheet.mergeCells('A1:I1');
      sheet.getCell('A1').value = `REPORTE MENSUAL - ${report.instructor.name}`;
      sheet.getCell('A1').font = { bold: true, size: 16 };
      sheet.getCell('A2').value = 'Sucursal'; sheet.getCell('B2').value = report.instructor.branch;
      sheet.getCell('D2').value = 'Mes'; sheet.getCell('E2').value = report.month;
      sheet.addRow([]);
      sheet.addRow(['Día', 'Fecha', 'Curso', 'Periodo del curso', 'Estudiante', 'Inicio', 'Fin', 'Tipo', 'Horas impartidas']);
      const header = sheet.getRow(4);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5145E5' } };
      for (const [groupIndex, cycle] of report.courseGroups.entries()) {
        const firstRow = sheet.rowCount + 1;
        for (const session of cycle.sessions) {
          const start = new Date(session.actual_start); const end = new Date(session.actual_end);
          sheet.addRow([
            start.toLocaleDateString('es-EC', { weekday: 'long' }), start.toLocaleDateString('es-EC'),
            cycle.courseName, `${cycle.startDate ? new Date(cycle.startDate).toLocaleDateString('es-EC') : ''} al ${cycle.endDate ? new Date(cycle.endDate).toLocaleDateString('es-EC') : ''}`, session.student_name,
            start.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
            end.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }), cycle.courseType, session.taught_hours,
          ]);
        }
        const color = groupIndex % 2 ? 'FFF2F8FD' : 'FFFAF9FF';
        for (let rowNumber = firstRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
          sheet.getRow(rowNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        }
      }
      sheet.addRow([]);
      sheet.addRow(['TOTALES', '', '', '', `${report.reportTotals.attendedStudents} estudiantes`, '', '', '', report.reportTotals.taughtHours]);
      sheet.columns = [{ width: 14 }, { width: 14 }, { width: 24 }, { width: 24 }, { width: 45 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 18 }];
      sheet.views = [{ state: 'frozen', ySplit: 4 }];
      const buffer = await workbook.xlsx.writeBuffer();
      const safeName = report.instructor.name.replace(/[^a-z0-9]+/gi, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="reporte_${safeName}_${report.month}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (error) { next(error); }
  }
}

module.exports = InstructorAdminController;
