/* Archivo privado del formulario anterior. No presupone pagos confirmados. */
(() => {
  'use strict';
  const auth=window.ClubAuth, family=document.getElementById('family'), panel=document.getElementById('registrationsPane');
  if(!family&&!panel)return;
  let revision=0,rows=[],page=1;
  const section=document.createElement(family?'section':'details');section.className='surface registration-history';section.hidden=true;
  const title=document.createElement(family?'h2':'summary');title.textContent='Inscripciones del formulario anterior · 2026/2027';
  const help=document.createElement('p');help.textContent='Fichas incorporadas del formulario anterior. Un justificante aportado no confirma el ingreso. El club revisará el detalle de pagos; aquí no se generan nuevas cuotas.';
  const status=document.createElement('p');status.setAttribute('role','status');
  const controls=document.createElement('div');controls.className='actions';
  const search=document.createElement('input');search.type='search';search.placeholder='Buscar jugador, correo o equipo';search.setAttribute('aria-label','Buscar en el formulario anterior');
  const category=document.createElement('select');category.setAttribute('aria-label','Categoría del formulario anterior');
  const load=document.createElement('button');load.type='button';load.textContent='Consultar archivo';
  controls.append(search,category,load);
  const list=document.createElement('div'),pagination=document.createElement('nav');pagination.className='pagination';pagination.setAttribute('aria-label','Páginas del formulario anterior');
  const previous=document.createElement('button'),next=document.createElement('button'),information=document.createElement('p');
  previous.type=next.type='button';previous.textContent='Anterior';next.textContent='Siguiente';previous.className=next.className='secondary';
  pagination.append(previous,information,next);section.append(title,help,controls,status,pagination,list);(family||panel).append(section);
  const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value||'';return e;};
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function render(){
    const query=normalized(search.value),selected=category.value;
    const filtered=rows.filter(row=>(!selected||row.profile.category===selected)&&normalized([row.profile.name,row.profile.category,row.profile.division,row.profile.contactEmail,row.profile.submittedEmail].join(' ')).includes(query));
    const pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.max(1,Math.min(page,pages));
    list.replaceChildren();
    for(const row of filtered.slice((page-1)*20,page*20)){
      const p=row.profile,card=text('article','');card.append(text('h2',p.name||'Nombre pendiente de revisar'),text('p',[p.category,p.division].filter(Boolean).join(' · ')),text('p',p.paymentState));
      const details=document.createElement('details');details.append(text('summary','Ver ficha de archivo'),text('p','Nacimiento: '+p.birth+' · Documento: '+p.identifier),text('p',[p.contactName,p.contactEmail||p.submittedEmail,p.phone].filter(Boolean).join(' · ')),text('p',[p.address,p.town].filter(Boolean).join(' · ')),text('p','Equipación: '+[p.printName,p.shirt&&'Camisetas '+p.shirt,p.trousers&&'Pantalón '+p.trousers].filter(Boolean).join(' · ')),text('p','Respuesta original del '+p.received+' · Fila '+row.source_row));
      card.append(details);
      try{const url=new URL(p.receiptLink);if(url.protocol==='https:'&&url.hostname==='drive.google.com'){const link=text('a','Abrir justificante original en Drive');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}}catch{}
      list.append(card);
    }
    status.textContent=rows.length+' fichas importadas · '+filtered.length+' coinciden con los filtros.';
    information.textContent=filtered.length?'Página '+page+' de '+pages:'No hay fichas con esos filtros.';
    previous.disabled=page===1;next.disabled=page===pages;
  }
  async function fetchRows(){
    const current=revision;load.disabled=true;status.textContent='Consultando archivo…';
    try{
      const data=await auth.authorized('/rest/v1/rpc/'+(family?'bm_pinto_my_registration_history':'bm_pinto_admin_registration_history'),{});
      if(current!==revision)return;
      rows=data;page=1;category.replaceChildren(new Option('Todas las categorías',''),...Array.from(new Set(rows.map(r=>r.profile.category).filter(Boolean))).sort().map(value=>new Option(value,value)));
      section.hidden=Boolean(family&&!rows.length);render();
    }catch{if(current===revision)status.textContent='No se pudo consultar el archivo. Pulsa Consultar archivo para reintentarlo.';}
    finally{load.disabled=false;}
  }
  search.oninput=category.onchange=()=>{page=1;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};load.onclick=fetchRows;
  async function sessionChanged(session){
    const current=++revision;rows=[];list.replaceChildren();status.textContent='';section.hidden=true;search.value='';category.replaceChildren();
    if(!session)return;
    if(panel&&!await auth.isAdmin())return;if(current!==revision)return;
    section.hidden=false;
    if(family)await fetchRows();
  }
  auth.subscribe(sessionChanged);auth.getSession().then(sessionChanged).catch(()=>{});
})();
