jest.mock('../config/database', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('../services/InstructorAdminService', () => ({ resolveScheduleBranchId: jest.fn() }));
jest.mock('../services/CycleInstructorAssignmentService', () => ({ reconcilePracticalSessions: jest.fn() }));
const db = require('../config/database');
const Service = require('../services/WeekendGroupService');
const instructorId = '11111111-1111-4111-8111-111111111111';
const enrollmentId = '22222222-2222-4222-8222-222222222222';
const cycleId = '33333333-3333-4333-8333-333333333333';
const context = { cycle: { id: cycleId, modality: 'intensivo', vehicle_type: 'carro', today: '2026-10-08', start_date: '2026-10-10', end_date: '2026-10-18' }, instructors: [{ id: instructorId }] };
const valid = () => ({ reason: 'Cambio solicitado', changes: [{ enrollmentId, instructorId, slots: [{ date: '2026-10-10', time: '07:00 - 10:10' }] }] });

test('valida las practicas de fin de semana sin cambiar su secuencia', () => {
  expect(Service.validate(valid(), context).slots).toHaveLength(1);
});
test.each([
  ['motivo', data => { data.reason = ''; }],
  ['fecha fuera del curso', data => { data.changes[0].slots[0].date = '2026-10-12'; }],
  ['hora no configurada', data => { data.changes[0].slots[0].time = '08:00 - 09:40'; }],
  ['instructor no habilitado', data => { data.changes[0].instructorId = enrollmentId; }],
  ['matricula duplicada', data => { data.changes.push(data.changes[0]); }],
])('rechaza %s', (_, change) => { const data = valid(); change(data); expect(() => Service.validate(data, context)).toThrow(); });
test('rechaza dos integrantes para un mismo instructor a la misma hora', () => {
  const data = valid(); data.changes.push({ ...data.changes[0], enrollmentId: cycleId });
  expect(() => Service.validate(data, context)).toThrow('Dos estudiantes');
});
test('acepta retirar sin crear un horario ficticio', () => {
  expect(Service.validate({ reason: 'Retiro solicitado', changes: [{ enrollmentId, remove: true }] }, context).slots).toEqual([]);
});
test('no permite cambiar fechas pasadas aunque pertenezcan al curso', () => {
  expect(() => Service.validate(valid(), { ...context, cycle: { ...context.cycle, today: '2026-10-11' } })).toThrow('Fecha pasada');
});
test('valida el permiso de sucursal tambien en el servicio', async () => {
  const InstructorService = require('../services/InstructorAdminService');
  InstructorService.resolveScheduleBranchId.mockResolvedValue('branch-one');
  db.query.mockResolvedValueOnce({ rows: [{ ...context.cycle, branch_id: 'branch-other' }] }).mockResolvedValueOnce({ rows: [{ id: 'branch-one' }] });
  await expect(Service.context({ branch_id: 'branch-one' },cycleId,instructorId)).rejects.toThrow('No tienes acceso');
});
test('un fallo en la version revierte la transaccion y libera la conexion', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  db.getClient.mockResolvedValue(client);
  const spy = jest.spyOn(Service, 'context').mockResolvedValue(context);
  const assignmentSpy = jest.spyOn(Service, 'assignments').mockResolvedValue([]);
  await expect(Service.save({}, cycleId, instructorId, { ...valid(), version: 'stale' })).rejects.toThrow('El grupo cambio');
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  expect(client.release).toHaveBeenCalled();
  spy.mockRestore(); assignmentSpy.mockRestore();
});
