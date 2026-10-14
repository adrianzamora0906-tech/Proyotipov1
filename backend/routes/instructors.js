const express = require('express');
const router = express.Router();
const InstructorAdminController = require('../controllers/instructorAdminController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }),
  InstructorAdminController.list
);

router.get('/availability/monthly', requirePermission('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }), InstructorAdminController.monthlyAvailability);

router.put('/groups', requirePermission('INSTRUCTOR_ASSIGN'), InstructorAdminController.updateGroupAssignments);

router.get('/:instructorId/availability-overrides', requirePermission('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }), InstructorAdminController.availabilityOverrides);
router.put('/:instructorId/availability-overrides', requirePermission('INSTRUCTOR_ASSIGN'), InstructorAdminController.saveAvailabilityOverrides);
router.post('/:instructorId/calendar-reservations', requirePermission('INSTRUCTOR_ASSIGN'), InstructorAdminController.reserveCalendarSeat);

router.get(
  '/:instructorId/calendar',
  requirePermission('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }),
  InstructorAdminController.calendar
);

router.get(
  '/:instructorId/performance',
  requirePermission('INSTRUCTOR_PERFORMANCE_VIEW'),
  InstructorAdminController.performance
);

router.get(
  '/:instructorId/performance-report',
  requirePermission('INSTRUCTOR_PERFORMANCE_REPORT'),
  InstructorAdminController.performanceReport
);

router.post(
  '/:instructorId/performance-report/export',
  requirePermission('INSTRUCTOR_PERFORMANCE_REPORT'),
  InstructorAdminController.exportPerformanceReport
);

router.post(
  '/assignments',
  requirePermission('INSTRUCTOR_ASSIGN'),
  InstructorAdminController.assign
);

module.exports = router;
