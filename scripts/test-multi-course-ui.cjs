const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/multi-course-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/multi-course-test');
  const result=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   authService.getCurrentUser=()=>({id:'cashier',name:'Caja',role:'caja',branch_id:'branch',permissions:['PAYMENT_CREATE']});
   authService.can=code=>code==='PAYMENT_CREATE';authService.refreshAuthorization=async()=>{};authService.getEffectiveBranchId=()=> 'branch';
   const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');Layout.render=async html=>html;Layout.attachEventListeners=()=>{};
   const {default:Api}=await import('/src/js/core/api/apiService.js');
   const {default:Students}=await import('/src/js/services/StudentService.js');
   let body;
   Api.createStudent=async data=>{body=data;return {success:true,data:{id:'existing',enrollment_id:'moto-enrollment',existingStudent:true,scheduleReserved:true}};};
   const plan={selections:[{cycleId:'cycle',date:'2026-10-19',time:'08:00 - 09:40'}]};
   const enrolled=await Students.createStudent({cedula:'1234567890',firstName:'Alumno',lastName:'Prueba',course_id:'moto',schedulePlan:plan});
   const adapter=enrolled.success && enrolled.data.id==='existing' && body.schedulePlan.selections[0].cycleId==='cycle';
   const {default:Payments}=await import('/src/js/services/PaymentService.js?v=voucher-pago-20260824');
   const {default:View}=await import('/src/js/views/cash/PendingPaymentsView.js');
   const student={id:'existing',cedula:'1234567890',firstName:'Alumno',lastName:'Prueba'};
   Students.getStudent=async()=>student;
   Payments.getPendingPayments=async()=>[
    {studentId:'existing',enrollmentId:'auto-enrollment',student:{...student,course:'Auto'},balance:190},
    {studentId:'existing',enrollmentId:'moto-enrollment',student:{...student,course:'Moto'},balance:125}];
   let selectedBalance,selectedPayment;
   Payments.getStudentBalance=async(id,enrollmentId)=>{selectedBalance=enrollmentId;return {balance:125};};
   Payments.getAvailableMethods=async()=>[{code:'efectivo',name:'Efectivo'}];
   Payments.registerPayment=async data=>{selectedPayment=data;return {success:false,error:'Prueba sin cobro real'};};
   Api.getReceipts=async()=>({success:true,data:[]});Api.getBranches=async()=>({success:true,data:[]});
   const view=new View();document.body.innerHTML=await view.render();await view.mount();
   const rows=document.querySelectorAll('#pending-payments-body tr');
   const independentRows=rows.length===2 && rows[0].textContent.includes('Auto') && rows[1].textContent.includes('Moto');
   const uniqueStudent=document.querySelector('.cash-kpi.pending strong').textContent==='1';
   rows[1].querySelector('.charge-btn').click();await new Promise(resolve=>setTimeout(resolve,30));
   const balanceForMoto=selectedBalance==='moto-enrollment';
   const form=document.querySelector('#payment-modal form');form.elements.amount.value='10';form.elements.method.value='efectivo';
   document.getElementById('modal-pay').click();await new Promise(resolve=>setTimeout(resolve,30));
   const paymentForMoto=selectedPayment?.enrollmentId==='moto-enrollment';
   view.unmount();
   return {adapter,independentRows,uniqueStudent,balanceForMoto,paymentForMoto};
  });
  for(const [name,value] of Object.entries(result))assert(value,name);
  console.log('PASS: expediente reutilizado, payload con horario, dos cursos en Caja y cobro dirigido a la matricula seleccionada. Sin cobros reales.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
