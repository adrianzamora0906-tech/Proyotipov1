const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/identity-prefill-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/identity-prefill-test');
  const result=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   authService.getCurrentUser=()=>({role:'secretaria_sucursal',permissions:[]});authService.can=()=>false;
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const {default:Api}=await import('/src/js/core/api/apiService.js');
   const view=new View();document.body.innerHTML=await view.renderStudentModal();
   const form=document.getElementById('student-modal-form');
   const row={id:'existing',identification:'1234567890',first_name:'Nombre',last_name:'Apellido',birth_date:'2000-05-05',
    email:'test@example.com',phone:'0999999999',address:'Direccion',blood_type:'O+',branch_id:'another-branch'};
   Api.searchStudents=async()=>({success:true,data:[row]});
   form.elements.cedula.value=row.identification;view.registrationIdentityRequest=1;
   const branchBefore=form.elements.branch.value;
   await view.resolveRegistrationIdentity(row.identification,1);
   const filled=form.elements.firstName.value==='Nombre' && form.elements.birthDate.value==='2000-05-05' && form.elements.bloodType.value==='O+';
   const branchPreserved=form.elements.branch.value===branchBefore;
   form.elements.cedula.value='1';view.scheduleRegistrationIdentityLookup('1');
   const cleared=form.elements.firstName.value==='' && form.elements.email.value==='';
   let resolve;
   Api.searchStudents=()=>new Promise(done=>{resolve=done;});
   form.elements.cedula.value=row.identification;view.registrationIdentityRequest=3;
   const pending=view.resolveRegistrationIdentity(row.identification,3);
   form.elements.cedula.value='2';view.scheduleRegistrationIdentityLookup('2');
   resolve({success:true,data:[row]});await pending;
   const staleIgnored=form.elements.firstName.value==='';
   form.elements.cedula.value=row.identification;view.registrationIdentityRequest=5;
   const typed=view.resolveRegistrationIdentity(row.identification,5);
   form.elements.firstName.value='Edicion manual';resolve({success:true,data:[row]});await typed;
   const typingPreserved=form.elements.firstName.value==='Edicion manual';
   Api.searchStudents=async()=>({success:true,data:[{...row,identification:'0000000000'}]});
   form.elements.firstName.value='';view.registrationIdentityRequest=6;
   await view.resolveRegistrationIdentity(row.identification,6);
   const exactOnly=form.elements.firstName.value==='';
   return {filled,branchPreserved,cleared,staleIgnored,typingPreserved,exactOnly};
  });
  for(const [name,value] of Object.entries(result))assert(value,name);
  console.log('PASS: precarga exacta, alcance API existente, fechas, sucursal intacta, limpieza y respuestas atrasadas.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
