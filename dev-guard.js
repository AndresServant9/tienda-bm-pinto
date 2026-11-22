/* Solo en la rama de desarrollo. Ninguna peticion alcanza Supabase operativo. */
(() => {
 'use strict';
 const nativeFetch=window.fetch.bind(window);
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 window.fetch=(input,init)=>{
  const raw=input instanceof Request?input.url:String(input),url=new URL(raw,location.href);
  if(url.hostname.endsWith('.supabase.co')) {
   if(!local)return Promise.reject(new Error('Entorno de desarrollo: base operativa bloqueada. Usa el servidor local de pruebas.'));
   return nativeFetch('/__test__'+url.pathname+url.search,init);
  }
  if(url.origin!==location.origin)return Promise.reject(new Error('Conexiones externas bloqueadas en desarrollo.'));
  return nativeFetch(input,init);
 };
 function banner(){const note=document.createElement('aside');note.textContent='DESARROLLO · Datos ficticios · No se envían correos ni se modifica la tienda. Cuenta de prueba: familia@example.test / PruebaLocal123!';note.setAttribute('role','note');note.style.cssText='padding:12px 18px;background:#fff1be;color:#29251b;border-bottom:2px solid #aa8c29;font:14px/1.5 system-ui';document.body.prepend(note);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner,{once:true});else banner();
})();
