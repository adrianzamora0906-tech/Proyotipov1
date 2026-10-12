const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const db=require('../backend/config/database');
const Resource=require('../backend/services/ResourceTelemetryService');
const StudentResource=require('../backend/services/StudentResourceService');

async function main(){
  const studentId=randomUUID(),branchId=randomUUID(),enrollmentId=randomUUID(),otherId=randomUUID();
  const records=[];const original=db.pool.query;let notifications=0;
  Resource.notify=()=>notifications++;
  db.pool.query=async(sql,values)=>{
    if(sql.includes('SELECT s.id student_id')){
      await new Promise(resolve=>setTimeout(resolve,80));
      return {rows:values[0]===studentId||values[1]==='1317646972'?[{student_id:studentId,branch_id:branchId,enrollment_id:enrollmentId}]:[]};
    }
    if(sql.includes('INSERT INTO request_resource_metrics')){records.push(values);return {rows:[]};}
    throw new Error('Unexpected query');
  };
  const scenarios=[
    ['POST','/api/students',{identification:'1317646972',password:'never-persist'}, {id:studentId},'REGISTER',studentId],
    ['GET','/api/students/search',undefined,[{id:studentId,identification:'1317646972'}],'SEARCH',studentId,{query:'1317646972'}],
    ['GET','/api/students/search',undefined,[{id:studentId},{id:otherId}],'SEARCH',null,{query:'Santos'}],
    ['GET','/api/students',undefined,[{id:studentId}],'SEARCH',studentId,{search:'Nombre unico'}],
    ['GET',`/api/students/${studentId}`,undefined,{id:studentId},'PROFILE',studentId],
    ['PUT',`/api/students/${studentId}/record`,{email:'never-persist@example.com'},{id:otherId},'UPDATE',studentId],
    ['POST',`/api/students/${studentId}/documents`,{fileUrl:'data:never-persist'},{id:otherId},'DOCUMENTS',studentId],
    ['GET',`/api/students/${studentId}/history`,undefined,[],'HISTORY',studentId],
    ['GET',`/api/schedules/student/${studentId}`,undefined,null,'SCHEDULE',studentId],
    ['POST','/api/payments/register',{cedula:'1317646972'},{id:otherId},'PAYMENTS',studentId],
    ['GET','/api/students/branches/all',undefined,[{id:otherId}],null,null],
    ['DELETE',`/api/documents/${otherId}`,undefined,{},'DOCUMENTS',studentId,{},studentId],
    ['GET','/api/documents/mobile-upload-token/never-persist-token/result',undefined,{},'DOCUMENTS',null],
  ];
  try{
    for(const [method,path,body,data,stage,expected,query={},hint] of scenarios){
      const expectedCount=records.length+1;
      const req=Object.assign(new EventEmitter(),{method,path,body,query,user:{id:otherId,branch_id:otherId},requestContext:{requestId:randomUUID(),studentId:hint},get:()=>undefined});
      const res=new EventEmitter();res.statusCode=200;res.get=()=>undefined;res.json=value=>value;
      const middleware=Resource.middleware;
      middleware(req,res,()=>{if(body)req.emit('data',Buffer.from(JSON.stringify(body)));Resource.recordQuery(3.5);res.json({success:true,data});res.emit('finish');});
      for(let i=0;i<100&&records.length<expectedCount;i++)await new Promise(r=>setTimeout(r,10));
      assert.equal(records.length,expectedCount);
      const record=records.at(-1);
      assert.equal(record[14],expected,`${method} ${path}: student attribution`);
      assert.equal(record[12],1);assert.equal(record[13],3.5);
      assert.equal(record[10],body?Buffer.byteLength(JSON.stringify(body)):0);
      assert(record[7]<70,'Telemetry enrichment must not inflate duration');
      assert.equal(StudentResource.stage(method,path,record[3]),stage);
      assert(!JSON.stringify(record).includes('never-persist'));
      if(expected)assert.equal(record[2],branchId);
    }
    assert.equal(records.length,scenarios.length);assert.equal(notifications,scenarios.length);
    assert.throws(()=>StudentResource.validate({studentId:'invalid'}),error=>error.statusCode===400||error.status===400);
    console.log('PASS 13 operation shapes: registration, both search routes, profile, update, documents, history, schedules, payments and token redaction');
    console.log('PASS distinct entity IDs, shared-query attribution, branch, DB counters, payload privacy and timing boundaries');
  }finally{db.pool.query=original;Resource.notify=null;await db.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
