const assert=require('node:assert/strict');
const jwt=require('../backend/node_modules/jsonwebtoken');
const db=require('../backend/config/database');
const {WebSocket}=require('../backend/node_modules/ws');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  let browser,ws;
  try{
    const users=(await db.query("SELECT id,username FROM users WHERE active=true AND username IN ('admin.system','sp_anthony.zamora')")).rows;
    const token=jwt.sign({id:users.find(u=>u.username==='admin.system').id},process.env.JWT_SECRET,{expiresIn:'5m'});
    const limited=jwt.sign({id:users.find(u=>u.username==='sp_anthony.zamora').id},process.env.JWT_SECRET,{expiresIn:'5m'});
    const student=(await db.query('SELECT id,identification FROM students ORDER BY created_at DESC LIMIT 1')).rows[0];
    const get=async(path,auth=token)=>{const response=await fetch(`http://localhost:5000/api${path}`,{headers:{Authorization:`Bearer ${auth}`}});return {status:response.status,body:await response.json()};};
    const denied=await get(`/admin/resource-monitor?studentId=${student.id}`,limited);assert.equal(denied.status,403);
    const deniedExport=await get(`/admin/resource-monitor/export?studentId=${student.id}`,limited);assert.equal(deniedExport.status,403);
    assert.equal((await get('/admin/resource-monitor?studentId=invalid')).status,400);
    const payload=JSON.stringify({diagnostic:'x'.repeat(65536)});
    const rejected=await fetch('http://localhost:5000/api/students',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:payload});
    assert.equal(rejected.status,422);const requestId=rejected.headers.get('x-request-id');
    let captured;
    for(let i=0;i<100;i++){
      captured=(await db.query('SELECT request_bytes,status_code,student_id FROM request_resource_metrics WHERE request_id=$1',[requestId])).rows[0];
      if(captured)break;await wait(20);
    }
    assert.equal(Number(captured.request_bytes),Buffer.byteLength(payload));assert.equal(captured.student_id,null);
    const before=await get(`/admin/resource-monitor?studentId=${student.id}`);assert.equal(before.status,200);
    ws=new WebSocket('ws://localhost:5000/api/realtime',{origin:'http://localhost:8080'});
    const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));ws.on('open',()=>ws.send(JSON.stringify({type:'authenticate',token})));
    for(let i=0;i<100&&!messages.some(m=>m.type==='ready');i++)await wait(20);
    assert(messages.some(m=>m.type==='ready'));
    for(const path of [`/students/${student.id}`,`/students/${student.id}/history`,`/schedules/student/${student.id}`,
      `/students/search?query=${student.identification}`,`/students?search=${student.identification}&scope=all`])assert.equal((await get(path)).status,200);
    let after;
    for(let i=0;i<100;i++){
      await wait(40);after=await get(`/admin/resource-monitor?studentId=${student.id}`);
      if(['PROFILE','HISTORY','SCHEDULE','SEARCH'].every(stage=>
        Number(after.body.data.studentResources.stages.find(s=>s.stage===stage).operations)>
        Number(before.body.data.studentResources.stages.find(s=>s.stage===stage).operations)))break;
    }
    for(const stage of ['PROFILE','HISTORY','SCHEDULE','SEARCH'])assert(
      after.body.data.studentResources.stages.find(s=>s.stage===stage).operations>
      before.body.data.studentResources.stages.find(s=>s.stage===stage).operations,stage);
    assert(messages.some(m=>m.type==='changed'&&m.topics.includes('resources')));
    assert(after.body.data.rows.every(row=>row.historical||row.student_id===student.id));
    assert(after.body.data.rows.some(row=>row.route==='/api/students'&&row.operation==='STUDENT_SEARCH'));
    const storage=after.body.data.studentResources.storage;
    assert.equal(storage.logicalBytes,storage.recordsBytes+storage.contentBytes);assert.equal(storage.physicalDiskBytes,null);
    const file=await fetch(`http://localhost:5000/api/admin/resource-monitor/export?studentId=${student.id}`,{headers:{Authorization:`Bearer ${token}`}});
    assert.equal(file.status,200);const workbook=new (require('../backend/node_modules/exceljs').Workbook)();await workbook.xlsx.load(await file.arrayBuffer());
    assert(workbook.getWorksheet('Etapas del estudiante'));assert(workbook.getWorksheet('Almacenamiento logico'));
    console.log('PASS live API: administrator-only access, identity filtering, four read stages, logical storage, Excel and WebSocket');
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.route('**/resource-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
      await page.goto('http://localhost:8080/resource-test');
      await page.evaluate(async token=>{
        window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};sessionStorage.setItem('erp_api_token',token);
        const {default:View}=await import('/src/js/views/admin/AdminResourceMonitorView.js');
        const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');Layout.render=async html=>html;
        const view=new View();window.view=view;document.body.innerHTML=await view.render();
        await Promise.all(['/src/assets/css/base/globals.css','/src/assets/css/components/components.css','/src/assets/css/pages/manager-dashboard.css','/src/assets/css/pages/resource-monitor.css'].map(href=>new Promise((resolve,reject)=>{
          const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=reject;document.head.append(link);
        })));
        await view.mount();
      },token);
      await page.fill('#resource-student-query',student.identification);
      await page.waitForFunction(id=>window.view.studentId===id&&!window.view.loading,student.id);
      assert(await page.locator('#resource-student-storage').innerText().then(text=>text.includes(student.identification)));
      assert.equal(await page.locator('#resource-student-stages tbody tr').count(),12);
      assert(await page.locator('#resource-purchase').evaluate(element=>element.hidden));
      const fits=await page.evaluate(()=>[...document.querySelectorAll('.student-resource-stats>div')].every(e=>e.scrollWidth<=e.clientWidth));assert(fits);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page must not overflow horizontally');
      await page.screenshot({path:`.tmp/student-resources-${width}.png`,fullPage:true});
      await page.fill('#resource-student-query','');
      await page.waitForFunction(()=>!window.view.studentId&&!window.view.loading);
      assert.equal(await page.locator('#resource-student-storage').innerText(),'Sin estudiante seleccionado.');
      console.log(`PASS ${width}px: student search/filter/clear, 12 stages, bounded metric tiles and screenshot`);
      await page.close();
    }
  }finally{ws?.terminate();await browser?.close();await db.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
