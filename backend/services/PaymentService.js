const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const CycleInstructorAssignmentService = require('./CycleInstructorAssignmentService');
const AuditService = require('./AuditService');

class PaymentService {
  static async getAvailableMethods(branchId) {
    if (!branchId) throw createError(422, 'Sucursal requerida para consultar métodos de pago');
    const result = await db.query(`
      SELECT pm.code,pm.name,bpm.requires_reference,bpm.provider
      FROM branch_payment_methods bpm JOIN payment_methods pm ON pm.id=bpm.payment_method_id
      WHERE bpm.branch_id=$1 AND bpm.active=TRUE AND pm.active=TRUE
      ORDER BY CASE pm.code WHEN 'efectivo' THEN 1 WHEN 'transferencia' THEN 2 WHEN 'tarjeta' THEN 3 ELSE 4 END,pm.name
    `, [branchId]);
    return result.rows;
  }
  static async requestPaymentVoid(detailId, reason, actor, requestContext) {
    if (!reason || !String(reason).trim()) throw createError(422, 'El motivo de anulación es obligatorio');
    const result = await db.query(`
      INSERT INTO payment_void_requests(payment_detail_id, branch_id, requested_by, reason)
      SELECT pd.id, e.branch_id, $2, $3
      FROM payment_details pd
      JOIN payments p ON p.id=pd.payment_id
      JOIN enrollments e ON e.id=p.enrollment_id
      WHERE pd.id=$1 AND pd.status='ACTIVE'
      RETURNING *`, [detailId, actor.id, reason.trim()]);
    if (!result.rows.length) throw createError(404, 'Pago activo no encontrado');
    return result.rows[0];
  }

  static async isCentralVoidApprover(actor, client = db) {
    const result = await client.query(`SELECT 1 FROM settings
      WHERE scope_type='GLOBAL' AND branch_id IS NULL
        AND key='payments.central_void_approver_user_id'
        AND value #>> '{}' = $1`, [actor.id]);
    return result.rows.length > 0;
  }

  static async getPendingVoidRequests(actor) {
    if (!await this.isCentralVoidApprover(actor)) return [];
    const result = await db.query(`
      SELECT r.*, pd.amount, pd.payment_method, s.id student_id,
        s.first_name || ' ' || s.last_name student_name, s.identification,
        u.first_name || ' ' || u.last_name requested_by_name, b.name branch_name
      FROM payment_void_requests r
      JOIN payment_details pd ON pd.id=r.payment_detail_id
      JOIN payments p ON p.id=pd.payment_id
      JOIN enrollments e ON e.id=p.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
      JOIN users u ON u.id=r.requested_by
      JOIN branches b ON b.id=r.branch_id
      WHERE r.status='PENDING'
      ORDER BY r.requested_at`);
    return result.rows;
  }

