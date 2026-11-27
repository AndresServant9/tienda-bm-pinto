'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
async function createDatabase(dataDir){
 const db=new PGlite(dataDir);
 const fresh=!(await db.query("select to_regclass('bm_pinto.dorsal_assignments') as found")).rows[0].found;
 if(fresh){
  await db.exec(fs.readFileSync(path.join(__dirname,'base-fixtures.sql'),'utf8'));
 }
 await db.exec(fs.readFileSync(path.join(root,'sql/140-dorsales.sql'),'utf8'));
 if(fresh){
  await db.exec(fs.readFileSync(path.join(__dirname,'fixture-dorsals.sql'),'utf8'));
 }
 await db.exec(fs.readFileSync(path.join(__dirname,'demo-views.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'family-fixtures.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'sql/160-familias-y-fichas.sql'),'utf8'));
 return db;
}
module.exports={createDatabase};
