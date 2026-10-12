const { performance } = require('node:perf_hooks');
const jwt = require('../backend/node_modules/jsonwebtoken');
const db = require('../backend/config/database');

async function createDiagnosticSession() {
  const row = (await db.query('SELECT id FROM users WHERE active=true AND username=$1 LIMIT 1',
    [process.env.DIAGNOSTIC_USERNAME||'sp_anthony.zamora'])).rows[0];
  if (!row) throw new Error('Active diagnostic account not found');
  const token = jwt.sign({id:row.id},process.env.JWT_SECRET,{expiresIn:'5m'});
  const response = await fetch('http://localhost:5000/api/auth/me',{headers:{Authorization:`Bearer ${token}`}});
  const result = await response.json();
  if (!result.success) throw new Error('Diagnostic account cannot authenticate');
  return {...result.user,apiToken:token};
}

async function measure(base,path,token) {
  const started=performance.now();
  const response=await fetch(`${base}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  const headersMs=performance.now()-started;
  const raw=await response.text();
  const receivedMs=performance.now()-started;
  const parsed=JSON.parse(raw);
  return {headersMs:Math.round(headersMs),totalMs:Math.round(performance.now()-started),
    parseMs:Math.round(performance.now()-started-receivedMs),bytes:Buffer.byteLength(raw),status:response.status,data:parsed.data};
}

async function main() {
  try {
    const session=await createDiagnosticSession();
    const list=await measure('http://localhost:5000/api','/students?scope=all',session.apiToken);
    if (!Array.isArray(list.data)||!list.data.length) throw new Error('No accessible students for measurement');
    const candidates=await db.query(`SELECT student_id,SUM(octet_length(file_path)) bytes FROM student_documents
      WHERE student_id=ANY($1::uuid[]) GROUP BY student_id ORDER BY bytes DESC NULLS LAST LIMIT 1`,[list.data.map(s=>s.id)]);
    const id=candidates.rows[0]?.student_id||list.data[0].id;
    console.log(`Accessible students: ${list.data.length}; largest accessible document payload: ${candidates.rows[0]?.bytes||0} bytes`);
    const paths=[['health','/health'],['list','/students?scope=all'],['summary','/students?scope=all&registration_type=REGULAR'],
      ['branches','/students/branches/all'],['reservations','/students/reservations?scope=all'],
      ['profile',`/students/${id}`],['documents',`/students/${id}/documents`],['payments',`/students/${id}/payments`],
      ['balance',`/students/${id}/balance`],['schedule',`/schedules/student/${id}`],['history',`/students/${id}/history`]];
    for(const base of ['http://localhost:5000/api','https://sport-adrian.tailf77b78.ts.net/api']) {
      console.log(base);
      for(const [name,path] of paths) {
        try { const {data,...metrics}=await measure(base,path,session.apiToken);console.log(name,JSON.stringify(metrics)); }
        catch(error) { console.log(name,JSON.stringify({error:error.message})); }
      }
    }
    const stats=await db.query(`SELECT CASE WHEN route ~ '^/api/students/[0-9a-f-]{36}/documents$' THEN 'documents'
      WHEN route ~ '^/api/students/[0-9a-f-]{36}$' THEN 'profile'
      WHEN route='/api/students' THEN 'list' ELSE 'other_student_queries' END category,
      COUNT(*)::int requests,ROUND(AVG(duration_ms)::numeric,1) avg_ms,
      ROUND(percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms)::numeric,1) p95_ms,
      ROUND(AVG(db_duration_ms)::numeric,1) avg_db_ms,ROUND(AVG(db_query_count)::numeric,1) avg_queries,
      MAX(response_bytes) max_bytes FROM request_resource_metrics WHERE method='GET' AND status_code=200
      AND route LIKE '/api/students%' AND created_at>NOW()-INTERVAL '24 hours' GROUP BY 1 ORDER BY 1`);
    console.log('Last 24h backend metrics (includes diagnostic requests):');console.table(stats.rows);
  } finally { await db.pool.end(); }
}

module.exports={createDiagnosticSession,measure};
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
