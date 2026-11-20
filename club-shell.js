(() => {
  'use strict';
  const auth = window.ClubAuth;
  const restrictedStorefront = false;
  const host = document.querySelector('header')?.parentElement || document.querySelector('main') || document.body;
  const bar = document.createElement('div'); bar.className = 'club-account-bar';
  bar.innerHTML = `<a href="/#mis-pedidos" data-public-orders>Mis pedidos</a><button type="button" class="club-primary" data-login>Iniciar sesión</button>
    <details class="club-account-menu" hidden><summary aria-label="Abrir menú de mi cuenta"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span>Mi cuenta</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary>
      <div class="club-account-panel"><p class="club-account-caption">CUENTA DEL CLUB</p><p class="club-account-name"></p>
        <a href="/#mis-pedidos" data-account-link>Mis pedidos</a><a href="/mis-inscripciones" data-account-link>Mis inscripciones</a>
        <div class="club-admin-options" hidden><p class="club-account-caption">ADMINISTRACIÓN</p><a href="/panel" data-admin-link hidden>Gestión del club</a><a href="/#gestion-pedidos" data-admin-link hidden>Pedidos de la tienda</a></div>
        <button type="button" data-logout>Cerrar sesión</button>
      </div></details><button type="button" data-install hidden>Instalar app</button>`;
  host.prepend(bar);
  const verificationNotice = document.createElement('section');
  verificationNotice.className = 'club-verification-notice';
  verificationNotice.hidden = true;
  verificationNotice.setAttribute('role','status');
  bar.after(verificationNotice);
  function showVerification() {
    const result = auth.emailVerification?.();
    if (!result) return;
    if((result.ok||result.sessionActive)&&auth.current()?.user?.email!==result.email){verificationNotice.hidden=true;return;}
    verificationNotice.hidden = false;
    verificationNotice.replaceChildren();
    const title=document.createElement('strong'),text=document.createElement('p');
    title.textContent=result.ok?'¡Bienvenido al Club Balonmano Pinto!':result.sessionActive?'Tienes una sesión válida':'No se ha podido completar la verificación';
    text.textContent=result.ok?'Tu correo está verificado y ya has iniciado sesión con '+result.email+'. Crear la cuenta no envía una inscripción ni un alta de socio. Puedes continuar el trámite que necesites.':result.sessionActive?'El enlace no se ha podido validar, pero hemos comprobado con el club que la sesión de '+result.email+' está activa y su correo está verificado. Puedes continuar con esta cuenta. Crear la cuenta no envía una inscripción ni un alta de socio.':result.message;
    verificationNotice.append(title,text);
    if(result.needsIdentifier){const hint=document.createElement('p');hint.textContent='No se pudo guardar el DNI/NIE. Contacta con el club si no aparece tu descuento de socio.';verificationNotice.append(hint);}
    if(result.ok||result.sessionActive){
      for(const [label,url] of [['Continuar inscripción','/inscripciones'],['Hacerme socio','/socios'],['Ver mis inscripciones','/mis-inscripciones']]){const link=document.createElement('a');link.href=url;link.textContent=label;verificationNotice.append(link);}
    }else{
      const login=document.createElement('button');login.type='button';login.textContent='Iniciar sesión';login.onclick=()=>window.ClubAccount.open();verificationNotice.append(login);
    }
  }
  window.addEventListener('club-email-verified',showVerification);
  auth.getSession().then(showVerification).catch(()=>{});
  const dialog = document.createElement('dialog'); dialog.id = 'clubLoginDialog';
  dialog.setAttribute('aria-labelledby','clubLoginTitle');
  dialog.innerHTML = '<h2 id="clubLoginTitle">Tu cuenta del club</h2><p>Una misma cuenta para tus pedidos, inscripciones y solicitudes de socio.</p><form id="clubCommonLogin"><label>Correo de la cuenta<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><div class="club-dialog-actions"><button type="submit">Iniciar sesión</button><button type="button" data-close>Cerrar</button></div></form><p id="clubLoginStatus" role="status"></p><p><a href="/recuperar-cuenta">He olvidado mi contraseña</a></p><p><a href="/?crear-cuenta=1#mis-pedidos" data-create-account>No tengo cuenta · Crear cuenta del club</a></p>';
  document.body.append(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[role=status]');
  let revision = 0, installPrompt;
  function open() { status.textContent = ''; dialog.showModal(); form.elements.email.focus(); }
  async function render() {
    const version = ++revision, session = auth.current();
    nav.hidden = !session;
    showVerification();
    const name = bar.querySelector('.club-account-name'); name.hidden = !session;
    name.textContent = session?.user?.email || '';
    bar.querySelector('[data-login]').hidden = Boolean(session);
    bar.querySelector('.club-account-menu').hidden = !session;
    bar.querySelector('[data-public-orders]').hidden = !restrictedStorefront || Boolean(session);
    if(!session)bar.querySelector('.club-account-menu').open=false;
    bar.querySelectorAll('[data-account-link]').forEach(link => { link.hidden = !session || (restrictedStorefront && link.getAttribute('href') === '/mis-inscripciones'); });
    document.querySelectorAll('[data-admin-link]').forEach(link => { link.hidden = true; });
    bar.querySelector('.club-admin-options').hidden=true;
    const admin = session && await auth.isAdmin();
    if (version !== revision) return;
    bar.querySelector('[href="/mis-inscripciones"]').hidden = !session || (restrictedStorefront && !admin);
    if(restrictedStorefront)bar.querySelector('[data-install]').hidden=true;
    document.querySelectorAll('[data-admin-link]').forEach(link => { link.hidden = !admin; });
    bar.querySelector('.club-admin-options').hidden=!admin;
    window.dispatchEvent(new CustomEvent('club-access', {detail:{admin:Boolean(admin)}}));
  }
  const pageHeader=document.querySelector('header.club-header');
  if(pageHeader&&!pageHeader.querySelector('img')){const crest=document.createElement('img');crest.src='/escudo.png';crest.alt='Escudo del club';pageHeader.prepend(crest);}
  const links = [['Tienda','/'],['Inscripciones','/inscripciones'],['Socios','/socios']];
  let nav = document.querySelector('.club-nav');
  if (!nav) { nav = document.createElement('nav'); (document.querySelector('header') || bar).append(nav); }
  nav.hidden = true;
  nav.className = 'club-navigation'; nav.setAttribute('aria-label','Navegación del club');
  nav.replaceChildren(...links.map(([label,href]) => { const a=document.createElement('a');a.textContent=label;a.href=href;if(location.pathname.replace(/\.html$/,'')===href)a.setAttribute('aria-current','page');return a; }));
  const accountMenu=bar.querySelector('.club-account-menu');
  document.addEventListener('click',event=>{if(!accountMenu.contains(event.target))accountMenu.open=false;});
  accountMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){accountMenu.open=false;accountMenu.querySelector('summary').focus();}});
  accountMenu.querySelectorAll('a,button').forEach(control=>control.addEventListener('click',()=>{accountMenu.open=false;}));
  dialog.addEventListener('close',()=>{form.elements.password.value='';});
  bar.querySelector('[data-login]').onclick = open;
  bar.querySelector('[data-logout]').onclick = async () => { await auth.signOut(); };
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-create-account]').onclick = () => { dialog.close(); window.dispatchEvent(new Event('club-create-account')); };
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    status.textContent = 'Iniciando sesión…';
    try { await auth.signIn(form.elements.email.value,form.elements.password.value); form.elements.password.value=''; dialog.close(); }
    catch(error) { status.textContent = error.message; }
    finally { form.elements.password.value='';button.disabled=false; }
  };
  window.ClubAccount = {open};
  auth.subscribe(render); render();
  auth.getSession().then(render).catch(() => {});
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt=event;bar.querySelector('[data-install]').hidden=restrictedStorefront; });
  bar.querySelector('[data-install]').onclick = async () => { if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;bar.querySelector('[data-install]').hidden=true; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
