/* Selector compacto: la lista nativa solo conserva el valor del formulario. */
(() => {
 'use strict';
 function bind(player) {
  const select=player.querySelector('[name="dorsal"]');
  if(select.dorsalPicker)return select.dorsalPicker;
  const button=document.createElement('button');button.type='button';button.className='dorsal-picker-button';button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
  select.after(button);
  const dialog=document.createElement('dialog');dialog.className='dorsal-dialog';
  const id='dorsal-picker-'+crypto.randomUUID();dialog.id=id;button.setAttribute('aria-controls',id);
  const title=document.createElement('h2');title.id=id+'-title';title.textContent='Elige tu dorsal';dialog.setAttribute('aria-labelledby',title.id);
  const heading=document.createElement('div');heading.className='dorsal-dialog-heading';
  const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close();heading.append(title,close);
  const label=document.createElement('label');label.textContent='Buscar número';
  const search=document.createElement('input');search.type='search';search.inputMode='numeric';search.autocomplete='off';search.maxLength=2;search.placeholder='Del 1 al 99';label.append(search);
  const count=document.createElement('p');count.className='dorsal-choice-count';count.setAttribute('role','status');
  const grid=document.createElement('div');grid.className='dorsal-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Dorsales disponibles');
  const empty=document.createElement('p');empty.className='dorsal-grid-empty';empty.hidden=true;empty.textContent='Ese número no está disponible.';
  dialog.append(heading,label,count,grid,empty);player.append(dialog);
  function render(){
   const options=[...select.options].filter(option=>option.value&&!option.disabled);
   const filter=search.value.trim();const visible=options.filter(option=>!filter||option.value===String(Number(filter)));
   grid.replaceChildren();
   for(const option of visible){const choice=document.createElement('button');choice.type='button';choice.textContent=option.textContent;choice.dataset.dorsalChoice=option.value;choice.setAttribute('aria-label','Dorsal '+option.value);choice.setAttribute('aria-pressed',String(select.value===option.value));
    choice.onclick=()=>{if(select.disabled||![...select.options].some(o=>o.value===option.value&&!o.disabled))return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();sync();};grid.append(choice);}
   count.textContent=filter?(visible.length?'Número disponible':'Sin coincidencias'):options.length+' dorsales disponibles';empty.hidden=visible.length>0;
  }
  function sync(){button.disabled=select.disabled;button.textContent=select.value?'Dorsal '+select.value:select.options[0]?.textContent||'Elegir dorsal';button.setAttribute('aria-label',select.value?'Cambiar dorsal '+select.value:'Elegir dorsal de juego');if(dialog.open)render();}
  button.onclick=()=>{search.value='';render();dialog.showModal();if(window.matchMedia?.('(pointer: coarse)').matches)close.focus();else search.focus();};
  search.addEventListener('input',render);
  // Evita que Intro en la busqueda envie todo el formulario.
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const choices=grid.querySelectorAll('button');if(choices.length===1)choices[0].click();}});
  dialog.addEventListener('close',()=>{if(player.isConnected)button.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  select.addEventListener('change',sync);
  const observer=new MutationObserver(sync);observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});
  select.dorsalPicker={sync,close:()=>dialog.close(),destroy(){observer.disconnect();dialog.remove();button.remove();}};sync();return select.dorsalPicker;
 }
 window.ClubDorsalPicker={bind};
})();
