// Regla exclusiva ATM: no acredita ni aprueba transferencias.
const sponsored = "(to_jsonb(s)->>'discount_benefit'='SPONSORSHIP_PRIZE' AND p.final_amount=0 AND p.balance=0)";
const requiredAmount = "CASE WHEN " + sponsored + " THEN 0::numeric WHEN (to_jsonb(s)->>'discount_benefit'='BLACK_FRIDAY' OR EXISTS(SELECT 1 FROM audit_logs promotion_audit WHERE promotion_audit.entity_id=e.id AND promotion_audit.action='STUDENT_ADDITIONAL_ENROLLMENT_CREATED' AND promotion_audit.metadata->>'discountBenefit'='BLACK_FRIDAY')) AND ((c.name ILIKE '%moto%' OR c.name ILIKE '%clase a%') AND p.final_amount=100 OR (c.name ILIKE '%auto%' OR c.name ILIKE '%clase b%') AND p.final_amount=156) THEN p.final_amount WHEN (c.name ILIKE '%moto%' OR c.name ILIKE '%clase a%') THEN LEAST(p.final_amount, 125::numeric) ELSE 165::numeric END";
const joins = `
 JOIN LATERAL (SELECT id,final_amount,balance,created_at FROM payments
   WHERE enrollment_id=e.id AND status<>'anulado' ORDER BY created_at DESC,id DESC LIMIT 1) p ON TRUE
 LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) amount FROM transfer_payment_verifications
   WHERE enrollment_id=e.id AND service_transaction_id IS NULL
     AND status IN ('PENDING','AWAITING_APPROVAL')) pending_transfer ON TRUE`;
const condition = `(GREATEST(p.final_amount-p.balance,0)+COALESCE(pending_transfer.amount,0) >= ${requiredAmount})`;
// Fecha en que los abonos acumulados alcanzaron el requisito, en hora de Ecuador.
const dateJoin = `
 JOIN LATERAL (
   SELECT MIN(paid_on) eligible_date FROM (
     SELECT paid_on,SUM(amount) OVER (ORDER BY paid_on) accumulated FROM (
       SELECT COALESCE((SELECT MIN(t.transfer_date) FROM transfer_payment_verifications t
         WHERE t.enrollment_id=e.id AND t.service_transaction_id IS NULL AND t.status='CONFIRMED'
           AND t.reference=pd.reference), (pd.created_at AT TIME ZONE 'America/Guayaquil')::date) paid_on,pd.amount
       FROM payment_details pd WHERE pd.payment_id=p.id AND pd.status='ACTIVE'
       UNION ALL
       SELECT transfer_date,amount FROM transfer_payment_verifications
       WHERE enrollment_id=e.id AND service_transaction_id IS NULL AND status IN ('PENDING','AWAITING_APPROVAL')
       UNION ALL
       SELECT (p.created_at AT TIME ZONE 'America/Guayaquil')::date,0::numeric WHERE ${sponsored}
     ) events
   ) totals WHERE accumulated >= ${requiredAmount}
 ) payment_date ON TRUE`;
module.exports = { joins, condition, dateJoin };
