jest.mock('../config/database',()=>({query:jest.fn()}));
jest.mock('../services/AuditService',()=>({log:jest.fn()}));
const db = require('../config/database');
const Audit = require('../services/AuditService');
const Service = require('../services/AttendanceAuditService');
const req = {user:{id:'student-user',role:'estudiante'},params:{token:'private-token'},body:{lastFour:'4321',latitude:1,longitude:2},requestContext:{requestId:'request'}};
beforeEach(()=>{
  jest.clearAllMocks();
  db.query.mockResolvedValue({rows:[{student_id:'student',student_name:'Ana Perez',session_id:'session',branch_id:'branch',attendance_phase:'ENTRY',instructor_name:'Jose Orlando'}]});
  Audit.log.mockResolvedValue();
});
test('audita un intento aceptado sin QR, digitos o ubicacion',async()=>{
  const result = {started:true};
  expect(await Service.run(req,'confirm',async()=>result)).toBe(result);
  const entry = Audit.log.mock.calls[0][0];
  expect(entry.action).toBe('ATTENDANCE_QR_ATTEMPT_ACCEPTED');
  expect(entry.userId).toBe('student-user');
  expect(entry.description).toContain('Ana Perez');
  expect(entry.description).toContain('Jose Orlando');
  expect(JSON.stringify(entry)).not.toMatch(/private-token|4321|latitude|longitude/);
  expect(db.query.mock.calls[0][0]).toContain('enrollment.student_id=u.student_id');
});
test('persiste rechazo sin cambiar el error original',async()=>{
  const error = Object.assign(new Error('El instructor ya tiene otra clase activa'),{status:409});
  await expect(Service.run(req,'confirm',async()=>{throw error;})).rejects.toBe(error);
  const entry = Audit.log.mock.calls[0][0];
  expect(entry.action).toBe('ATTENDANCE_QR_ATTEMPT_FAILED');
  expect(entry.metadata.statusCode).toBe(409);
  expect(entry.description).toContain(error.message);
});
test('codigo invalido registra solo alumno sin asociar otra clase',async()=>{
  db.query.mockResolvedValue({rows:[{student_id:'student',student_name:'Ana',user_branch_id:'home'}]});
  await Service.record({...req,params:{code:'123456'}},'scan',Object.assign(new Error('Codigo invalido'),{status:404}));
  const entry = Audit.log.mock.calls[0][0];
  expect(entry.entityId).toBe(req.user.id);
  expect(entry.branchId).toBe('home');
  expect(entry.metadata.method).toBe('code');
  expect(JSON.stringify(entry)).not.toContain('123456');
});
test('error de auditoria no convierte asistencia confirmada en fallo',async()=>{
  Audit.log.mockRejectedValue(new Error('unavailable'));
  const spy = jest.spyOn(console,'error').mockImplementation(()=>{});
  expect(await Service.run(req,'location',async()=>({allowed:true}))).toEqual({allowed:true});
  spy.mockRestore();
});
test('no publica errores internos del servidor',async()=>{
  await Service.record(req,'confirm',new Error('database secret detail'));
  expect(Audit.log.mock.calls[0][0].description).not.toContain('database secret detail');
});
