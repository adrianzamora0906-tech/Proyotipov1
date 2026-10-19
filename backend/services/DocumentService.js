const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const AuditService = require('./AuditService');

class DocumentService {
  static async studentIdForDocument(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw createError(400,'Documento invalido');
    const result = await db.query('SELECT student_id FROM student_documents WHERE id=$1',[id]);
    if (!result.rows.length) throw createError(404,'Documento no encontrado');
    return result.rows[0].student_id;
  }
  static async getStudentSummaries({ cityId = null, branchId = null } = {}) {
    const result = await db.query(`
      SELECT s.id AS "studentId", s.identification AS cedula,
        s.first_name || ' ' || s.last_name AS "studentName", s.phone,
        b.name AS branch, cty.name AS city, COALESCE(course.name, 'Sin curso') AS course,
        sd.id AS "documentId", dt.code AS type
      FROM students s
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN cities cty ON cty.id = s.city_id
      LEFT JOIN LATERAL (SELECT c.name FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = s.id AND e.status = 'activo' LIMIT 1) course ON true
      LEFT JOIN student_documents sd ON sd.student_id = s.id
      LEFT JOIN document_types dt ON dt.id = sd.document_type_id
      WHERE s.status <> 'inhabilitado' AND ($1::uuid IS NULL OR b.city_id = $1)
        AND ($2::uuid IS NULL OR s.branch_id = $2)
      ORDER BY b.name, s.first_name, s.last_name
    `, [cityId, branchId]);
    const baseRequiredTypes = ['cedula', 'certificado_bachiller', 'carnet_tipo_sangre'];
    const documentNames = {
      cedula: 'Cedula',
      certificado_bachiller: 'Certificado de estudio',
      carnet_tipo_sangre: 'Carnet de tipo sanguineo',
      certificado_discapacidad: 'Certificado de discapacidad',
    };
    const summaries = new Map();
    result.rows.forEach(row => {
      if (!summaries.has(row.studentId)) summaries.set(row.studentId, { ...row, documents: [] });
      if (row.documentId) summaries.get(row.studentId).documents.push({ id: row.documentId, type: row.type });
    });
    return [...summaries.values()].map(summary => {
      const uploadedTypes = new Set(summary.documents.map(document => document.type));
      const requiredTypes = /tipo\s*f/i.test(String(summary.course || ''))
        ? [...baseRequiredTypes, 'certificado_discapacidad']
        : baseRequiredTypes;
      summary.requiredCount = requiredTypes.length;
      summary.uploadedCount = requiredTypes.filter(type => uploadedTypes.has(type)).length;
      summary.missingDocuments = requiredTypes
        .filter(type => !uploadedTypes.has(type))
        .map(type => documentNames[type]);
      summary.missingCount = summary.missingDocuments.length;
      return summary;
    });
  }

  /**
   * Obtener documentos de un estudiante
   */
  static assertStudentAccess(studentId,scope) {
    return require('./StudentService').assertReadAccess(studentId,scope);
  }

