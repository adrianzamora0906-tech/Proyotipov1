const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

class LicenseRenewalService {
  static async create(data, actor) {
    const identification = String(data.identification || '').replace(/\D/g, '');
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const branchId = data.branch_id || actor.branch_id;
    if (!identification || !firstName || !lastName || !branchId) {
      throw createError(422, 'Cédula, nombre, apellido y sucursal son requeridos');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const service = await client.query(`
        SELECT sc.id,COALESCE(bs.price_override,sc.base_price) amount
        FROM service_catalog sc
        JOIN branches b ON b.id=$1 AND b.code<>'SP_MC'
        JOIN branch_services bs ON bs.service_id=sc.id AND bs.branch_id=$1 AND bs.enabled=TRUE
        WHERE sc.code='PSICOSENSOMETRICO' AND sc.active=TRUE LIMIT 1
      `, [branchId]);
      if (!service.rows.length) {
        throw createError(422, 'La renovación de licencia no está habilitada en la sucursal seleccionada');
      }

      const notes = String(data.notes || '').trim().slice(0, 500);
      let student = (await client.query(
        'SELECT id FROM students WHERE identification=$1 FOR UPDATE', [identification],
      )).rows[0];
      if (!student) {
        student = (await client.query(`
          INSERT INTO students(
            branch_id,city_id,identification,first_name,last_name,birth_date,email,phone,
            address,blood_type,status,created_by,registration_type,notes
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'N/D','pendiente_pago',$10,'LICENSE_RENEWAL',$11)
          RETURNING id
        `, [branchId, data.city_id || null, identification, firstName, lastName,
          data.birthDate || null, data.email || null, data.phone || null,
          data.address || null, actor.id, notes || null])).rows[0];
        await client.query(
          'INSERT INTO history(student_id,action) VALUES($1,$2)',
          [student.id, 'Persona registrada para renovación de licencia'],
        );
      } else if (notes) {
        await client.query(`
          UPDATE students
          SET notes=$2, updated_by=$3, updated_at=NOW()
          WHERE id=$1
        `, [student.id, notes, actor.id]);
      }

      const result = await client.query(`
        INSERT INTO service_transactions(
          service_id,branch_id,student_id,customer_identification,customer_name,
          customer_email,customer_phone,customer_birth_date,customer_address,city_id,
          amount,payment_method,status,performed_at,result,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendiente','PENDING',NOW(),'RENOVACION_LICENCIA',$12)
        RETURNING *
      `, [service.rows[0].id, branchId, student.id, identification,
        `${firstName} ${lastName}`, data.email || null, data.phone || null,
        data.birthDate || null, data.address || null, data.city_id || null,
        service.rows[0].amount, actor.id]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = LicenseRenewalService;
