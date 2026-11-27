'use strict';
// BAJA es efectiva. DUDA requiere una decision expresa registrada en el estado.
function sourceState(label,current='active'){
 if(!['active','review','released'].includes(current))throw Error('Estado de origen incorrecto');
 if(/^\s*BAJA\s*:/i.test(String(label)))return 'released';
 // Una decision expresa del club puede resolver una duda. No se libera por el texto.
 if(/^\s*DUDA\s*:/i.test(String(label)))return current==='released'?'released':'review';
 return current;
}
module.exports={sourceState};
