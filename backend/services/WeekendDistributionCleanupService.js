const Audit=require('./AuditService');

class WeekendDistributionCleanupService {
  static async reconcile(client,{programId,branchId,courseId,vehicleType,actor,requestContext=null}) {
    const candidates=(await client.query(`SELECT rotation.id,rotation.cycle_id,rotation.start_date,rotation.position_order
      FROM intensive_instructor_rotation_assignments rotation
      JOIN course_cycles cycle ON cycle.id=rotation.cycle_id
      JOIN branch_course_weekend_overrides distribution ON distribution.program_id=$1 AND distribution.start_date=rotation.start_date
      WHERE rotation.branch_id=$2 AND rotation.vehicle_type=$3 AND rotation.active=TRUE
        AND cycle.course_id=$4 AND cycle.modality='intensivo' AND cycle.active=TRUE AND cycle.deleted_at IS NULL
        AND cycle.start_date>=CURRENT_DATE
        AND rotation.position_order>CASE WHEN distribution.active THEN distribution.instructor_count ELSE 1 END
      ORDER BY rotation.start_date,rotation.position_order FOR UPDATE OF rotation,cycle`,[programId,branchId,vehicleType,courseId])).rows;
    const retired=[],protectedCycles=[];
    for(const row of candidates){
      const occupied=await client.query(`SELECT 1 FROM course_cycle_schedule_assignments WHERE cycle_id=$1 AND status='activo'
        UNION ALL SELECT 1 FROM course_cycle_seat_reservations WHERE cycle_id=$1 AND status='activo' AND (expires_at IS NULL OR expires_at>NOW())
        UNION ALL SELECT 1 FROM referred_instructor_schedule_blocks WHERE cycle_id=$1 AND status='activo' LIMIT 1`,[row.cycle_id]);
      if(occupied.rows.length){protectedCycles.push(row.cycle_id);continue;}
      await client.query('UPDATE course_cycles SET active=FALSE,updated_at=NOW() WHERE id=$1',[row.cycle_id]);
      await client.query('UPDATE intensive_instructor_rotation_assignments SET active=FALSE,cycle_id=NULL,updated_at=NOW() WHERE id=$1',[row.id]);
      await Audit.log({userId:actor?.id,role:actor?.role || 'SYSTEM',branchId,
        action:'WEEKEND_DISTRIBUTION_CYCLE_RETIRED',module:'CURSOS',entityType:'COURSE_CYCLE',entityId:row.cycle_id,
        description:'Curso adicional vacio deshabilitado al retirar o reducir la distribucion de fin de semana',
        oldValues:{active:true,position:row.position_order},newValues:{active:false},requestContext},client);
      retired.push(row.cycle_id);
    }
    return {retired,protectedCycles};
  }
}
module.exports=WeekendDistributionCleanupService;