  static async getContent(studentId, documentId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) throw createError(400,'Documento invalido');
    const result = await db.query('SELECT id, file_path AS file_url FROM student_documents WHERE id=$1 AND student_id=$2',[documentId,studentId]);
    if (!result.rows.length) throw createError(404,'Documento no encontrado');
    return result.rows[0];
  }

  static async getByStudent(studentId, metadata = false) {
    const result = await db.query(`
      SELECT sd.id, sd.student_id, dt.code AS type, dt.name,
        ${metadata ? "CASE WHEN NULLIF(sd.file_path,'') IS NOT NULL THEN '/api/students/' || sd.student_id || '/documents/' || sd.id || '/content' END" : 'sd.file_path'} AS file_url,
        sd.observations, sd.uploaded_at, sd.created_at
      FROM student_documents sd
      JOIN document_types dt ON dt.id = sd.document_type_id
      WHERE sd.student_id = $1 ORDER BY sd.uploaded_at DESC
    `, [studentId]);
    return result.rows;
  }

  /**
   * Crear documento para un estudiante
   */
  static async create(studentId, data, actor = null, requestContext = null) {
    if (data.cedulaIndicatesBachiller === true) {
      if (data.type !== 'certificado_bachiller') throw createError(422, 'Tipo de documento no valido para confirmar bachiller');
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const cedula = (await client.query(`
          SELECT sd.file_path FROM student_documents sd
          JOIN document_types dt ON dt.id=sd.document_type_id
          WHERE sd.student_id=$1 AND dt.code='cedula' AND NULLIF(sd.file_path,'') IS NOT NULL
          FOR UPDATE OF sd`, [studentId])).rows[0];
        if (!cedula) throw createError(422, 'Carga la cedula para confirmar que indica bachiller');
        const document = (await client.query(`
          INSERT INTO student_documents (student_id,document_type_id,file_path,observations,uploaded_at)
          SELECT $1,id,$2,$3,NOW() FROM document_types WHERE code='certificado_bachiller' AND active=true
          ON CONFLICT (student_id,document_type_id) DO UPDATE
          SET file_path=EXCLUDED.file_path,observations=EXCLUDED.observations,uploaded_at=NOW()
          RETURNING id,student_id,file_path AS file_url,observations,uploaded_at`,
        [studentId, cedula.file_path, 'La cedula indica bachiller. No requiere certificado de estudio.'])).rows[0];
        if (!document) throw createError(422, 'Tipo de documento no configurado');
        await AuditService.log({
          userId: actor?.id || null, branchId: actor?.branch_id || null, role: actor?.role || null,
          action: 'DOCUMENT_CREATED', module: 'DOCUMENTACION', entityType: 'STUDENT_DOCUMENT',
          entityId: document.id, description: 'Confirmacion de bachiller en cedula',
          newValues: { studentId, cedulaIndicatesBachiller: true }, requestContext,
        }, client);
        await client.query('COMMIT');
        return document;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    if (data.type === 'registro_documentos') {
      const documentCodes = data.includesBloodCard === false
        ? ['cedula']
        : ['cedula', 'carnet_tipo_sangre'];
      const result = await db.query(
        `INSERT INTO student_documents (student_id, document_type_id, file_path, observations, uploaded_at)
         SELECT $1, dt.id, $2, $3, NOW()
         FROM document_types dt
         WHERE dt.code = ANY($4::text[]) AND dt.active = true
         ON CONFLICT (student_id, document_type_id) DO UPDATE
         SET file_path = EXCLUDED.file_path, observations = EXCLUDED.observations, uploaded_at = NOW()
         RETURNING id, student_id, file_path AS file_url, uploaded_at`,
        [
          studentId,
          data.fileUrl || null,
          data.observations || (data.includesBloodCard === false ? 'PDF de cedula' : 'PDF combinado de cedula y carnet de tipo sanguineo'),
          documentCodes,
        ]
      );
      if (result.rows.length !== documentCodes.length) throw createError(422, 'No están configurados los tipos de documento requeridos');
      return { documents: result.rows };
    }
    const result = await db.query(
      `INSERT INTO student_documents (student_id, document_type_id, file_path, observations, uploaded_at)
       SELECT $1, dt.id, $3, $4, NOW()
       FROM document_types dt WHERE dt.code = $2 AND dt.active = true
       ON CONFLICT (student_id, document_type_id) DO UPDATE
       SET file_path = EXCLUDED.file_path, observations = EXCLUDED.observations, uploaded_at = NOW()
       RETURNING id, student_id, file_path AS file_url, uploaded_at`,
      [studentId, data.type, data.fileUrl || null, data.observations || null]
    );
    if (result.rows.length === 0) throw createError(422, 'Tipo de documento no válido');
    return result.rows[0];
  }

  static async delete(id, actor = null, requestContext = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`
        SELECT sd.id, sd.student_id, sd.document_type_id, sd.file_path, sd.observations, sd.uploaded_at,
          dt.code document_code, dt.name document_name,
          s.identification, TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name, s.branch_id
        FROM student_documents sd
        JOIN students s ON s.id = sd.student_id
        LEFT JOIN document_types dt ON dt.id = sd.document_type_id
        WHERE sd.id = $1
        FOR UPDATE OF sd
      `, [id])).rows[0];
      if (!current) throw createError(404, 'Documento no encontrado');
      if (requestContext) requestContext.studentId = current.student_id;

      const result = await client.query(
        'DELETE FROM student_documents WHERE id = $1 RETURNING id',
        [id]
      );

      await AuditService.log({
        userId: actor?.id || null,
        branchId: current.branch_id || actor?.branch_id || null,
        role: actor?.role || null,
        action: 'DOCUMENT_DELETED',
        module: 'DOCUMENTACION',
        entityType: 'STUDENT_DOCUMENT',
        entityId: current.id,
        description: `Documento eliminado: ${current.document_name || current.document_code || 'Documento'} de ${current.student_name || current.identification}`,
        oldValues: current,
        metadata: {
          studentId: current.student_id,
          identification: current.identification,
          studentName: current.student_name,
          documentType: current.document_code,
          documentName: current.document_name,
        },
        requestContext,
      }, client);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async appendBloodCardToRegistrationPdf(studentId, data) {
    if (!data.fileUrl || !String(data.fileUrl).startsWith('data:')) {
      throw createError(422, 'Archivo del carnet requerido');
    }

    const existing = await db.query(
      `SELECT sd.file_path AS file_url
       FROM student_documents sd
       JOIN document_types dt ON dt.id = sd.document_type_id
       WHERE sd.student_id = $1 AND dt.code = 'cedula'
       LIMIT 1`,
      [studentId]
    );
    if (!existing.rows[0]?.file_url?.startsWith('data:application/pdf')) {
      throw createError(422, 'Primero debe existir el PDF de cedula');
    }

    const decodeDataUrl = (dataUrl) => {
      const [metadata, encoded] = String(dataUrl).split(',');
      if (!encoded) throw createError(422, 'Archivo no valido');
      return {
        mimeType: metadata.match(/^data:([^;]+)/)?.[1] || '',
        bytes: Buffer.from(encoded, 'base64'),
      };
    };

    const existingPdf = decodeDataUrl(existing.rows[0].file_url);
    const cardFile = decodeDataUrl(data.fileUrl);
    const pdf = await PDFDocument.load(existingPdf.bytes);

    const firstPage = pdf.getPage(0);
    const slotWidth = 235;
    const slotHeight = 175;
    const slotX = 48;
    const slotY = 275;
    if (cardFile.mimeType === 'application/pdf') {
      const cardPdf = await PDFDocument.load(cardFile.bytes);
      const [cardPage] = await pdf.embedPdf(cardPdf, [0]);
      const scale = Math.min(slotWidth / cardPage.width, slotHeight / cardPage.height);
      const cardWidth = cardPage.width * scale;
      const cardHeight = cardPage.height * scale;
      firstPage.drawPage(cardPage, {
        x: slotX + ((slotWidth - cardWidth) / 2),
        y: slotY + ((slotHeight - cardHeight) / 2),
        width: cardWidth,
        height: cardHeight,
      });
    } else {
      const image = cardFile.mimeType === 'image/png'
        ? await pdf.embedPng(cardFile.bytes)
        : await pdf.embedJpg(cardFile.bytes);
      const fitted = image.scaleToFit(slotWidth, slotHeight);
      firstPage.drawImage(image, {
        x: slotX + ((slotWidth - fitted.width) / 2),
        y: slotY + ((slotHeight - fitted.height) / 2),
        width: fitted.width,
        height: fitted.height,
      });
    }

    const mergedBytes = await pdf.save();
    const mergedFileUrl = `data:application/pdf;base64,${Buffer.from(mergedBytes).toString('base64')}`;
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const type of ['cedula', 'carnet_tipo_sangre']) {
        await client.query(
          `INSERT INTO student_documents (student_id, document_type_id, file_path, observations, uploaded_at)
           SELECT $1, dt.id, $3, $4, NOW()
           FROM document_types dt WHERE dt.code = $2 AND dt.active = true
           ON CONFLICT (student_id, document_type_id) DO UPDATE
           SET file_path = EXCLUDED.file_path, observations = EXCLUDED.observations, uploaded_at = NOW()`,
          [studentId, type, mergedFileUrl, 'PDF consolidado de cedula y carnet de tipo sanguineo']
        );
      }
      await client.query('COMMIT');
      return { fileUrl: mergedFileUrl };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createMobileUploadToken(user, data) {
    const studentId = data.studentId || null;
    const type = data.type || 'cedula';

    let studentName = 'Registro nuevo';
    if (studentId) {
      const student = await db.query('SELECT id, first_name, last_name FROM students WHERE id = $1', [studentId]);
      if (student.rows.length === 0) throw createError(404, 'Estudiante no encontrado');
      studentName = `${student.rows[0].first_name} ${student.rows[0].last_name}`;
    }

    const isRegistrationPackage = type === 'registro_documentos';
    const isBloodCardCompletion = type === 'completar_carnet';
    const isAdditionalPractice = ['practica_adicional_exestudiante','practica_adicional_externo'].includes(type);
    const documentType = isRegistrationPackage || isBloodCardCompletion || isAdditionalPractice
      ? { rows: [{ code: type, name: isBloodCardCompletion ? 'Carnet de tipo sanguineo' : isAdditionalPractice ? 'Documentos para prácticas adicionales' : 'Cedula y carnet de la Cruz Roja' }] }
      : await db.query('SELECT code, name FROM document_types WHERE code = $1 AND active = true', [type]);
    if (documentType.rows.length === 0) throw createError(422, 'Tipo de documento no valido');

    if (isRegistrationPackage && user?.id) {
      const activeSession = await db.query(
        `SELECT token, student_id AS "studentId", document_type AS type,
          expires_at AS "expiresAt", used_at AS "usedAt"
         FROM mobile_document_upload_tokens
         WHERE created_by = $1 AND document_type = $2 AND expires_at > NOW() + INTERVAL '1 hour'
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id, type]
      );
      if (activeSession.rows.length > 0) {
        return {
          ...activeSession.rows[0],
          studentName,
          documentName: documentType.rows[0].name,
          reused: true,
        };
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expirationInterval = isRegistrationPackage ? '12 hours' : '15 minutes';
    const result = await db.query(
      `INSERT INTO mobile_document_upload_tokens (token, student_id, document_type, expires_at, created_by)
       VALUES ($1, $2, $3, NOW() + $5::interval, $4)
       RETURNING token, student_id AS "studentId", document_type AS type, expires_at AS "expiresAt"`,
      [token, studentId, type, user?.id || null, expirationInterval]
    );

    return {
      ...result.rows[0],
      studentName,
      documentName: documentType.rows[0].name,
    };
  }

  static async getMobileUploadToken(token) {
    const result = await db.query(
      `SELECT t.token, t.student_id AS "studentId", t.document_type AS type,
        t.expires_at AS "expiresAt", t.used_at AS "usedAt",
        COALESCE(s.first_name || ' ' || s.last_name, 'Registro nuevo') AS "studentName",
        COALESCE(dt.name, CASE
          WHEN t.document_type = 'completar_carnet' THEN 'Carnet de tipo sanguineo'
          WHEN t.document_type IN ('practica_adicional_exestudiante','practica_adicional_externo') THEN 'Documentos para prácticas adicionales'
          ELSE 'Cedula y carnet de la Cruz Roja'
        END) AS "documentName"
       FROM mobile_document_upload_tokens t
       LEFT JOIN students s ON s.id = t.student_id
       LEFT JOIN document_types dt ON dt.code = t.document_type
       WHERE t.token = $1`,
      [token]
    );

    if (result.rows.length === 0) throw createError(404, 'Enlace no encontrado');

    const upload = result.rows[0];
    if (upload.usedAt && upload.type !== 'registro_documentos') throw createError(410, 'Este enlace ya fue utilizado');
    if (new Date(upload.expiresAt).getTime() < Date.now()) throw createError(410, 'Este enlace ya expiro');

    return upload;
  }

  static async completeMobileUpload(token, data) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
          `SELECT t.*, COALESCE(s.first_name || ' ' || s.last_name, 'Registro nuevo') AS student_name, dt.id AS document_type_id
         FROM mobile_document_upload_tokens t
         LEFT JOIN students s ON s.id = t.student_id
         LEFT JOIN document_types dt ON dt.code = t.document_type AND dt.active = true
         WHERE t.token = $1
         FOR UPDATE OF t`,
        [token]
      );

      if (tokenResult.rows.length === 0) throw createError(404, 'Enlace no encontrado');

      const upload = tokenResult.rows[0];
      if (upload.used_at && upload.document_type !== 'registro_documentos') throw createError(410, 'Este enlace ya fue utilizado');
      if (new Date(upload.expires_at).getTime() < Date.now()) throw createError(410, 'Este enlace ya expiro');
      const isBloodCardCompletion = upload.document_type === 'completar_carnet';
      const validPdf = String(data.fileUrl || '').startsWith('data:application/pdf');
      const validBloodCardImage = /^data:image\/(jpeg|png);base64,/.test(String(data.fileUrl || ''));
      if (!validPdf && !(isBloodCardCompletion && validBloodCardImage)) {
        throw createError(422, isBloodCardCompletion ? 'Foto del carnet requerida' : 'PDF requerido');
      }
      const certificateFileUrl = data.certificateFileUrl || null;
      if (certificateFileUrl && !String(certificateFileUrl).startsWith('data:application/pdf')) {
        throw createError(422, 'El certificado debe enviarse como PDF');
      }

      let document = { rows: [{ file_url: data.fileUrl }] };
      if (upload.student_id && upload.document_type_id) {
        document = await client.query(
          `INSERT INTO student_documents (student_id, document_type_id, file_path, observations, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (student_id, document_type_id) DO UPDATE
           SET file_path = EXCLUDED.file_path, observations = EXCLUDED.observations, uploaded_at = NOW()
           RETURNING id, student_id, file_path AS file_url, uploaded_at`,
          [
            upload.student_id,
            upload.document_type_id,
            data.fileUrl,
            data.observations || 'Documento capturado desde telefono',
          ]
        );
      }

      await client.query(
        `UPDATE mobile_document_upload_tokens
         SET used_at = NOW(), file_url = $1, observations = $2, certificate_file_url = $3
         WHERE id = $4`,
        [data.fileUrl, data.observations || 'Documento capturado desde telefono', certificateFileUrl, upload.id]
      );
      await client.query('COMMIT');
      return document.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getMobileUploadResult(token, actor, global = false) {
    if (!actor?.id || !/^[a-f0-9]{64}$/i.test(token)) throw createError(404,'Enlace no encontrado');
    const result = await db.query(
      `SELECT token, document_type AS type, file_url AS "fileUrl",
        certificate_file_url AS "certificateFileUrl", observations,
          used_at AS "usedAt", expires_at AS "expiresAt", created_by
       FROM mobile_document_upload_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) throw createError(404, 'Enlace no encontrado');
    const upload = result.rows[0];
      if (!global && String(upload.created_by) !== String(actor.id)) throw createError(404,'Enlace no encontrado');
      if (new Date(upload.expiresAt).getTime() < Date.now()) throw createError(410, 'Este enlace ya expiro');
    return {
      completed: Boolean(upload.usedAt && upload.fileUrl),
      type: upload.type,
      fileUrl: upload.fileUrl || null,
      certificateFileUrl: upload.certificateFileUrl || null,
      includesCertificate: String(upload.observations || '').includes('CERTIFICATE_INCLUDED:true'),
      includesBloodCard: String(upload.observations || '').includes('BLOOD_CARD_INCLUDED:true'),
      usedAt: upload.usedAt,
    };
  }

}

module.exports = DocumentService;
