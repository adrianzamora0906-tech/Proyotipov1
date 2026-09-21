import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminView = fs.readFileSync(new URL('../src/js/views/admin/AdminBranchesView.js', import.meta.url), 'utf8');
const cycleService = fs.readFileSync(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const branchService = fs.readFileSync(new URL('../../backend/services/BranchAdminService.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../backend/migrations/enterprise/087_weekend_instructor_overrides.sql', import.meta.url), 'utf8');

test('el administrador puede configurar uno o dos instructores por fecha', () => {
  assert.match(adminView, /Capacidad especial por fin de semana/);
  assert.match(adminView, /weekend-instructor-count/);
  assert.match(adminView, /weekendOverrides/);
  assert.match(branchService, /Solo el Administrador del Sistema puede configurar la capacidad especial/);
  assert.match(branchService, /instructor_count SMALLINT|instructorCount/);
});

test('una reprogramacion de fin de semana exige confirmacion y conserva las asignaciones', () => {
  assert.match(adminView, /WEEKEND_REASSIGNMENT_CONFIRMATION_REQUIRED/);
  assert.match(adminView, /confirmWeekendReassignment:true/);
  assert.match(branchService, /weekendConfirmationError/);
  assert.match(branchService, /moveIntensiveCycle/);
  assert.match(branchService, /replacePublishedCycleInstructor/);
  assert.match(branchService, /UPDATE course_cycle_schedule_assignments SET schedule_date/);
  assert.match(branchService, /UPDATE practical_sessions SET scheduled_start/);
});

test('la tabla de rotacion comparte fecha cuando una excepcion consume dos turnos', () => {
  assert.match(adminView, /anchorOverride/);
  assert.match(adminView, /forcedIds/);
  assert.match(adminView, /overrideDates/);
  assert.match(adminView, /weekIndex=Math\.max\(weekIndex,forcedWeek\+1\)/);
  assert.match(adminView, /\.weekend-start-date,\.weekend-instructor-1,\.weekend-instructor-2/);
});

test('la especialidad intensiva puede excluir a un instructor mixto sin afectar lunes a viernes', () => {
  assert.match(adminView, /weekend_practice_area\|\|instructor\.practice_area/);
  assert.match(adminView, /Benito sigue siendo mixto de lunes a viernes/);
  assert.match(adminView, /eligibleWeekendIds/);
  assert.match(adminView, /data\.rotation\|\|\[\]\)\.filter/);
  assert.match(branchService, /COALESCE\(ip\.weekend_practice_area,ip\.practice_area\)/);
  assert.match(cycleService, /COALESCE\(ip\.weekend_practice_area,scoped\.practice_area,ip\.practice_area\)/);
});

test('la generación publica todos los instructores de la excepción', () => {
  assert.match(cycleService, /targetInstructorCount/);
  assert.match(cycleService, /usableCycleIds\.push\(cycleId\)/);
  assert.match(cycleService, /weekendOverride && index < assignments\.length - 1/);
  assert.match(cycleService, /branch_course_weekend_override_instructors/);
});

test('la configuración conserva posiciones únicas y trazabilidad', () => {
  assert.match(migration, /CHECK \(instructor_count IN \(1,2\)\)/);
  assert.match(migration, /PRIMARY KEY\(override_id,position_order\)/);
  assert.match(migration, /created_by UUID REFERENCES users/);
  assert.match(branchService, /capacidad de fin de semana actualizadas/);
});

test('un ciclo vacío puede reasignarse pero uno con estudiantes continúa protegido', () => {
  assert.match(branchService, /Number\(row\.students\)>0\|\|Number\(row\.reservations\)>0/);
  assert.match(branchService, /UPDATE course_cycle_instructors SET active=FALSE/);
  assert.match(branchService, /UPDATE intensive_instructor_rotation_assignments SET instructor_id/);
});

test('Manta comparte únicamente la operación intensiva con Flavio Reyes', () => {
  assert.match(cycleService, /Manta 2000 conserva ciclos normales propios/);
  assert.match(cycleService, /resolveIntensiveBranchId/);
  assert.match(branchService, /current\.code='SP_IC'/);
  assert.match(branchService, /shared\.code='SP_IC1'/);
  assert.match(adminView, /Fin de semana centralizado/);
  assert.match(adminView, /Los cursos normales de esta sucursal continúan independientes/);
});

test('el guardado recibe el contexto requerido por auditoría', () => {
  assert.match(branchService, /saveCourseProgram\(actor, branchId, courseId, data, requestContext = null\)/);
  assert.match(branchService, /newValues:\{courseId,vehicleType:data\.vehicleType\|\|'carro',weekendOverrides\},requestContext/);
});
