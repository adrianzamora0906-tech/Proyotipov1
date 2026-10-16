const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const RealtimeService = require('../services/RealtimeService');
test('15 dispositivos por WebSocket compiten sin consultar base de datos', async () => {
  const service = new RealtimeService({
    authenticate: (req, res, next) => { req.user = { id:'operator', exp:Date.now()/1000+120 }; next(); },
    getPermissions: async () => ['SCHEDULE_ASSIGN'],
  });
  const server = http.createServer();
  service.wss = new WebSocketServer({ server });
  service.wss.on('connection', ws => service.accept(ws));
  const clients = [];
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const address = `ws://127.0.0.1:${server.address().port}`;
    const received = [];
    for (let i=0; i<15; i++) {
      const ws = new WebSocket(address); clients.push(ws); received[i]=[];
      await new Promise((resolve,reject) => {
        ws.on('error',reject);
        ws.on('open',()=>ws.send(JSON.stringify({ type:'authenticate',token:'test' })));
        ws.on('message',raw=>{const message=JSON.parse(raw);received[i].push(message);if(message.type==='ready')resolve();});
      });
    }
    const slots=[{ instructorId:'3502fb7e-eb33-4338-9375-bc5701009367',cycleId:'646b0818-29bb-496c-a7f9-06fd85b6c9ee',date:'2026-10-19',start:'08:00',end:'09:40' }];
    const results = await Promise.all(clients.map(ws => new Promise(resolve => {
      const requestId=`test-${clients.indexOf(ws)}`;
      const listener = raw => { const message=JSON.parse(raw);if(message.type==='schedule-hold-result'){assert.equal(message.requestId,requestId);ws.off('message',listener);resolve(message.accepted);} };
      ws.on('message',listener);ws.send(JSON.stringify({type:'schedule-hold',slots,requestId}));
    })));
    assert.equal(results.filter(Boolean).length,1);
    const winner=results.findIndex(Boolean);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert(received.every(messages=>messages.some(m=>m.type==='schedule-holds' && m.holds.length===1)));
    clients[winner].close();
    await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(service.selectionHolds.owners.size,0);
  } finally {
    for(const ws of clients)ws.terminate();
    await service.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
