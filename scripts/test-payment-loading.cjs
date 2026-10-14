const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('**/payment-loading-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
    await page.goto('http://localhost:8080/payment-loading-test');
    const result=await page.evaluate(async()=>{
      const {authService}=await import('/src/js/core/auth/AuthService.js');
      let user={id:'one',apiToken:'session-one',permissions:['PAYMENT_VIEW']};
      authService.getCurrentUser=()=>user;authService.can=()=>false;authService.refreshAuthorization=async()=>{};
      const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');
      Layout.render=async content=>content;Layout.attachEventListeners=()=>{};
      const {default:Payments}=await import('/src/js/services/PaymentService.js?v=voucher-pago-20260824');
      Payments.getPendingPayments=async()=>[{student:{id:'student',firstName:'Alumno',lastName:'Prueba',cedula:'123',course:'Moto'},balance:125}];
      const {default:Api}=await import('/src/js/core/api/apiService.js');
      let branchCalls=0,receiptCalls=0,resolveReceipts;
      Api.getBranches=async()=>{branchCalls++;return {success:true,data:[]};};
      Api.getReceipts=()=>{receiptCalls++;return new Promise(resolve=>{resolveReceipts=resolve;});};
      const {default:View}=await import('/src/js/views/cash/PendingPaymentsView.js');
      View.branchCache=null;
      const view=new View();document.body.innerHTML=await view.render();
      const notBlocking=receiptCalls===0;
      await view.mount();
      const pendingVisible=document.querySelector('#pending-payments-body').textContent.includes('Alumno');
      const loading=document.querySelector('.cash-kpi.collected strong').textContent==='Cargando...';
      await view.getCachedBranches();const reused=branchCalls===1;
      user={...user,id:'two',apiToken:'session-two'};await view.getCachedBranches();
      const isolated=branchCalls===2;
      resolveReceipts({success:true,data:[{id:'r',studentName:'Alumno Prueba',amount:100}]});
      await view.receiptsRequest;
      const loaded=document.querySelector('.cash-kpi.collected strong').textContent.includes('100');
      const deduped=receiptCalls===1;
      view.unmount();
      return {notBlocking,pendingVisible,loading,reused,isolated,loaded,deduped};
    });
    for(const [name,value] of Object.entries(result)) assert(value,name);
    console.log('PASS: pendientes sin esperar comprobantes, carga diferida, cache por sesion y peticiones deduplicadas.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
