const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const CycleInstructorAssignmentService = require('./CycleInstructorAssignmentService');
const AutomaticCycleService = require('./AutomaticCycleService');
const TheoryCourseService = require('./TheoryCourseService');
const NotificationService = require('./NotificationService');
const CourseCycleCodeService = require('./CourseCycleCodeService');

const NORMAL_PRACTICAL_SLOTS = [
  ['06:00', '07:40'],
  ['08:00', '09:40'],
  ['10:00', '11:40'],
  ['12:00', '13:40'],
  ['14:00', '15:40'],
  ['16:00', '17:40'],
  ['18:00', '19:40'],
  ['20:00', '21:40'],
];

const INTENSIVE_PRACTICAL_SLOTS = {
  carro: [
    ['07:00', '10:10'],
    ['10:30', '13:50'],
    ['14:30', '17:50'],
  ],
  moto: [
    ['06:00', '08:30'],
    ['09:00', '11:30'],
    ['12:00', '14:30'],
    ['15:00', '17:30'],
    ['18:00', '20:30'],
  ],
};

function toDateString(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeTime(value) {
  return String(value || '').slice(0, 5);
}

async function resolveEnrollmentBranchId(branchId) {
  if (!branchId) return null;
  const result = await db.query(`
    SELECT COALESCE(reference.id, current.id) AS enrollment_branch_id
    FROM branches current
    LEFT JOIN branches reference
      ON current.code = 'SP_IC2'
     AND reference.code = 'SP_IC1'
     AND reference.city_id = current.city_id
     AND reference.active = TRUE
    WHERE current.id = $1
    LIMIT 1
  `, [branchId]);
  return result.rows[0]?.enrollment_branch_id || branchId;
}

async function resolveIntensiveBranchId(branchId, queryable = db) {
  if (!branchId) return null;
  const result = await queryable.query(`
    SELECT COALESCE(reference.id,current.id) intensive_branch_id
    FROM branches current
    LEFT JOIN branches reference
      ON current.code='SP_IC'
     AND reference.code='SP_IC1'
     AND reference.city_id=current.city_id
     AND reference.active=TRUE
    WHERE current.id=$1 LIMIT 1
  `,[branchId]);
  return result.rows[0]?.intensive_branch_id||branchId;
}

function parseTimeRange(time) {
  const [startTime, endTime] = String(time || '').split('-').map(value => value.trim().slice(0, 5));
  if (!startTime || !endTime) throw createError(422, 'Horario invalido');
  return { startTime, endTime };
}

function businessDates(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${toDateString(startDate)}T00:00:00`);
  const end = new Date(`${toDateString(endDate)}T00:00:00`);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function cycleDates(cycle) {
  if (Array.isArray(cycle.schedule_templates) && cycle.schedule_templates.length) {
    const allowedDays = new Set(cycle.schedule_templates.map(slot => Number(slot.day_of_week)));
    const dates=[];const cursor=new Date(`${toDateString(cycle.start_date)}T00:00:00`),end=new Date(`${toDateString(cycle.end_date)}T00:00:00`);
    while(cursor<=end){if(allowedDays.has(cursor.getDay()))dates.push(toDateString(cursor));cursor.setDate(cursor.getDate()+1);}return dates;
  }
  if (cycle.modality === 'intensivo') {
    const start = new Date(`${toDateString(cycle.start_date)}T00:00:00`);
    const offsets = cycle.vehicle_type === 'carro' ? [0, 1, 7, 8] : [0, 1, 7];
    return offsets.map(offset => {
      const date = new Date(start);
      date.setDate(date.getDate() + offset);
      return toDateString(date);
    });
  }
  return businessDates(cycle.start_date, cycle.end_date);
}

function practicalCycleDates(cycle, requestedStartDate = null) {
  const officialDates = cycleDates(cycle);
  if (!requestedStartDate || cycle.modality !== 'normal') return officialDates;

  const officialStart = toDateString(cycle.start_date);
  const practicalStart = toDateString(requestedStartDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(practicalStart)) return officialDates;

  const required = Math.max(Number(cycle.duration_business_days) || officialDates.length || 1, 1);
  const allowedDays = new Set(
    Array.isArray(cycle.schedule_templates) && cycle.schedule_templates.length
      ? cycle.schedule_templates.map(slot => Number(slot.day_of_week))
      : [1, 2, 3, 4, 5]
  );
  const dates = [];
  const cursor = new Date(`${practicalStart}T12:00:00`);
  let guard = 0;
  while (dates.length < required && guard < 60) {
    if (allowedDays.has(cursor.getDay())) dates.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates.length === required ? dates : officialDates;
}

function practicalSlots(cycle) {
  if (Array.isArray(cycle.schedule_templates) && cycle.schedule_templates.length) {
    const unique = new Map(cycle.schedule_templates.map(slot => [`${normalizeTime(slot.start_time)}-${normalizeTime(slot.end_time)}`, [normalizeTime(slot.start_time), normalizeTime(slot.end_time)]]));
    return [...unique.values()];
  }
  return cycle.modality === 'intensivo'
    ? INTENSIVE_PRACTICAL_SLOTS[cycle.vehicle_type]
    : NORMAL_PRACTICAL_SLOTS;
}

function benitoWeeklyStartDate(officialStartDate) {
  const base = new Date('2026-09-14T12:00:00');
  const official = new Date(`${toDateString(officialStartDate)}T12:00:00`);
  if (official <= base) return toDateString(official);
  const elapsedDays = Math.floor((official - base) / 86400000);
  const start = new Date(base);
  start.setDate(start.getDate() + Math.floor(elapsedDays / 7) * 7);
  return toDateString(start);
}

function addBusinessDays(startDate, daysToAdd) {
  const date = new Date(`${toDateString(startDate)}T00:00:00`);
  let remaining = Number(daysToAdd) || 0;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
  }
  return toDateString(date);
}

function addCalendarDays(startDate, daysToAdd) {
  const date = new Date(`${toDateString(startDate)}T12:00:00`);
  date.setDate(date.getDate() + (Number(daysToAdd) || 0));
  return toDateString(date);
}

function nextBusinessDay(value) {
  return addBusinessDays(value, 1);
}

function nextMotoStart(value) {
  const date = new Date(`${toDateString(value)}T00:00:00`);
  do {
    date.setDate(date.getDate() + 1);
  } while (![1, 3, 5].includes(date.getDay()));
  return toDateString(date);
}

function nextSaturday(value = new Date()) {
  const date = new Date(`${toDateString(value)}T12:00:00`);
  while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
  return toDateString(date);
}

function intensiveEndDate(startDate, vehicleType) {
  const date = new Date(`${toDateString(startDate)}T12:00:00`);
  date.setDate(date.getDate() + (vehicleType === 'carro' ? 8 : 7));
  return toDateString(date);
}

class CourseCycleService {
  static async ensureIntensiveRotation(user, filters = {}) {
    let branchId = filters.branch_id || user.branch_id;
    const vehicleType = filters.vehicle_type;
    if (!branchId || !['carro', 'moto'].includes(vehicleType)) return null;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      // REGLA PROTEGIDA: Manta 2000 conserva ciclos normales propios, pero los
      // intensivos de fin de semana consumen la rotacion central de Flavio Reyes.
      branchId = await resolveIntensiveBranchId(branchId, client);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `intensive-rotation:${branchId}:${vehicleType}`,
      ]);
      const program = (await client.query(`
        SELECT p.id,p.course_id,GREATEST(p.capacity_per_instructor,1)::int capacity_per_instructor
        FROM branch_course_programs p
        JOIN courses c ON c.id=p.course_id AND c.active=TRUE
        WHERE p.branch_id=$1 AND p.vehicle_type=$2 AND p.intensive_enabled=TRUE
        LIMIT 1
      `, [branchId, vehicleType])).rows[0];
      if (!program) {
        await client.query('COMMIT');
        return null;
      }

      const pool = (await client.query(`
        SELECT ip.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name
        FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id AND u.active=TRUE
        JOIN branches home ON home.id=u.branch_id
        JOIN branches target ON target.id=$1 AND target.city_id=home.city_id
        JOIN instructor_course_capabilities capability
          ON capability.instructor_id=ip.id AND capability.course_id=$3 AND capability.active=TRUE
        LEFT JOIN LATERAL (
          SELECT priority.practice_area
          FROM instructor_branch_priorities priority
          WHERE priority.instructor_id=ip.id AND priority.branch_id=$1 AND priority.active=TRUE
            AND priority.effective_from<=CURRENT_DATE
            AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
          LIMIT 1
        ) scoped ON TRUE
        LEFT JOIN branch_course_intensive_rotation configured_rotation
          ON configured_rotation.program_id=$4 AND configured_rotation.instructor_id=ip.id AND configured_rotation.active=TRUE
        WHERE ip.status='activo' AND ip.deleted_at IS NULL
          AND COALESCE(ip.weekend_practice_area,scoped.practice_area,ip.practice_area)=$2
          AND (u.branch_id=$1 OR scoped.practice_area IS NOT NULL)
        ORDER BY LOWER(translate(COALESCE(u.first_name,''),'ÁÉÍÓÚÑáéíóúñ','AEIOUNaeioun')),
          LOWER(translate(COALESCE(u.last_name,''),'ÁÉÍÓÚÑáéíóúñ','AEIOUNaeioun')),ip.id
      `, [branchId, vehicleType, program.course_id, program.id])).rows;
      const configuredRotation = (await client.query(`SELECT instructor_id,position_order
        FROM branch_course_intensive_rotation WHERE program_id=$1 AND active=TRUE ORDER BY position_order`,[program.id])).rows;
      if(configuredRotation.length){
        const configuredOrder=new Map(configuredRotation.map(item=>[String(item.instructor_id),Number(item.position_order)]));
        pool.sort((left,right)=>(configuredOrder.get(String(left.id))??Number.MAX_SAFE_INTEGER)-(configuredOrder.get(String(right.id))??Number.MAX_SAFE_INTEGER));
      }
      if (!pool.length) {
        await client.query('COMMIT');
        return null;
      }

      const slotCount = INTENSIVE_PRACTICAL_SLOTS[vehicleType].length;
      let startDate = nextSaturday(new Date());
      let previousInstructorId = null;
      if (String(filters.extend || '').toLowerCase() === 'true') {
        const latestPublished = (await client.query(`
          SELECT rotation.start_date,rotation.instructor_id
          FROM intensive_instructor_rotation_assignments rotation
          JOIN course_cycles cc ON cc.id=rotation.cycle_id
          WHERE rotation.branch_id=$1 AND rotation.vehicle_type=$2
            AND rotation.active=TRUE AND rotation.cycle_id IS NOT NULL
            AND cc.active=TRUE AND cc.deleted_at IS NULL
            AND cc.status IN ('activo','proximo') AND cc.start_date>=CURRENT_DATE
          ORDER BY rotation.start_date DESC,rotation.position_order DESC
          LIMIT 1
        `, [branchId, vehicleType])).rows[0];
        if (latestPublished) {
          const nextStart = new Date(`${toDateString(latestPublished.start_date)}T12:00:00`);
          nextStart.setDate(nextStart.getDate() + 7);
          startDate = toDateString(nextStart);
          previousInstructorId = latestPublished.instructor_id;
        }
      }
      for (let weekendGuard = 0; weekendGuard < 12; weekendGuard += 1) {
        const weekendOverride = (await client.query(`
          SELECT override.id,override.instructor_count,
            COALESCE(json_agg(json_build_object('instructor_id',selected.instructor_id,'position_order',selected.position_order)
              ORDER BY selected.position_order) FILTER (WHERE selected.instructor_id IS NOT NULL),'[]') instructors
          FROM branch_course_weekend_overrides override
          LEFT JOIN branch_course_weekend_override_instructors selected ON selected.override_id=override.id
          WHERE override.program_id=$1 AND override.start_date=$2::date AND override.active=TRUE
          GROUP BY override.id
        `, [program.id, startDate])).rows[0];
        let assignments = (await client.query(`
          SELECT rotation.id,rotation.position_order,rotation.instructor_id,rotation.cycle_id,
            TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name
          FROM intensive_instructor_rotation_assignments rotation
          JOIN instructor_profiles ip ON ip.id=rotation.instructor_id
          JOIN users u ON u.id=ip.user_id
          WHERE rotation.branch_id=$1 AND rotation.vehicle_type=$2
            AND rotation.start_date=$3::date AND rotation.active=TRUE
          ORDER BY rotation.position_order
        `, [branchId, vehicleType, startDate])).rows;

        const ensureAssignment = async (positionOrder) => {
          const forcedInstructorId = weekendOverride?.instructors?.find(item => Number(item.position_order) === positionOrder)?.instructor_id;
          const lastUsed = previousInstructorId || (await client.query(`
            SELECT instructor_id FROM intensive_instructor_rotation_assignments
            WHERE branch_id=$1 AND vehicle_type=$2 AND active=TRUE
              AND (start_date<$3::date OR (start_date=$3::date AND position_order<$4))
            ORDER BY start_date DESC,position_order DESC LIMIT 1
          `, [branchId, vehicleType, startDate, positionOrder])).rows[0]?.instructor_id;
          const lastIndex = pool.findIndex(item => String(item.id) === String(lastUsed));
          const selected = forcedInstructorId
            ? pool.find(item => String(item.id) === String(forcedInstructorId))
            : pool[(lastIndex + 1 + pool.length) % pool.length];
          if (!selected) throw createError(422, `El instructor configurado para ${startDate} ya no está habilitado`);
          const inserted = (await client.query(`
            INSERT INTO intensive_instructor_rotation_assignments(
              branch_id,vehicle_type,start_date,position_order,instructor_id,created_by
            ) VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(branch_id,vehicle_type,start_date,position_order)
            DO UPDATE SET instructor_id=EXCLUDED.instructor_id,active=TRUE,updated_at=NOW()
            RETURNING *
          `, [branchId, vehicleType, startDate, positionOrder, selected.id, user.id || null])).rows[0];
          previousInstructorId = selected.id;
          return { ...inserted, instructor_name: selected.name };
        };

        const targetInstructorCount = weekendOverride ? Number(weekendOverride.instructor_count) : 1;
        if (weekendOverride) assignments = assignments.filter(item => Number(item.position_order) <= targetInstructorCount);
        for (let position = 1; position <= targetInstructorCount; position += 1) {
          const expectedInstructorId = weekendOverride?.instructors?.find(item => Number(item.position_order) === position)?.instructor_id;
          const current = assignments.find(item => Number(item.position_order) === position);
          if (!current || (expectedInstructorId && String(current.instructor_id) !== String(expectedInstructorId))) {
            const replacement = await ensureAssignment(position);
            assignments = assignments.filter(item => Number(item.position_order) !== position).concat(replacement)
              .sort((a, b) => Number(a.position_order) - Number(b.position_order));
          }
        }
        if (!assignments.length) assignments = [await ensureAssignment(1)];
        const usableCycleIds = [];
        for (let index = 0; index < assignments.length; index += 1) {
          const assignment = assignments[index];
          let cycleId = assignment.cycle_id;
          if (!cycleId) {
            const code = await CourseCycleCodeService.nextCode(client, {
              branchId,
              vehicleType,
              startDate,
            });
            const cycle = (await client.query(`
              INSERT INTO course_cycles(
                branch_id,course_id,group_id,code,modality,vehicle_type,start_date,end_date,
                duration_business_days,capacity_per_instructor,published_capacity,status,notes,active,created_by
              ) VALUES($1,$2,NULL,$3,'intensivo',$4,$5,$6,$7,$8,$8,'proximo',$9,TRUE,$10)
              ON CONFLICT(branch_id,code) DO UPDATE SET active=TRUE,deleted_at=NULL,
                duration_business_days=EXCLUDED.duration_business_days,end_date=EXCLUDED.end_date,
                capacity_per_instructor=EXCLUDED.capacity_per_instructor,
                published_capacity=EXCLUDED.published_capacity,updated_at=NOW()
              RETURNING id
            `, [branchId, program.course_id, code, vehicleType, startDate,
              intensiveEndDate(startDate, vehicleType), vehicleType === 'carro' ? 4 : 3,
              program.capacity_per_instructor,
              `Rotacion intensiva alfabetica · turno ${assignment.position_order}`,
              user.id || null])).rows[0];
            cycleId = cycle.id;
            await client.query(`
              INSERT INTO course_cycle_instructors(cycle_id,instructor_id,role,active)
              VALUES($1,$2,'practico',TRUE)
              ON CONFLICT(cycle_id,instructor_id) DO UPDATE SET active=TRUE,updated_at=NOW()
            `, [cycleId, assignment.instructor_id]);
            await client.query(`UPDATE intensive_instructor_rotation_assignments
              SET cycle_id=$2,updated_at=NOW() WHERE id=$1`, [assignment.id, cycleId]);
          }

          const used = Number((await client.query(`
            SELECT COUNT(DISTINCT seat_key)::int used FROM (
              SELECT enrollment_id::text seat_key FROM course_cycle_schedule_assignments
              WHERE cycle_id=$1 AND status='activo'
              UNION
              SELECT COALESCE(enrollment_id::text,id::text) seat_key
              FROM course_cycle_seat_reservations WHERE cycle_id=$1 AND status='activo'
            ) seats
          `, [cycleId])).rows[0].used);
          const full = used >= program.capacity_per_instructor * slotCount;
          if (!full) {
            usableCycleIds.push(cycleId);
            if (weekendOverride && index < assignments.length - 1) continue;
            await client.query('COMMIT');
            return { cycleIds: usableCycleIds, startDate };
          }
          previousInstructorId = assignment.instructor_id;
        }

        if (!weekendOverride && assignments.length < 2) {
          assignments.push(await ensureAssignment(2));
          continue;
        }
        const next = new Date(`${startDate}T12:00:00`);
        next.setDate(next.getDate() + 7);
        startDate = toDateString(next);
      }
      throw createError(409, 'No fue posible encontrar cupos en la rotacion intensiva');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async previewInstructor(user, data = {}) {
    return CycleInstructorAssignmentService.previewForSchedule(user, data);
  }

  static async ensureReferredIntensiveCycle(user, filters = {}) {
    const branchId = filters.branch_id || user.branch_id;
    const instructorId = filters.instructor_id;
    const vehicleType = filters.vehicle_type;
    if (!branchId || !instructorId || !['carro', 'moto'].includes(vehicleType)) return;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`referred-intensive:${branchId}:${vehicleType}:${instructorId}`]);
      const eligible = await client.query(`SELECT p.course_id,p.capacity_per_instructor
        FROM branch_course_programs p
        JOIN branches target ON target.id=p.branch_id
        JOIN instructor_profiles ip ON ip.id=$3 AND ip.status='activo' AND ip.deleted_at IS NULL
        JOIN users u ON u.id=ip.user_id AND u.active=TRUE
        JOIN branches home ON home.id=u.branch_id AND home.city_id=target.city_id
        JOIN instructor_course_capabilities icc ON icc.instructor_id=ip.id AND icc.course_id=p.course_id AND icc.active=TRUE
        LEFT JOIN LATERAL (
          SELECT rule.practice_area FROM instructor_branch_priorities rule
          WHERE rule.instructor_id=ip.id AND rule.branch_id=$1 AND rule.assignment_type='priority'
            AND rule.active=TRUE AND rule.effective_from<=CURRENT_DATE
            AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
          LIMIT 1
        ) scoped_priority ON TRUE
        WHERE p.branch_id=$1 AND p.vehicle_type=$2
          AND (COALESCE(scoped_priority.practice_area,ip.practice_area)='mixto'
            OR COALESCE(scoped_priority.practice_area,ip.practice_area)=$2)
        LIMIT 1`, [branchId, vehicleType, instructorId]);
      if (!eligible.rows.length) { await client.query('COMMIT'); return; }

      const start = new Date(`${toDateString(new Date())}T00:00:00`);
      do start.setDate(start.getDate() + 1); while (start.getDay() !== 6);
      const startDate = toDateString(start);
      const end = new Date(`${startDate}T00:00:00`);
      end.setDate(end.getDate() + (vehicleType === 'carro' ? 7 : 14));
      const endDate = toDateString(end);
      const existingCycle = await client.query(`
        SELECT cycle.id
        FROM course_cycles cycle
        JOIN course_cycle_instructors instructor ON instructor.cycle_id=cycle.id
          AND instructor.instructor_id=$4 AND instructor.active=TRUE
        WHERE cycle.branch_id=$1 AND cycle.vehicle_type=$2 AND cycle.modality='intensivo'
          AND cycle.start_date=$3 AND cycle.active=TRUE AND cycle.deleted_at IS NULL
        LIMIT 1
      `, [branchId, vehicleType, startDate, instructorId]);
      if (existingCycle.rows.length) {
        await client.query('COMMIT');
        return;
      }
      const code = await CourseCycleCodeService.nextCode(client, {
        branchId,
        vehicleType,
        startDate,
      });
      const cycle = await client.query(`INSERT INTO course_cycles(
          branch_id,course_id,group_id,code,modality,vehicle_type,start_date,end_date,
          duration_business_days,capacity_per_instructor,published_capacity,status,notes,active,created_by)
        VALUES($1,$2,NULL,$3,'intensivo',$4,$5,$6,$7,1,1,'proximo',$8,TRUE,$9)
        ON CONFLICT(branch_id,code) DO UPDATE SET active=TRUE,deleted_at=NULL,status='proximo',updated_at=NOW()
        RETURNING id`, [branchId, eligible.rows[0].course_id, code, vehicleType, startDate, endDate,
        vehicleType === 'carro' ? 3 : 5, 'Intensivo referido creado bajo demanda', user.id || null]);
      await client.query(`INSERT INTO course_cycle_instructors(cycle_id,instructor_id,role,active)
        VALUES($1,$2,'practico',TRUE)
        ON CONFLICT(cycle_id,instructor_id) DO UPDATE SET role='practico',active=TRUE,updated_at=NOW()`, [cycle.rows[0].id, instructorId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async ensureUpcomingCycle(user, filters = {}) {
    const branchId = filters.branch_id || user.branch_id;
    if ((filters.modality || 'normal') === 'intensivo' && filters.instructor_id) {
      await this.ensureReferredIntensiveCycle(user, filters);
    }
    if (branchId) await AutomaticCycleService.ensureForBranch(branchId, user.id, {
      vehicleType: filters.vehicle_type,
      forceNext: String(filters.extend || '').toLowerCase() === 'true',
    });
    const vehicleType = filters.vehicle_type;
    const modality = filters.modality || 'normal';
    if (!branchId || !['carro', 'moto'].includes(vehicleType)) return;

    // Cuando una sucursal usa programación configurable, los ciclos se
    // publican explícitamente desde Administración y no con reglas heredadas.
    const configured = await db.query(`SELECT p.assignment_mode,p.automatic_cycles FROM branch_course_programs p
      JOIN courses c ON c.id=p.course_id
      WHERE p.branch_id=$1 AND p.vehicle_type=$2 AND c.active=TRUE LIMIT 1`, [branchId, vehicleType]);
    const extendRequested = String(filters.extend || '').toLowerCase() === 'true';
    if (configured.rows.length
      && (configured.rows[0].assignment_mode === 'groups'
        || (!configured.rows[0].automatic_cycles && !extendRequested))) return;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `next-course-cycle:${branchId}:${vehicleType}:${modality}`,
      ]);

      if (String(filters.extend || '').toLowerCase() === 'true') {
        const published = await client.query(`
          SELECT COUNT(*)::int total
          FROM course_cycles
          WHERE branch_id=$1 AND vehicle_type=$2 AND modality=$3
            AND active=TRUE AND deleted_at IS NULL
            AND status IN ('activo','proximo') AND end_date>=CURRENT_DATE
        `, [branchId, vehicleType, modality]);
        if (Number(published.rows[0]?.total || 0) >= 6) {
          await client.query('COMMIT');
          return;
        }
      }

      const upcoming = await client.query(`
        SELECT id FROM course_cycles
        WHERE branch_id = $1 AND vehicle_type = $2 AND modality = $3
          AND active = true AND deleted_at IS NULL
          AND status IN ('activo', 'proximo') AND start_date > CURRENT_DATE
        LIMIT 1
      `, [branchId, vehicleType, modality]);
      if (upcoming.rows.length && String(filters.extend || '').toLowerCase() !== 'true') {
        await client.query('COMMIT');
        return;
      }

      const templateResult = await client.query(`
        SELECT * FROM course_cycles
        WHERE branch_id = $1 AND vehicle_type = $2
          AND active = true AND deleted_at IS NULL
        ORDER BY (modality = $3) DESC, end_date DESC, created_at DESC
        LIMIT 1
      `, [branchId, vehicleType, modality]);
      if (!templateResult.rows.length) {
        await client.query('COMMIT');
        return;
      }

      const template = templateResult.rows[0];
      const today = toDateString(new Date());
      const duration = modality === 'intensivo'
        ? (vehicleType === 'carro' ? 4 : 3)
        : (vehicleType === 'carro' ? 8 : 5);
      let startDate = vehicleType === 'moto' && modality === 'normal'
        ? nextMotoStart(template.end_date)
        : nextBusinessDay(template.end_date);

      if (modality === 'intensivo') {
        const cursor = new Date(`${startDate}T00:00:00`);
        while (cursor.getDay() !== 6 || toDateString(cursor) <= today) cursor.setDate(cursor.getDate() + 1);
        startDate = toDateString(cursor);
      }

      if (vehicleType === 'moto' && modality === 'normal') {
        while (startDate <= today) startDate = nextMotoStart(startDate);
      } else {
        while (startDate <= today) {
          startDate = nextBusinessDay(addBusinessDays(startDate, duration - 1));
        }
      }

      let endDate;
      if (modality === 'intensivo') {
        const end = new Date(`${startDate}T00:00:00`);
        end.setDate(end.getDate() + (vehicleType === 'carro' ? 8 : 7));
        endDate = toDateString(end);
      } else {
        endDate = addBusinessDays(startDate, duration - 1);
      }
      const code = await CourseCycleCodeService.nextCode(client, {
        branchId,
        vehicleType,
        startDate,
      });
      const inserted = await client.query(`
        INSERT INTO course_cycles (
          branch_id, course_id, group_id, code, modality, vehicle_type,
          start_date, end_date, duration_business_days, capacity_per_instructor,
          status, notes, active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                  'proximo', $11, true, $12)
        ON CONFLICT (branch_id, code) DO UPDATE SET
          active = true, deleted_at = NULL, status = 'proximo', updated_at = NOW()
        RETURNING id
      `, [
        branchId, template.course_id, template.group_id, code, modality, vehicleType,
        startDate, endDate, duration, template.capacity_per_instructor,
        `Ciclo generado automáticamente: ${duration} días laborables. El último día corresponde a exámenes.`,
        user.id || null,
      ]);

      await client.query(`
        INSERT INTO course_cycle_instructors (cycle_id, instructor_id, role, active)
        SELECT $1, source.instructor_id, source.role, true
        FROM course_cycle_instructors source
        JOIN instructor_profiles profile ON profile.id=source.instructor_id
        WHERE source.cycle_id = $2 AND source.active = true
          AND profile.status='activo' AND profile.deleted_at IS NULL
          AND (profile.practice_area='mixto' OR profile.practice_area=$3)
        ON CONFLICT (cycle_id, instructor_id) DO UPDATE SET active = true, updated_at = NOW()
      `, [inserted.rows[0].id, template.id, vehicleType]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async listCycles(user, filters = {}) {
    const params = [];
    let where = `cc.active = true AND cc.deleted_at IS NULL`;

    const branchId = filters.branch_id || user.branch_id;
    if (branchId) {
      params.push(branchId);
      where += ` AND cc.branch_id = $${params.length}`;
    }

    if (filters.vehicle_type) {
      params.push(filters.vehicle_type);
      where += ` AND cc.vehicle_type = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      where += ` AND cc.status = $${params.length}`;
    }

    const result = await db.query(`
      SELECT cc.id, cc.code, cc.modality, cc.vehicle_type, cc.start_date, cc.end_date,
             cc.duration_business_days, cc.capacity_per_instructor, cc.status, cc.notes,
             c.name AS course_name,
             b.name AS branch_name,
             ig.code AS group_code,
             ig.name AS group_name,
             COALESCE((SELECT json_build_object('regular',s.regular_enabled,'saturday',s.saturday_enabled,'virtual',s.virtual_enabled)
               FROM branch_theory_settings s WHERE s.branch_id=cc.branch_id),
               json_build_object('regular',TRUE,'saturday',TRUE,'virtual',TRUE)) AS theory_options,
             COUNT(DISTINCT cci.instructor_id)::int AS cycle_instructors,
             COUNT(DISTINCT igm.instructor_id)::int AS group_instructors,
             GREATEST((cc.end_date - CURRENT_DATE), 0)::int AS days_until_end
      FROM course_cycles cc
      JOIN courses c ON c.id = cc.course_id
      JOIN branches b ON b.id = cc.branch_id
      JOIN branch_course_programs program ON program.branch_id=cc.branch_id AND program.course_id=cc.course_id
      LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
      LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
      LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
      WHERE ${where}
        AND (cc.modality='intensivo'
          OR (program.assignment_mode='individual' AND cc.group_id IS NULL)
          OR (program.assignment_mode='groups' AND cc.group_id IS NOT NULL))
      GROUP BY cc.id, c.id, b.id, ig.id
      ORDER BY
        CASE cc.status
          WHEN 'por_terminar' THEN 0
          WHEN 'activo' THEN 1
          WHEN 'proximo' THEN 2
          ELSE 3
        END,
        cc.start_date,
        cc.code
    `, params);

    return result.rows.map(row => ({
      id: row.id,
      code: row.code,
      course: row.course_name,
      branch: row.branch_name,
      modality: row.modality,
      vehicleType: row.vehicle_type,
      startDate: toDateString(row.start_date),
      endDate: toDateString(row.end_date),
      durationBusinessDays: Number(row.duration_business_days),
      capacityPerInstructor: Number(row.capacity_per_instructor),
      status: row.status,
      group: row.group_code ? {
        code: row.group_code,
        name: row.group_name,
        instructors: Number(row.group_instructors),
      } : null,
      cycleInstructors: Number(row.cycle_instructors),
      daysUntilEnd: Number(row.days_until_end),
      notes: row.notes,
    }));
  }

  static async getDashboard(user, filters = {}) {
    const cycles = await this.listCycles(user, filters);
    return {
      active: cycles.filter(cycle => cycle.status === 'activo' || cycle.status === 'por_terminar'),
      upcoming: cycles.filter(cycle => cycle.status === 'proximo'),
      finished: cycles.filter(cycle => cycle.status === 'finalizado'),
    };
  }

  static async getEnrollmentOptions(user, filters = {}) {
    await db.query('SELECT expire_course_cycle_seat_reservations()');
    // REGLA PROTEGIDA: las matrículas atendidas desde Shopin consumen la oferta
    // académica, ciclos y cupos de Flavio Reyes, sin cambiar la sede de registro.
    const requestedBranchId = filters.branch_id || user.branch_id;
    const enrollmentBranchId = await resolveEnrollmentBranchId(requestedBranchId);
    const operationalBranchId = filters.modality === 'intensivo'
      ? await resolveIntensiveBranchId(enrollmentBranchId)
      : enrollmentBranchId;
    filters = { ...filters, branch_id: operationalBranchId };
    const intensiveRotation = filters.modality === 'intensivo'
      ? await this.ensureIntensiveRotation(user, filters)
      : null;
    if (!intensiveRotation) await this.ensureUpcomingCycle(user, filters);
    if (intensiveRotation) {
      // La rotacion garantiza que exista al menos un curso utilizable, pero la
      // navegacion debe recibir tambien los siguientes cursos ya publicados.
      // Limitar la respuesta al primer ciclo dejaba el boton "Proximo" sin un
      // destino aunque la siguiente fecha ya estuviera configurada.
      const branchId = filters.branch_id || user.branch_id;
      const publishedRotation = await db.query(`
        SELECT DISTINCT rotation.cycle_id,cc.start_date,rotation.position_order
        FROM intensive_instructor_rotation_assignments rotation
        JOIN course_cycles cc ON cc.id=rotation.cycle_id
        WHERE rotation.branch_id=$1 AND rotation.vehicle_type=$2
          AND rotation.active=TRUE AND rotation.cycle_id IS NOT NULL
          AND cc.active=TRUE AND cc.deleted_at IS NULL
          AND cc.status IN ('activo','proximo') AND CURRENT_DATE<=cc.start_date+2
        ORDER BY cc.start_date,rotation.position_order
      `, [branchId, filters.vehicle_type]);
      intensiveRotation.cycleIds = [...new Set([
        ...(intensiveRotation.cycleIds || []),
        ...publishedRotation.rows.map(row => row.cycle_id),
      ])];
      filters = { ...filters, instructor_id: null };
    }
    const params = [];
    let where = `
      cc.active = true
      AND cc.deleted_at IS NULL
      AND cc.status IN ('activo', 'proximo')
      -- REGLA PROTEGIDA: una matricula nueva admite como maximo los dos dias
      -- posteriores al inicio. No reemplazar esta condicion por end_date.
      AND CURRENT_DATE <= cc.start_date + 2
      AND EXISTS (SELECT 1 FROM branch_courses bc WHERE bc.branch_id=cc.branch_id AND bc.course_id=cc.course_id AND bc.active=TRUE)
    `;

    const branchId = filters.branch_id || user.branch_id;
    if (branchId) {
      params.push(branchId);
      where += ` AND cc.branch_id = $${params.length}`;
    }

    if (filters.vehicle_type) {
      params.push(filters.vehicle_type);
      where += ` AND cc.vehicle_type = $${params.length}`;
    }

    if (filters.modality) {
      params.push(filters.modality);
      where += ` AND cc.modality = $${params.length}`;
    }

    if (filters.course_id) {
      params.push(filters.course_id);
      where += ` AND cc.course_id = $${params.length}`;
    }

    if (intensiveRotation?.cycleIds?.length) {
      params.push(intensiveRotation.cycleIds);
      where += ` AND cc.id = ANY($${params.length}::uuid[])`;
    }

    if (filters.instructor_id) {
      params.push(filters.instructor_id);
      where += ` AND (
        EXISTS (
          SELECT 1 FROM course_cycle_instructors selected_cci
          WHERE selected_cci.cycle_id = cc.id
            AND selected_cci.instructor_id = $${params.length}
            AND selected_cci.active = true
        )
        OR EXISTS (
          SELECT 1 FROM instructor_group_members selected_igm
          WHERE selected_igm.group_id = cc.group_id
            AND selected_igm.instructor_id = $${params.length}
            AND selected_igm.active = true
        )
        OR EXISTS (
          SELECT 1
          FROM instructor_profiles selected_ip
          JOIN users selected_user ON selected_user.id=selected_ip.user_id AND selected_user.active=TRUE
          JOIN branches selected_home ON selected_home.id=selected_user.branch_id
          JOIN branches selected_target ON selected_target.id=cc.branch_id AND selected_target.city_id=selected_home.city_id
          JOIN instructor_course_capabilities selected_capability
            ON selected_capability.instructor_id=selected_ip.id
            AND selected_capability.course_id=cc.course_id
            AND selected_capability.active=TRUE
          WHERE selected_ip.id=$${params.length}
            AND selected_ip.status='activo' AND selected_ip.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM instructor_branch_priorities selected_priority
              WHERE selected_priority.instructor_id=selected_ip.id
                AND selected_priority.assignment_type='priority'
                AND selected_priority.active=TRUE
                AND selected_priority.effective_from<=CURRENT_DATE
                AND (selected_priority.effective_until IS NULL OR selected_priority.effective_until>=CURRENT_DATE)
                AND selected_priority.branch_id<>cc.branch_id
            )
        )
      )`;
    }

    const result = await db.query(`
      SELECT cc.id, cc.branch_id, cc.code, cc.modality, cc.vehicle_type, cc.start_date, cc.end_date,
             cc.duration_business_days, cc.status, cc.capacity_per_instructor,
             cc.published_capacity,
             c.name AS course_name,
             b.name AS branch_name,
             ig.code AS group_code,
             ig.name AS group_name,
             COALESCE(
               (SELECT json_agg(json_build_object('id', group_ip.id, 'name', TRIM(group_u.first_name || ' ' || group_u.last_name)) ORDER BY group_igm.position_order, group_u.first_name, group_u.last_name)
                FROM instructor_group_members group_igm
                JOIN instructor_profiles group_ip ON group_ip.id = group_igm.instructor_id AND group_ip.deleted_at IS NULL
                JOIN users group_u ON group_u.id = group_ip.user_id AND group_u.active = TRUE
                WHERE group_igm.group_id = cc.group_id AND group_igm.active = TRUE
                  AND group_igm.ended_at IS NULL),
               (SELECT json_agg(json_build_object('id', assigned_ip.id, 'name', TRIM(assigned_u.first_name || ' ' || assigned_u.last_name)) ORDER BY assigned_cci.created_at, assigned_u.first_name, assigned_u.last_name)
                FROM course_cycle_instructors assigned_cci
                JOIN instructor_profiles assigned_ip ON assigned_ip.id = assigned_cci.instructor_id AND assigned_ip.deleted_at IS NULL
                JOIN users assigned_u ON assigned_u.id = assigned_ip.user_id AND assigned_u.active = TRUE
                WHERE assigned_cci.cycle_id = cc.id AND assigned_cci.active = TRUE),
               '[]'::json
             ) AS instructors,
             COALESCE((
               SELECT json_build_object(
                 'regular', settings.regular_enabled,
                 'saturday', settings.saturday_enabled,
                 'virtual', settings.virtual_enabled
               )
               FROM branch_theory_settings settings
               WHERE settings.branch_id = cc.branch_id
             ), json_build_object('regular', TRUE, 'saturday', TRUE, 'virtual', TRUE)) AS theory_options,
             LEAST(
               COALESCE(cc.published_capacity, 2147483647),
               COALESCE(NULLIF(COUNT(DISTINCT igm.instructor_id), 0), NULLIF(COUNT(DISTINCT cci.instructor_id), 0), 1)
                 * GREATEST(cc.capacity_per_instructor, 1)
             )::int AS slot_capacity,
             (SELECT json_agg(json_build_object('day_of_week',t.day_of_week,'start_time',t.start_time,'end_time',t.end_time)) FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE WHERE p.branch_id=cc.branch_id AND p.course_id=cc.course_id AND t.modality=cc.modality) schedule_templates
      FROM course_cycles cc
      JOIN courses c ON c.id = cc.course_id
      JOIN branches b ON b.id = cc.branch_id
      JOIN branch_course_programs program ON program.branch_id=cc.branch_id AND program.course_id=cc.course_id
      LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
      LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
      LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
      WHERE ${where}
        AND (cc.modality='intensivo'
          OR (program.assignment_mode='individual' AND cc.group_id IS NULL)
          OR (program.assignment_mode='groups' AND cc.group_id IS NOT NULL))
      GROUP BY cc.id, c.id, b.id, ig.id
      ORDER BY cc.start_date, cc.vehicle_type, cc.code
    `, params);

    const cycleIds = result.rows.map(row => row.id);
    const instructorRulesResult = cycleIds.length ? await db.query(`
      SELECT DISTINCT cc.id cycle_id,member.instructor_id,priority_rule.branch_id priority_branch_id,
        COALESCE(priority_rule.allowed_slots,'[]'::jsonb) allowed_slots
      FROM course_cycles cc
      LEFT JOIN LATERAL (
        SELECT igm.instructor_id FROM instructor_group_members igm
        WHERE igm.group_id=cc.group_id AND igm.active=TRUE AND igm.ended_at IS NULL
        UNION
        SELECT cci.instructor_id FROM course_cycle_instructors cci
        WHERE cci.cycle_id=cc.id AND cci.active=TRUE
          AND NOT EXISTS (SELECT 1 FROM instructor_group_members selected_igm
            WHERE selected_igm.group_id=cc.group_id AND selected_igm.active=TRUE
              AND selected_igm.ended_at IS NULL)
      ) member ON TRUE
      LEFT JOIN LATERAL (SELECT rule.branch_id,rule.allowed_slots FROM instructor_branch_priorities rule
        WHERE rule.instructor_id=member.instructor_id AND rule.assignment_type='priority' AND rule.active=TRUE
          AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
        ORDER BY (rule.branch_id=cc.branch_id) DESC,rule.updated_at DESC LIMIT 1) priority_rule ON TRUE
      WHERE cc.id=ANY($1::uuid[]) AND member.instructor_id IS NOT NULL
    `,[cycleIds]) : {rows:[]};
    const instructorRules = new Map();
    instructorRulesResult.rows.forEach(rule=>{const values=instructorRules.get(rule.cycle_id)||[];values.push(rule);instructorRules.set(rule.cycle_id,values);});
    // Un instructor referido no pertenece al grupo/ciclo de la sucursal destino.
    // Cuando se lo selecciona expresamente, inclúyelo únicamente en el cálculo
    // de disponibilidad de estos ciclos, conservando su regla de prioridad.
    if (filters.instructor_id && cycleIds.length) {
      const selectedInstructorRuleResult = await db.query(`
        SELECT ip.id AS instructor_id,
          TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS instructor_name,
          priority_rule.branch_id AS priority_branch_id,
          COALESCE(priority_rule.allowed_slots,'[]'::jsonb) AS allowed_slots
        FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id
        LEFT JOIN LATERAL (
          SELECT rule.branch_id, rule.allowed_slots
          FROM instructor_branch_priorities rule
          WHERE rule.instructor_id=ip.id
            AND rule.assignment_type='priority'
            AND rule.active=TRUE
            AND rule.effective_from<=CURRENT_DATE
            AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
          ORDER BY rule.updated_at DESC
          LIMIT 1
        ) priority_rule ON TRUE
        WHERE ip.id=$1::uuid AND ip.status='activo' AND ip.deleted_at IS NULL
        LIMIT 1
      `, [filters.instructor_id]);
      const selectedRule = selectedInstructorRuleResult.rows[0];
      if (selectedRule) {
        cycleIds.forEach(cycleId => {
          const values = (instructorRules.get(cycleId) || [])
            .filter(rule => String(rule.instructor_id) !== String(selectedRule.instructor_id));
          values.push({ ...selectedRule, cycle_id: cycleId });
          instructorRules.set(cycleId, values);
        });
      }
    }
    const selectedInstructorRule = filters.instructor_id && cycleIds.length
      ? (instructorRules.get(cycleIds[0]) || []).find(rule =>
        String(rule.instructor_id) === String(filters.instructor_id))
      : null;
    const selectedInstructorShowsFullSchedule = String(selectedInstructorRule?.instructor_name || '')
      .trim().toLowerCase() === 'benito alonzo';
    const requestedStartAppliesToRow = row => Boolean(filters.practical_start_date
      && (!filters.practical_cycle_id || String(filters.practical_cycle_id) === String(row.id)));
    const practicalDatesForRow = row => {
      const requestedStartApplies = requestedStartAppliesToRow(row);
      return practicalCycleDates(
        row,
        (requestedStartApplies ? filters.practical_start_date : null)
          || (selectedInstructorShowsFullSchedule ? benitoWeeklyStartDate(row.start_date) : null),
      );
    };
    const displayedDatesForRow = row => [...new Set([
      ...practicalCycleDates(row),
      ...practicalDatesForRow(row),
    ])].sort();
    // La ocupación debe cubrir las fechas prácticas que realmente se muestran.
    // Cuando Secretaría adelanta el inicio, esas fechas pueden ser anteriores
    // al inicio oficial del ciclo y no deben aparecer como libres.
    const displayedPracticalDates = result.rows.flatMap(displayedDatesForRow);
    const availabilityRange = displayedPracticalDates.reduce((range, date) => ({
      start: !range.start || date < range.start ? date : range.start,
      end: !range.end || date > range.end ? date : range.end,
    }), { start: null, end: null });
    const instructorOccupancyResult = cycleIds.length ? await db.query(`
      SELECT instructor_id,cycle_id,schedule_date,start_time,end_time
      FROM course_cycle_schedule_assignments
      WHERE status='activo' AND schedule_date BETWEEN $1::date AND $2::date
      UNION ALL
      SELECT instructor_id,cycle_id,schedule_date,start_time,end_time
      FROM referred_instructor_schedule_blocks
      WHERE status='activo' AND schedule_date BETWEEN $1::date AND $2::date
    `, [availabilityRange.start, availabilityRange.end]) : { rows: [] };
    const availabilityOverridesResult = cycleIds.length ? await db.query(`
      SELECT cc.id AS cycle_id, o.instructor_id, o.schedule_date, o.start_time, o.end_time, o.status
      FROM course_cycles cc
      JOIN instructor_availability_overrides o
        ON o.schedule_date BETWEEN cc.start_date AND cc.end_date AND o.active=TRUE
      WHERE cc.id=ANY($1::uuid[])
        AND (EXISTS (SELECT 1 FROM course_cycle_instructors cci WHERE cci.cycle_id=cc.id AND cci.instructor_id=o.instructor_id AND cci.active=TRUE)
          OR EXISTS (SELECT 1 FROM instructor_group_members igm WHERE igm.group_id=cc.group_id AND igm.instructor_id=o.instructor_id AND igm.active=TRUE AND igm.ended_at IS NULL)
          OR ($2::uuid IS NOT NULL AND o.instructor_id=$2::uuid))
    `, [cycleIds, filters.instructor_id || null]) : { rows: [] };
    const availabilityOverrides = new Map(availabilityOverridesResult.rows.map(item => [
      `${item.cycle_id}:${item.instructor_id}:${toDateString(item.schedule_date)}:${normalizeTime(item.start_time)}:${normalizeTime(item.end_time)}`,
      item.status,
    ]));
    const occupancyResult = cycleIds.length
      ? await db.query(filters.instructor_id ? `
          SELECT cycle_id, schedule_date, start_time, end_time,
                 COUNT(DISTINCT enrollment_id)::int AS occupied
          FROM (
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM course_cycle_schedule_assignments
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[]) AND instructor_id = $2::uuid
            UNION
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM referred_instructor_schedule_blocks
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[]) AND instructor_id = $2::uuid
          ) instructor_occupancy
          GROUP BY cycle_id, schedule_date, start_time, end_time
        ` : `
          SELECT cycle_id, schedule_date, start_time, end_time,
                 COUNT(DISTINCT enrollment_id)::int AS occupied
          FROM (
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM course_cycle_schedule_assignments
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[])
            UNION
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM referred_instructor_schedule_blocks
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[])
          ) global_occupancy
          GROUP BY cycle_id, schedule_date, start_time, end_time
        `, filters.instructor_id ? [cycleIds, filters.instructor_id] : [cycleIds])
      : { rows: [] };
    const globalOccupancyResult = filters.instructor_id && cycleIds.length
      ? await db.query(`
          SELECT cycle_id, schedule_date, start_time, end_time,
                 COUNT(DISTINCT enrollment_id)::int AS occupied
          FROM (
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM course_cycle_schedule_assignments
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[])
            UNION
            SELECT cycle_id, enrollment_id, schedule_date, start_time, end_time
            FROM referred_instructor_schedule_blocks
            WHERE status = 'activo' AND cycle_id = ANY($1::uuid[])
          ) global_occupancy
          GROUP BY cycle_id, schedule_date, start_time, end_time
        `, [cycleIds])
      : occupancyResult;
    const occupancy = new Map(occupancyResult.rows.map(row => [
      `${row.cycle_id}:${toDateString(row.schedule_date)}:${normalizeTime(row.start_time)}:${normalizeTime(row.end_time)}`,
      Number(row.occupied),
    ]));
    const globalOccupancy = new Map(globalOccupancyResult.rows.map(row => [
      `${row.cycle_id}:${toDateString(row.schedule_date)}:${normalizeTime(row.start_time)}:${normalizeTime(row.end_time)}`,
      Number(row.occupied),
    ]));
    const cycleSeatUsageResult = cycleIds.length ? await db.query(`
      SELECT cycle_id, COUNT(DISTINCT seat_key)::int used
      FROM (
        SELECT cycle_id, enrollment_id::text seat_key
        FROM course_cycle_schedule_assignments
        WHERE cycle_id=ANY($1::uuid[]) AND status='activo'
        UNION
        SELECT cycle_id, COALESCE(enrollment_id::text,id::text) seat_key
        FROM course_cycle_seat_reservations
        WHERE cycle_id=ANY($1::uuid[]) AND status='activo'
      ) occupied_cycle_seats
      GROUP BY cycle_id
    `,[cycleIds]) : {rows:[]};
    const cycleSeatUsage = new Map(cycleSeatUsageResult.rows.map(row=>[String(row.cycle_id),Number(row.used)]));
    const instructorBusyResult = filters.instructor_id ? await db.query(`
      SELECT schedule_date,start_time,end_time FROM course_cycle_schedule_assignments
      WHERE instructor_id=$1 AND status='activo'
      UNION ALL
      SELECT schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks
      WHERE instructor_id=$1 AND status='activo'
    `,[filters.instructor_id]) : {rows:[]};
    const instructorTheoryResult = filters.instructor_id ? await db.query(`SELECT class_date,start_time,end_time,recurring,modality
      FROM theory_class_schedules WHERE instructor_id=$1 AND active=TRUE`,[filters.instructor_id]) : {rows:[]};
    const cycleInstructorIds = [...new Set(instructorRulesResult.rows.map(rule => String(rule.instructor_id)))];
    const allInstructorTheoryResult = !filters.instructor_id && cycleInstructorIds.length ? await db.query(`
      SELECT instructor_id,class_date,start_time,end_time,recurring,modality
      FROM theory_class_schedules
      WHERE instructor_id=ANY($1::uuid[]) AND active=TRUE
    `,[cycleInstructorIds]) : {rows:[]};
    const examAppointmentsResult = filters.instructor_id && availabilityRange.start ? await db.query(`
      SELECT scheduled_start::date schedule_date,
             to_char(scheduled_start, 'HH24:MI') exam_time,
             COUNT(*)::int total
      FROM practical_sessions
      WHERE instructor_id=$1 AND appointment_type='EXAM_ONLY' AND deleted_at IS NULL
        AND status NOT IN ('CANCELADA','REPROGRAMADA')
        AND scheduled_start::date BETWEEN $2::date AND $3::date
      GROUP BY scheduled_start::date, to_char(scheduled_start, 'HH24:MI')
    `,[filters.instructor_id,availabilityRange.start,availabilityRange.end]) : {rows:[]};
    const examAppointments = new Map(examAppointmentsResult.rows.map(row=>[
      `${toDateString(row.schedule_date)}:${normalizeTime(row.exam_time)}`,
      Number(row.total),
    ]));
    const options = result.rows.map(row => {
      const cycleIncludesBenito = (Array.isArray(row.instructors) ? row.instructors : [])
        .some(instructor => String(instructor.name || '').trim().toLowerCase() === 'benito alonzo');
      const isManta2000Schedule = String(row.branch_name || '').trim().toLowerCase() === 'manta 2000';
      const showFullNormalSchedule = (selectedInstructorShowsFullSchedule || cycleIncludesBenito || isManta2000Schedule)
        && row.modality !== 'intensivo';
      const rowPracticalSlots = showFullNormalSchedule ? NORMAL_PRACTICAL_SLOTS : practicalSlots(row);
      const configuredCapacity = Number(row.slot_capacity) || 1;
      const usedCycleSeats = cycleSeatUsage.get(String(row.id)) || 0;
      const configuredPublishedCapacity = Number(row.published_capacity) > 0
        ? Number(row.published_capacity)
        : Number.MAX_SAFE_INTEGER;
      const configuredCourseCapacity = configuredPublishedCapacity === Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : configuredPublishedCapacity * Math.max(practicalSlots(row).length, 1);
      const cycleHasSeats = usedCycleSeats < configuredCourseCapacity;
      const practicalDates = practicalDatesForRow(row);
      const displayedDates = displayedDatesForRow(row);
      const instructorBaseStart = selectedInstructorShowsFullSchedule
        && practicalDates[0] < toDateString(row.start_date);
      const rowCycleRules = instructorRules.get(row.id) || [];
      const rowPriorityRules = rowCycleRules.filter(rule =>
        String(rule.priority_branch_id || '') === String(row.branch_id));
      const rowCapacityRules = rowPriorityRules.length ? rowPriorityRules : rowCycleRules;
      const instructorHasAvailability = instructor => cycleHasSeats && practicalSlots(row).some(([startTime, endTime]) => {
        const eligibleDates = Array.isArray(row.schedule_templates) && row.schedule_templates.length
          ? practicalDates.filter(date => row.schedule_templates.some(template =>
            Number(template.day_of_week) === new Date(`${date}T00:00:00`).getDay()
            && normalizeTime(template.start_time) === startTime
            && normalizeTime(template.end_time) === endTime))
          : practicalDates;
        const rule = rowCapacityRules.find(item => String(item.instructor_id) === String(instructor.id));
        if (!rule || !eligibleDates.length) return false;
          const slotAllowed = !rule.priority_branch_id
          || (String(rule.priority_branch_id) === String(row.branch_id)
            ? Array.isArray(rule.allowed_slots) && (!rule.allowed_slots.length || eligibleDates.every(date => rule.allowed_slots.some(slot =>
              Number(slot.weekday) === new Date(`${date}T12:00:00`).getDay()
              && normalizeTime(slot.startTime || slot.start_time) === startTime
              && normalizeTime(slot.endTime || slot.end_time) === endTime)))
            : Array.isArray(rule.allowed_slots) && eligibleDates.every(date => !rule.allowed_slots.some(slot =>
              Number(slot.weekday) === new Date(`${date}T12:00:00`).getDay()
              && normalizeTime(slot.startTime || slot.start_time) === startTime
              && normalizeTime(slot.endTime || slot.end_time) === endTime)));
        if (!slotAllowed) return false;
        return eligibleDates.some(date => {
          const overlaps = item => normalizeTime(item.start_time) < endTime
            && normalizeTime(item.end_time) > startTime;
          const practicalBusy = instructorOccupancyResult.rows.some(item =>
            String(item.instructor_id) === String(instructor.id)
            && toDateString(item.schedule_date) === date
            && overlaps(item));
          const weekday = new Date(`${date}T12:00:00`).getDay();
          const theoryBusy = allInstructorTheoryResult.rows.some(item =>
            String(item.instructor_id) === String(instructor.id)
            && overlaps(item)
            && (toDateString(item.class_date) === date || (item.recurring && (
              (item.modality === 'presencial_regular' && weekday >= 1 && weekday <= 5)
              || (item.modality === 'presencial_sabado' && weekday === 6)
            ))));
          const overridden = availabilityOverrides.has(
            `${row.id}:${instructor.id}:${date}:${startTime}:${endTime}`);
          return !practicalBusy && !theoryBusy && !overridden;
        });
      });
      return {
        id: row.id,
        code: row.code,
        course: row.course_name,
        branch: row.branch_name,
        modality: row.modality,
        vehicleType: row.vehicle_type,
        startDate: toDateString(row.start_date),
        endDate: toDateString(row.end_date),
        enrollmentDeadline: toDateString(new Date(new Date(row.start_date).setDate(new Date(row.start_date).getDate() + 2))),
        enrollmentStarted: toDateString(row.start_date) <= toDateString(new Date()),
        practicalStartDate: practicalDates[0] || toDateString(row.start_date),
        practicalEndDate: practicalDates[practicalDates.length - 1] || toDateString(row.end_date),
        practicalStartAdvanced: Boolean(requestedStartAppliesToRow(row)
          && practicalDates[0] < toDateString(row.start_date)),
        instructorBaseStart,
        durationBusinessDays: Number(row.duration_business_days),
        status: row.status,
        group: row.group_code ? {
          code: row.group_code,
          name: row.group_name,
        } : null,
        instructors: (Array.isArray(row.instructors) ? row.instructors : [])
          .filter(instructor => filters.instructor_id || instructorHasAvailability(instructor)),
        theoryOptions: row.theory_options,
        slotCapacity: configuredCapacity,
        fullNormalSchedule: showFullNormalSchedule,
        slots: rowPracticalSlots.map(([startTime, endTime]) => {
          const dates = displayedDates;
          const eligibleDates = !showFullNormalSchedule && Array.isArray(row.schedule_templates) && row.schedule_templates.length
            ? dates.filter(date => row.schedule_templates.some(template =>
              Number(template.day_of_week) === new Date(`${date}T00:00:00`).getDay()
              && normalizeTime(template.start_time) === startTime
              && normalizeTime(template.end_time) === endTime))
            : dates;
          const cycleRules=instructorRules.get(row.id)||[];
          const priorityRules=cycleRules.filter(rule=>String(rule.priority_branch_id||'')===String(row.branch_id));
          const capacityRules=priorityRules.length?priorityRules:cycleRules;
          const eligibleRules=capacityRules.filter(rule=>{
            if(filters.instructor_id&&String(rule.instructor_id)!==String(filters.instructor_id))return false;
            if(!rule.priority_branch_id)return true;
            if(String(rule.priority_branch_id)===String(row.branch_id)){
              return Array.isArray(rule.allowed_slots)&&(!rule.allowed_slots.length||eligibleDates.every(date=>rule.allowed_slots.some(slot=>
                Number(slot.weekday)===new Date(`${date}T12:00:00`).getDay()
                && normalizeTime(slot.startTime||slot.start_time)===startTime
                && normalizeTime(slot.endTime||slot.end_time)===endTime)));
            }
            return Array.isArray(rule.allowed_slots)&&eligibleDates.every(date=>!rule.allowed_slots.some(slot=>
              Number(slot.weekday)===new Date(`${date}T12:00:00`).getDay()
              && normalizeTime(slot.startTime||slot.start_time)===startTime
              && normalizeTime(slot.endTime||slot.end_time)===endTime));
          });
          const hasInstructorConflict=Boolean(filters.instructor_id)&&eligibleDates.some(date=>{
            const overlaps=(item)=>normalizeTime(item.start_time)<endTime&&normalizeTime(item.end_time)>startTime;
            const practicalBusy=instructorBusyResult.rows.some(item=>toDateString(item.schedule_date)===date&&overlaps(item));
            const weekday=new Date(`${date}T12:00:00`).getDay();
            const theoryBusy=instructorTheoryResult.rows.some(item=>overlaps(item)&&(
              toDateString(item.class_date)===date || (item.recurring&&(
                (item.modality==='presencial_regular'&&weekday>=1&&weekday<=5)
                || (item.modality==='presencial_sabado'&&weekday===6)
              ))));
            const override = availabilityOverrides.get(`${row.id}:${filters.instructor_id}:${date}:${startTime}:${endTime}`);
            return practicalBusy||theoryBusy||Boolean(override);
          });
          const instructorCapacityUnit = Math.max(Number(row.capacity_per_instructor)||1,1);
          const availableRulesByDate = date => eligibleRules.filter(rule => {
            if (availabilityOverrides.has(`${row.id}:${rule.instructor_id}:${date}:${startTime}:${endTime}`)) return false;
            return !instructorOccupancyResult.rows.some(item => String(item.instructor_id) === String(rule.instructor_id)
              && String(item.cycle_id) !== String(row.id)
              && toDateString(item.schedule_date) === date
              && normalizeTime(item.start_time) < endTime
              && normalizeTime(item.end_time) > startTime);
          });
          const availableRules = availableRulesByDate(eligibleDates[0] || '');
          const resourceCapacity=(hasInstructorConflict?0:availableRules.length)*instructorCapacityUnit;
          const publishedCapacity=filters.instructor_id?Number.MAX_SAFE_INTEGER:configuredPublishedCapacity;
          const capacity=Math.max(Math.min(resourceCapacity,publishedCapacity),0);
          const globalCapacity=capacity;
          const occupancyByDate = Object.fromEntries(eligibleDates.map(date => {
            const occupancyKey = `${row.id}:${date}:${startTime}:${endTime}`;
            const selectedOverrideStatus = filters.instructor_id
              ? availabilityOverrides.get(`${row.id}:${filters.instructor_id}:${date}:${startTime}:${endTime}`)
              : null;
            const selectedInstructorBusy = Boolean(filters.instructor_id)
              && instructorBusyResult.rows.some(item =>
                toDateString(item.schedule_date) === date
                && normalizeTime(item.start_time) < endTime
                && normalizeTime(item.end_time) > startTime);
            const occupied = occupancy.get(occupancyKey) || 0;
            const occupiedGlobally = filters.instructor_id ? occupied : (globalOccupancy.get(occupancyKey) || 0);
            const dailyCapacity = cycleHasSeats
              ? Math.max(Math.min(availableRulesByDate(date).length * instructorCapacityUnit, publishedCapacity), 0)
              : 0;
            return [date, {
              occupied,
              capacity: dailyCapacity,
              examCount: examAppointments.get(`${date}:${startTime}`) || 0,
              // En la vista agregada "Todos" también se debe advertir que la
              // franja ya está reservada, aunque aún queden otros instructores.
              status: selectedOverrideStatus === 'reserved' || selectedInstructorBusy
                || occupied > 0 || occupiedGlobally > 0 ? 'reserved' : null,
              available: Math.max(Math.min(dailyCapacity - occupied, dailyCapacity - occupiedGlobally), 0),
            }];
          }));
          const occupied = Math.max(...Object.values(occupancyByDate).map(value => value.occupied), 0);
          const available = Math.min(...Object.values(occupancyByDate).map(value => value.available), capacity);
          return {
            startTime,
            endTime,
            capacity,
            occupied,
            available,
            occupancyByDate,
          };
        }),
      };
    });

    // REGLA GLOBAL PROTEGIDA: no publicar en matrícula un instructor/ciclo
    // que no tenga al menos una franja utilizable durante todo el curso.
    const bookableOptions = options.filter(option =>
      (option.slots || []).some(slot => Number(slot.available || 0) > 0));

    if (!selectedInstructorShowsFullSchedule) return bookableOptions;

    // Benito trabaja sobre una sola secuencia semanal, cuyo inicio base es el
    // lunes 14/09/2026. Moto ocupa cinco dias y Automovil ocho, pero los ciclos
    // automaticos intermedios no deben verse como nuevos inicios de Benito.
    // Conservamos un ciclo tecnico por tipo/modalidad y semana para registrar
    // la matricula, mientras la agenda global sigue evitando cruces entre ambos.
    const weeklyOptions = new Map();
    bookableOptions.forEach(option => {
      if (option.modality === 'intensivo') {
        weeklyOptions.set(`intensivo:${option.id}`, option);
        return;
      }
      const weeklyStart = benitoWeeklyStartDate(option.startDate);
      const key = `${option.vehicleType}:${option.modality}:${weeklyStart}`;
      const current = weeklyOptions.get(key);
      const candidateDistance = Math.abs(
        new Date(`${option.startDate}T12:00:00`) - new Date(`${weeklyStart}T12:00:00`)
      );
      const currentDistance = current ? Math.abs(
        new Date(`${current.startDate}T12:00:00`) - new Date(`${weeklyStart}T12:00:00`)
      ) : Number.MAX_SAFE_INTEGER;
      if (!current || candidateDistance < currentDistance
        || (candidateDistance === currentDistance && String(option.startDate) < String(current.startDate))) {
        weeklyOptions.set(key, option);
      }
    });
    return [...weeklyOptions.values()].sort((first, second) =>
      String(first.practicalStartDate || first.startDate).localeCompare(String(second.practicalStartDate || second.startDate))
      || String(first.vehicleType).localeCompare(String(second.vehicleType)));
  }

  static async getInstructorFirstAvailability(user, filters = {}) {
    if (!filters.instructor_id || !filters.branch_id || !filters.course_id) {
      throw createError(422, 'Instructor, sucursal y curso son requeridos');
    }
    const baseFilters = {
      branch_id: filters.branch_id,
      course_id: filters.course_id,
      instructor_id: filters.instructor_id,
      modality: filters.modality || 'normal',
    };
    const official = await this.getEnrollmentOptions(user, baseFilters);
    if (!official.length) return { date: null, officialStartDate: null, available: false };
    const officialStartDate = official[0].startDate;
    const candidates = [];
    const cursor = new Date(`${toDateString(new Date())}T12:00:00`);
    const officialStart = new Date(`${officialStartDate}T12:00:00`);
    while (cursor < officialStart && candidates.length < 31) {
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) candidates.push(toDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    candidates.push(officialStartDate);
    for (const date of candidates) {
      const options = date === officialStartDate
        ? official
        : await this.getEnrollmentOptions(user, { ...baseFilters, practical_start_date: date });
      if (options.some(cycle => cycle.slots.some(slot => Number(slot.available) > 0))) {
        return { date, officialStartDate, available: true, advanced: date < officialStartDate };
      }
    }
    return { date: officialStartDate, officialStartDate, available: false, advanced: false };
  }

  static async getStudentScheduleChangeOptions(user, studentId) {
    if (!studentId) throw createError(422, 'Estudiante requerido');

    const params = [studentId];
    let branchFilter = '';
    if (user.branch_id) {
      params.push(user.branch_id);
      branchFilter = `AND cc.branch_id = $${params.length}`;
    }

    const cycleResult = await db.query(`
      SELECT cc.id, cc.branch_id, cc.course_id, cc.code, cc.modality, cc.vehicle_type, cc.start_date, cc.end_date,
             cc.duration_business_days, cc.status, c.name AS course_name,
             e.theory_modality, e.theory_start_time,
             b.name AS branch_name, ig.code AS group_code, ig.name AS group_name,
             LEAST(
               COALESCE(cc.published_capacity, 2147483647),
               COALESCE(NULLIF(COUNT(DISTINCT cci.instructor_id), 0), NULLIF(COUNT(DISTINCT igm.instructor_id), 0), 1)
                 * GREATEST(cc.capacity_per_instructor, 1)
             )::int AS slot_capacity,
             (SELECT json_agg(json_build_object('day_of_week',t.day_of_week,'start_time',t.start_time,'end_time',t.end_time)) FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE WHERE p.branch_id=cc.branch_id AND p.course_id=cc.course_id AND t.modality=cc.modality) schedule_templates
      FROM course_cycle_schedule_assignments a
      JOIN enrollments e ON e.id = a.enrollment_id
      JOIN course_cycles cc ON cc.id = a.cycle_id
      JOIN courses c ON c.id = cc.course_id
      JOIN branches b ON b.id = cc.branch_id
      LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
      LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
      LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
      WHERE a.student_id = $1
        AND a.status = 'activo'
        AND cc.active = true
        AND cc.deleted_at IS NULL
        AND cc.end_date >= CURRENT_DATE
        ${branchFilter}
      GROUP BY cc.id, c.id, b.id, ig.id, e.id
      ORDER BY
        CASE WHEN CURRENT_DATE BETWEEN cc.start_date AND cc.end_date THEN 0 ELSE 1 END,
        cc.start_date
      LIMIT 1
    `, params);

    if (!cycleResult.rows.length) {
      throw createError(404, 'El estudiante no tiene un curso vigente con horario asignado');
    }

    const row = cycleResult.rows[0];
    const assignmentsResult = await db.query(`
      SELECT a.schedule_date, a.start_time, a.end_time, a.instructor_id,
             concat_ws(' ', u.first_name, u.last_name) AS instructor_name
      FROM course_cycle_schedule_assignments a
      LEFT JOIN instructor_profiles ip ON ip.id = a.instructor_id
      LEFT JOIN users u ON u.id = ip.user_id
      WHERE a.student_id = $1 AND a.cycle_id = $2 AND a.status = 'activo'
      ORDER BY a.schedule_date
    `, [studentId, row.id]);
    const currentAssignments = assignmentsResult.rows.map(assignment => ({
      date: toDateString(assignment.schedule_date),
      startTime: normalizeTime(assignment.start_time),
      endTime: normalizeTime(assignment.end_time),
      instructorId: assignment.instructor_id,
      instructorName: assignment.instructor_name,
    }));

    const occupancyResult = await db.query(`
      SELECT instructor_id, schedule_date, start_time, end_time, COUNT(*)::int AS occupied
      FROM course_cycle_schedule_assignments
      WHERE cycle_id = $1 AND status = 'activo' AND student_id <> $2
      GROUP BY instructor_id, schedule_date, start_time, end_time
    `, [row.id, studentId]);
    const occupancy = new Map(occupancyResult.rows.map(item => [
      `${item.instructor_id || ''}:${toDateString(item.schedule_date)}:${normalizeTime(item.start_time)}:${normalizeTime(item.end_time)}`,
      Number(item.occupied),
    ]));
    const capacity = Math.max(Number(row.capacity_per_instructor) || 1, 1);
    const dates = cycleDates(row);

    return {
      id: row.id,
      branchId: row.branch_id,
      courseId: row.course_id,
      code: row.code,
      course: row.course_name,
      branch: row.branch_name,
      modality: row.modality,
      vehicleType: row.vehicle_type,
        startDate: toDateString(row.start_date),
        endDate: toDateString(row.end_date),
      durationBusinessDays: Number(row.duration_business_days),
      status: row.status,
      canRescheduleCourse: toDateString(new Date()) < toDateString(row.start_date),
      theorySchedule: row.theory_modality === 'virtual'
        ? 'virtual'
        : row.theory_modality === 'presencial_intensivo'
          ? (normalizeTime(row.theory_start_time) >= '13:00' ? 'presencial_intensivo_13' : 'presencial_intensivo_08')
          : 'presencial_regular',
      group: row.group_code ? { code: row.group_code, name: row.group_name } : null,
      slotCapacity: capacity,
      currentAssignments,
      slots: practicalSlots(row).map(([startTime, endTime]) => {
        const eligibleDates = Array.isArray(row.schedule_templates) && row.schedule_templates.length
          ? dates.filter(date => row.schedule_templates.some(template =>
            Number(template.day_of_week) === new Date(`${date}T00:00:00`).getDay()
            && normalizeTime(template.start_time) === startTime
            && normalizeTime(template.end_time) === endTime))
          : dates;
        const occupancyByDate = Object.fromEntries(eligibleDates.map(date => {
          const assignment = currentAssignments.find(item => item.date === date);
          const occupied = occupancy.get(`${assignment?.instructorId || ''}:${date}:${startTime}:${endTime}`) || 0;
          return [date, { occupied, available: Math.max(capacity - occupied, 0) }];
        }));
        return { startTime, endTime, capacity, occupancyByDate };
      }),
    };
  }

  static async changeStudentScheduleDays(user, data = {}) {
    const { studentId, cycleId } = data;
    const observation = String(data.observation || '').trim();
    const requestedChanges = Array.isArray(data.changes) ? data.changes : [];
    if (!studentId || !cycleId || !requestedChanges.length
      || requestedChanges.some(change => !change?.date || !change?.time)) {
      throw createError(422, 'Estudiante, curso y cambios de horario son requeridos');
    }
    if (!observation) throw createError(422, 'La observacion del cambio es obligatoria');
    if (observation.length > 1000) throw createError(422, 'La observacion no puede superar 1000 caracteres');
    if (new Set(requestedChanges.map(change => change.date)).size !== requestedChanges.length) {
      throw createError(422, 'Solo puedes seleccionar un nuevo horario por dia');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const cycleResult = await client.query(`
        SELECT cc.*
        FROM course_cycles cc
        WHERE cc.id = $1 AND cc.active = true AND cc.deleted_at IS NULL
          AND cc.end_date >= CURRENT_DATE
        FOR UPDATE
      `, [cycleId]);
      if (!cycleResult.rows.length) throw createError(404, 'Curso vigente no encontrado');
      const cycle = cycleResult.rows[0];
      if (user.branch_id && String(user.branch_id) !== String(cycle.branch_id)) {
        throw createError(403, 'No tienes acceso a este curso');
      }
      const validDates = cycleDates(cycle);
      const today = toDateString(new Date());
      if (requestedChanges.length > validDates.length) {
        throw createError(422, 'La cantidad de cambios supera los dias del curso');
      }
      const changes = requestedChanges.map(change => {
        if (change.date < today) throw createError(422, `No puedes modificar la fecha pasada ${change.date}`);
        if (!validDates.includes(change.date)) throw createError(422, `La fecha ${change.date} no pertenece al curso`);
        return { date: change.date, ...parseTimeRange(change.time) };
      }).sort((first, second) => `${first.date}:${first.startTime}`.localeCompare(`${second.date}:${second.startTime}`));

      const capacityResult = await client.query(`
        SELECT LEAST(
          COALESCE(MAX(cc.published_capacity), 2147483647),
          COALESCE(NULLIF(COUNT(DISTINCT cci.instructor_id), 0), NULLIF(COUNT(DISTINCT igm.instructor_id), 0), 1)
            * GREATEST(MAX(cc.capacity_per_instructor), 1)
        )::int AS slot_capacity
        FROM course_cycles cc
        LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
        LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
        LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
        WHERE cc.id = $1
      `, [cycleId]);
      const capacity = Number(capacityResult.rows[0]?.slot_capacity) || 1;
      const insertedAssignments = [];
      const notificationDetails = new Map();

      for (const change of changes) {
        const { date, startTime, endTime } = change;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${cycleId}:${date}:${startTime}:${endTime}`]);
        const currentResult = await client.query(`
          SELECT id, enrollment_id, instructor_id, start_time, end_time
          FROM course_cycle_schedule_assignments
          WHERE student_id = $1 AND cycle_id = $2 AND schedule_date = $3 AND status = 'activo'
          FOR UPDATE
        `, [studentId, cycleId, date]);
        if (!currentResult.rows.length) {
          throw createError(404, `El estudiante no tiene un horario asignado para el dia ${date}`);
        }
        const current = currentResult.rows[0];
        if (normalizeTime(current.start_time) === startTime && normalizeTime(current.end_time) === endTime) {
          throw createError(409, `El horario seleccionado para ${date} ya es el actual`);
        }
        const occupiedResult = await client.query(`
          SELECT COUNT(*)::int AS occupied
          FROM course_cycle_schedule_assignments
          WHERE cycle_id = $1 AND schedule_date = $2
            AND start_time = $3::time AND end_time = $4::time
            AND status = 'activo' AND student_id <> $5
        `, [cycleId, date, startTime, endTime, studentId]);
        if (Number(occupiedResult.rows[0]?.occupied || 0) >= capacity) {
          throw createError(409, `No hay cupos disponibles el ${date} en ese horario`);
        }
        if (current.instructor_id) {
          const instructorConflict = await client.query(`
            SELECT 1 FROM course_cycle_schedule_assignments
            WHERE instructor_id = $1 AND schedule_date = $2
              AND start_time = $3::time AND end_time = $4::time
              AND status = 'activo' AND student_id <> $5
            LIMIT 1
          `, [current.instructor_id, date, startTime, endTime, studentId]);
          if (instructorConflict.rows.length) {
            throw createError(409, `El instructor del estudiante ya esta ocupado el ${date} en ese horario`);
          }
        }
        await client.query(`
          UPDATE course_cycle_schedule_assignments
          SET status = 'cancelado', updated_at = NOW()
          WHERE id = $1
        `, [current.id]);
        const inserted = await client.query(`
          INSERT INTO course_cycle_schedule_assignments (
            cycle_id, enrollment_id, student_id, schedule_date,
            start_time, end_time, instructor_id, status, created_by
          ) VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, 'activo', $8)
          RETURNING *
        `, [cycleId, current.enrollment_id, studentId, date, startTime, endTime, current.instructor_id, user.id]);
        insertedAssignments.push(inserted.rows[0]);
        if (current.instructor_id) {
          const details = notificationDetails.get(String(current.instructor_id)) || [];
          details.push({
            date,
            previous: `${normalizeTime(current.start_time)} - ${normalizeTime(current.end_time)}`,
            next: `${startTime} - ${endTime}`,
          });
          notificationDetails.set(String(current.instructor_id), details);
        }
        await client.query(
          'INSERT INTO history (student_id, action) VALUES ($1, $2)',
          [studentId, `Cambio de horario del ${date}: ${normalizeTime(current.start_time)} - ${normalizeTime(current.end_time)} a ${startTime} - ${endTime}. Observacion: ${observation}`]
        );
      }
      const student = (await client.query(`
        SELECT concat_ws(' ', first_name, last_name) AS name
        FROM students WHERE id = $1
      `, [studentId])).rows[0];
      for (const [instructorId, details] of notificationDetails) {
        const instructor = (await client.query(`
          SELECT user_id FROM instructor_profiles WHERE id = $1
        `, [instructorId])).rows[0];
        if (!instructor?.user_id) continue;
        const scheduleSummary = details
          .map(detail => `${detail.date}: ${detail.previous} a ${detail.next}`)
          .join('; ');
        await client.query(`
          INSERT INTO notifications(
            student_id, user_id, branch_id, title, message, type,
            reference_type, reference_id, read
          ) VALUES ($1, $2, $3, $4, $5, 'warning', 'SCHEDULE_CHANGE', $1, FALSE)
        `, [
          studentId,
          instructor.user_id,
          cycle.branch_id,
          'Cambio de horario asignado',
          `${student?.name || 'Un estudiante'} cambio ${details.length} ${details.length === 1 ? 'dia' : 'dias'} de horario. ${scheduleSummary}. Observacion: ${observation}`,
        ]);
      }
      await client.query('COMMIT');
      return insertedAssignments;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async changeStudentScheduleDay(user, data = {}) {
    const changes = Array.isArray(data.changes) ? data.changes : [{ date: data.date, time: data.time }];
    return this.changeStudentScheduleDays(user, { ...data, changes });
  }

  static async changeStudentScheduleDayLegacy(user, data = {}) {
    const { studentId, cycleId, date, time } = data;
    if (!studentId || !cycleId || !date || !time) {
      throw createError(422, 'Estudiante, curso, fecha y horario son requeridos');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const cycleResult = await client.query(`
        SELECT cc.*
        FROM course_cycles cc
        WHERE cc.id = $1 AND cc.active = true AND cc.deleted_at IS NULL
          AND cc.end_date >= CURRENT_DATE
        FOR UPDATE
      `, [cycleId]);
      if (!cycleResult.rows.length) throw createError(404, 'Curso vigente no encontrado');
      const cycle = cycleResult.rows[0];
      if (user.branch_id && String(user.branch_id) !== String(cycle.branch_id)) {
        throw createError(403, 'No tienes acceso a este curso');
      }
      if (date < toDateString(new Date())) throw createError(422, 'No puedes modificar una fecha pasada');
      if (!cycleDates(cycle).includes(date)) {
        throw createError(422, 'La fecha no pertenece al curso');
      }

      const currentResult = await client.query(`
        SELECT id, enrollment_id, instructor_id, start_time, end_time
        FROM course_cycle_schedule_assignments
        WHERE student_id = $1 AND cycle_id = $2 AND schedule_date = $3 AND status = 'activo'
        FOR UPDATE
      `, [studentId, cycleId, date]);
      if (!currentResult.rows.length) {
        throw createError(404, 'El estudiante no tiene un horario asignado para ese día');
      }

      const { startTime, endTime } = parseTimeRange(time);
      const current = currentResult.rows[0];
      if (normalizeTime(current.start_time) === startTime && normalizeTime(current.end_time) === endTime) {
        throw createError(409, 'Ese ya es el horario asignado para ese día');
      }

      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [`${cycleId}:${date}:${startTime}:${endTime}`]);
      const capacityResult = await client.query(`
        SELECT LEAST(
          COALESCE(MAX(cc.published_capacity), 2147483647),
          COALESCE(NULLIF(COUNT(DISTINCT cci.instructor_id), 0), NULLIF(COUNT(DISTINCT igm.instructor_id), 0), 1)
            * GREATEST(MAX(cc.capacity_per_instructor), 1)
        )::int AS slot_capacity
        FROM course_cycles cc
        LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
        LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
        LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
        WHERE cc.id = $1
      `, [cycleId]);
      const capacity = Number(capacityResult.rows[0]?.slot_capacity) || 1;
      const occupiedResult = await client.query(`
        SELECT COUNT(*)::int AS occupied
        FROM course_cycle_schedule_assignments
        WHERE cycle_id = $1 AND schedule_date = $2
          AND start_time = $3::time AND end_time = $4::time
          AND status = 'activo' AND student_id <> $5
      `, [cycleId, date, startTime, endTime, studentId]);
      if (Number(occupiedResult.rows[0]?.occupied || 0) >= capacity) {
        throw createError(409, 'No hay cupos disponibles en ese horario');
      }
      if (current.instructor_id) {
        const instructorConflict = await client.query(`
          SELECT 1
          FROM course_cycle_schedule_assignments
          WHERE instructor_id = $1 AND schedule_date = $2
            AND start_time = $3::time AND end_time = $4::time
            AND status = 'activo' AND student_id <> $5
          LIMIT 1
        `, [current.instructor_id, date, startTime, endTime, studentId]);
        if (instructorConflict.rows.length) {
          throw createError(409, 'El instructor del estudiante ya está ocupado en ese horario');
        }
      }

      await client.query(`
        UPDATE course_cycle_schedule_assignments
        SET status = 'cancelado', updated_at = NOW()
        WHERE id = $1
      `, [current.id]);
      const inserted = await client.query(`
        INSERT INTO course_cycle_schedule_assignments (
          cycle_id, enrollment_id, student_id, schedule_date,
          start_time, end_time, instructor_id, status, created_by
        ) VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, 'activo', $8)
        RETURNING *
      `, [cycleId, current.enrollment_id, studentId, date, startTime, endTime, current.instructor_id, user.id]);
      await client.query(
        'INSERT INTO history (student_id, action) VALUES ($1, $2)',
        [studentId, `Cambio de horario del ${date}: ${normalizeTime(current.start_time)} - ${normalizeTime(current.end_time)} a ${startTime} - ${endTime}`]
      );
      await client.query('COMMIT');
      return inserted.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async reserveSchedule(user, data = {}) {
    const { studentId, schedulePlan } = data;
    const preferredInstructorId = data.preferredInstructorId || schedulePlan?.preferredInstructorId || null;
    const selections = Array.isArray(schedulePlan?.selections) ? schedulePlan.selections : [];
    const theorySelection = schedulePlan?.theorySchedule;
    const theoryPending = !theorySelection || theorySelection === 'por_confirmar';
    const theoryOption = theoryPending || theorySelection === 'virtual'
      ? null
      : TheoryCourseService.normalizeSelection(theorySelection);
    const theorySchedule = theoryPending ? null : theorySelection === 'virtual' ? 'virtual' : theoryOption.modality;
    const requestedPracticalStart = schedulePlan?.practicalStartDate || null;
    const practicalStartReason = String(schedulePlan?.practicalStartReason || '').trim();
    const examOnly = schedulePlan?.practicalMode === 'exam_only';
    const rescheduleFromCycleId = data.rescheduleFromCycleId || null;
    const rescheduleReason = String(data.rescheduleReason || '').trim();
    if (!studentId) throw createError(422, 'Estudiante requerido');
    if (rescheduleFromCycleId && !rescheduleReason) {
      throw createError(422, 'El motivo del reagendamiento es obligatorio');
    }
    if (!selections.length) throw createError(422, 'Debes seleccionar un horario');
    if (theorySchedule && !['presencial_regular', 'presencial_intensivo', 'virtual'].includes(theorySchedule)) {
      throw createError(422, 'Debes seleccionar una modalidad de teoría válida');
    }

    const cycleId = selections[0]?.cycleId;
    if (!cycleId || selections.some(selection => selection.cycleId !== cycleId)) {
      throw createError(422, 'La seleccion debe pertenecer a un solo curso');
    }

    const selectionsByDate = new Map();
    const timeSet = new Set();
    for (const selection of selections) {
      if (!selection.date || !selection.time) throw createError(422, 'Seleccion de horario incompleta');
      const daySelections = selectionsByDate.get(selection.date) || [];
      daySelections.push(selection);
      selectionsByDate.set(selection.date, daySelections);
      timeSet.add(selection.time);
    }

    if (schedulePlan.rotation) {
      if (timeSet.size > 2) {
        throw createError(409, 'En horario rotativo solo puedes escoger maximo dos horas distintas');
      }
      const orderedDates = [...selectionsByDate.keys()].sort((left, right) => left.localeCompare(right));
      const doubledDates = orderedDates.filter(date => selectionsByDate.get(date).length === 2);
      if (doubledDates.length > 4) {
        throw createError(409, 'Solo puedes doblar horas en un maximo de cuatro dias');
      }
      const doubledPositions = doubledDates.map(date => orderedDates.indexOf(date));
      if (doubledPositions.some((position, index) => index > 0 && position !== doubledPositions[index - 1] + 1)) {
        throw createError(409, 'Los dias con horario doble deben ser consecutivos y no pueden alternarse');
      }
      for (const daySelections of selectionsByDate.values()) {
        if (daySelections.length > 2) throw createError(409, 'Solo puedes escoger dos bloques por dia');
        if (daySelections.length === 2) {
          const first = parseTimeRange(daySelections[0].time);
          const second = parseTimeRange(daySelections[1].time);
          const orderedSlots = NORMAL_PRACTICAL_SLOTS.map(([start, end]) => `${start}-${end}`);
          const indexes = [
            orderedSlots.indexOf(`${first.startTime}-${first.endTime}`),
            orderedSlots.indexOf(`${second.startTime}-${second.endTime}`),
          ];
          if (indexes.includes(-1) || Math.abs(indexes[0] - indexes[1]) !== 1) {
            throw createError(409, 'Para doblar horas, los dos bloques del dia deben ser consecutivos');
          }
        }
      }
    }
    if (!schedulePlan.rotation && timeSet.size !== 1) {
      throw createError(409, 'El horario normal debe mantener una sola hora durante el curso');
    }
    if (examOnly && selections.length !== 1) {
      throw createError(422, 'Solo examen requiere seleccionar una única fecha y horario');
    }
    if (examOnly && !preferredInstructorId) {
      throw createError(422, 'Selecciona el instructor que tomará el examen');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const cycleResult = await client.query(`
        SELECT cc.*
        FROM course_cycles cc
        WHERE cc.id = $1
          AND cc.active = true
          AND cc.deleted_at IS NULL
          AND cc.status IN ('activo', 'proximo')
          -- REGLA PROTEGIDA: incluso por llamada directa, solo se admiten los
          -- dos primeros dias posteriores al inicio del ciclo.
          AND CURRENT_DATE <= cc.start_date + 2
        FOR UPDATE
      `, [cycleId]);

      if (cycleResult.rows.length === 0) throw createError(404, 'Curso no disponible para inscripcion');
      const cycle = cycleResult.rows[0];
      if (rescheduleFromCycleId) {
        const sourceResult = await client.query(`
          SELECT source.id,source.branch_id,source.course_id,source.start_date
          FROM course_cycle_schedule_assignments assignment
          JOIN course_cycles source ON source.id=assignment.cycle_id
          WHERE assignment.student_id=$1 AND assignment.cycle_id=$2::uuid
            AND assignment.status='activo'
          FOR UPDATE OF source
        `,[studentId,rescheduleFromCycleId]);
        if (!sourceResult.rows.length) throw createError(404, 'No se encontró el curso actual del estudiante');
        const source = sourceResult.rows[0];
        if (toDateString(source.start_date) <= toDateString(new Date())) {
          throw createError(409, 'No se puede reagendar porque el curso ya inició');
        }
        if (String(source.id) === String(cycle.id)
          || String(source.branch_id) !== String(cycle.branch_id)
          || String(source.course_id) !== String(cycle.course_id)
          || toDateString(cycle.start_date) <= toDateString(source.start_date)) {
          throw createError(422, 'Selecciona otro curso próximo de la misma sucursal y tipo de curso');
        }
      }
      const officialStart = toDateString(cycle.start_date);
      const selectedInstructorIdentity = preferredInstructorId ? (await client.query(`
        SELECT LOWER(TRIM(CONCAT(u.first_name, ' ', u.last_name))) AS full_name
        FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id
        WHERE ip.id=$1::uuid
        LIMIT 1
      `, [preferredInstructorId])).rows[0] : null;
      const usesBenitoBaseStart = selectedInstructorIdentity?.full_name === 'benito alonzo'
        && requestedPracticalStart === benitoWeeklyStartDate(officialStart);
      if (requestedPracticalStart) {
        const today = toDateString(new Date());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedPracticalStart)) {
          throw createError(422, 'La fecha de inicio práctico no es válida');
        }
        if (requestedPracticalStart < today || requestedPracticalStart > toDateString(cycle.end_date)) {
          throw createError(422, 'El inicio práctico debe estar entre hoy y el último día visible del curso');
        }
        if (cycle.modality !== 'normal') {
          throw createError(422, 'El inicio anticipado solo aplica a horarios normales');
        }
      }
      const theorySettingsResult = await client.query(`
        SELECT regular_enabled, saturday_enabled, virtual_enabled
        FROM branch_theory_settings
        WHERE branch_id = $1
      `, [cycle.branch_id]);
      const theorySettings = theorySettingsResult.rows[0] || {
        regular_enabled: true,
        saturday_enabled: true,
        virtual_enabled: true,
      };
      const theorySettingBySelection = {
        presencial_regular: theorySettings.regular_enabled,
        presencial_intensivo: theorySettings.saturday_enabled,
        virtual: theorySettings.virtual_enabled,
      };
      if (theorySchedule && !theorySettingBySelection[theorySchedule]) {
        throw createError(409, 'La modalidad de teoria seleccionada no esta habilitada en esta sucursal');
      }
      const configuredTemplates = await client.query(`SELECT t.day_of_week,t.start_time,t.end_time FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE WHERE p.branch_id=$1 AND p.course_id=$2 AND t.modality=$3`,[cycle.branch_id,cycle.course_id,cycle.modality]);
      cycle.schedule_templates=configuredTemplates.rows;
      if (examOnly) {
        const selection = selections[0];
        const { startTime } = parseTimeRange(selection.time);
        const allowedDates = new Set(practicalCycleDates(cycle, null));
        if (!allowedDates.has(selection.date)) throw createError(422, 'La fecha seleccionada no pertenece al calendario mostrado');
        if (selection.date < toDateString(new Date())) throw createError(422, 'El examen no puede programarse en una fecha pasada');
        const instructorResult = await client.query(`
          SELECT ip.id,u.first_name,u.last_name,
            EXISTS(SELECT 1 FROM instructor_branch_priorities priority
              WHERE priority.instructor_id=ip.id AND priority.branch_id=cc.branch_id
                AND priority.assignment_type='priority' AND priority.active=TRUE
                AND priority.effective_from<=CURRENT_DATE
                AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)) AS priority_in_branch
          FROM course_cycle_instructors cci
          JOIN course_cycles cc ON cc.id=cci.cycle_id
          JOIN instructor_profiles ip ON ip.id=cci.instructor_id
          JOIN users u ON u.id=ip.user_id
          WHERE cci.cycle_id=$1 AND cci.instructor_id=$2::uuid AND cci.active=TRUE
            AND ip.status='activo' AND ip.deleted_at IS NULL AND u.active=TRUE
          LIMIT 1
        `,[cycleId,preferredInstructorId]);
        if (!instructorResult.rows.length) throw createError(422, 'El instructor no está habilitado para este curso');
        const instructor = instructorResult.rows[0];
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`exam-only:${instructor.id}:${selection.date}`]);
        const dailyCount = Number((await client.query(`SELECT COUNT(*)::int total FROM practical_sessions
          WHERE instructor_id=$1 AND appointment_type='EXAM_ONLY' AND scheduled_start::date=$2::date
            AND deleted_at IS NULL AND status NOT IN ('CANCELADA','REPROGRAMADA')`,[instructor.id,selection.date])).rows[0].total);
        if (dailyCount >= 2) throw createError(409, 'Este instructor ya tiene los dos exámenes permitidos para ese día');
        const enrollment = (await client.query(`SELECT e.id FROM enrollments e
          WHERE e.student_id=$1 AND e.status='activo' AND e.course_id=$2
          ORDER BY e.created_at DESC LIMIT 1 FOR UPDATE OF e`,[studentId,cycle.course_id])).rows[0];
        if (!enrollment) throw createError(404, 'Matrícula activa no encontrada para este curso');
        await client.query(`UPDATE enrollments SET theory_modality=$2,theory_start_time=$3::time,theory_end_time=$4::time,
          practical_start_date=$5::date,practical_end_date=$5::date,updated_at=NOW() WHERE id=$1`,
        [enrollment.id,theorySchedule,theoryOption?.startTime||null,theoryOption?.endTime||null,selection.date]);
        await TheoryCourseService.assignEnrollment(client,{enrollmentId:enrollment.id,studentId,branchId:cycle.branch_id,
          courseId:cycle.course_id,selection:theorySelection,actorId:user.id});
        await client.query(`UPDATE enrollment_instructor_assignments SET active=FALSE,updated_at=NOW()
          WHERE enrollment_id=$1 AND active=TRUE`,[enrollment.id]);
        await client.query(`INSERT INTO enrollment_instructor_assignments
          (enrollment_id,instructor_id,assigned_by,start_date,end_date,active,observations)
          VALUES($1,$2,$3,$4::date,$4::date,TRUE,$5)`,[enrollment.id,instructor.id,user.id,selection.date,
            'Solo examen práctico']);
        const appointment = (await client.query(`INSERT INTO practical_sessions
          (enrollment_id,instructor_id,branch_id,scheduled_start,scheduled_end,session_number,status,observations,appointment_type,created_by)
          VALUES($1,$2,$3,$4::date+$5::time,$4::date+$5::time+INTERVAL '40 minutes',1,'PROGRAMADA',
            'Examen práctico; el bloque es referencial y no consume cupo de clase','EXAM_ONLY',$6) RETURNING *`,
        [enrollment.id,instructor.id,cycle.branch_id,selection.date,startTime,user.id])).rows[0];
        await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[studentId,
          `Solo examen práctico asignado con ${instructor.first_name} ${instructor.last_name} el ${selection.date} a las ${startTime}`]);
        await client.query('COMMIT');
        return { assignments:[],examAppointment:appointment,instructor:{id:instructor.id,name:`${instructor.first_name} ${instructor.last_name}`} };
      }
      const capacityResult = await client.query(`
        SELECT LEAST(
          COALESCE(MAX(cc.published_capacity), 2147483647),
          COALESCE(NULLIF(COUNT(DISTINCT cci.instructor_id), 0), NULLIF(COUNT(DISTINCT igm.instructor_id), 0), 1)
            * GREATEST(MAX(cc.capacity_per_instructor), 1)
        )::int AS slot_capacity
        FROM course_cycles cc
        LEFT JOIN instructor_groups ig ON ig.id = cc.group_id
        LEFT JOIN instructor_group_members igm ON igm.group_id = ig.id AND igm.active = true
        LEFT JOIN course_cycle_instructors cci ON cci.cycle_id = cc.id AND cci.active = true
        WHERE cc.id = $1
      `, [cycleId]);
      const capacity = Number(capacityResult.rows[0]?.slot_capacity) || 1;
      const practicalDates = practicalCycleDates(cycle, requestedPracticalStart);
      const allowedDates = new Set(practicalDates);
      const requiredClasses = Math.max(Number(cycle.duration_business_days) || allowedDates.size, 1);
      const uniqueSelections = new Set(selections.map(selection => `${selection.date}:${selection.time}`));
      if (uniqueSelections.size !== selections.length) {
        throw createError(422, 'Hay horarios seleccionados más de una vez');
      }
      const minimumClasses = schedulePlan.rotation ? Math.ceil(requiredClasses / 2) : requiredClasses;
      if (selections.length < minimumClasses || selections.length > requiredClasses) {
        throw createError(422, schedulePlan.rotation
          ? `En horario rotativo debes seleccionar entre ${minimumClasses} y ${requiredClasses} clases prácticas`
          : `Debes seleccionar exactamente ${requiredClasses} clases prácticas en total`);
      }

      for (const selection of selections) {
        if (!allowedDates.has(selection.date)) {
          throw createError(422, 'La fecha seleccionada no pertenece al curso');
        }
        const { startTime, endTime } = parseTimeRange(selection.time);
        const dayOfWeek = new Date(`${selection.date}T00:00:00`).getDay();
        const matchesTemplate = cycle.schedule_templates.some(template =>
          Number(template.day_of_week) === dayOfWeek
          && normalizeTime(template.start_time) === startTime
          && normalizeTime(template.end_time) === endTime);
        if (!matchesTemplate) throw createError(422, 'El bloque seleccionado no está configurado para ese día');
      }

      const courseNameFilter = cycle.vehicle_type === 'moto'
        ? ['%moto%', '%motocicleta%', '%clase a%']
        : ['%auto%', '%automovil%', '%automóvil%', '%clase b%'];
      const enrollmentResult = await client.query(`
        SELECT e.id
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = $1
          AND e.status = 'activo'
          AND (
            e.course_id = $2
            OR LOWER(c.name) LIKE ANY($3::text[])
          )
        ORDER BY e.created_at DESC
        LIMIT 1
        FOR UPDATE OF e
      `, [studentId, cycle.course_id, courseNameFilter]);

      if (enrollmentResult.rows.length === 0) throw createError(404, 'Matricula activa no encontrada para este curso');
      const enrollmentId = enrollmentResult.rows[0].id;
      const occupiedCycleSeats = Number((await client.query(`
        SELECT COUNT(DISTINCT seat_key)::int occupied
        FROM (
          SELECT enrollment_id::text seat_key
          FROM course_cycle_schedule_assignments
          WHERE cycle_id=$1 AND status='activo' AND enrollment_id IS DISTINCT FROM $2
          UNION
          SELECT COALESCE(enrollment_id::text,id::text) seat_key
          FROM course_cycle_seat_reservations
          WHERE cycle_id=$1 AND status='activo' AND enrollment_id IS DISTINCT FROM $2
        ) protected_seats
      `, [cycleId, enrollmentId])).rows[0].occupied || 0);
      const courseCapacity = capacity * Math.max(practicalSlots(cycle).length, 1);
      if (occupiedCycleSeats >= courseCapacity) {
        throw createError(409, 'El curso ya no tiene cupos generales disponibles');
      }

      let preferredInstructor = null;
      if (preferredInstructorId) {
        const preferredResult = await client.query(`
          SELECT ip.id, u.first_name, u.last_name, priority_rule.branch_id AS priority_branch_id,
            COALESCE(priority_rule.allowed_slots,'[]'::jsonb) AS allowed_slots
          FROM course_cycles selected_cycle
          JOIN instructor_profiles ip ON ip.id = $2::uuid
          JOIN users u ON u.id = ip.user_id
          JOIN branches ib ON ib.id = u.branch_id
          JOIN branches target ON target.id = $3
          JOIN instructor_course_capabilities capability
            ON capability.instructor_id=ip.id
            AND capability.course_id=selected_cycle.course_id
            AND capability.active=TRUE
          LEFT JOIN LATERAL (SELECT rule.branch_id,rule.allowed_slots FROM instructor_branch_priorities rule
            WHERE rule.instructor_id=ip.id AND rule.assignment_type='priority' AND rule.active=TRUE
              AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
            ORDER BY (rule.branch_id=$3) DESC,rule.updated_at DESC LIMIT 1) priority_rule ON TRUE
          WHERE selected_cycle.id = $1
            AND ip.status = 'activo'
            AND ip.deleted_at IS NULL
            AND u.active = true
            AND ib.city_id = target.city_id
          LIMIT 1
        `, [cycleId, preferredInstructorId, cycle.branch_id]);
        if (!preferredResult.rows.length) {
          throw createError(422, 'El instructor referido no está habilitado para este curso y sucursal');
        }
        preferredInstructor = preferredResult.rows[0];
        if (preferredInstructor.priority_branch_id && String(preferredInstructor.priority_branch_id) !== String(cycle.branch_id)) {
          const shared = Array.isArray(preferredInstructor.allowed_slots) && selections.every(selection => {
            const { startTime } = parseTimeRange(selection.time);
            const weekday = new Date(`${selection.date}T12:00:00`).getDay();
            return !preferredInstructor.allowed_slots.some(slot => Number(slot.weekday)===weekday
              && normalizeTime(slot.startTime||slot.start_time)===startTime);
          });
          if (!shared) throw createError(409, 'El instructor referido tiene ese horario reservado para su sucursal prioritaria');
        }
        const instructorLockKeys = [...allowedDates].flatMap(date=>[...timeSet].map(time=>{
          const { startTime,endTime }=parseTimeRange(time);
          return `instructor-slot:${preferredInstructor.id}:${date}:${startTime}:${endTime}`;
        })).sort();
        for (const lockKey of instructorLockKeys) {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
        }
      }

      await client.query(
        `UPDATE enrollments
         SET theory_modality=$2::text,
             theory_start_time=$8::time,
             theory_end_time=$9::time,
             practical_start_date=$3::date,
             practical_end_date=$4::date,
             practical_start_advanced=$5::boolean,
             practical_start_authorized_by=CASE WHEN $5::boolean THEN $6::uuid ELSE NULL END,
             practical_start_reason=CASE WHEN $5::boolean THEN NULLIF($7::text,'') ELSE NULL END,
             updated_at=NOW()
         WHERE id=$1`,
        [enrollmentId, theorySchedule, practicalDates[0], practicalDates[practicalDates.length - 1], Boolean(requestedPracticalStart && requestedPracticalStart < officialStart && !usesBenitoBaseStart), user.id, practicalStartReason, theoryOption?.startTime||null, theoryOption?.endTime||null],
      );

      if (!theoryPending) {
        await TheoryCourseService.assignEnrollment(client, {
          enrollmentId, studentId, branchId: cycle.branch_id, courseId: cycle.course_id,
          selection: theorySelection, actorId: user.id,
        });
      }

      await client.query(`
        UPDATE course_cycle_schedule_assignments
        SET status = 'cancelado', updated_at = NOW()
        WHERE student_id = $1 AND status = 'activo'
      `, [studentId]);
      await client.query(`
        UPDATE referred_instructor_schedule_blocks
        SET status = 'cancelado', updated_at = NOW()
        WHERE enrollment_id = $1 AND status = 'activo'
      `, [enrollmentId]);

      const inserted = [];
      for (const selection of selections) {
        const { startTime, endTime } = parseTimeRange(selection.time);
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [`${cycleId}:${selection.date}:${startTime}:${endTime}`]
        );

        // Se consulta después de obtener el candado. Una reserva temporal pudo
        // haberse confirmado mientras esta matrícula esperaba su turno.
        const currentOverrides = await client.query(`
          SELECT DISTINCT o.instructor_id
          FROM instructor_availability_overrides o
          WHERE o.active=TRUE AND o.schedule_date=$1::date
            AND o.start_time<$3::time AND o.end_time>$2::time
            AND EXISTS(SELECT 1 FROM course_cycle_instructors cci
              WHERE cci.cycle_id=$4 AND cci.instructor_id=o.instructor_id AND cci.active=TRUE)
            AND NOT EXISTS(SELECT 1 FROM course_cycle_seat_reservations own_seat
              WHERE own_seat.cycle_id=$4 AND own_seat.student_id=$5 AND own_seat.status='activo'
                AND o.reason LIKE CONCAT('RESERVA_CURSO:',own_seat.id::text,':%'))
        `,[selection.date,startTime,endTime,cycleId,studentId]);
        const blockedCount = currentOverrides.rowCount;
        const selectionCapacity = Math.max(capacity - blockedCount, 0);
        if (selectionCapacity < 1) throw createError(409, `Este cupo acaba de ser reservado para ${selection.date} ${selection.time}`);

        const occupiedResult = await client.query(`
          SELECT COUNT(DISTINCT enrollment_id)::int AS occupied
          FROM (
            SELECT enrollment_id FROM course_cycle_schedule_assignments
            WHERE cycle_id = $1
              AND schedule_date=$4::date
              AND start_time = $2::time AND end_time = $3::time AND status = 'activo'
            UNION
            SELECT enrollment_id FROM referred_instructor_schedule_blocks
            WHERE cycle_id = $1
              AND schedule_date=$4::date
              AND start_time = $2::time AND end_time = $3::time AND status = 'activo'
          ) occupied_slots
        `, [cycleId, startTime, endTime, selection.date]);
        const occupied = Number(occupiedResult.rows[0]?.occupied || 0);
        if (occupied >= selectionCapacity) {
          throw createError(409, `No hay cupos disponibles para ${selection.date} ${selection.time}`);
        }

        if (preferredInstructor) {
          const preferredStatus = currentOverrides.rows.some(item => String(item.instructor_id) === String(preferredInstructor.id));
          if (preferredStatus) throw createError(409, `${preferredInstructor.first_name} ${preferredInstructor.last_name} tiene ese cupo reservado el ${selection.date} de ${selection.time}`);
          const theoryOccupiedResult=await client.query(`SELECT 1 FROM theory_class_schedules WHERE instructor_id=$1
            AND (class_date=$2 OR (recurring=TRUE AND ((modality='presencial_regular' AND EXTRACT(DOW FROM $2::date) BETWEEN 1 AND 5)
              OR (modality='presencial_sabado' AND EXTRACT(DOW FROM $2::date)=6))))
            AND active=TRUE AND start_time<$4::time AND end_time>$3::time LIMIT 1`,
          [preferredInstructor.id,selection.date,startTime,endTime]);
          if(theoryOccupiedResult.rows.length)throw createError(409,`${preferredInstructor.first_name} ${preferredInstructor.last_name} tiene clase teórica el ${selection.date}`);
          const instructorOccupiedResult = await client.query(`
            SELECT COUNT(DISTINCT enrollment_id)::int AS occupied
            FROM (
              SELECT enrollment_id FROM course_cycle_schedule_assignments
              WHERE instructor_id = $1
                AND schedule_date = $5::date
                AND start_time < $3::time AND end_time > $2::time
                AND status = 'activo' AND student_id <> $4
              UNION
              SELECT enrollment_id FROM referred_instructor_schedule_blocks
              WHERE instructor_id = $1
                AND schedule_date = $5::date
                AND start_time < $3::time AND end_time > $2::time
                AND status = 'activo' AND student_id <> $4
            ) occupied_slots
          `, [preferredInstructor.id, startTime, endTime, studentId, selection.date]);
          const instructorOccupied = Number(instructorOccupiedResult.rows[0]?.occupied || 0);
          if (instructorOccupied >= Math.max(Number(cycle.capacity_per_instructor) || 1, 1)) {
            throw createError(409, `${preferredInstructor.first_name} ${preferredInstructor.last_name} ya está ocupado el ${selection.date} de ${selection.time}`);
          }
        }

        const insertResult = await client.query(`
          INSERT INTO course_cycle_schedule_assignments (
            cycle_id, enrollment_id, student_id, schedule_date, start_time, end_time, instructor_id, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, 'activo', $8)
          RETURNING *
        `, [cycleId, enrollmentId, studentId, selection.date, startTime, endTime, preferredInstructor?.id || null, user.id]);
        inserted.push(insertResult.rows[0]);
      }

      if (preferredInstructor) {
        // Aunque el estudiante seleccione días distintos en horario rotativo,
        // el instructor queda reservado durante toda la fila del curso. Esto
        // evita que se le asigne otro estudiante en esa misma hora.
        for (const time of timeSet) {
          const { startTime, endTime } = parseTimeRange(time);
          const blockConflict = await client.query(`
            SELECT COUNT(DISTINCT enrollment_id)::int AS occupied
            FROM (
              SELECT enrollment_id FROM course_cycle_schedule_assignments
              WHERE instructor_id = $1 AND start_time < $3::time AND end_time > $2::time
                AND schedule_date = ANY($5::date[]) AND status = 'activo' AND student_id <> $4
              UNION
              SELECT enrollment_id FROM referred_instructor_schedule_blocks
              WHERE instructor_id = $1 AND start_time < $3::time AND end_time > $2::time
                AND schedule_date = ANY($5::date[]) AND status = 'activo' AND student_id <> $4
            ) occupied_slots
          `, [preferredInstructor.id, startTime, endTime, studentId, [...allowedDates]]);
          if (Number(blockConflict.rows[0]?.occupied || 0) >= Math.max(Number(cycle.capacity_per_instructor) || 1, 1)) {
            throw createError(409, `${preferredInstructor.first_name} ${preferredInstructor.last_name} no puede reservar toda la fila ${time}`);
          }
          for (const date of allowedDates) {
            await client.query(`
              INSERT INTO referred_instructor_schedule_blocks (
                enrollment_id, cycle_id, student_id, instructor_id,
                schedule_date, start_time, end_time, status, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6::time, $7::time, 'activo', $8)
            `, [enrollmentId, cycleId, studentId, preferredInstructor.id, date, startTime, endTime, user.id]);
          }
        }
        await client.query(`
          UPDATE enrollment_instructor_assignments
          SET active = false, end_date = CURRENT_DATE, updated_at = NOW()
          WHERE enrollment_id = $1 AND active = true
        `, [enrollmentId]);
        await client.query(`
          INSERT INTO enrollment_instructor_assignments (
            enrollment_id, instructor_id, assigned_by, start_date, end_date, active, observations
          ) VALUES ($1, $2, $3, $4::date, $5::date, true, $6)
        `, [
          enrollmentId,
          preferredInstructor.id,
          user.id,
          practicalDates[0],
          practicalDates[practicalDates.length - 1],
          `Instructor seleccionado durante la inscripción (${cycle.code})`,
        ]);
        await client.query(
          'INSERT INTO history (student_id, action) VALUES ($1, $2)',
          [studentId, `Instructor asignado: ${preferredInstructor.first_name} ${preferredInstructor.last_name} (${cycle.code})`]
        );
      }

      await client.query(
        "UPDATE students SET status = 'horario_seleccionado', updated_at = NOW() WHERE id = $1",
        [studentId]
      );
      await client.query(
        'INSERT INTO history (student_id, action) VALUES ($1, $2)',
        [studentId, rescheduleFromCycleId
          ? `Curso reagendado a ${cycle.code}, inicio ${officialStart}. Motivo: ${rescheduleReason}`
          : requestedPracticalStart
          ? `Inicio práctico anticipado autorizado: ${practicalDates[0]} a ${practicalDates[practicalDates.length - 1]}; curso oficial ${cycle.code} inicia ${officialStart}`
          : `Horario de curso reservado: ${inserted.length} dia(s)`]
      );
      // La reserva provisional bloquea al mismo instructor y horario para
      // terceros. Al activarla, liberamos solo ese bloqueo propio antes de
      // validar la asignación definitiva; todo ocurre dentro de la transacción.
      await client.query(`UPDATE instructor_availability_overrides override
        SET active=FALSE,updated_by=$3,updated_at=NOW()
        WHERE override.active=TRUE AND EXISTS(
          SELECT 1 FROM course_cycle_seat_reservations seat
          WHERE seat.enrollment_id=$1 AND seat.cycle_id=$2 AND seat.status='activo'
            AND override.reason LIKE CONCAT('RESERVA_CURSO:',seat.id::text,':%'))`,[enrollmentId,cycleId,user.id]);
      const instructorAssignment = await CycleInstructorAssignmentService.assignForEnrollment(
        client,
        enrollmentId,
        user.id
      );
      if (instructorAssignment?.instructor_id) {
        const instructorUser = (await client.query('SELECT user_id FROM instructor_profiles WHERE id=$1', [instructorAssignment.instructor_id])).rows[0];
        const student = (await client.query(`SELECT TRIM(CONCAT(first_name,' ',last_name)) name FROM students WHERE id=$1`, [studentId])).rows[0];
        if (instructorUser?.user_id) {
          await NotificationService.createInstructorEvent(client, {
            studentId, userId: instructorUser.user_id, branchId: cycle.branch_id,
            title: rescheduleFromCycleId ? 'Estudiante trasladado de curso' : 'Nuevo estudiante asignado',
            type: rescheduleFromCycleId ? 'warning' : 'info',
            referenceType: rescheduleFromCycleId ? 'COURSE_RESCHEDULED' : 'COURSE_ASSIGNMENT',
            referenceId: cycle.id,
            message: rescheduleFromCycleId
              ? `${student?.name || 'Un estudiante'} fue trasladado al curso ${cycle.code}, que inicia el ${officialStart}. Motivo: ${rescheduleReason}. Cambio realizado por ${user.name || user.username || 'Secretaría'}.`
              : `${student?.name || 'Un estudiante'} fue asignado a tu curso ${cycle.code}, que inicia el ${officialStart}.`,
          });
        }
      }

      await client.query(`UPDATE course_cycle_seat_reservations
        SET status='convertido',converted_at=NOW(),updated_at=NOW()
        WHERE enrollment_id=$1 AND cycle_id=$2 AND status='activo'`,[enrollmentId,cycleId]);

      await client.query('COMMIT');
      return {
        assignments: inserted,
        instructor: instructorAssignment ? {
          id: instructorAssignment.instructor_id,
          name: `${instructorAssignment.first_name || ''} ${instructorAssignment.last_name || ''}`.trim(),
        } : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw createError(409, 'Este cupo acaba de ser ocupado por otra matrícula. Selecciona otro horario o instructor');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = CourseCycleService;
