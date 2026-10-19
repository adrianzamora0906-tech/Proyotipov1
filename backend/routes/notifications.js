const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);
const Feedback=require('../services/InstructorChangeFeedbackService');
const requirePermission=require('../middleware/requirePermission');
router.get('/instructor-feedback/pending',async(req,res,next)=>{try{res.json({success:true,data:await Feedback.pending(req.user)});}catch(e){next(e);}});
router.post('/instructor-feedback/:id/respond',async(req,res,next)=>{try{res.json({success:true,data:await Feedback.respond(req.params.id,req.body.comment,req.user)});}catch(e){next(e);}});
router.get('/instructor-feedback/student/:studentId',requirePermission('STUDENT_VIEW'),async(req,res,next)=>{try{res.json({success:true,data:await Feedback.list(req.params.studentId,req.user,req.authorization)});}catch(e){next(e);}});
router.post('/instructor-feedback/:id/review',requirePermission('STUDENT_UPDATE'),async(req,res,next)=>{try{res.json({success:true,data:await Feedback.review(req.params.id,req.user,req.authorization)});}catch(e){next(e);}});

// GET /api/notifications - Todas las notificaciones
router.get('/', NotificationController.getAll);

// GET /api/notifications/unread - No leídas
router.get('/unread', NotificationController.getUnread);

// GET /api/notifications/schedule-changes/unread - Cambios dirigidos al instructor
router.get('/schedule-changes/unread', NotificationController.getUnreadScheduleChanges);

// PUT /api/notifications/:id/read - Marcar como leída
router.put('/:id/read', NotificationController.markAsRead);

module.exports = router;
