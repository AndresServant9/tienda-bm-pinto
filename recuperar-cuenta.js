(() => {
  'use strict';
  const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
  const key = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
  const callback = 'https://inscripcion-bm-pinto.pages.dev/recuperar-cuenta';
  const requestForm = document.getElementById('requestRecovery');
  const changeForm = document.getElementById('changePassword');
  const status = document.getElementById('recoveryStatus');
  let recoveryToken = '';
  let busy = false;
  function feedback(text, kind = 'error') {
    status.textContent = text;
    status.dataset.kind = kind;
    status.focus();
  }
  async function auth(path, body, token, method = 'POST') {
    const headers = {apikey: key, 'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + '/auth/v1/' + path, {
      method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000),
    });
    return {ok: response.ok, status: response.status, data: await response.json().catch(() => ({}))};
  }
  requestForm.onsubmit = async event => {
    event.preventDefault();
    if (busy || !requestForm.reportValidity()) return;
    busy = true;
    const button = requestForm.querySelector('button');
    button.disabled = true;
    feedback('Solicitando el enlace…', 'info');
    try {
      const result = await auth('recover?redirect_to=' + encodeURIComponent(callback), {email: requestForm.elements.email.value.trim().toLowerCase()});
      if (!result.ok) throw Error(result.status === 429 ? 'Espera un minuto antes de solicitar otro enlace.' : 'No se pudo solicitar el enlace. Inténtalo de nuevo más tarde.');
      feedback('Si ese correo tiene una cuenta del club, recibirás un enlace. Revisa también el correo no deseado y utiliza solo el último enlace recibido.', 'success');
    } catch (error) {
      feedback(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'No se pudo conectar. Comprueba tu conexión y vuelve a intentarlo.' : error.message);
    } finally { busy = false; button.disabled = false; }
  };
  changeForm.onsubmit = async event => {
    event.preventDefault();
    if (busy || !recoveryToken || !changeForm.reportValidity()) return;
    if (changeForm.elements.password.value !== changeForm.elements.repeat.value) {
      feedback('Las contraseñas no coinciden.');
      changeForm.elements.repeat.focus();
      return;
    }
    busy = true;
    const button = changeForm.querySelector('button');
    button.disabled = true;
    feedback('Guardando la nueva contraseña…', 'info');
    try {
      const result = await auth('user', {password: changeForm.elements.password.value}, recoveryToken, 'PUT');
      if (!result.ok) {
        if ([401,403].includes(result.status)) {
          recoveryToken = '';
          changeForm.hidden = true;
          requestForm.hidden = false;
          throw Error('El enlace ha caducado. Solicita uno nuevo.');
        }
        throw Error('No se pudo cambiar la contraseña. Usa una diferente de la anterior y que cumpla los requisitos de seguridad.');
      }
      // El token solo vive en memoria. No se usa esta pantalla como acceso al club.
      window.ClubAuth?.signOut();
      const token = recoveryToken;
      recoveryToken = '';
      changeForm.reset();
      changeForm.hidden = true;
      const logout = await auth('logout?scope=global', undefined, token).catch(() => null);
      feedback('Contraseña actualizada. Ya puedes entrar en el club con tu nueva contraseña.' +
        (logout?.ok ? '' : ' No se pudo confirmar el cierre de las otras sesiones; contacta con el club si necesitas revisarlas.'), 'success');
    } catch (error) {
      feedback(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'No se pudo confirmar el cambio. Prueba a entrar con la nueva contraseña antes de repetirlo.' : error.message);
    } finally { busy = false; button.disabled = false; }
  };
  async function acceptRecovery() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    const hasRecovery = hash.has('access_token') || query.has('token_hash') || hash.has('error') || query.has('error');
    if (!hasRecovery) return;
    // Retirar credenciales de la dirección y el historial antes de hacer peticiones.
    history.replaceState(null, '', location.pathname);
    requestForm.hidden = true;
    busy = true;
    feedback('Comprobando el enlace de recuperación…', 'info');
    try {
      if (hash.has('error') || query.has('error')) throw Error('El enlace no es válido o ha caducado. Solicita uno nuevo.');
      if (query.get('type') === 'recovery' && query.get('token_hash')) {
        const verified = await auth('verify', {type:'recovery', token_hash:query.get('token_hash')});
        if (!verified.ok) throw Error('El enlace no es válido o ha caducado. Solicita uno nuevo.');
        recoveryToken = verified.data.access_token || '';
      } else if (hash.get('type') === 'recovery') {
        recoveryToken = hash.get('access_token') || '';
      }
      if (!recoveryToken) throw Error('Abre el enlace de recuperación que has recibido por correo.');
      const user = await auth('user', undefined, recoveryToken, 'GET');
      if (!user.ok || !user.data.id) throw Error('El enlace no es válido o ha caducado. Solicita uno nuevo.');
      changeForm.hidden = false;
      status.textContent = '';
      changeForm.elements.password.focus();
    } catch (error) {
      recoveryToken = '';
      requestForm.hidden = false;
      feedback(error.name === 'TypeError' || error.name === 'TimeoutError' ? 'No se pudo comprobar el enlace. Solicita uno nuevo cuando recuperes la conexión.' : error.message);
    } finally { busy = false; }
  }
  acceptRecovery();
})();
