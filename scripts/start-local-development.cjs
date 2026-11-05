const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const {spawn}=require('node:child_process');
const express=require('../backend/node_modules/express');
const root=path.resolve(__dirname,'..');

async function available(port){
  await new Promise((resolve,reject)=>{
    const server=net.createServer();server.once('error',()=>reject(Error(`Puerto ${port} ocupado. No se detuvo ningun proceso.`)));
    server.listen(port,'127.0.0.1',()=>server.close(resolve));
  });
}
async function main(){
  await available(8080);await available(5001);
  const directory=path.join(root,'.tmp','local-development');fs.mkdirSync(directory,{recursive:true});
  const output=fs.openSync(path.join(directory,'backend.log'),'a');
  const backend=spawn(process.execPath,['--watch','server.js'],{cwd:path.join(root,'backend'),windowsHide:true,
    env:{...process.env,NODE_ENV:'development',SERVER_HOST:'127.0.0.1',SERVER_PORT:'5001',
      LOCAL_DEVELOPMENT_ONLY:'true',CORS_ORIGIN:'http://localhost:8080,http://127.0.0.1:8080',LOG_LEVEL:'info'},stdio:['ignore',output,output]});
  fs.closeSync(output);
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/env.js',(_req,res)=>res.type('application/javascript').send(
    'window.__SPORTMANCAR_CONFIG__='+JSON.stringify({API_BASE_URL:'http://127.0.0.1:5001/api',MOODLE_URL:''})+';'));
  app.use(express.static(path.join(root,'frontend'),{dotfiles:'deny',etag:false,lastModified:false}));
  app.get('*',(_req,res)=>res.sendFile(path.join(root,'frontend','index.html')));
  const server=app.listen(8080,'127.0.0.1',()=>console.log('Desarrollo local: http://localhost:8080 | API: http://127.0.0.1:5001/api | Base de datos del .env (no aislada).'));
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;backend.kill();server.close(()=>process.exit());setTimeout(()=>process.exit(),2000).unref();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  backend.once('error',stop);backend.once('exit',()=>{if(!stopping)stop();});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
