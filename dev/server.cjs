'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{createDatabase}=require('./database.cjs');
const root=path.resolve(__dirname,'..'),userId='14000000-0000-4000-8000-000000000001';
const user={id:userId,email:'familia@example.test',email_confirmed_at:'2026-11-01T12:00:00Z',user_metadata:{full_name:'Familia de ejemplo',phone:'600000000'}};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
let serial=Promise.resolve();
(async()=>{await fs.mkdir(path.join(root,'.dev-data'),{recursive:true});const db=await createDatabase(path.join(root,'.dev-data','database'));
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/__test__/')){
   if(req.headers.origin && req.headers.origin!=='http://127.0.0.1:8140'){res.writeHead(403);res.end();return;}
   let raw='';for await(const part of req){raw+=part;if(raw.length>8000000)throw Error('Peticion demasiado grande');}const body=raw?JSON.parse(raw):{};const endpoint=url.pathname.slice('/__test__'.length);
   const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
   if(endpoint==='/auth/v1/token'){if(body.email&&body.email!=='familia@example.test')return send({message:'Usa la cuenta ficticia indicada en la cabecera'},400);return send({access_token:'local-dorsales-only',refresh_token:'local-refresh-only',expires_in:3600,token_type:'bearer',user});}
   if(endpoint==='/auth/v1/user')return send(user);
   if(endpoint==='/auth/v1/logout')return send({});
   if(endpoint.startsWith('/auth/'))return send({message:'Solo acceso con cuenta ficticia. No se envian correos.'},400);
   const rpc=endpoint.split('/').pop();
   if(rpc==='bm_pinto_is_admin')return send(false);
   if(rpc==='bm_pinto_check_public_member')return send(false);
   if(rpc==='bm_pinto_my_registration_history')return send([]);
   if(rpc==='bm_pinto_my_registration_test_receipt_rejections')return send([]);
   if(rpc==='bm_pinto_my_registration_test_membership_discount')return send({discount:0});
   if(rpc==='bm_pinto_my_membership_test_requests'||rpc==='bm_pinto_my_membership_requests')return send([]);
   const calls={bm_pinto_dorsal_options:['select public.bm_pinto_dorsal_options($1::date,$2,$3) as data',[body.p_birth,body.p_division,body.p_name||'']],bm_pinto_submit_registration_test_details:['select public.bm_pinto_submit_registration_test_details($1::uuid,$2::jsonb,$3,$4::jsonb) as data',[body.submission_id,JSON.stringify(body.submission),body.first_receipt,JSON.stringify(body.p_details)]],bm_pinto_registration_dorsals:['select public.bm_pinto_registration_dorsals($1::uuid) as data',[body.p_id]],bm_pinto_my_registration_dorsals:['select public.bm_pinto_my_registration_dorsals() as data',[]],bm_pinto_my_registration_tests:['select public.bm_pinto_my_registration_tests() as data',[]]};
   if(!calls[rpc])return send({code:'TEST_ONLY',message:'Funcion no incluida en el ensayo local'},400);
   const action=async()=>{try{await db.exec('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[req.headers.authorization==='Bearer local-dorsales-only'?userId:'']);await db.exec('set local role '+(req.headers.authorization==='Bearer local-dorsales-only'?'authenticated':'anon'));const result=(await db.query(...calls[rpc])).rows[0].data;await db.exec('commit');send(result);}catch(e){await db.exec('rollback');send({code:e.code||'ERROR',message:e.message},400);}};
   serial=serial.then(action,action);await serial;return;
  }
  let filename=decodeURIComponent(url.pathname);if(filename==='/')filename='/index.html';if(!path.extname(filename))filename+='.html';const target=path.resolve(root,'.'+filename);if(!target.startsWith(root+path.sep)||filename.includes('..')||target.includes(path.sep+'.')||target.includes(path.sep+'node_modules'+path.sep)||target.includes(path.sep+'dev'+path.sep)||target.includes(path.sep+'sql'+path.sep)){res.writeHead(404);res.end();return;}
  let data=await fs.readFile(target);
  if(filename==='/index.html')data=Buffer.from(data.toString('utf8').replace('<meta charset="utf-8">','<meta charset="utf-8"><script src="dev-guard.js"></script>'));
  const headers={'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  headers['Content-Security-Policy']="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
  res.writeHead(200,headers);res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:400);res.end('No disponible en el entorno de pruebas.');}});
 server.listen(8140,'127.0.0.1',()=>console.log('Pruebas aisladas: http://127.0.0.1:8140/inscripciones | cuenta familia@example.test'));
 const stop=()=>server.close(async()=>{await db.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
