const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('../backend/node_modules/ws');
const db = require('../backend/config/database');
const Realtime = require('../backend/services/RealtimeService');

const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function waitFor(check) {
  for (let i=0;i<100;i++) { if (check()) return; await pause(50); }
  throw new Error('Realtime test timed out');
}

async function main() {
  let revoked = false;
  const server = http.createServer((req,res) => res.end('ok'));
  const service = new Realtime({ authenticate: (req,res,next) => {
    if (req.headers.authorization !== 'Bearer valid' || revoked) return res.status(401).json({});
    req.user = { id:'test-user', exp:Math.floor(Date.now()/1000)+600 }; next();
  } }).attach(server,origin => origin === 'http://localhost:8080');
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const url = `ws://127.0.0.1:${server.address().port}/api/realtime`;
  const sockets = [];
  const client = await db.getClient();
  const connect = async token => {
    const ws = new WebSocket(url,{origin:'http://localhost:8080'});
    const messages = [];
    ws.on('message',raw => messages.push(JSON.parse(raw)));
    sockets.push(ws);
    await once(ws,'open');
    ws.send(JSON.stringify({type:'authenticate',token}));
    return {ws,messages};
  };
  try {
    await waitFor(() => service.ready);
    const first = await connect('valid'), second = await connect('valid');
    await waitFor(() => first.messages.some(m=>m.type==='ready') && second.messages.some(m=>m.type==='ready'));
    const invalid = await connect('invalid');
    const [code] = await once(invalid.ws,'close');
    assert.equal(code,4001);
    assert(!invalid.messages.some(m=>m.type==='changed'));
    console.log('PASS authentication required; two independent connections ready');

    await client.query('CREATE TEMP TABLE realtime_test_rows(id int primary key,value text)');
    await client.query("CREATE TRIGGER realtime_test AFTER INSERT OR UPDATE OR DELETE ON realtime_test_rows FOR EACH ROW EXECUTE FUNCTION notify_erp_change('students')");
    await client.query('BEGIN');
    await client.query("INSERT INTO realtime_test_rows VALUES(1,'rollback')");
    await client.query('ROLLBACK');
    await pause(350);
    assert(!first.messages.some(m=>m.type==='changed'));
    console.log('PASS rolled-back writes do not broadcast');

    await client.query('BEGIN');
    await client.query("INSERT INTO realtime_test_rows VALUES(1,'committed')");
    await pause(200);
    assert(!first.messages.some(m=>m.type==='changed'));
    await client.query('COMMIT');
    await waitFor(() => first.messages.some(m=>m.type==='changed') && second.messages.some(m=>m.type==='changed'));
    assert.deepEqual(first.messages.find(m=>m.type==='changed'),{type:'changed',topics:['students']});
    console.log('PASS commit immediately reaches both clients without personal data');

    const count = first.messages.filter(m=>m.type==='changed').length;
    await client.query("UPDATE realtime_test_rows SET value='committed' WHERE id=1");
    await pause(300);
    assert.equal(first.messages.filter(m=>m.type==='changed').length,count);
    console.log('PASS unchanged updates do not cause refresh loops');

    first.ws.terminate();
    const reconnected = await connect('valid');
    await waitFor(() => reconnected.messages.some(m=>m.type==='ready'));
    await client.query("UPDATE realtime_test_rows SET value='changed' WHERE id=1");
    await waitFor(() => reconnected.messages.some(m=>m.type==='changed'));
    console.log('PASS reconnect receives subsequent changes');

    const denied = new WebSocket(url,{origin:'https://untrusted.example'});
    denied.on('error',() => {});
    const [,response] = await once(denied,'unexpected-response');
    assert.equal(response.statusCode,403);
    denied.terminate();
    console.log('PASS untrusted origin rejected');

    const closed = once(second.ws,'close');
    revoked = true;
    service.publish('authorization');
    assert.equal((await closed)[0],4001);
    console.log('PASS revoked sessions disconnect');
  } finally {
    sockets.forEach(ws => ws.terminate());
    client.release();
    await service.close();
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode=1; });
