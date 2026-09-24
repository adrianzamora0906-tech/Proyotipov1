const express = require('express');
const CourseCycleController = require('../controllers/courseCycleController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

const router = express.Router();

router.use(authMiddleware);

router.get('/enrollment-options', requirePermission('ENROLLMENT_VIEW'), CourseCycleController.enrollmentOptions);
router.get('/instructor-first-availability', requirePermission('ENROLLMENT_VIEW'), CourseCycleController.instructorFirstAvailability);
router.get('/theory-options', requirePermission('ENROLLMENT_VIEW'), CourseCycleController.theoryOptions);
router.post('/student/:studentId/theory', requirePermission('SCHEDULE_CHANGE'), CourseCycleController.changeStudentTheory);
router.post('/instructor-preview', requirePermission('ENROLLMENT_VIEW'), CourseCycleController.previewInstructor);
router.post('/reservations', requirePermission('SCHEDULE_ASSIGN'), CourseCycleController.reserveSchedule);
router.get('/student/:studentId/schedule-change-options', requirePermission('SCHEDULE_VIEW'), CourseCycleController.studentScheduleChangeOptions);
router.post('/schedule-changes', requirePermission('SCHEDULE_CHANGE'), CourseCycleController.changeStudentScheduleDay);
router.get('/', requirePermission('COURSE_VIEW'), CourseCycleController.list);
router.get('/dashboard', requirePermission('COURSE_VIEW'), CourseCycleController.dashboard);

module.exports = router;
