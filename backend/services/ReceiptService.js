const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

class ReceiptService {
  static async getAll(branchId = null) {
    const result = await db.query(`
      SELECT r.*, pd.amount, pd.payment_method, pd.reference, pd.card_batch, pd.status AS payment_detail_status,
        s.first_name || ' ' || s.last_name AS "studentName",
        s.identification AS cedula, c.name AS course
      FROM receipts r
      JOIN payment_details pd ON r.payment_detail_id = pd.id
      JOIN payments p ON pd.payment_id = p.id
      JOIN enrollments e ON p.enrollment_id = e.id
      JOIN students s ON e.student_id = s.id
      LEFT JOIN courses c ON e.course_id = c.id
      WHERE ($1::uuid IS NULL OR e.branch_id=$1)
      ORDER BY r.created_at DESC
    `, [branchId]);
    const serviceResult = await db.query(`
      SELECT sr.id,sr.receipt_number,sr.created_at,st.id payment_detail_id,
        st.amount,st.payment_method,st.payment_reference reference,st.card_batch,st.status payment_detail_status,
        st.customer_name AS "studentName",st.customer_identification cedula,
        sc.name course,st.branch_id,TRUE AS service_receipt
      FROM service_receipts sr
      JOIN service_transactions st ON st.id=sr.transaction_id
      JOIN service_catalog sc ON sc.id=st.service_id
      WHERE ($1::uuid IS NULL OR st.branch_id=$1)
      ORDER BY sr.created_at DESC
    `, [branchId]);
    return [...result.rows,...serviceResult.rows]
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }

  static async getById(id, branchId = null) {
    const result = await db.query(`
      SELECT r.*, pd.amount, pd.payment_method, pd.reference, pd.card_batch, pd.observations,
        s.first_name || ' ' || s.last_name AS "studentName",
        s.identification AS cedula, s.address, c.name AS "courseName", b.name AS "branchName",
        p.balance, u.first_name || ' ' || u.last_name AS "cashierName"
      FROM receipts r
      JOIN payment_details pd ON r.payment_detail_id = pd.id
      JOIN payments p ON pd.payment_id = p.id
      JOIN enrollments e ON p.enrollment_id = e.id
      JOIN students s ON e.student_id = s.id
      LEFT JOIN courses c ON e.course_id = c.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN users u ON pd.received_by = u.id
      WHERE r.id = $1 AND ($2::uuid IS NULL OR e.branch_id=$2)
    `, [id, branchId]);
    if (result.rows.length) return result.rows[0];
    const serviceResult=await db.query(`
      SELECT sr.*,st.amount,st.payment_method,st.payment_reference reference,st.card_batch,
        st.customer_name AS "studentName",st.customer_identification cedula,
        st.customer_address address,sc.name AS "courseName",
        COALESCE(cashier_branch.name,b.name) AS "branchName",0::numeric balance,
        TRIM(CONCAT(u.first_name,' ',u.last_name)) AS "cashierName"
      FROM service_receipts sr JOIN service_transactions st ON st.id=sr.transaction_id
      JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
      LEFT JOIN users u ON u.id=st.received_by LEFT JOIN branches cashier_branch ON cashier_branch.id=u.branch_id
      WHERE sr.id=$1 AND ($2::uuid IS NULL OR st.branch_id=$2)
    `,[id, branchId]);
    if (!serviceResult.rows.length) throw createError(404, 'Comprobante no encontrado');
    return serviceResult.rows[0];
  }

  static async getPrintHTML(id, branchId = null) {
    const receipt = await this.getById(id, branchId);
    return this.renderHTML(receipt);
  }

  static async getTransferPrintHTML(id, actor, authorization = {}) {
    const branchId = authorization.operationalCoverage?.operational_branch_id || authorization.branchId || actor.branch_id;
    const permissions = authorization.permissions || [];
    const canReadBranchPayments = permissions.some(permission =>
      ['PAYMENT_VIEW','PAYMENT_CREATE','TRANSFER_VERIFY','TRANSFER_APPROVE'].includes(permission));
    const globalRead = Boolean(authorization.global || permissions.includes('TRANSFER_APPROVE')
      || (permissions.includes('TRANSFER_VERIFY') && await require('./CashOperationsService').isCentralTransferVerifier(actor.id)));
    const result = await db.query(`SELECT tv.id,tv.amount,tv.reference,tv.created_at,tv.status,
      tv.bank,tv.transfer_date,'transferencia' AS payment_method,
      TRIM(CONCAT(s.first_name,' ',s.last_name)) AS "studentName",s.identification cedula,
      COALESCE(c.name,sc.name,'Servicio') AS "courseName",b.name AS "branchName",
      TRIM(CONCAT(u.first_name,' ',u.last_name)) AS "cashierName"
      FROM transfer_payment_verifications tv JOIN students s ON s.id=tv.student_id
      JOIN branches b ON b.id=tv.branch_id LEFT JOIN users u ON u.id=tv.created_by
      LEFT JOIN enrollments e ON e.id=tv.enrollment_id LEFT JOIN courses c ON c.id=e.course_id
      LEFT JOIN service_transactions st ON st.id=tv.service_transaction_id
      LEFT JOIN service_catalog sc ON sc.id=st.service_id
      WHERE tv.id=$1 AND tv.status IN ('PENDING','AWAITING_APPROVAL')
        AND ($2::boolean OR ($5::boolean AND tv.branch_id=$3::uuid) OR tv.created_by=$4::uuid)`,
    [id,globalRead,branchId || null,actor.id,canReadBranchPayments]);
    if (!result.rows.length) throw createError(404,'Constancia pendiente no disponible');
    return this.renderHTML({...result.rows[0],pending_transfer:true,receipt_number:`TR-${id}`});
  }

