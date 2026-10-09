const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Service = require('../backend/services/StudentRecordEditService');

async function main() {
  const studentId = '319fc2d6-e9fb-422d-9c3f-1788046054b0';
  const client = await db.getClient();
  const actor = (await db.query("SELECT id,role,branch_id,username FROM users WHERE username='admin'")).rows[0];
  // Every write below is rolled back; permissions model an authorized editor.
  actor.permissions = ['STUDENT_UPDATE','SCHEDULE_ASSIGN','SCHEDULE_CHANGE','PAYMENT_CREATE','DOCUMENT_CREATE','DOCUMENT_UPDATE'];
  const access = { global:true, branchId:actor.branch_id };
  const before = await Service.snapshot(studentId);
  let passed = 0;
  async function test(name, run) {
    await client.query('BEGIN');
    try { await run(); passed++; console.log(`PASS ${name}`); }
    finally { await client.query('ROLLBACK'); }
  }
  try {
    const payload = { revision:before.revision, personal:{notes:'Prueba de edicion - rollback'} };
    const preview = await Service.preview(studentId,payload,actor,access);
    assert.equal((await Service.snapshot(studentId)).revision,before.revision);
    assert.equal(preview.changes.length,1);
    await test('preview is read-only; missing confirmation is rejected',async()=>{
      await assert.rejects(Service.save(studentId,{payload},actor,access,client),/falta confirmar/);
    });
    await test('tampered payload is rejected',async()=>{
      await assert.rejects(Service.save(studentId,{payload:{...payload,personal:{notes:'Manipulado'}},confirmationToken:preview.confirmationToken},actor,access,client),/falta confirmar/);
    });
    await test('personal data, document, account and audit are saved together',async()=>{
      const editable = {revision:before.revision,personal:{firstName:before.student.first_name+' PRUEBA'},
        documents:[{type:before.documents[0].type,name:'prueba.pdf',fileUrl:'data:application/pdf;base64,JVBERi0xLjQ='}]};
      const review=await Service.preview(studentId,editable,actor,access);
      await Service.save(studentId,{payload:editable,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      assert.equal(current.student.first_name,editable.personal.firstName);
      assert.equal(current.account.first_name,editable.personal.firstName);
      assert.equal(current.documents.find(d=>d.type===editable.documents[0].type).observations,'prueba.pdf');
      assert.equal(current.payments[0].balance,before.payments[0].balance);
      assert.equal(current.assignments.length,before.assignments.length);
      const audit=await client.query("SELECT 1 FROM audit_logs WHERE entity_id=$1 AND action='STUDENT_RECORD_EDITED'",[studentId]);
      assert(audit.rows.length>0);
    });
    await test('stale revision is rejected',async()=>{
      await client.query('UPDATE students SET notes=$2 WHERE id=$1',[studentId,'Cambio concurrente de prueba']);
      await assert.rejects(Service.save(studentId,{payload,confirmationToken:preview.confirmationToken},actor,access,client),/datos cambiaron/);
    });
    await test('unchanged data and invalid amounts are rejected',async()=>{
      await assert.rejects(Service.preview(studentId,{revision:before.revision,personal:{firstName:before.student.first_name}},actor,access),/No has realizado cambios/);
      await assert.rejects(Service.preview(studentId,{revision:before.revision,newPayment:{amount:'invalido',method:'efectivo'}},actor,access),/Monto de pago invalido/);
    });
    await test('identification synchronizes account and temporary credentials',async()=>{
      const base='131764698';
      const digits=[...base].map(Number);const sum=digits.reduce((total,n,i)=>total+(i%2===0 ? n*2>9 ? n*2-9 : n*2 : n),0);
      const identification=base+((10-sum%10)%10);
      const edit={revision:before.revision,personal:{identification}};
      const review=await Service.preview(studentId,edit,actor,access);
      await Service.save(studentId,{payload:edit,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      assert.equal(current.student.identification,identification);
      if(before.account.username===before.student.identification){
        assert.equal(current.account.username,identification);
        if(before.account.must_change_password){
          const hash=(await client.query('SELECT password_hash FROM users WHERE id=$1',[before.account.id])).rows[0].password_hash;
          assert(await require('../backend/node_modules/bcryptjs').compare(identification,hash));
          assert.equal(current.account.must_change_password,true);
        }
      }
    });
    await test('financial changes preserve already collected payments',async()=>{
      const paid=Number(before.payments[0].final_amount)-Number(before.payments[0].balance);
      const amount=Number(before.payments[0].final_amount)===190 ? 185 : 190;
      const edit={revision:before.revision,personal:{discountBenefit:null},finance:{finalAmount:amount}};
      const review=await Service.preview(studentId,edit,actor,access);
      await Service.save(studentId,{payload:edit,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      assert.equal(Number(current.payments[0].final_amount),amount);
      assert.equal(Number(current.payments[0].balance),amount-paid);
    });
    const options=await Service.options(studentId,actor,access,{branch_id:before.student.branch_id,course_id:before.enrollments[0].course_id,modality:'intensivo'});
    const target=options.find(c=>c.id!==before.assignments[0].cycle_id && c.instructors.length && c.dates.every(date=>c.slots.some(s=>s.date===date && s.instructorId===c.instructors[0].id && s.available && s.start===c.slots[0].start)));
    assert(target,'A future free cycle is needed for the rollback test');
    const academicPayload={revision:before.revision,personal:{notes:'Prueba de horario - rollback'},academic:{courseId:target.courseId,
      schedulePlan:{rotation:false,preferredInstructorId:target.instructors[0].id,practicalMode:'classes',
        selections:target.dates.map(date=>({cycleId:target.id,date,time:`${target.slots[0].start} - ${target.slots[0].end}`}))}}};
    await test('course, instructor and practical sessions move atomically',async()=>{
      const review=await Service.preview(studentId,academicPayload,actor,access);
      await Service.save(studentId,{payload:academicPayload,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      assert(current.assignments.every(a=>a.cycle_id===target.id && a.instructor_id===target.instructors[0].id));
      assert.equal(current.assignments.length,target.dates.length);
      assert.equal(current.appointments.filter(p=>p.appointment_type==='PRACTICAL_CLASS').length,target.dates.length);
      assert.equal(current.enrollments[0].theory_modality,before.enrollments[0].theory_modality);
    });
    await test('schedule permissions are enforced',async()=>{
      await assert.rejects(Service.preview(studentId,academicPayload,{...actor,permissions:['STUDENT_UPDATE']},access),/permiso para cambiar horarios/);
      const secretary={...actor,permissions:['STUDENT_UPDATE','SCHEDULE_ASSIGN']};
      const context=await Service.context(studentId,secretary,access);
      assert.equal(context.canSchedule,true);
      const review=await Service.preview(studentId,academicPayload,secretary,access);
      assert(review.changes.some(change=>change.field==='Fechas y horario'));
    });
    await test('combined PDF and bachiller confirmation save in one transaction',async()=>{
      const edit={revision:before.revision,documents:[{type:'registro_documentos',name:'registro.pdf',
        fileUrl:'data:application/pdf;base64,JVBERi0xLjQ=',includesBloodCard:true}],cedulaIndicatesBachiller:true};
      const review=await Service.preview(studentId,edit,actor,access);
      await Service.save(studentId,{payload:edit,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      for(const type of ['cedula','carnet_tipo_sangre','certificado_bachiller'])
        assert.equal(current.documents.find(document=>document.type===type)?.file_path,'data:application/pdf;base64,JVBERi0xLjQ=');
    });
    await test('occupied slot rejects the edit; rollback restores all fields',async()=>{
      const current=options.find(c=>c.id===before.assignments[0].cycle_id);
      const occupied=current.slots.find(s=>!s.available);
      assert(occupied,'An occupied slot is needed for this check');
      const blocked={...academicPayload,academic:{courseId:current.courseId,schedulePlan:{rotation:false,preferredInstructorId:occupied.instructorId,practicalMode:'classes',
        selections:current.dates.map(date=>({cycleId:current.id,date,time:`${occupied.start} - ${occupied.end}`}))}}};
      const review=await Service.preview(studentId,blocked,actor,access);
      await assert.rejects(Service.save(studentId,{payload:blocked,confirmationToken:review.confirmationToken},actor,access),/cupo|ocupado|instructor disponible/i);
      assert.equal((await Service.snapshot(studentId)).revision,before.revision);
    });
    if(Number(before.payments[0].balance)>=1) await test('transfer remains pending and does not reduce balance',async()=>{
      const transfer={revision:before.revision,newPayment:{amount:1,method:'transferencia',reference:`TEST-ROLLBACK-${Date.now()}`,transferDate:'2026-10-09'}};
      const review=await Service.preview(studentId,transfer,actor,access);
      await Service.save(studentId,{payload:transfer,confirmationToken:review.confirmationToken},actor,access,client);
      const current=await Service.snapshot(studentId,client);
      assert.equal(current.payments[0].balance,before.payments[0].balance);
      assert.equal(current.transfers.length,before.transfers.length+1);
      assert(current.transfers.some(t=>t.status==='PENDING'));
    });
    assert.equal((await Service.snapshot(studentId)).revision,before.revision,'All live data must remain unchanged');
    console.log(`${passed} integration checks passed; all writes rolled back, original record unchanged.`);
  } finally { client.release(); await db.pool.end(); }
}
main().catch(error=>{console.error(error.message,error.stack);process.exitCode=1;});
