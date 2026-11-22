'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createDatabase}=require('./database.cjs'),{importLinks}=require('./history-link-db.cjs');
(async()=>{
 if(!process.argv[2])throw Error('Indica el JSON privado de vinculaciones');
 const links=JSON.parse(await fs.readFile(path.resolve(process.argv[2]),'utf8'));
 const db=await createDatabase(path.join(__dirname,'../.dev-data/sheet-audit'));
 try{await db.exec('begin');const n=await importLinks(db,links,{allowUniqueAbbreviations:process.argv.includes('--club-unique-prefix')});await db.exec('commit');console.log('Vinculos aprobados en base privada local:',n);}catch(e){await db.exec('rollback');throw e;}finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
