const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const PaymentService = require('./PaymentService');
const AuditService = require('./AuditService');
const ExcelJS = require('exceljs');

class CashOperationsService {
  static branch(actor, authorization) {
    return authorization?.branchId || actor.branch_id;
  }

  static async isCentralTransferVerifier(userId, client = db) {
    const result = await client.query(`SELECT 1 FROM settings
      WHERE scope_type='GLOBAL' AND branch_id IS NULL
        AND key='payments.central_transfer_verifier_user_id'
        AND value #>> '{}' = $1 LIMIT 1`, [userId]);
    return Boolean(result.rows.length);
  }

  static async transferBranch(actor, authorization, client = db) {
    return authorization?.permissions?.includes('TRANSFER_APPROVE') || await this.isCentralTransferVerifier(actor.id, client)
      ? null
      : this.branch(actor, authorization);
  }

  static async workspace(actor, authorization) {
    const centralVerifier = await this.isCentralTransferVerifier(actor.id);
    const branchId = centralVerifier ? null : this.branch(actor, authorization);
    if (!branchId && !authorization?.global && !centralVerifier) throw createError(422, 'Sucursal requerida');
    const params = [authorization?.global ? null : branchId];
    const transferParams = authorization?.permissions?.includes('TRANSFER_APPROVE') ? [null] : params;
    const [transfers, directTransfers, corrections, alerts] = await Promise.all([
      db.query(`SELECT tv.*,TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,s.identification,
        TRIM(CONCAT(u.first_name,' ',u.last_name)) created_by_name
        FROM transfer_payment_verifications tv JOIN students s ON s.status <> 'inhabilitado' AND s.id=tv.student_id
        JOIN users u ON u.id=tv.created_by WHERE ($1::uuid IS NULL OR tv.branch_id=$1)
        ORDER BY tv.created_at DESC LIMIT 100`, transferParams),
      db.query(`SELECT pd.id,pd.id payment_detail_id,e.branch_id,s.id student_id,
        pd.amount,'Transferencia aplicada' bank,pd.reference,pd.created_at,pd.created_at reviewed_at,
        'CONFIRMED' status,TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,
        s.identification,TRIM(CONCAT(u.first_name,' ',u.last_name)) created_by_name,
        TRUE direct_payment
        FROM payment_details pd JOIN payments p ON p.id=pd.payment_id
        JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        LEFT JOIN users u ON u.id=pd.received_by
        WHERE LOWER(pd.payment_method)='transferencia' AND pd.status='ACTIVE'
          AND ($1::uuid IS NULL OR e.branch_id=$1)
          AND NOT EXISTS (SELECT 1 FROM transfer_payment_verifications tv
            WHERE tv.status='CONFIRMED' AND tv.student_id=s.id
              AND LOWER(tv.reference)=LOWER(COALESCE(pd.reference,'')))
        ORDER BY pd.created_at DESC LIMIT 100`, transferParams),
      db.query(`SELECT cr.*,TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,
        s.identification FROM payment_correction_requests cr
        JOIN payment_details pd ON pd.id=cr.payment_detail_id JOIN payments p ON p.id=pd.payment_id
        JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        WHERE ($1::uuid IS NULL OR cr.branch_id=$1) ORDER BY cr.created_at DESC LIMIT 100`, params),
      db.query(`WITH debt AS (
        SELECT DISTINCT ON (p.id) s.id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,
          p.balance,p.final_amount,cc.start_date,cc.end_date
        FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='activo'
        JOIN payments p ON p.enrollment_id=e.id AND p.status<>'anulado'
        LEFT JOIN course_cycle_schedule_assignments a ON a.enrollment_id=e.id AND a.status='activo'
        LEFT JOIN course_cycles cc ON cc.id=a.cycle_id
        WHERE p.balance>0 AND ($1::uuid IS NULL OR e.branch_id=$1)
        ORDER BY p.id,a.schedule_date NULLS LAST
      ) SELECT *,CASE
        WHEN start_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND (final_amount-balance)<final_amount*0.5 THEN 'STARTING_WITHOUT_HALF'
        WHEN start_date<=CURRENT_DATE AND (end_date IS NULL OR end_date>=CURRENT_DATE) THEN 'IN_CLASS_WITH_DEBT'
        ELSE 'PENDING_BALANCE' END alert_type
        FROM debt ORDER BY CASE WHEN start_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 THEN 0 ELSE 1 END,start_date NULLS LAST LIMIT 100`, params),
    ]);
    const allTransfers=[...transfers.rows,...directTransfers.rows]
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,100);
    return { transfers: allTransfers, corrections: corrections.rows, alerts: alerts.rows };
  }

  static async createTransfer(data, actor, authorization, requestContext, client = db) {
    let branchId = authorization?.operationalCoverage?.operational_branch_id || this.branch(actor, authorization);
    let service = null;
    if (data.serviceTransactionId) {
      service = (await client.query(`SELECT st.amount,st.student_id,st.branch_id FROM service_transactions st
        JOIN students s ON s.id=st.student_id AND s.status<>'inhabilitado'
        JOIN branches b ON b.id=st.branch_id LEFT JOIN cities bc ON bc.id=b.city_id
        LEFT JOIN branches collector ON collector.id=$4::uuid LEFT JOIN cities cc ON cc.id=collector.city_id
        LEFT JOIN users registrar ON registrar.id=st.created_by
        WHERE st.id=$1 AND st.customer_identification=$2 AND st.status='PENDING'
          AND ($3::boolean=TRUE OR st.branch_id=$4 OR registrar.branch_id=$4 OR (
            NULLIF(LOWER(TRIM(COALESCE(NULLIF(b.province,''),bc.province,''))), '') IS NOT NULL
            AND LOWER(TRIM(COALESCE(NULLIF(b.province,''),bc.province,'')))
              =LOWER(TRIM(COALESCE(NULLIF(collector.province,''),cc.province,'')))
          ))`, [data.serviceTransactionId,data.cedula,Boolean(authorization?.global),branchId])).rows[0];
      if (!service) throw createError(404, 'Servicio pendiente no encontrado o fuera del alcance de cobro');
      data.studentId = service.student_id;
      branchId = service.branch_id;
    } else if (!data.studentId && data.cedula) {
      const student = (await client.query(`SELECT s.id FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='activo'
          WHERE s.identification=$1 AND ($2::boolean=TRUE OR e.branch_id=$3) ORDER BY e.created_at DESC LIMIT 1`,[data.cedula,Boolean(authorization?.global),branchId])).rows[0];
      data.studentId=student?.id;
    }
    if (!data.studentId || !data.amount || !data.reference || !data.transferDate) throw createError(422, 'Complete estudiante, monto, número de transferencia y fecha');
    if (data.serviceTransactionId) {
      if(!service||Number(data.amount)!==Number(service.amount)) throw createError(422,'El valor no coincide con el servicio pendiente');
      const pending=(await client.query("SELECT COALESCE(SUM(amount),0)::numeric total FROM transfer_payment_verifications WHERE service_transaction_id=$1 AND status IN ('PENDING','AWAITING_APPROVAL')",[data.serviceTransactionId])).rows[0];
      if(Number(pending.total)>0) throw createError(409,'Este servicio ya tiene una transferencia por confirmar');
    } else {
      const payment=(await client.query(`SELECT p.balance FROM payments p JOIN enrollments e ON e.id=p.enrollment_id
        WHERE e.student_id=$1 AND e.status='activo' AND p.status<>'anulado' ORDER BY p.created_at DESC LIMIT 1`,[data.studentId])).rows[0];
      const pending=(await client.query("SELECT COALESCE(SUM(amount),0)::numeric total FROM transfer_payment_verifications WHERE student_id=$1 AND service_transaction_id IS NULL AND status IN ('PENDING','AWAITING_APPROVAL')",[data.studentId])).rows[0];
      if(!payment||Number(data.amount)+Number(pending.total)>Number(payment.balance)) throw createError(422,'El monto supera el saldo disponible después de las transferencias por confirmar');
    }
    try {
      const result = await client.query(`INSERT INTO transfer_payment_verifications
        (branch_id,student_id,service_transaction_id,amount,bank,reference,transfer_date,proof_url,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [branchId,data.studentId,data.serviceTransactionId||null,Number(data.amount),String(data.bank||'No especificado').trim(),String(data.reference).trim(),data.transferDate,data.proofUrl||null,actor.id]);
      await AuditService.log({userId:actor.id,branchId,role:actor.role,action:'TRANSFER_VERIFICATION_CREATED',module:'FINANCIERO',entityType:'TRANSFER_PAYMENT_VERIFICATION',entityId:result.rows[0].id,description:'Transferencia registrada para verificación',newValues:{amount:Number(data.amount),bank:data.bank,reference:data.reference},requestContext},client);
      return result.rows[0];
    } catch (error) {
      if (error.code==='23505') throw createError(409,'La referencia de transferencia ya fue registrada');
      throw error;
    }
  }

  static async exportTransfers(dateValue, actor, authorization) {
    const branchId=await this.transferBranch(actor,authorization);const reportDate=dateValue||new Date().toISOString().slice(0,10);
    const result=await db.query(`WITH report_transfers AS (
      SELECT tv.transfer_date,tv.reference,tv.bank,tv.amount,tv.status,tv.created_at,
        TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,s.identification,
        TRIM(CONCAT(u.first_name,' ',u.last_name)) registered_by
      FROM transfer_payment_verifications tv
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=tv.student_id
      JOIN users u ON u.id=tv.created_by
      WHERE ($1::uuid IS NULL OR tv.branch_id=$1) AND tv.created_at::date=$2::date
      UNION ALL
      SELECT pd.created_at::date,pd.reference,'Transferencia aplicada',pd.amount,'CONFIRMED',pd.created_at,
        TRIM(CONCAT(s.first_name,' ',s.last_name)),s.identification,
        TRIM(CONCAT(u.first_name,' ',u.last_name))
      FROM payment_details pd
      JOIN payments p ON p.id=pd.payment_id
      JOIN enrollments e ON e.id=p.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
      LEFT JOIN users u ON u.id=pd.received_by
      WHERE LOWER(pd.payment_method)='transferencia' AND pd.status='ACTIVE'
        AND ($1::uuid IS NULL OR e.branch_id=$1) AND pd.created_at::date=$2::date
        AND NOT EXISTS (SELECT 1 FROM transfer_payment_verifications tv
          WHERE tv.student_id=s.id AND LOWER(tv.reference)=LOWER(COALESCE(pd.reference,'')))
    ) SELECT transfer_date,reference,bank,amount,status,student_name,identification,registered_by
      FROM report_transfers ORDER BY created_at`,[branchId,reportDate]);
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Transferencias');
    sheet.mergeCells('A1:H1');sheet.getCell('A1').value='SPORTMANCAR - TRANSFERENCIAS POR CONFIRMAR';sheet.getCell('A1').font={bold:true,size:15,color:{argb:'FFFFFFFF'}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF312E81'}};sheet.getCell('A1').alignment={horizontal:'center'};
    sheet.mergeCells('A2:H2');sheet.getCell('A2').value=`Fecha del reporte: ${reportDate}`;sheet.getCell('A2').alignment={horizontal:'center'};
    sheet.columns=[{key:'date',width:15},{key:'student',width:34},{key:'id',width:16},{key:'bank',width:20},{key:'reference',width:24},{key:'amount',width:14},{key:'status',width:16},{key:'registered',width:25}];
    const header=sheet.getRow(4);header.values=['Fecha','Estudiante','Cédula','Banco','N.º transferencia','Valor','Estado','Registrado por'];header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF4F46E5'}};
    result.rows.forEach(row=>sheet.addRow({date:String(row.transfer_date).slice(0,10),student:row.student_name,id:row.identification,bank:row.bank,reference:row.reference,amount:Number(row.amount),status:({PENDING:'POR CONFIRMAR',AWAITING_APPROVAL:'POR APROBAR',CONFIRMED:'APLICADA',REJECTED:'RECHAZADA'})[row.status],registered:row.registered_by}));
    sheet.getColumn('amount').numFmt='$0.00';sheet.autoFilter={from:'A4',to:'H4'};sheet.views=[{state:'frozen',ySplit:4}];
    return {buffer:await workbook.xlsx.writeBuffer(),filename:`transferencias-${reportDate}.xlsx`};
  }

  static async reviewTransfer(id, decision, note, actor, authorization, requestContext) {
    const approval = authorization?.transferApproval === true;
    const permission = approval ? 'TRANSFER_APPROVE' : 'TRANSFER_VERIFY';
    if (!authorization?.permissions?.includes(permission)) throw createError(403, 'No tienes permiso para esta accion');
    const acceptedDecision = approval ? 'APPROVED' : 'CONFIRMED';
    if (![acceptedDecision, 'REJECTED'].includes(decision)) throw createError(422, 'Decision de transferencia invalida');
    const expectedStatus = approval ? 'AWAITING_APPROVAL' : 'PENDING';
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const branchId = await this.transferBranch(actor, authorization, client);
      const stageCondition = approval
        ? "(tv.status=$3 OR (tv.status='CONFIRMED' AND tv.approved_at IS NULL))"
        : 'tv.status=$3';
      const row=(await client.query(`SELECT tv.*,s.identification FROM transfer_payment_verifications tv
        JOIN students s ON s.status <> 'inhabilitado' AND s.id=tv.student_id WHERE tv.id=$1
          AND ($2::uuid IS NULL OR tv.branch_id=$2) AND ${stageCondition} FOR UPDATE OF tv`,[id,branchId,expectedStatus])).rows[0];
      if(!row) throw createError(404,'Transferencia pendiente no encontrada');
      if (approval && String(row.reviewed_by) === String(actor.id)) throw createError(403, 'La aprobacion requiere una persona distinta de quien confirmo');
      const confirmed = decision === acceptedDecision;
      const alreadyApplied = row.status === 'CONFIRMED';
      if (alreadyApplied && !confirmed) throw createError(409, 'Este pago ya fue aplicado. Para rechazarlo debes solicitar su anulacion');
      const status = confirmed ? (approval ? 'CONFIRMED' : 'AWAITING_APPROVAL') : 'REJECTED';
      let paymentResult=null;
      if(confirmed && approval && !alreadyApplied) paymentResult=await PaymentService.registerPayment({cedula:row.identification,serviceTransactionId:row.service_transaction_id,amount:Number(row.amount),method:'transferencia',reference:row.reference,cashierUserId:actor.id,cashierRole:actor.role,collectionBranchId:row.branch_id,globalAccess:branchId===null||Boolean(authorization?.global),requestContext},client);
      const reviewColumns = approval ? 'approved_by=$3,approval_note=$4,approved_at=NOW()' : 'reviewed_by=$3,review_note=$4,reviewed_at=NOW()';
      const updated=(await client.query(`UPDATE transfer_payment_verifications SET status=$2,${reviewColumns} WHERE id=$1 AND status=$5 AND approved_at IS NULL RETURNING *`,[id,status,actor.id,note||null,row.status || expectedStatus])).rows[0];
      if(!updated) throw createError(409,'La transferencia ya fue procesada');
      await AuditService.log({userId:actor.id,branchId:row.branch_id,role:actor.role,action:confirmed?(approval?'TRANSFER_APPROVED':'TRANSFER_CONFIRMED'):'TRANSFER_REJECTED',module:'FINANCIERO',entityType:'TRANSFER_PAYMENT_VERIFICATION',entityId:id,description:confirmed?(approval?'Transferencia aprobada y aplicada al saldo':'Transferencia confirmada pendiente de aprobacion'):'Transferencia rechazada',newValues:{status,note:note||null},metadata:{stage:approval?'approval':'confirmation'},requestContext},client);
      await client.query('COMMIT');
      return {transfer:updated,payment:paymentResult};
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  static async correctPayment(detailId, data, actor, authorization, requestContext) {
    const branchId=this.branch(actor,authorization);
    if(!data.reason||String(data.reason).trim().length<5) throw createError(422,'El motivo debe tener al menos 5 caracteres');
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      const detail=(await client.query(`SELECT pd.*,e.branch_id FROM payment_details pd JOIN payments p ON p.id=pd.payment_id
        JOIN enrollments e ON e.id=p.enrollment_id WHERE pd.id=$1 AND e.branch_id=$2 AND pd.status='ACTIVE' FOR UPDATE`,[detailId,branchId])).rows[0];
      if(!detail) throw createError(404,'Pago activo no encontrado en esta sucursal');
      const method=String(data.method||detail.payment_method).trim().toLowerCase();
      const configured=(await client.query(`SELECT bpm.requires_reference FROM branch_payment_methods bpm JOIN payment_methods pm ON pm.id=bpm.payment_method_id WHERE bpm.branch_id=$1 AND pm.code=$2 AND bpm.active=TRUE AND pm.active=TRUE`,[branchId,method])).rows[0];
      if(!configured) throw createError(422,'Método no habilitado para esta sucursal');
      const reference=String(data.reference||'').trim()||null;
      if(configured.requires_reference&&!reference) throw createError(422,'La referencia es obligatoria para este método');
      const cardBatch=method==='tarjeta'?String(data.cardBatch||detail.card_batch||'').trim()||null:null;
      if(method==='tarjeta'&&!cardBatch) throw createError(422,'El lote de tarjeta es obligatorio para pagos con tarjeta');
      const oldValues={paymentMethod:detail.payment_method,reference:detail.reference||null,cardBatch:detail.card_batch||null,observations:detail.observations||null};
      const newValues={paymentMethod:method,reference,cardBatch,observations:String(data.observations||'').trim()||null};
      await client.query('UPDATE payment_details SET payment_method=$2,reference=$3,card_batch=$4,observations=$5 WHERE id=$1',[detailId,method,reference,cardBatch,newValues.observations]);
      const correction=(await client.query(`INSERT INTO payment_correction_requests(payment_detail_id,branch_id,requested_by,reason,old_values,new_values) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[detailId,branchId,actor.id,String(data.reason).trim(),oldValues,newValues])).rows[0];
      await AuditService.log({userId:actor.id,branchId,role:actor.role,action:'PAYMENT_CORRECTED',module:'FINANCIERO',entityType:'PAYMENT_DETAIL',entityId:detailId,description:'Datos descriptivos de un cobro corregidos por Caja',oldValues,newValues,metadata:{reason:String(data.reason).trim(),correctionId:correction.id,amountUnchanged:Number(detail.amount)},requestContext},client);
      await client.query('COMMIT');
      return correction;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
module.exports=CashOperationsService;
