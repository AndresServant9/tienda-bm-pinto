'use strict';
// El club confirma que las marcas BAJA son bajas efectivas. DUDA no se libera.
function sourceState(label,current='active'){
 if(/^\s*BAJA\s*:/i.test(String(label)))return 'released';
 if(/^\s*DUDA\s*:/i.test(String(label)))return 'review';
 if(!['active','review','released'].includes(current))throw Error('Estado de origen incorrecto');
 return current;
}
module.exports={sourceState};
