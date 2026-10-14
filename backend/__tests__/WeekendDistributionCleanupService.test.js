jest.mock('../services/AuditService',()=>({log:jest.fn()}));
const Audit=require('../services/AuditService');
const Cleanup=require('../services/WeekendDistributionCleanupService');
const options={programId:'program',branchId:'branch',courseId:'course',vehicleType:'moto',actor:{id:'admin',role:'admin'}};
const row={id:'rotation',cycle_id:'cycle',start_date:'2026-10-17',position_order:2};
beforeEach(()=>jest.clearAllMocks());
test('retira solo ciclo adicional futuro sin alumnos, reservas o bloques',async()=>{
  const client={query:jest.fn().mockResolvedValue({rows:[]})};
  client.query.mockResolvedValueOnce({rows:[row]});
  expect(await Cleanup.reconcile(client,options)).toEqual({retired:['cycle'],protectedCycles:[]});
  expect(client.query).toHaveBeenCalledWith('UPDATE course_cycles SET active=FALSE,updated_at=NOW() WHERE id=$1',['cycle']);
  expect(client.query).toHaveBeenCalledWith('UPDATE intensive_instructor_rotation_assignments SET active=FALSE,cycle_id=NULL,updated_at=NOW() WHERE id=$1',['rotation']);
  expect(Audit.log.mock.calls[0][0].action).toBe('WEEKEND_DISTRIBUTION_CYCLE_RETIRED');
});
test.each(['alumno','reserva','bloque'])('conserva ciclo con %s',async()=>{
  const client={query:jest.fn().mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[{occupied:1}]})};
  expect(await Cleanup.reconcile(client,options)).toEqual({retired:[],protectedCycles:['cycle']});
  expect(client.query).toHaveBeenCalledTimes(2);
  expect(Audit.log).not.toHaveBeenCalled();
});
test('limita limpieza al programa y a posiciones fuera de la distribucion',async()=>{
  const client={query:jest.fn().mockResolvedValue({rows:[]})};
  await Cleanup.reconcile(client,options);
  const [sql,params]=client.query.mock.calls[0];
  expect(sql).toContain('cycle.course_id=$4');
  expect(sql).toContain('cycle.start_date>=CURRENT_DATE');
  expect(sql).toContain('ELSE 1 END');
  expect(sql).toContain('FOR UPDATE OF rotation,cycle');
  expect(params).toEqual(['program','branch','moto','course']);
});
