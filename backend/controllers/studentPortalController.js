const StudentPortalService=require('../services/StudentPortalService');
class StudentPortalController{
  static async summary(req,res,next){try{return res.json({success:true,data:await StudentPortalService.summary(req.user.id,req.query.enrollmentId || null)});}catch(error){next(error);}}
}
module.exports=StudentPortalController;
