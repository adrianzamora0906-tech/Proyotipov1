const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const db = require('../backend/config/database');
const Realtime = require('../backend/services/RealtimeService');

async function main() {
  const server = http.createServer((req,res) => res.end('ok'));
  const service = new Realtime({authenticate:(req,res,next) => {
    if (req.headers.authorization !== 'Bearer browser-test') return res.status(401).json({});
    req.user={id:'test',exp:Math.floor(Date.now()/1000)+600}; next();
  }}).attach(server,origin => origin === 'http://localhost:8080');
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const browser = await chromium.launch({channel:'msedge',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
  try {
    for(let i=0;i<100&&!service.ready;i++) await new Promise(r=>setTimeout(r,50));
    assert(service.ready);
    const pages=[];
    for(let i=0;i<2;i++) {
      const context=await browser.newContext(); const page=await context.newPage();
      page.on('console',message=> { if(message.type()==='error') console.log('Browser:',message.text()); });
      await page.route('**/realtime-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
      await page.goto('http://localhost:8080/realtime-test');
      await page.evaluate(async port=>{
        window.__SPORTMANCAR_CONFIG__={API_BASE_URL:`http://localhost:${port}/api`};
        sessionStorage.setItem('erp_api_token','browser-test');
        window.received=[];
        window.addEventListener('erp:realtime',e=>window.received.push(e.detail.topics));
        const {realtimeClient}=await import('/src/js/core/realtime/RealtimeClient.js');
        window.client=realtimeClient; realtimeClient.start();
      },server.address().port);
      await page.waitForFunction(()=>window.client.connected);
      pages.push(page);
    }
    service.publish('students');
    for(const page of pages) await page.waitForFunction(()=>window.received.some(t=>t.includes('students')));
    console.log('PASS two isolated browser sessions receive live changes');
    for(const page of pages) assert.equal(await page.evaluate(()=>window.received.some(t=>t.includes('resync'))),false,'Primera conexion no debe refrescar la pantalla');
    const page=pages[0];
    await page.evaluate(async()=>{
      const {default:App}=await import('/src/js/app.js');
      const {authService}=await import('/src/js/core/auth/AuthService.js');
      authService.isAuthenticated=()=>true;
      window.refreshes=0;
      const app=Object.create(App.prototype);
      window.routeRemounts=0;
      app.router={getCurrentRoute:()=>({name:'students'}),renderRoute:async()=>window.routeRemounts++,currentComponent:{refreshRealtime:async()=>window.refreshes++}};
      app.setupDataSync(); window.testApp=app;
      history.replaceState({},'', '/students');
      window.sendChange=()=>window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['students']}}));
      window.sendChange(); window.sendChange();
    });
    await page.waitForFunction(()=>window.refreshes===1);
    await page.evaluate(()=>{
      const modal=document.createElement('div'); modal.className='modal-overlay'; modal.textContent='Open';document.body.append(modal);window.sendChange();
    });
    await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.refreshes),1);
    await page.evaluate(()=>document.querySelector('.modal-overlay').remove());
    await page.waitForFunction(()=>window.refreshes===2);
    await page.evaluate(()=>{
      const form=document.createElement('form');form.innerHTML='<input id="editable" value="pending">';document.body.append(form);
      document.getElementById('editable').dispatchEvent(new Event('input',{bubbles:true}));
      window.testApp.dirtyRealtimeForms.add(form);window.sendChange();
    });
    await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.refreshes),2);
    assert.equal(await page.inputValue('#editable'),'pending');
    await page.evaluate(()=>document.querySelector('form').remove());
    await page.waitForFunction(()=>window.refreshes===3);
    console.log('PASS burst coalescing; open modal and unsaved form protected; deferred refresh resumes');
    await page.evaluate(()=>{
      history.replaceState({},'', '/instructor');
      window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['activity','admin','resources']}}));
    });
    await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.refreshes),3);
    await page.evaluate(()=>{
      history.replaceState({},'', '/students');
      window.dispatchEvent(new CustomEvent('erp:dataChanged',{detail:{collection:'payments'}}));
    });
    await page.waitForFunction(()=>window.refreshes===4);
    await page.evaluate(()=>{
      window.testApp.router.currentComponent={};
      const form=document.createElement('form');form.id='test-filter';form.innerHTML='<input id="filter-value" value="Maria"><button type="button">Filtrar</button>';document.body.append(form);
      window.shell=document.body;window.filterNode=document.getElementById('filter-value');
      window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['students','resync']}}));
    });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(()=>window.routeRemounts),0);
    assert.equal(await page.evaluate(()=>document.getElementById('filter-value')===window.filterNode),true);
    assert.equal(await page.inputValue('#filter-value'),'Maria');
    console.log('PASS unrelated events ignored, local events partial, unsupported views never remount; filters retained');
    await pages[1].evaluate(()=>window.client.socket.close());
    await pages[1].waitForFunction(()=>window.client.connected);
    service.publish('payments');
    await pages[1].waitForFunction(()=>window.received.some(t=>t.includes('payments')));
    console.log('PASS automatic browser reconnection');
  } finally { await browser.close();await service.close();await new Promise(r=>server.close(r));await db.pool.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