  static async reviewPaymentVoid(requestId, decision, note, actor, requestContext) {
    if (!['APPROVED', 'REJECTED'].includes(String(decision).toUpperCase())) throw createError(422, 'Decision de anulacion no valida');
    const client = await db.getClient();
    try {
    await client.query('BEGIN');
    if (!await this.isCentralVoidApprover(actor, client)) throw createError(403, 'Solo la responsable central puede decidir esta solicitud');
    const pending = await client.query("SELECT * FROM payment_void_requests WHERE id=$1 AND status='PENDING' FOR UPDATE", [requestId]);
    if (!pending.rows.length) throw createError(404, 'Solicitud pendiente no encontrada');
    if (pending.rows[0].requested_by === actor.id) throw createError(403, 'Quien solicita una anulación no puede aprobarla ni rechazarla');
    const approved = String(decision).toUpperCase() === 'APPROVED';
    if (approved) await this.cancelPayment(pending.rows[0].payment_detail_id, pending.rows[0].reason, { ...actor, branch_id: pending.rows[0].branch_id }, requestContext, client);
    const result = await client.query(`UPDATE payment_void_requests SET status=$2,reviewed_by=$3,
      review_note=$4,reviewed_at=NOW() WHERE id=$1 RETURNING *`,
      [requestId, approved ? 'APPROVED' : 'REJECTED', actor.id, note || null]);
    await AuditService.log({ userId: actor.id, branchId: pending.rows[0].branch_id, role: actor.role,
      action: approved ? 'PAYMENT_VOID_APPROVED' : 'PAYMENT_VOID_REJECTED', module: 'FINANCIERO',
      entityType: 'PAYMENT_VOID_REQUEST', entityId: requestId,
      description: approved ? 'Anulacion aprobada por responsable central' : 'Anulacion rechazada por responsable central',
      newValues: { status: approved ? 'APPROVED' : 'REJECTED', note: note || null }, requestContext }, client);
    await client.query('COMMIT');
    return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  static async getMyReviewedVoidRequests(actor) {
    const result = await db.query(`SELECT r.*,pd.amount,s.first_name || ' ' || s.last_name student_name,
      u.first_name || ' ' || u.last_name reviewed_by_name
      FROM payment_void_requests r
      JOIN payment_details pd ON pd.id=r.payment_detail_id
      JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id LEFT JOIN users u ON u.id=r.reviewed_by
      WHERE r.requested_by=$1 AND r.status IN ('APPROVED','REJECTED')
        AND r.requester_acknowledged_at IS NULL ORDER BY r.reviewed_at`, [actor.id]);
    return result.rows;
  }

  static async acknowledgeVoidRequest(requestId, actor) {
    const result = await db.query(`UPDATE payment_void_requests SET requester_acknowledged_at=NOW()
      WHERE id=$1 AND requested_by=$2 AND status IN ('APPROVED','REJECTED') RETURNING id`, [requestId, actor.id]);
    if (!result.rows.length) throw createError(404, 'Respuesta no encontrada');
    return result.rows[0];
  }

  static async voidPaymentAsCashier(detailId, reason, actor, requestContext) {
    return this.requestPaymentVoid(detailId, reason, actor, requestContext);
  }
  /**
   * Crea la cuenta por cobrar inicial de las matrículas que aún no la tienen.
   * payments representa la obligación de pago; payment_details, los abonos.
   */
  static async createMissingPaymentRecords() {
    await db.query(`
      INSERT INTO payments (enrollment_id, total, discount, final_amount, balance, status)
      SELECT
        e.id,
        COALESCE(c.price, 300),
        0,
        COALESCE(c.price, 300),
        COALESCE(c.price, 300),
        'pendiente'
      FROM enrollments e
      LEFT JOIN courses c ON c.id = e.course_id
      LEFT JOIN payments p ON p.enrollment_id = e.id AND p.status != 'anulado'
      WHERE e.status = 'activo'
        AND p.id IS NULL
    `);
  }

  /**
   * Mantiene students.status alineado con el último pago activo del estudiante.
   * Esto también repara datos creados antes de que existiera esta sincronización.
   */
  static async syncStudentPaymentStatuses() {
    await this.createMissingPaymentRecords();

    await db.query(`
      WITH latest_payments AS (
        SELECT DISTINCT ON (e.student_id)
          e.student_id,
          p.status AS payment_status,
          p.balance
        FROM payments p
        JOIN enrollments e ON e.id = p.enrollment_id
        WHERE p.status != 'anulado'
        ORDER BY e.student_id, p.created_at DESC
      ), payment_states AS (
        SELECT
          student_id,
          CASE
            WHEN balance > 0 THEN 'pendiente_pago'
            ELSE 'pago_confirmado'
          END AS student_status
        FROM latest_payments
      )
      UPDATE students s
      SET status = ps.student_status, updated_at = NOW()
      FROM payment_states ps
      WHERE s.id = ps.student_id
        AND s.status IS DISTINCT FROM ps.student_status
    `);
  }

  /**
   * Obtener pagos pendientes (estudiantes con balance > 0)
   */
  static async getPendingPayments({ global = false, collectionBranchId = null } = {}) {
    const result = await db.query(`
      SELECT
        s.id AS "studentId",
        e.branch_id AS "branchId",
        s.first_name || ' ' || s.last_name AS "studentName",
        s.identification AS cedula,
        destination.name AS "branchName",
        registrar_branch.name AS "registrationBranchName",
        p.status,
        c.name AS course,
        p.balance,
        p.total,
        p.final_amount AS "finalAmount",
        p.created_at AS "createdAt",
        COALESCE((SELECT SUM(tv.amount) FROM transfer_payment_verifications tv
          WHERE tv.student_id=s.id AND tv.service_transaction_id IS NULL AND tv.status IN ('PENDING','AWAITING_APPROVAL')),0) AS "pendingVerification",
        (SELECT tv.reference FROM transfer_payment_verifications tv
          WHERE tv.student_id=s.id AND tv.service_transaction_id IS NULL AND tv.status IN ('PENDING','AWAITING_APPROVAL')
          ORDER BY tv.created_at DESC LIMIT 1) AS "pendingTransferReference",
        COALESCE((
          SELECT SUM(pd.amount) FROM payment_details pd
          WHERE pd.payment_id = p.id AND pd.status = 'ACTIVE'
        ), 0) AS paid
      FROM payments p
      JOIN enrollments e ON e.id = p.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN branches destination ON destination.id = e.branch_id
      LEFT JOIN cities destination_city ON destination_city.id = destination.city_id
      LEFT JOIN users registrar ON registrar.id = COALESCE(e.created_by, s.created_by)
      LEFT JOIN branches registrar_branch ON registrar_branch.id = registrar.branch_id
      LEFT JOIN branches collector ON collector.id = $1::uuid
      LEFT JOIN cities collector_city ON collector_city.id = collector.city_id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE p.status IN ('pendiente', 'parcial')
        AND p.balance > 0
        AND (
          $2::boolean = TRUE
          OR e.branch_id = $1::uuid
          OR registrar.branch_id = $1::uuid
          OR (
            NULLIF(LOWER(TRIM(COALESCE(NULLIF(destination.province, ''), destination_city.province, ''))), '') IS NOT NULL
            AND LOWER(TRIM(COALESCE(NULLIF(destination.province, ''), destination_city.province, '')))
                = LOWER(TRIM(COALESCE(NULLIF(collector.province, ''), collector_city.province, '')))
          )
        )
      ORDER BY p.created_at DESC
    `, [collectionBranchId, global]);
    const coursePayments = result.rows.map(r => ({
      ...r,
      balance: Number(r.balance),
      pendingVerification: Number(r.pendingVerification || 0),
      availableToCollect: Math.max(Number(r.balance) - Number(r.pendingVerification || 0), 0),
      total: Number(r.total),
      finalAmount: Number(r.finalAmount),
      paid: Number(r.paid),
    }));
    const services = await db.query(`
      SELECT st.id AS "serviceTransactionId",st.student_id AS "studentId",
        st.branch_id AS "branchId",st.customer_name AS "studentName",
        st.customer_identification AS cedula,b.name AS "branchName",
        sc.name AS course,st.amount AS balance,st.amount AS total,
        st.amount AS "finalAmount",st.created_at AS "createdAt",0::numeric AS paid,
        COALESCE((SELECT SUM(tv.amount) FROM transfer_payment_verifications tv
          WHERE tv.service_transaction_id=st.id AND tv.status IN ('PENDING','AWAITING_APPROVAL')),0) AS "pendingVerification",
        (SELECT tv.reference FROM transfer_payment_verifications tv
          WHERE tv.service_transaction_id=st.id AND tv.status IN ('PENDING','AWAITING_APPROVAL')
          ORDER BY tv.created_at DESC LIMIT 1) AS "pendingTransferReference",
        'SERVICE' AS "paymentType"
      FROM service_transactions st
      JOIN service_catalog sc ON sc.id=st.service_id
      JOIN branches b ON b.id=st.branch_id
      LEFT JOIN cities service_city ON service_city.id=b.city_id
      LEFT JOIN branches collector ON collector.id=$1::uuid
      LEFT JOIN cities collector_city ON collector_city.id=collector.city_id
      LEFT JOIN users registrar ON registrar.id=st.created_by
      WHERE st.status='PENDING'
        AND (st.student_id IS NULL OR EXISTS(SELECT 1 FROM students visible WHERE visible.id=st.student_id AND visible.status <> 'inhabilitado'))
        AND sc.code IN ('PSICOSENSOMETRICO','PRACTICA_LICENCIADOS')
        AND ($2::boolean=TRUE OR st.branch_id=$1::uuid OR registrar.branch_id=$1::uuid OR (
          NULLIF(LOWER(TRIM(COALESCE(NULLIF(b.province,''),service_city.province,''))), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(NULLIF(b.province,''),service_city.province,'')))
              =LOWER(TRIM(COALESCE(NULLIF(collector.province,''),collector_city.province,'')))
        ))
      ORDER BY st.created_at DESC
    `,[collectionBranchId,global]);
    return [...coursePayments,...services.rows.map(row=>({...row,balance:Number(row.balance),total:Number(row.total),finalAmount:Number(row.finalAmount),paid:0,
      pendingVerification:Number(row.pendingVerification||0),availableToCollect:Math.max(Number(row.balance)-Number(row.pendingVerification||0),0)}))]
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  }

  /**
   * Obtener balance de un estudiante vía su enrollment activo
   */
  static async getStudentBalance(studentId) {
    const enrollment = await db.query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND status = 'activo' LIMIT 1",
      [studentId]
    );
    if (enrollment.rows.length === 0) {
      throw createError(404, 'El estudiante no tiene una matrícula activa');
    }

    const payment = await db.query(
      "SELECT total, discount, final_amount, balance FROM payments WHERE enrollment_id = $1 AND status != 'anulado' ORDER BY created_at DESC LIMIT 1",
      [enrollment.rows[0].id]
    );

    if (payment.rows.length === 0) {
      return { total: 0, paid: 0, balance: 0 };
    }

    const p = payment.rows[0];
    const finalAmount = Number(p.final_amount ?? p.total ?? 0);
    return {
      total: finalAmount,
      originalTotal: Number(p.total || 0),
      discount: Number(p.discount || 0),
      paid: finalAmount - Number(p.balance || 0),
      balance: Number(p.balance || 0),
    };
  }

  /**
   * Obtener pagos de un estudiante
   */
  static async getStudentPayments(studentId) {
    const result = await db.query(`
      SELECT pd.*, p.total, p.final_amount, p.status as payment_status,
        EXISTS(SELECT 1 FROM payment_void_requests vr WHERE vr.payment_detail_id=pd.id AND vr.status='PENDING') void_pending
      FROM payment_details pd
      JOIN payments p ON pd.payment_id = p.id
      JOIN enrollments e ON p.enrollment_id = e.id
      WHERE e.student_id = $1 AND p.status != 'anulado'
      ORDER BY pd.created_at DESC
    `, [studentId]);
    return result.rows;
  }

  /**
   * Registrar un pago
   */
  static async registerPayment(data, transactionClient = null) {
    if (data.serviceTransactionId) return this.registerServicePayment(data, transactionClient);
    const client = transactionClient || await db.getClient();
    try {
      if (!transactionClient) await client.query('BEGIN');

      // Buscar estudiante por identificación
      const studentResult = await client.query(`
        SELECT s.*, e.id AS enrollment_id, e.branch_id AS enrollment_branch_id,
          registrar.branch_id AS registration_branch_id,
          destination.name AS destination_branch_name,
          LOWER(TRIM(COALESCE(NULLIF(destination.province, ''), destination_city.province, ''))) AS destination_province,
          LOWER(TRIM(COALESCE(NULLIF(collector.province, ''), collector_city.province, ''))) AS collector_province
        FROM students s
        JOIN enrollments e ON e.student_id = s.id AND e.status = 'activo'
        JOIN branches destination ON destination.id = e.branch_id
        LEFT JOIN cities destination_city ON destination_city.id = destination.city_id
        LEFT JOIN users registrar ON registrar.id = COALESCE(e.created_by, s.created_by)
        LEFT JOIN branches collector ON collector.id = $2::uuid
        LEFT JOIN cities collector_city ON collector_city.id = collector.city_id
        WHERE s.identification = $1
        ORDER BY e.created_at DESC
        LIMIT 1
      `, [data.cedula, data.collectionBranchId]);
      if (studentResult.rows.length === 0) {
        throw createError(404, 'Estudiante no encontrado');
      }
      const student = studentResult.rows[0];
      const canCollect = data.globalAccess
        || String(student.enrollment_branch_id) === String(data.collectionBranchId)
        || String(student.registration_branch_id) === String(data.collectionBranchId)
        || (student.destination_province && student.destination_province === student.collector_province);
      if (!canCollect) {
        throw createError(403, 'El cobro no estÃ¡ permitido desde esta sucursal');
      }

      const normalizedMethod = String(data.method || '').trim().toLowerCase();
      const configuredMethod = await client.query(`
        SELECT pm.code,bpm.requires_reference FROM branch_payment_methods bpm
        JOIN payment_methods pm ON pm.id=bpm.payment_method_id
        WHERE bpm.branch_id=$1 AND pm.code=$2 AND bpm.active=TRUE AND pm.active=TRUE
      `, [data.collectionBranchId || student.enrollment_branch_id, normalizedMethod]);
      if (!configuredMethod.rows.length) throw createError(422, 'Este método de pago no está habilitado para la sucursal del estudiante');
      if (configuredMethod.rows[0].requires_reference && !String(data.reference || '').trim()) {
        throw createError(422, 'La referencia es obligatoria para el método de pago seleccionado');
      }
      data.method = normalizedMethod;
      const cardBatch = normalizedMethod === 'tarjeta' ? String(data.cardBatch || '').trim() : null;
      if (normalizedMethod === 'tarjeta' && !cardBatch) throw createError(422, 'El lote de tarjeta es obligatorio para pagos con tarjeta');

      // Buscar enrollment activo
      const enrollmentResult = await client.query(
        "SELECT id FROM enrollments WHERE student_id = $1 AND id = $2 AND status = 'activo' LIMIT 1",
        [student.id, student.enrollment_id]
      );
      if (enrollmentResult.rows.length === 0) {
        throw createError(400, 'El estudiante no tiene una matrícula activa');
      }
      const enrollmentId = enrollmentResult.rows[0].id;

      // Buscar o crear payment record
      let paymentResult = await client.query(
        "SELECT * FROM payments WHERE enrollment_id = $1 AND status != 'anulado' LIMIT 1",
        [enrollmentId]
      );

      let payment;
      if (paymentResult.rows.length === 0) {
        const courseResult = await client.query(
          `SELECT c.price FROM courses c
           JOIN enrollments e ON e.course_id = c.id
           WHERE e.id = $1`,
          [enrollmentId]
        );
        const coursePrice = Number(courseResult.rows[0]?.price || 300);

        // Crear pago usando el valor real del curso.
        paymentResult = await client.query(`
          INSERT INTO payments (enrollment_id, total, discount, final_amount, balance, status)
          VALUES ($1, $2, 0, $2, $2, 'pendiente')
          RETURNING *
        `, [enrollmentId, coursePrice]);
        payment = paymentResult.rows[0];
      } else {
        payment = paymentResult.rows[0];
      }

      // Validar monto
      if (data.amount <= 0) throw createError(400, 'El monto debe ser mayor a 0');
      if (data.amount > Number(payment.balance)) {
        throw createError(400, `El monto excede el balance pendiente ($${payment.balance})`);
      }

      // La identidad del cajero proviene exclusivamente del JWT autenticado.
      const userId = data.cashierUserId;
      if (!userId) throw createError(401, 'Usuario autenticado requerido para registrar el pago');

      // Crear payment_detail
      const detailResult = await client.query(`
        INSERT INTO payment_details (payment_id, amount, payment_method, reference, card_batch, observations, received_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [payment.id, data.amount, data.method, data.reference || null, cardBatch, data.concept || null, userId]);

      // Actualizar balance del payment
      const newBalance = Number(payment.balance) - Number(data.amount);
      const newStatus = newBalance <= 0 ? 'pagado' : 'parcial';
      await client.query(
        'UPDATE payments SET balance = $1, status = $2 WHERE id = $3',
        [newBalance, newStatus, payment.id]
      );

      // Actualizar estado del estudiante
      const studentStatus = newBalance <= 0 ? 'pago_confirmado' : 'pago_parcial';
      await client.query(
        'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
        [studentStatus, student.id]
      );

      // Crear comprobante
      const receiptSetting=await client.query(`SELECT value FROM settings WHERE scope_type='GLOBAL' AND key='documents.receipt_prefix' LIMIT 1`);
      const receiptPrefix=String(receiptSetting.rows[0]?.value||'RCT').replace(/[^A-Z0-9_-]/gi,'').slice(0,20)||'RCT';
      const receiptResult = await client.query(`
        INSERT INTO receipts (payment_detail_id, receipt_number)
        VALUES ($1, $2)
        RETURNING *
      `, [detailResult.rows[0].id, `${receiptPrefix}-${Date.now()}`]);

      // Registrar historial
      await client.query(
        'INSERT INTO history (student_id, action) VALUES ($1, $2)',
        [student.id, `Pago registrado: $${data.amount} - ${data.method}`]
      );
      await client.query(
        'INSERT INTO payment_history (student_id, payment_id, action, amount) VALUES ($1, $2, $3, $4)',
        [student.id, payment.id, 'Pago registrado', data.amount]
      );

      const finalAmount = Number(payment.final_amount || payment.total || 0);
      const paidAfterPayment = Math.max(finalAmount - newBalance, 0);
      const practicalAccessUnlocked = finalAmount > 0 && paidAfterPayment + 0.00001 >= finalAmount * 0.5;

      await AuditService.log({
        userId, branchId: data.collectionBranchId || student.enrollment_branch_id, role: data.cashierRole,
        action: 'PAYMENT_REGISTERED', module: 'FINANCIERO', entityType: 'PAYMENT_DETAIL',
        entityId: detailResult.rows[0].id,
        description: `Pago de $${data.amount} registrado para el estudiante en ${student.destination_branch_name}`,
        newValues: { amount: data.amount, paymentMethod: data.method, reference: data.reference || null, cardBatch },
        metadata: { studentId: student.id, enrollmentId, paymentId: payment.id,
          paymentDetailId: detailResult.rows[0].id, previousBalance: Number(payment.balance), newBalance,
          practicalAccessUnlocked,
          collectionBranchId: data.collectionBranchId || null,
          destinationBranchId: student.enrollment_branch_id,
          registrationBranchId: student.registration_branch_id || null },
        requestContext: data.requestContext,
      }, client);

      let instructorAssignment = null;
      if (practicalAccessUnlocked) {
        instructorAssignment = await CycleInstructorAssignmentService.assignForEnrollment(
          client,
          enrollmentId,
          data.cashierUserId || userId
        );
      }

      if (!transactionClient) await client.query('COMMIT');

      return {
        payment: { ...payment, balance: newBalance, status: newStatus },
        detail: detailResult.rows[0],
        receipt: receiptResult.rows[0],
        newBalance,
        practicalAccessUnlocked,
        instructorAssignment,
      };
    } catch (error) {
      if (!transactionClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transactionClient) client.release();
    }
  }

  static async registerServicePayment(data, transactionClient = null) {
    const client=transactionClient || await db.getClient();
    try {
      if (!transactionClient) await client.query('BEGIN');
      const transaction=(await client.query(`
        SELECT st.*,sc.name service_name,b.name branch_name,
          LOWER(TRIM(COALESCE(NULLIF(b.province,''),bc.province,''))) destination_province,
          LOWER(TRIM(COALESCE(NULLIF(collector.province,''),cc.province,''))) collector_province,
          registrar.branch_id registration_branch_id
        FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id
        JOIN branches b ON b.id=st.branch_id LEFT JOIN cities bc ON bc.id=b.city_id
        LEFT JOIN branches collector ON collector.id=$2::uuid LEFT JOIN cities cc ON cc.id=collector.city_id
        LEFT JOIN users registrar ON registrar.id=st.created_by
        WHERE st.id=$1 AND st.status='PENDING' FOR UPDATE OF st
      `,[data.serviceTransactionId,data.collectionBranchId])).rows[0];
      if(!transaction) throw createError(404,'El servicio pendiente no fue encontrado');
      const allowed=data.globalAccess||String(transaction.branch_id)===String(data.collectionBranchId)
        ||String(transaction.registration_branch_id)===String(data.collectionBranchId)
        ||(transaction.destination_province&&transaction.destination_province===transaction.collector_province);
      if(!allowed) throw createError(403,'El cobro no está permitido desde esta sucursal');
      if(Number(data.amount)!==Number(transaction.amount)) throw createError(422,`El servicio debe cobrarse por el valor completo ($${Number(transaction.amount).toFixed(2)})`);
      const method=String(data.method||'').trim().toLowerCase();
      const configured=(await client.query(`SELECT bpm.requires_reference FROM branch_payment_methods bpm JOIN payment_methods pm ON pm.id=bpm.payment_method_id WHERE bpm.branch_id=$1 AND pm.code=$2 AND bpm.active=TRUE AND pm.active=TRUE`,[data.collectionBranchId||transaction.branch_id,method])).rows[0];
      if(!configured) throw createError(422,'Este método de pago no está habilitado para la sucursal que realiza el cobro');
      if(configured.requires_reference&&!String(data.reference||'').trim()) throw createError(422,'La referencia es obligatoria para el método seleccionado');
      const cardBatch=method==='tarjeta'?String(data.cardBatch||'').trim():null;
      if(method==='tarjeta'&&!cardBatch) throw createError(422,'El lote de tarjeta es obligatorio para pagos con tarjeta');
      const prefix=(await client.query(`SELECT value FROM settings WHERE scope_type='GLOBAL' AND key='documents.receipt_prefix' LIMIT 1`)).rows[0]?.value||'RCT';
      const receiptNumber=`${String(prefix).replace(/[^A-Z0-9_-]/gi,'').slice(0,20)||'RCT'}-SRV-${Date.now()}`;
      const updated=(await client.query(`UPDATE service_transactions SET status='PAID',payment_method=$2,payment_reference=$3,card_batch=$4,received_by=$5,paid_at=NOW(),performed_at=NOW() WHERE id=$1 RETURNING *`,[transaction.id,method,data.reference||null,cardBatch,data.cashierUserId])).rows[0];
      if(transaction.student_id) await client.query(`UPDATE students SET status='pago_confirmado',updated_at=NOW() WHERE id=$1 AND registration_type IN ('ADDITIONAL_PRACTICE','LICENSE_RENEWAL')`,[transaction.student_id]);
      const receipt=(await client.query(`INSERT INTO service_receipts(transaction_id,receipt_number) VALUES($1,$2) RETURNING *`,[transaction.id,receiptNumber])).rows[0];
      await AuditService.log({userId:data.cashierUserId,branchId:data.collectionBranchId||transaction.branch_id,role:data.cashierRole,action:'SERVICE_PAYMENT_REGISTERED',module:'FINANCIERO',entityType:'SERVICE_TRANSACTION',entityId:transaction.id,description:`Cobro de ${transaction.service_name} por $${Number(transaction.amount).toFixed(2)}`,newValues:{amount:Number(transaction.amount),paymentMethod:method,reference:data.reference||null,cardBatch,receiptNumber},requestContext:data.requestContext},client);
      if (!transactionClient) await client.query('COMMIT');
      return {payment:updated,receipt,newBalance:0,servicePayment:true};
    } catch(error){if (!transactionClient) await client.query('ROLLBACK');throw error;} finally{if (!transactionClient) client.release();}
  }

  /**
   * Obtener estadísticas
   */
  static async getStatistics(branchId = null) {
    const result = await db.query(`
      WITH course_collections AS (
        SELECT pd.amount
        FROM payment_details pd
        JOIN payments p ON pd.payment_id = p.id
        JOIN enrollments e ON e.id = p.enrollment_id
        WHERE pd.status = 'ACTIVE'
          AND pd.created_at::date = CURRENT_DATE
          AND ($1::uuid IS NULL OR e.branch_id = $1)
      ), service_collections AS (
        SELECT st.amount
        FROM service_transactions st
        WHERE st.status = 'PAID'
          AND st.paid_at::date = CURRENT_DATE
          AND ($1::uuid IS NULL OR st.branch_id = $1)
      ), today_collections AS (
        SELECT amount FROM course_collections
        UNION ALL
        SELECT amount FROM service_collections
      )
      SELECT
        COALESCE((SELECT SUM(amount) FROM today_collections), 0) AS "totalAmount",
        (SELECT COUNT(*) FROM today_collections) AS "totalPayments",
        COALESCE((SELECT AVG(amount) FROM today_collections), 0) AS "averagePayment",
        (SELECT COUNT(*) FROM students s2
         WHERE s2.status IN ('pendiente_pago', 'pago_parcial')
           AND ($1::uuid IS NULL OR s2.branch_id = $1)) AS "pendingCount"
    `, [branchId]);
    return result.rows[0];
  }

  static async getHistory() {
    const result = await db.query(`
      SELECT ph.id, ph.student_id AS "studentId", ph.payment_id AS "paymentId",
        ph.action, ph.amount, ph.date,
        s.first_name || ' ' || s.last_name AS "studentName", s.identification AS cedula
      FROM payment_history ph
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = ph.student_id
      ORDER BY ph.date DESC
    `);
    return result.rows.map(row => ({ ...row, amount: Number(row.amount || 0) }));
  }

  /**
   * Cancelar/anular un pago
   */
  static async cancelPayment(detailId, reason, actor, requestContext, transactionClient = null) {
    if (!reason || !String(reason).trim()) throw createError(422, 'El motivo de anulación es obligatorio');
    const client = transactionClient || await db.getClient();
    try {
      if (!transactionClient) await client.query('BEGIN');

      const detailResult = await client.query(
        "SELECT * FROM payment_details WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE",
        [detailId]
      );
      if (detailResult.rows.length === 0) throw createError(404, 'Detalle de pago no encontrado');
      const detail = detailResult.rows[0];

      // Restaurar balance
      const payment = await client.query(
        'SELECT * FROM payments WHERE id = $1',
        [detail.payment_id]
      );
      if (payment.rows.length === 0) throw createError(404, 'Pago no encontrado');

      const restoredBalance = Number(payment.rows[0].balance) + Number(detail.amount);
      await client.query(
        "UPDATE payments SET balance = $1, status = CASE WHEN $2 >= final_amount THEN 'pendiente' ELSE 'parcial' END WHERE id = $3",
        [restoredBalance, restoredBalance, detail.payment_id]
      );

      // El movimiento original se conserva de forma inmutable.
      await client.query(`UPDATE payment_details SET status='VOIDED', voided_by=$2,
        voided_at=NOW(), void_reason=$3 WHERE id=$1`, [detailId, actor.id, reason.trim()]);

      // Recalcular estado del estudiante
      const enrollment = await client.query(
        'SELECT student_id FROM enrollments WHERE id = $1',
        [payment.rows[0].enrollment_id]
      );

      if (enrollment.rows.length > 0) {
        const studentId = enrollment.rows[0].student_id;
        const totalResult = await client.query(
          `SELECT COALESCE(SUM(pd.amount), 0) as paid
           FROM payment_details pd
           JOIN payments p ON pd.payment_id = p.id
           WHERE p.enrollment_id = $1 AND p.status != 'anulado' AND pd.status = 'ACTIVE'`,
          [payment.rows[0].enrollment_id]
        );
        const totalPayment = await client.query(
          'SELECT final_amount FROM payments WHERE id = $1',
          [detail.payment_id]
        );

        const paid = Number(totalResult.rows[0].paid);
        const total = totalPayment.rows.length > 0 ? Number(totalPayment.rows[0].final_amount) : 300;

        let newStatus;
        if (paid === 0) newStatus = 'pendiente_pago';
        else if (paid < total) newStatus = 'pago_parcial';
        else newStatus = 'pago_confirmado';

        await client.query(
          'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, studentId]
        );

        await client.query(
          'INSERT INTO history (student_id, action) VALUES ($1, $2)',
          [studentId, `Pago anulado: $${detail.amount} - Razón: ${reason}`]
        );
        await client.query('INSERT INTO payment_history (student_id,payment_id,action,amount) VALUES ($1,$2,$3,$4)',
          [studentId, detail.payment_id, 'Pago anulado', detail.amount]);
        await AuditService.log({ userId: actor.id, branchId: actor.branch_id, role: actor.role,
          action: 'PAYMENT_VOIDED', module: 'FINANCIERO', entityType: 'PAYMENT_DETAIL', entityId: detailId,
          description: `Pago de $${detail.amount} anulado`, oldValues: { status: 'ACTIVE', amount: detail.amount },
          newValues: { status: 'VOIDED' }, metadata: { paymentId: detail.payment_id, studentId, reason,
            previousBalance: Number(payment.rows[0].balance), newBalance: restoredBalance }, requestContext }, client);

        const assignment = await client.query(`
          SELECT instructor_id
          FROM enrollment_instructor_assignments
          WHERE enrollment_id=$1 AND active=TRUE
          LIMIT 1
        `, [payment.rows[0].enrollment_id]);
        if (assignment.rows.length) {
          await CycleInstructorAssignmentService.syncPracticalSessions(
            client,
            payment.rows[0].enrollment_id,
            assignment.rows[0].instructor_id,
            actor.id
          );
        }
      }

      if (!transactionClient) await client.query('COMMIT');
      return { success: true, detail };
    } catch (error) {
      if (!transactionClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transactionClient) client.release();
    }
  }
}

module.exports = PaymentService;