  static renderHTML(receipt) {
    const pending = receipt.pending_transfer === true;
    return `
      <div class="receipt" style="font-family:Arial,sans-serif;max-width:340px;margin:0 auto;padding:20px;color:#101828;background:#fff;">
        <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px;">
          <h2 style="margin:0;font-size:21px;color:#17226b;">SPORTMANCAR</h2>
          <p style="margin:3px 0;font-size:12px;">Escuela de Conducción</p>
          <strong style="display:block;margin-top:9px;font-size:14px;">${pending ? 'CONSTANCIA DE TRANSFERENCIA PENDIENTE' : 'COMPROBANTE DE PAGO'}</strong>
          <p style="margin:5px 0 0;font-size:12px;">N.º ${escapeHtml(receipt.receipt_number)}</p>
        </div>
        <div style="margin-bottom:10px;font-size:13px;line-height:1.45;">
          <p style="margin:5px 0;"><strong>Fecha:</strong> ${new Date(receipt.created_at).toLocaleString('es-EC')}</p>
          <p style="margin:5px 0;"><strong>Sucursal:</strong> ${escapeHtml(receipt.branchName || 'Sportmancar')}</p>
          <p style="margin:5px 0;"><strong>Estudiante:</strong> ${escapeHtml(receipt.studentName)}</p>
          <p style="margin:5px 0;"><strong>Cédula:</strong> ${escapeHtml(receipt.cedula)}</p>
          <p style="margin:5px 0;"><strong>Curso:</strong> ${escapeHtml(receipt.courseName || 'N/A')}</p>
          <p style="margin:5px 0;"><strong>Registrado por:</strong> ${escapeHtml(receipt.cashierName || 'N/A')}</p>
        </div>
        <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:10px 0;margin-bottom:10px;font-size:14px;">
          <p style="display:flex;justify-content:space-between;margin:4px 0;"><strong>${pending ? 'Valor declarado (no confirmado)' : 'Valor pagado'}</strong><strong>$${Number(receipt.amount).toFixed(2)}</strong></p>
          <p style="display:flex;justify-content:space-between;margin:4px 0;"><span>Método</span><span>${escapeHtml(receipt.payment_method)}</span></p>
          ${receipt.reference ? `<p style="display:flex;justify-content:space-between;margin:4px 0;"><span>Referencia</span><span>${escapeHtml(receipt.reference)}</span></p>` : ''}
          ${receipt.card_batch ? `<p style="display:flex;justify-content:space-between;margin:4px 0;"><span>Lote tarjeta</span><span>${escapeHtml(receipt.card_batch)}</span></p>` : ''}
          ${pending ? '<p style="font-weight:bold;color:#9a3412;">Transferencia pendiente de verificaci&oacute;n y aprobaci&oacute;n. No acredita un pago confirmado ni reduce el saldo del estudiante.</p>' : `<p style="display:flex;justify-content:space-between;margin:4px 0;"><span>Saldo pendiente</span><strong>$${Number(receipt.balance || 0).toFixed(2)}</strong></p>`}
        </div>
        <div style="text-align:center;font-size:11px;color:#667085;"><p style="margin:4px 0;">Este documento no tiene validez tributaria.</p><p style="margin:4px 0;">${pending ? 'Constancia de registro; no es comprobante de pago.' : 'Conserve este comprobante. Gracias por su pago.'}</p></div>
      </div>
    `;
  }

  static async getByStudent(studentId, branchId = null) {
    const result = await db.query(`
      SELECT r.*, pd.amount, pd.payment_method
      FROM receipts r
      JOIN payment_details pd ON r.payment_detail_id = pd.id
      JOIN payments p ON pd.payment_id = p.id
      JOIN enrollments e ON p.enrollment_id = e.id
      WHERE e.student_id = $1 AND ($2::uuid IS NULL OR e.branch_id=$2)
      ORDER BY r.created_at DESC
    `, [studentId, branchId]);
    return result.rows;
  }
}

module.exports = ReceiptService;
