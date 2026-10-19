process.env.LOG_LEVEL='info';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const db=require('../backend/config/database');
const queries=[];const sandbox={module:{exports:{}},require:p=>p==='../config/database'?{query:async(sql,params=[])=>{if(/^(SELECT|WITH)/.test(sql.trimStart())&&!sql.includes('refresh_due_'))queries.push({sql,params:[...params]});return {rows:sql.includes('COUNT(*) AS total')?[{total:0}]:[]};}}:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/services/StudentService.js'),'utf8'),sandbox);
(async()=>{
 await sandbox.module.exports.getAll({paginated:true,page:1,registration_type:'REGULAR'});
 const report={measuredAt:new Date().toISOString(),kind:'Lecturas locales, sin prueba de concurrencia',queries:[]};
 const client=await db.getClient();try{
 await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
 for(let i=0;i<queries.length;i++){
 const samples=[];let result;for(let j=0;j<3;j++){result=(await client.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+queries[i].sql,queries[i].params)).rows[0]['QUERY PLAN'][0];samples.push(result['Execution Time']);}
 report.queries.push({name:i===0?'list-count':'list-page-10',executionMs:samples,rows:result.Plan['Actual Rows'],sharedHitBlocks:result.Plan['Shared Hit Blocks'],sharedReadBlocks:result.Plan['Shared Read Blocks']});}
 const selected=(await client.query('SELECT student_id FROM student_documents GROUP BY student_id ORDER BY SUM(octet_length(file_path)) DESC LIMIT 1')).rows[0];
 if(selected){
 const full=await client.query('SELECT sd.id,sd.student_id,dt.code type,dt.name,sd.file_path file_url,sd.observations,sd.uploaded_at,sd.created_at FROM student_documents sd JOIN document_types dt ON dt.id=sd.document_type_id WHERE student_id=$1',[selected.student_id]);
 const metadata=full.rows.map(row=>({...row,file_url:row.file_url?'/api/students/'+row.student_id+'/documents/'+row.id+'/content':null}));
 report.documents={sample:'expediente con mayor peso documental',count:full.rows.length,fullJsonBytes:Buffer.byteLength(JSON.stringify(full.rows)),metadataJsonBytes:Buffer.byteLength(JSON.stringify(metadata))};
 }
 report.counts=(await client.query('SELECT (SELECT COUNT(*) FROM students)::int students,(SELECT COUNT(*) FROM history)::int history,(SELECT COUNT(*) FROM student_documents)::int documents')).rows[0];
 await client.query('ROLLBACK');
 }finally{client.release();}
 const target=path.resolve(process.argv[2]||'.tmp/student-performance.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.pool.end());
