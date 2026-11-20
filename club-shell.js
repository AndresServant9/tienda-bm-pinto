(() => {
  'use strict';
  const auth = window.ClubAuth;
  // La tienda ya es pública; las nuevas áreas siguen en revisión hasta su apertura.
  const restrictedStorefront = location.pathname === '/' || location.pathname === '/index.html';
  const host = document.querySelector('header')?.parentElement || document.querySelector('main') || document.body;
  const bar = document.createElement('div'); bar.className = 'club-account-bar';
  bar.innerHTML = '<span class="club-account-name" hidden></span><a href="/#mis-pedidos" data-account-link hidden>Mis pedidos</a><a href="/mis-inscripciones" data-account-link hidden>Mis inscripciones</a><a href="/panel" data-admin-link hidden>Gestión del club</a><button type="button" class="club-primary" data-login>Iniciar sesión</button><button type="button" data-logout hidden>Cerrar sesión</button><button type="button" data-install hidden>Instalar app</button>';
  host.prepend(bar);
  const dialog = document.createElement('dialog'); dialog.id = 'clubLoginDialog';
  dialog.setAttribute('aria-labelledby','clubLoginTitle');
  dialog.innerHTML = '<h2 id="clubLoginTitle">Tu cuenta del club</h2><p>Una misma cuenta para tus pedidos, inscripciones y solicitudes de socio.</p><form id="clubCommonLogin"><label>Correo de la cuenta<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><div class="club-dialog-actions"><button type="submit">Iniciar sesión</button><button type="button" data-close>Cerrar</button></div></form><p id="clubLoginStatus" role="status"></p><p><a href="/recuperar-cuenta">He olvidado mi contraseña</a></p><p><a href="/?crear-cuenta=1#mis-pedidos" data-create-account>No tengo cuenta · Crear cuenta del club</a></p>';
  document.body.append(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[role=status]');
  let revision = 0, installPrompt;
  function open() { status.textContent = ''; dialog.showModal(); form.elements.email.focus(); }
  async function render() {
    const version = ++revision, session = auth.current();
    const name = bar.querySelector('.club-account-name'); name.hidden = !session;
    name.textContent = session?.user?.email || '';
    bar.querySelector('[data-login]').hidden = Boolean(session);
    bar.querySelector('[data-logout]').hidden = !session;
    bar.querySelectorAll('[data-account-link]').forEach(link => { link.hidden = !session || (restrictedStorefront && link.getAttribute('href') === '/mis-inscripciones'); });
    document.querySelectorAll('[data-admin-link]').forEach(link => { link.hidden = true; });
    const admin = session && await auth.isAdmin();
    if (version !== revision) return;
    nav.hidden = restrictedStorefront && !admin;
    bar.querySelector('[href="/mis-inscripciones"]').hidden = !session || (restrictedStorefront && !admin);
    if(restrictedStorefront)bar.querySelector('[data-install]').hidden=true;
    document.querySelectorAll('[data-admin-link]').forEach(link => { link.hidden = !admin; });
    window.dispatchEvent(new CustomEvent('club-access', {detail:{admin:Boolean(admin)}}));
  }
  const links = [['Tienda','/'],['Inscripciones','/inscripciones'],['Socios','/socios']];
  let nav = document.querySelector('.club-nav');
  if (!nav) { nav = document.createElement('nav'); (document.querySelector('header') || bar).append(nav); }
  nav.hidden = restrictedStorefront;
  nav.className = 'club-navigation'; nav.setAttribute('aria-label','Navegación del club');
  nav.replaceChildren(...links.map(([label,href]) => { const a=document.createElement('a');a.textContent=label;a.href=href;if(location.pathname.replace(/\.html$/,'')===href)a.setAttribute('aria-current','page');return a; }));
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
