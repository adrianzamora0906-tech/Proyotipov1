const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const db=require('../backend/config/database');
const {createDiagnosticSession,measure}=require('./diagnose-student-performance.cjs');

async function main(){
  const session=await createDiagnosticSession();
  const list=await measure('http://localhost:5000/api','/students?scope=all',session.apiToken);
  const row=(await db.query(`SELECT student_id,SUM(octet_length(file_path)) bytes FROM student_documents
    WHERE student_id=ANY($1::uuid[]) GROUP BY student_id ORDER BY bytes DESC NULLS LAST LIMIT 1`,[list.data.map(s=>s.id)])).rows[0];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
  try{
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:844}});
      await page.route('**/performance-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
      await page.goto('http://localhost:8080/performance-test');
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:384000,uploadThroughput:128000});
      const calls=[];
      page.on('request',request=>{if(request.url().includes(':5000/api/'))calls.push(request.url());});
      const metrics=await page.evaluate(async({session,id})=>{
        window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};
        sessionStorage.setItem('erp_session',JSON.stringify(session));
        const {default:View}=await import('/src/js/views/student-profile/StudentProfileView.js');
        const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');
        Layout.render=async html=>html;Layout.attachEventListeners=()=>{};
        const view=new View({studentId:id});window.view=view;
        view.updateNotificationBadge=()=>{};
        const started=performance.now();
        document.body.innerHTML=await view.render();await view.mount();
        return {initialMs:Math.round(performance.now()-started),bytes:document.body.innerHTML.length,
          pending:document.querySelector('.tab-pane[data-tab="documents"]').innerHTML.length};
      },{session,id:row.student_id});
      assert.equal(calls.filter(url=>url.endsWith('/documents')).length,0);
      assert.equal(metrics.pending,0);assert(metrics.bytes<100000);
      console.log(`PASS ${width}px, CPU 4x / 3Mbps / 100ms: initial ${metrics.initialMs}ms, HTML ${metrics.bytes} characters; no document download`);
      if(width===1280){
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
        await page.click('button[data-tab="documents"]');
        await page.waitForFunction(()=>window.view.documentsLoaded);
        assert.equal(calls.filter(url=>url.endsWith('/documents')).length,1);
        assert(await page.locator('.view-document-btn').count()>0);
        await page.click('button[data-tab="personal"]');await page.click('button[data-tab="documents"]');
        await page.waitForTimeout(100);assert.equal(calls.filter(url=>url.endsWith('/documents')).length,1);
        const errorCalls=await page.evaluate(async()=>{
          const {default:Api}=await import('/src/js/core/api/apiService.js');
          let calls=0;Api.getStudentDocuments=async()=>{calls++;await new Promise(r=>setTimeout(r,40));
            return calls===1?{success:false,error:'Test failure'}:{success:true,data:[]};};
          window.view.documentsLoaded=false;
          await Promise.all([window.view.loadDocumentsTab(),window.view.loadDocumentsTab()]);
          if(calls!==1||window.view.documentsLoaded)throw new Error('Concurrent requests or false loaded state');
          document.querySelector('.tab-pane[data-tab="documents"] button').click();
          await window.view.documentsLoadPromise;
          return {calls,loaded:window.view.documentsLoaded};
        });
        assert.deepEqual(errorCalls,{calls:2,loaded:true});
        console.log('PASS documents load on demand; handlers present; no duplicate download; failed load retries');
      }
      await page.close();
    }
    const page=await browser.newPage();
    await page.route('**/performance-list-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
    await page.goto('http://localhost:8080/performance-list-test');
    const listMetrics=await page.evaluate(async session=>{
      window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};
      sessionStorage.setItem('erp_session',JSON.stringify(session));
      const {default:View}=await import('/src/js/views/students/StudentsView.js');
      const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');
      const {default:Students}=await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');
      const {default:Api}=await import('/src/js/core/api/apiService.js');
      Layout.render=async html=>html;Layout.attachEventListeners=()=>{};
      const original=Api.getStudents;const calls=[];
      Api.getStudents=async params=>{calls.push({...params});return original.call(Api,params);};
      const expected=await Students.getAllStudents({scope:'all',registration_type:'REGULAR'});
      calls.length=0;history.replaceState({},'', '/students');
      const view=new View();const started=performance.now();
      document.body.innerHTML=await view.render();
      const initialMs=Math.round(performance.now()-started);
      const count=document.getElementById('students-result-count').textContent;
      if(!count.includes(String(expected.length)))throw new Error('List count changed');
      if(calls.filter(p=>p.status!=='inhabilitado').length!==1)throw new Error('Duplicate unfiltered list query');
      calls.length=0;
      await view.refreshStudentTable({scope:'all',registration_type:'REGULAR'},1);
      if(calls.filter(p=>p.status!=='inhabilitado').length!==1)throw new Error('Duplicate query when filtering');
      calls.length=0;
      await view.refreshStudentTable({scope:'all',registration_type:'REGULAR',status:'pendiente_pago'},1);
      if(!calls.some(p=>p.status==='pendiente_pago'&&p.registration_type==='REGULAR'))throw new Error('Status filter no longer uses server');
      return {initialMs,expectedRows:expected.length};
    },session);
    console.log(`PASS list ${listMetrics.initialMs}ms, ${listMetrics.expectedRows} rows: no duplicate unfiltered request; status filtering preserved`);
    await page.close();
  }finally{await browser.close();await db.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;db.pool.end().catch(()=>{});});
