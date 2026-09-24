const CourseCycleService = require('../services/CourseCycleService');
const TheoryCourseService = require('../services/TheoryCourseService');

class CourseCycleController {
  static async theoryOptions(req, res, next) {
    try { res.json({ success: true, data: await TheoryCourseService.options(req.user, req.query) }); }
    catch (error) { next(error); }
  }
  static async changeStudentTheory(req,res,next){
    try{res.json({success:true,data:await TheoryCourseService.changeStudentTheory(req.user,req.params.studentId,req.body)});}
    catch(error){next(error);}
  }
  static async list(req, res, next) {
    try {
      const cycles = await CourseCycleService.listCycles(req.user, req.query);
      res.json({ success: true, data: cycles });
    } catch (error) {
      next(error);
    }
  }

  static async dashboard(req, res, next) {
    try {
      const dashboard = await CourseCycleService.getDashboard(req.user, req.query);
      res.json({ success: true, data: dashboard });
    } catch (error) {
      next(error);
    }
  }

  static async enrollmentOptions(req, res, next) {
    try {
      const options = await CourseCycleService.getEnrollmentOptions(req.user, req.query);
      res.json({ success: true, data: options });
    } catch (error) {
      next(error);
    }
  }

  static async instructorFirstAvailability(req, res, next) {
    try {
      const availability = await CourseCycleService.getInstructorFirstAvailability(req.user, req.query);
      res.json({ success: true, data: availability });
    } catch (error) { next(error); }
  }

  static async reserveSchedule(req, res, next) {
    try {
      const assignments = await CourseCycleService.reserveSchedule(req.user, req.body);
      res.status(201).json({ success: true, data: assignments });
    } catch (error) {
      next(error);
    }
  }

  static async previewInstructor(req, res, next) {
    try {
      const preview = await CourseCycleService.previewInstructor(req.user, req.body);
      res.json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  }

  static async studentScheduleChangeOptions(req, res, next) {
    try {
      const cycle = await CourseCycleService.getStudentScheduleChangeOptions(req.user, req.params.studentId);
      res.json({ success: true, data: cycle });
    } catch (error) {
      next(error);
    }
  }

  static async changeStudentScheduleDay(req, res, next) {
    try {
      const assignment = await CourseCycleService.changeStudentScheduleDay(req.user, req.body);
      res.json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CourseCycleController;
