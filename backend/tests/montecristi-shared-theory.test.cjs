const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../config/database');
const calls=[];
const client={query:async(sql,params)=>{
 calls.push({sql,params});
 if(sql.includes('FROM branches current'))return {rows:[{branch_id:'flavio'}]};
 if(sql.includes('FROM theory_class_schedules'))return {rows:[{instructor_id:'theory-teacher'}]};
 if(sql.includes('FROM theory_course_groups'))return {rows:[{id:'shared-group',capacity:30,occupied:12}]};
 if(sql.includes('SELECT COUNT(*)::int occupied'))return {rows:[{occupied:12}]};
 return {rows:[]};
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:client};
const Theory=require('../services/TheoryCourseService');
test('Montecristi usa profesor, grupo y cupos de Flavio sin trasladar matricula',async()=>{
 const result=await Theory.assignEnrollment(client,{enrollmentId:'montecristi-enrollment',studentId:'student',branchId:'montecristi',courseId:'car',selection:'presencial_regular',actorId:'orlando'});
 assert.equal(result.id,'shared-group');
 const resolution=calls.find(c=>c.sql.includes('FROM branches current'));
 assert(resolution.sql.includes("'SP_MC'"));
 assert(resolution.sql.includes("current.code='SP_MC' OR reference.city_id=current.city_id"));
 assert.equal(resolution.params[0],'montecristi');
 assert.equal(calls.find(c=>c.sql.includes('FROM theory_class_schedules')).params[0],'flavio');
 assert.equal(calls.find(c=>c.sql.includes('FROM theory_course_groups')).params[0],'flavio');
 assert(calls.some(c=>c.sql.includes('INSERT INTO theory_group_students') && c.params[0]==='shared-group' && c.params[1]==='montecristi-enrollment'));
 assert(!calls.some(c=>/UPDATE (enrollments|students|enrollment_instructor_assignments)/.test(c.sql)));
});
