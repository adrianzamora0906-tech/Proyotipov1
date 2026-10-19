const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../config/database');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const Edit=require('../services/StudentRecordEditService');
test('snapshot conserva resultado y revision con lecturas paralelas; escritura mantiene candados secuenciales',async()=>{
 async function run(lock){
  let active=0,peak=0;
  const client={query:async(sql)=>{
   if(sql.includes('FROM student_documents d')) {
    assert(sql.includes('md5(COALESCE(d.file_path'));
    assert(sql.includes("NULLIF(d.file_path,'') IS NOT NULL"));
   }
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,5));active--;
   if(sql.includes('SELECT * FROM students'))return {rows:[{id:'student',status:'activo'}]};
   if(sql.includes('SELECT e.*,c.name'))return {rows:[{id:'enrollment'}]};
   return {rows:[]};
  }};
  return {snapshot:await Edit.snapshot('student',client,lock),get peak(){return peak;}};
 }
 const read=await run(false),write=await run(true);
 assert.equal(read.snapshot.revision,write.snapshot.revision);
 assert(read.peak>1);assert.equal(write.peak,1);
});
