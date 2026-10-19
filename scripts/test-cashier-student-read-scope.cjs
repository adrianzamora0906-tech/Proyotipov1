const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const StudentService = require('../backend/services/StudentService');
const Controller = require('../backend/controllers/studentController');
(async () => {
  const originalQuery = db.query;
  const originalGet = StudentService.getById;
  try {
    db.query = async () => ({ rows: [{ city_id: 'local-city' }] });
    const request = {user:{id:'cashier',role:'caja',branch_id:'20857100-415d-4072-94cb-7ad8635d9dc4'},authorization:{roles:['CASHIER'],permissions:['STUDENT_VIEW','PAYMENT_VIEW','PAYMENT_CREATE']},query:{},params:{id:'20857100-415d-4072-94cb-7ad8635d9dc3'}};
    assert.deepEqual(await Controller.readScope(request), {});
    let receivedScope;
    StudentService.getById = async (id,scope) => {receivedScope=scope;return {id};};
    await Controller.getById(request,{json:()=>{}},error=>{throw error;});
    assert.deepEqual(receivedScope, {});
    const secretary={...request,user:{...request.user,role:'secretaria'},authorization:{...request.authorization,roles:['SECRETARY']}};
    assert.equal((await Controller.readScope(secretary)).city_id,'local-city');
    const readOnly={...request,authorization:{...request.authorization,permissions:['STUDENT_VIEW','PAYMENT_VIEW']}};
    assert.equal((await Controller.readScope(readOnly)).city_id,'local-city');
    console.log('PASS: Caja con consulta y cobro lee perfiles entre sucursales; otros perfiles mantienen alcance.');
  } finally {db.query=originalQuery;StudentService.getById=originalGet;await db.pool.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
