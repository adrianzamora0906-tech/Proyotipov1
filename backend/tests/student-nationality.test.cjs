const {test}=require('node:test'),assert=require('node:assert/strict');
const normalize=require('../services/normalizeStudentIdentity');
test('Datos personales en mayusculas sin alterar correo, claves ni identificadores',()=>{
 const original={firstName:'María José',lastName:'Muñoz',address:'Calle la paz',notes:'observación',nationality:' española ',email:'Mixed@Example.com',password:'AaZ!12',identification:'0956627897'};
 const result=normalize(original);
 assert.equal(result.firstName,'MARÍA JOSÉ');assert.equal(result.lastName,'MUÑOZ');assert.equal(result.address,'CALLE LA PAZ');assert.equal(result.nationality,'ESPAÑOLA');
 for(const key of ['email','password','identification'])assert.equal(result[key],original[key]);
 assert.equal(original.firstName,'María José');
});
test('Nacionalidad opcional y longitud validada',()=>{
 assert.equal(normalize({nationality:''}).nationality,null);
 for(const nationality of [{},[],123,'a'.repeat(101)])assert.throws(()=>normalize({nationality}),{status:422});
 assert.equal(normalize({nationality:'ecuatoriana'}).nationality,'ECUATORIANA');
});
test('SQL normaliza nuevas escrituras sin alterar nacionalidades ni nombres anteriores',{skip:process.env.NATIONALITY_DB_TEST!=='1'},async()=>{
 const db=require('../config/database'),c=await db.getClient();
 try{
  await c.query('BEGIN');await c.query('CREATE TEMP TABLE students(id int,first_name text,last_name text,address text,notes text,email text,status text) ON COMMIT DROP');
  await c.query("INSERT INTO students VALUES(1,'Anterior','Apellido','Direccion','Nota','MiCorreo@Example.com','activo')");
  const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/enterprise/120_student_nationality_uppercase.sql'),'utf8');await c.query(sql);
  let row=(await c.query('SELECT * FROM students WHERE id=1')).rows[0];assert.equal(row.first_name,'Anterior');assert.equal(row.nationality,null);
  await c.query("UPDATE students SET status='completado' WHERE id=1");row=(await c.query('SELECT * FROM students WHERE id=1')).rows[0];assert.equal(row.first_name,'Anterior');
  await c.query("INSERT INTO students(id,first_name,last_name,nationality,email) VALUES(2,'maría','muñoz','española','MiCorreo@Example.com')");
  row=(await c.query('SELECT * FROM students WHERE id=2')).rows[0];assert.equal(row.nationality,'ESPAÑOLA');assert.equal(row.first_name,'MARÍA');assert.equal(row.email,'MiCorreo@Example.com');
 }finally{await c.query('ROLLBACK');c.release();await db.pool.end();}
});
