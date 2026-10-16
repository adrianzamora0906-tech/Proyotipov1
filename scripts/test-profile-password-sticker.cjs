const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});
   await page.route('**/password-sticker-test',r=>r.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/assets/css/pages/login.css"><div id="password-change-layer"></div>'}));
   await page.goto('http://localhost:8080/password-sticker-test');
   const result=await page.evaluate(async()=>{
    const {default:View}=await import('/src/js/views/profile/ProfileView.js');
    const view=Object.create(View.prototype);
    for(const forced of [true,false]){
     view.openPasswordModal(forced);
     const form=document.getElementById('profile-password-form');
     const buttons=[...form.querySelectorAll('[data-password-toggle]')];
     if(buttons.length!==3)throw new Error('Faltan controles');
     for(const button of buttons){
      const input=document.getElementById(button.getAttribute('aria-controls'));
      input.value='ClavePrueba123';button.click();
      if(input.type!=='text'||button.getAttribute('aria-pressed')!=='true'||!button.classList.contains('is-password-visible'))throw new Error('No muestra clave');
      if([...form.querySelectorAll('input')].some(other=>other!==input&&other.type!=='password'))throw new Error('Cambio otro campo');
      button.click();if(input.type!=='password'||input.value!=='ClavePrueba123')throw new Error('No oculta o pierde valor');
      if(getComputedStyle(button).position!=='absolute')throw new Error('Posicion incorrecta');
     }
     if(Boolean(form.querySelector('#cancel-password-change'))===forced)throw new Error('Cambio flujo obligatorio');
    }
    return true;
   });
   assert(result);await page.close();
  }
  console.log('PASS: tres caritas independientes, mostrar/ocultar y cambio obligatorio/opcional en movil y escritorio.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
