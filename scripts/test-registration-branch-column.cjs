const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('**/branch-column-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
    await page.goto('http://localhost:8080/branch-column-test');
    const result=await page.evaluate(async()=>{
      const {default:Service}=await import('/src/js/services/StudentService.js');
      const {default:View}=await import('/src/js/views/students/StudentsView.js');
      const original={id:'test',first_name:'Alumno',last_name:'Prueba',identification:'1234567890',
        branch_name:'Sportmancar Flavio Reyes',branch_id:'academic-branch',city_name:'Manta',
        created_by_name:'Jazmin Mero',registered_by_branch_name:'Manta 2000',registered_by_city_name:'Manta',
        instructor_name:'Instructor original',status:'activo',created_at:'2026-10-15T10:00:00Z'};
      const student=Service.normalizeStudent(original);
      document.body.innerHTML=new View().renderStudentRows([student]);
      const cells=document.querySelectorAll('.table-row .table-cell');
      return {column:cells[3].textContent,registrar:cells[2].textContent,instructor:cells[4].textContent,
        group:document.querySelector('.student-branch-group').textContent,actualBranch:student.branch,actualBranchId:student.branch_id};
    });
    assert.equal(result.column,'Manta 2000');assert.equal(result.registrar,'Jazmin Mero');
    assert.equal(result.instructor,'Instructor original');assert.equal(result.group,'Manta · Manta 2000');
    assert.equal(result.actualBranch,'Sportmancar Flavio Reyes');assert.equal(result.actualBranchId,'academic-branch');
    console.log('PASS: columna y grupo usan sucursal del inscriptor; expediente e instructor intactos.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
