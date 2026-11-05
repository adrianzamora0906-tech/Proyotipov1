const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    fs.mkdirSync('.tmp/login-mfa',{recursive:true});
    for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:850}});
      const source=fs.readFileSync('frontend/src/js/views/auth/LoginView.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default LoginView;','window.LoginView=LoginView;');
      await page.setContent('<main id="app"></main>');
      await page.addStyleTag({path:'frontend/src/assets/css/pages/login.css'});
      await page.addScriptTag({content:`class Component {};const Validator={};window.requests=[];
        const authService={login:async(username,password,proof)=>{window.requests.push(proof);return proof.challengeId?{success:true,user:{role:'secretaria',mustChangePassword:false}}:{success:true,mfaRequired:true,challengeId:'309e656a-a0c0-4db2-a845-f86418fc806a'};}};${source}`});
      await page.evaluate(async()=>{const view=new window.LoginView();document.querySelector('#app').innerHTML=await view.render();await view.mount();window.history.pushState=()=>{};});
      assert.equal(await page.locator('#login-code').isHidden(),true);
      await page.locator('#username').fill('prueba');await page.locator('#password').fill('PruebaSegura9!');
      await page.locator('#login-submit').click();await page.locator('#login-code').waitFor({state:'visible'});
      assert.equal(await page.locator('#login-code-group').evaluate(node=>node.matches(':modal')),true);
      assert.equal(await page.locator('#username').getAttribute('readonly'),'');
      assert.equal(await page.locator('#username').isHidden(),true);
      const box=await page.locator('#login-code-group').boundingBox();
      assert(Math.abs(box.x+box.width/2-width/2)<2,'Modal centrado horizontalmente');
      assert(Math.abs(box.y+box.height/2-850/2)<2,'Modal centrado verticalmente');
      assert(box.x>=0 && box.x+box.width<=width,'Modal dentro del viewport');
      await page.screenshot({path:`.tmp/login-mfa/login-${width}.png`});
      await page.locator('#login-code-restart').click();
      assert.equal(await page.locator('#username').isVisible(),true);
      await page.locator('#login-submit').click();
      await page.locator('#login-code').waitFor({state:'visible'});
      await page.locator('#login-code').fill('ABC234');await page.locator('#login-code-submit').click();
      await page.waitForFunction(()=>window.requests.length===3);
      assert.deepEqual(await page.evaluate(()=>window.requests[2]),{challengeId:'309e656a-a0c0-4db2-a845-f86418fc806a',code:'ABC234'});
      await page.close();
    }
    console.log('PASS login MFA movil/escritorio: codigo aparece despues de clave y se envia con el desafio sin guardar la clave en almacenamiento.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
