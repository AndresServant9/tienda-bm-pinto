'use strict';
async function seedDemoAdult(db){
 const profile={name:'Jugador adulto de ejemplo',birth:'2000-04-09',identifier:'00000000T',category:'Primera Nacional Masculino',division:'Masculino',contactEmail:'adulto@example.test',submittedEmail:'adulto@example.test',paymentState:'Ficha ficticia para probar compras personales'};
 await db.query("insert into bm_pinto.registration_history(source_spreadsheet,source_sheet,source_row,season,player_key,is_current,profile) values('demo-adult','Archivo ficticio',1631,'2026/2027','demo-adult',true,$1::jsonb) on conflict do nothing",[JSON.stringify(profile)]);
 await db.query("insert into bm_pinto.orders(id,reference,recipient,email,phone,total_cents,payment_status,is_test) values('16300000-0000-4000-8000-000000000001','DEMO-ADULTO-01','Jugador adulto de ejemplo','adulto@example.test','600000000',3500,'confirmed',false) on conflict do nothing");
}
module.exports={seedDemoAdult};
