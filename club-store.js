/* Adaptador de sesión. El catálogo, carrito, precios y envío de pedidos conservan su implementación. */
(() => {
  'use strict';
  const auth = window.ClubAuth;
  document.querySelector('header').classList.add('club-store-header');
  const ordersIntro=document.createElement('p');ordersIntro.className='club-orders-intro';
  document.querySelector('#myOrders h2').after(ordersIntro);
  const loginSubmit=historyEmailForm.querySelector('button[type=submit]');
  historyEmailForm.insertBefore(loginSubmit,document.getElementById('historyRegisterToggle'));
  historyEmailForm.elements.email.closest('label').firstChild.textContent='Correo de la cuenta';
  function updateOrdersLayout(){
    document.body.classList.toggle('club-orders-page',location.hash==='#mis-pedidos');
    const signedIn=Boolean(auth.current());
    ordersIntro.textContent=signedIn?'Consulta el estado de tus compras y sus prendas.':'Entra con tu cuenta del club para consultar tus compras. También puedes crear una cuenta si todavía no tienes una.';
    const search=document.getElementById('historySearchLabel');
    if(!signedIn||!document.getElementById('historyOrders').children.length)search.hidden=true;
  }
  async function openStoreManagement(){
    if(location.hash!=='#gestion-pedidos'||!await auth.isAdmin())return;
    if(document.getElementById('cloudPanel').open)return;
    const session=await auth.getSession();if(!session)return;
    clubSession={accessToken:session.access_token,userId:session.user.id};
    await document.getElementById('cloudHeader').onclick();
  }
  window.addEventListener('hashchange',()=>{updateOrdersLayout();openStoreManagement().catch(()=>{});});
  auth.subscribe(updateOrdersLayout);updateOrdersLayout();
  const membershipLinks=[...document.querySelectorAll('a[href*="forms.gle"]')].map(link=>({link,href:link.getAttribute('href'),target:link.getAttribute('target'),label:link.getAttribute('aria-label')}));
  window.addEventListener('club-access',event=>{
    for(const entry of membershipLinks){
      entry.link.href=event.detail.admin?'/socios':entry.href;
      if(event.detail.admin)entry.link.removeAttribute('target');else if(entry.target)entry.link.setAttribute('target',entry.target);
      if(entry.label)entry.link.setAttribute('aria-label',event.detail.admin?'Hazte socio del club':entry.label);
    }
  });
  const originalOpen = openOrderHistory;
  let currentToken = '', revision = 0, storeUserId=null;
  historyEmailForm.addEventListener('submit', event => {
    if (!historyRegistering) return;
    const id=normalizeMemberId(historyEmailForm.elements.identifier.value);
    const digits=id.slice(0,-1).replace(/^[XYZ]/,letter=>({X:'0',Y:'1',Z:'2'})[letter]);
    if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(id) || 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits)%23]!==id.slice(-1)) {
      event.preventDefault();event.stopImmediatePropagation();
      historyStatus.textContent='DNI o NIE incorrecto. Revisa el número y la letra del titular.';
      historyEmailForm.elements.identifier.focus();
    }
  },true);
  openOrderHistory = async data => {
    await auth.acceptSession(data);
    // El observador carga el historial usando la misma cuenta que el resto del club.
  };
  historyLogout.onclick = () => auth.signOut();
  document.getElementById('clubLogout').onclick = () => auth.signOut();
  const oldAdminSubmit = document.getElementById('clubLoginForm');
  oldAdminSubmit.onsubmit = async event => {
    event.preventDefault();
    const button=oldAdminSubmit.querySelector('[type=submit]');button.disabled=true;
    try { await auth.signIn(oldAdminSubmit.elements.email.value,oldAdminSubmit.elements.password.value); }
    catch(error) { document.getElementById('loginStatus').textContent=error.message; }
    finally { oldAdminSubmit.elements.password.value='';button.disabled=false; }
  };
  async function apply(session) {
    const next=session?.access_token || '';
    if (next===currentToken) return;
    currentToken=next;
    if(session?.user.id && session.user.id===storeUserId){
      historyToken=next;historyUser=session.user;
      if(clubSession)clubSession.accessToken=next;
      return;
    }
    storeUserId=session?.user.id || null;
    const version=++revision;
    clearOrderHistory(); clearClubSession();
    document.getElementById('realClubButton').hidden=true;
    if (!session) return;
    try { await originalOpen(session); }
    catch(error) { if(version===revision)historyStatus.textContent=error.message; }
    if (version!==revision) return;
    const admin=await auth.isAdmin();
    if (version!==revision || !admin) return;
    clubSession={accessToken:session.access_token,userId:session.user.id};
    document.getElementById('realClubButton').hidden=false;
    document.getElementById('realClubButton').textContent='Gestión de pedidos';
    document.getElementById('cloudHeader').hidden=false;
    document.getElementById('clubLoginForm').hidden=true;
    document.getElementById('realClubState').hidden=false;
    document.getElementById('realClubEmail').textContent=session.user.email;
    await openStoreManagement();
  }
  document.getElementById('realClubButton').hidden=true;
  auth.subscribe(apply);auth.getSession().then(apply).catch(error=>{historyStatus.textContent=error.message;});
  // Antes de cada operación administrativa, obtener el token vigente sin otro inicio de sesión.
  cloudRpc = async (name,body={}) => {
    if (!await auth.isAdmin()) throw Error('Tu cuenta no tiene permisos de administración.');
    const session=await auth.getSession();
    clubSession={accessToken:session.access_token,userId:session.user.id};
    return auth.authorized('/rest/v1/rpc/'+name,body);
  };
  window.addEventListener('club-create-account',()=>{
    location.hash='mis-pedidos';setHistoryRegistration(true);historyEmailForm.elements.email.focus();
  });
  if (new URLSearchParams(location.search).get('crear-cuenta') === '1') {
    setHistoryRegistration(true);
    history.replaceState(null, '', '/#mis-pedidos');
  }
  document.getElementById('myOrdersButton').onclick=()=>{location.hash='mis-pedidos';};
})();
