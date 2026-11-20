/* Sesión del club compartida por las aplicaciones del mismo origen. */
(() => {
  'use strict';
  const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
  const key = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
  const storageKey = 'bm-pinto-club-session-v1';
  const epochKey = storageKey + '-logout';
  let memory = null, refreshing = null;
  const listeners = new Set();
  function read() {
    let raw;
    try { raw=localStorage.getItem(storageKey); } catch { return memory; }
    if (!raw) return null;
    try {
      const session=JSON.parse(raw);
      if (typeof session?.access_token!=='string' || typeof session?.refresh_token!=='string' ||
          typeof session?.user?.id!=='string' || typeof session?.user?.email!=='string' ||
          !Number.isFinite(Number(session.expires_at))) throw Error('Sesión incompleta');
      return session;
    } catch {
      memory=null;
      try { localStorage.removeItem(storageKey); } catch {}
      return null;
    }
  }
  function epoch() { try { return localStorage.getItem(epochKey) || ''; } catch { return ''; } }
  function notify() { for (const listener of listeners) Promise.resolve().then(() => listener(read())).catch(() => {}); }
  function write(session) {
    memory = session;
    try { if (session) localStorage.setItem(storageKey, JSON.stringify(session)); else localStorage.removeItem(storageKey); } catch {}
    notify();
  }
  async function request(path, body, token, method = 'POST') {
    const headers = {apikey:key, 'Content-Type':'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + path, {method, headers, cache:'no-store',
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Error(response.status === 429 ? 'Demasiados intentos. Espera un minuto.' :
        response.status === 400 || response.status === 401 ? 'No se pudo iniciar sesión. Revisa el correo, la contraseña y la verificación del correo.' : 'No se pudo conectar con el club. Inténtalo de nuevo.');
      error.status = response.status; error.code = data.code; error.serverMessage = data.message; throw error;
    }
    return data;
  }
  function normalize(data, user) {
    if (!data?.access_token || !data?.refresh_token || !user?.id || !user.email_confirmed_at) throw Error('Verifica el correo para acceder a tu cuenta.');
    return {access_token:data.access_token, refresh_token:data.refresh_token,
      expires_at:Number(data.expires_at) || Math.floor(Date.now()/1000) + Number(data.expires_in || 3600), user};
  }
  async function acceptSession(data) {
    const before = epoch();
    const user = await request('/auth/v1/user', undefined, data.access_token, 'GET');
    if (epoch() !== before) throw Error('La sesión se ha cerrado. Vuelve a entrar.');
    const session = normalize(data, user); write(session); return session;
  }
  async function signIn(email, password) {
    const before = epoch();
    const data = await request('/auth/v1/token?grant_type=password', {email:email.trim().toLowerCase(),password});
    if (epoch() !== before) throw Error('La sesión se ha cerrado. Vuelve a entrar.');
    return acceptSession(data);
  }
  async function refresh() {
    const session = read();
    if (!session?.access_token) return null;
    if (session.expires_at > Date.now()/1000 + 60) return session;
    if (!session.refresh_token) { write(null); return null; }
    const before = epoch();
    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', {refresh_token:session.refresh_token});
      if (epoch() !== before || read()?.refresh_token !== session.refresh_token) return read();
      const next = normalize(data, data.user); write(next); return next;
    } catch (error) {
      if ([400,401,403].includes(error.status) && read()?.refresh_token === session.refresh_token) write(null);
      throw error;
    }
  }
  async function getSession() {
    if (navigator.locks) return navigator.locks.request(storageKey, refresh);
    if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function signOut() {
    const session = read();
    try { localStorage.setItem(epochKey, crypto.randomUUID()); } catch {}
    write(null);
    if (!session?.access_token) return true;
    try { await request('/auth/v1/logout?scope=local', undefined, session.access_token); return true; } catch { return false; }
  }
  async function authorized(path, body, method = 'POST') {
    const session = await getSession();
    if (!session) throw Error('Inicia sesión con tu cuenta del club.');
    try { return await request(path, body, session.access_token, method); }
    catch (error) { if (error.status === 401 && read()?.access_token === session.access_token) write(null); throw error; }
  }
  async function isAdmin() {
    try { return await authorized('/rest/v1/rpc/bm_pinto_is_admin', {}) === true; } catch { return false; }
  }
  window.addEventListener('focus', () => { getSession().catch(() => {}); });
  window.addEventListener('pageshow', () => { getSession().then(notify).catch(notify); });
  setInterval(() => { if (document.visibilityState === 'visible') getSession().catch(() => {}); }, 45000);
  window.addEventListener('storage', event => { if ([storageKey,epochKey].includes(event.key) || event.key === null) notify(); });
  window.ClubAuth = {getSession, signIn, signOut, acceptSession, authorized, isAdmin,
    current:read, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }};
})();
