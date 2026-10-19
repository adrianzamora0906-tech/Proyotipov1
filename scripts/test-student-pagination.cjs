const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const calls=[];const db={query:async(sql,params=[])=>{calls.push({sql,params});if(sql.includes('COUNT(*) AS total')||sql.includes('COUNT(*) total'))return {rows:[{total:25}]};return {rows:[]};}};
const context={require:p=>p==='../config/database'?db:{},module:{exports:{}},console};vm.runInNewContext(fs.readFileSync('backend/services/StudentService.js','utf8'),context);const service=context.module.exports;
(async()=>{
await service.getAll({paginated:true,page:2,branch_id:'branch',registration_type:'REGULAR'});
let q=calls.at(-1);assert(q.sql.includes('LIMIT $'));assert.deepEqual(Array.from(q.params.slice(-2)),[10,10]);assert(q.params.includes('branch'));assert(!q.sql.includes('s.*'));
await service.getAll({paginated:true,page:999,group:'instructor'});assert.equal(calls.at(-1).params.at(-1),20);
await service.getAll({aggregate:true,city_id:'city'});q=calls.at(-1);assert(q.sql.includes('GROUP BY'));assert(!q.sql.includes("s.status <> 'inhabilitado'"));assert(q.params.includes('city'));
await service.getActiveSeatReservations({paginated:true,page:2,branch_id:'branch'});q=calls.at(-1);assert.deepEqual(Array.from(q.params.slice(-2)),[10,10]);assert(!q.sql.startsWith('SELECT reservation'));assert(q.sql.includes('LIMIT $'));assert(q.sql.includes('OFFSET $'));
await service.getAll({branch_id:'branch'});assert(!calls.at(-1).sql.includes(' OFFSET '));
console.log('OK: SQL paginado, limite 10, alcance, ultima pagina, agrupacion, contadores y contrato anterior. Sin conexion a base de datos.');
})().catch(e=>{console.error(e);process.exitCode=1});
