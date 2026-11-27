const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
const apiKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const get = id => document.getElementById(id);
const form = get('signin');
const message = get('message');
function setMessage(text, kind = 'info') {
  message.textContent = text;
  message.dataset.kind = kind;
}
const enrollments = get('enrollments');
const refreshEnrollments = get('refreshEnrollments');
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const historyDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeZone: 'Europe/Madrid' });
const paymentFilter = get('familyPaymentFilter');
const states = { pending: 'Pendiente', in_review: 'En revisión', confirmed: 'Confirmado', not_applicable: 'No aplica' };
let token = '';

function membershipRequest(row) {
  const card = node('article', '');
  const title = row.kind === 'renew' ? 'Renovación' : 'Alta';
  card.append(node('h2', [title, row.full_name].filter(Boolean).join(' · ')));
  card.append(node('p', 'Temporada ' + row.season));
  if (!row.rejected_at) card.append(node('p', 'Cuota de socio ' + euro.format(row.fee)));
  const state = row.rejected_at ? 'Solicitud rechazada. Contacta con el club para revisar los datos.'
    : row.awaiting_receipt ? 'Pendiente de completar y adjuntar el justificante.'
    : row.approved_at ? 'Solicitud validada.'
    : 'Justificante recibido. Pendiente de revisión por el club.';
  card.append(node('p', state));
  if (!row.rejected_at && row.installment_discount > 0) {
    card.append(node('p', (row.approved_at ? 'Descuento aplicado a la última cuota de inscripción: '
      : 'Descuento reservado para la última cuota de inscripción: ') + euro.format(row.installment_discount)));
  }
  if (row.approved_at && !row.rejected_at) {
    card.append(node('p', row.card_state === 'sent' ?
      (row.is_campaign ? 'Carné enviado al correo de la solicitud.' : 'El club está gestionando el envío del carné.') :
      'El club está gestionando el envío del carné.'));
  }
  return card;
}

async function loadMembershipRequests(session) {
  const rows = await post('/rest/v1/rpc/bm_pinto_my_membership_requests', {}, session);
  if (token !== session) return;
  get('membershipRequests').replaceChildren(...rows.map(membershipRequest));
  get('membershipRequestsStatus').textContent = rows.length ? '' :
    'No hay solicitudes de socio asociadas al correo de esta cuenta.';
}

async function post(path, data, token) {
  if (token && !path.startsWith('/auth/')) return window.ClubAuth.authorized(path, data);
  const headers = { apikey: apiKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Solicitud rechazada');
  return response.json();
}

function node(tag, content) {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

function enrollment(row, rejections) {
  const card = node('article', '');
  const account = row.payments;
  const namedPlayers = (account.player_names ?? []).map((name,index)=>({name,index})).filter(({name}) => typeof name === 'string' && name.trim() && !name.includes('@'));
  const names=(account.player_names ?? []);
  const heading=node('h2','');
  if(namedPlayers.length)namedPlayers.forEach(({name,index},position)=>{if(position)heading.append(document.createTextNode(' · '));const link=node('a',name);link.href='ficha-jugador.html?registration='+encodeURIComponent(row.id)+'&index='+index+'&return=mis-inscripciones.html';link.target='_blank';link.rel='noopener';heading.append(link);});
  else heading.textContent='Inscripción · '+row.categories.join(' · ');
  card.append(heading);
  if (namedPlayers.length) card.append(node('p', row.categories.join(' · ')));
  if (row.dorsals?.length) card.append(node('p', row.dorsals.map(d => (names[d.player_index] || 'Jugador ' + (d.player_index + 1)) + ' · Dorsal ' + d.number).join(' / ')));
  if (account.agreement_pending) {
    card.append(node('p', 'Acuerdo pendiente de concretar'));
    return card;
  }
  if (account.mode === 'demand') card.append(node('p', 'Pago a demanda'));
  const nextPayment = account.installments.reduce((next, payment) => {
    if (payment.status !== 'pending' || !payment.due_on) return next;
    return !next || payment.due_on < next.due_on ? payment : next;
  }, null);
  if (nextPayment) {
    card.append(node('p', 'Primera cuota pendiente: ' + euro.format(nextPayment.amount)
      + ' · Vencimiento ' + nextPayment.due_on.split('-').reverse().join('/')));
  }
  card.append(node('p', [
    'Total ' + euro.format(account.total), 'Confirmado ' + euro.format(account.confirmed),
    'En revisión ' + euro.format(account.in_review), 'Pendiente ' + euro.format(account.pending),
  ].join(' · ')));
  const list = node('ul', '');
  let paymentNumber = 0;
  for (const payment of account.installments) {
    if (payment.status === 'not_applicable' && Number(payment.amount) === 0) continue;
    paymentNumber += 1;
    const label = payment.due_on ? 'Pago ' + paymentNumber + ' · Vencimiento ' + payment.due_on.split('-').reverse().join('/') : 'Ingreso sin vencimiento';
    const history = payment.confirmed_at ? 'Confirmado el ' + historyDate.format(new Date(payment.confirmed_at))
      : payment.receipt_received_at ? 'Justificante recibido el ' + historyDate.format(new Date(payment.receipt_received_at))
      : '';
    const line = node('li', [label, euro.format(payment.amount), states[payment.status], history].filter(Boolean).join(' · '));
    line.dataset.paymentState = payment.status;
    if (payment.status === 'pending') {
      const rejection = rejections.find(entry => entry.registration_id === row.id &&
        entry.schedule === payment.schedule && entry.installment === payment.installment);
      if (rejection) line.append(node('p', 'Justificante rechazado. Motivo: ' + rejection.reason));
      line.append(receiptForm(row.id, payment));
    }
    if (payment.receipt_received_at) line.append(' ', downloadReceipt(row.id, payment));
    list.append(line);
  }
  if (account.mode === 'demand' && Number(account.pending) > 0) {
    const balance = node('li', 'Saldo sin vencimiento · ' + euro.format(account.pending) + ' · Pendiente');
    balance.dataset.paymentState = 'pending';
    list.append(balance);
  }
  card.append(list);
  return card;
}

function downloadReceipt(id, payment) {
  const button = node('button', 'Descargar justificante');
  button.type = 'button';
  button.onclick = async () => {
    const session = token;
    if (!session || button.disabled) return;
    button.disabled = true;
    try {
      const receipt = await post('/rest/v1/rpc/bm_pinto_download_registration_test_receipt', {
        p_id: id, p_schedule: payment.schedule, p_installment: payment.installment,
      }, session);
      if (token !== session) return;
      const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[receipt?.mime];
      if (!extension || !receipt.file) throw new Error('Archivo no disponible');
      const bytes = Uint8Array.from(atob(receipt.file), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: receipt.mime }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'justificante-' + id + '-' + payment.schedule + '-' + payment.installment + '.' + extension;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (token === session) setMessage('No se pudo descargar el justificante. Actualiza el estado de los pagos y vuelve a intentarlo.', 'error');
    } finally {
      button.disabled = false;
    }
  };
  return button;
}

function receiptForm(id, payment) {
  const upload = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png';
  input.required = true;
  const label = node('label', 'Justificante (PDF, JPG o PNG, máximo 5 MB)');
  label.append(input);
  const button = node('button', 'Subir justificante');
  const feedback = node('p', '');
  feedback.className = 'form-message';
  feedback.setAttribute('role', 'status');
  upload.append(label, button, feedback);
  upload.onsubmit = async event => {
    event.preventDefault();
    const file = input.files[0];
    if (!file) {
      feedback.textContent = 'Selecciona un justificante PDF, JPG o PNG.';
      feedback.dataset.kind = 'error';
      return;
    }
    const session = token;
    button.disabled = input.disabled = true;
    feedback.textContent = 'Subiendo justificante…';
    feedback.dataset.kind = 'info';
    try {
      const encoded = await window.ClubReceipts.read(file);
      await post('/rest/v1/rpc/bm_pinto_upload_registration_test_receipt', {
        p_id: id, p_schedule: payment.schedule, p_installment: payment.installment, p_file: encoded,
      }, session);
    } catch (error) {
      feedback.dataset.kind = 'error';
      feedback.textContent = error.name === 'ReceiptError' ? error.message
        : 'No se pudo confirmar la subida. Pulsa Actualizar estado antes de volver a subirlo, para comprobar si el justificante ya se ha recibido.';
      button.disabled = input.disabled = false;
      return;
    }
    if (token !== session) return;
    setMessage('Justificante recibido. El pago queda en revisión.', 'success');
    try {
      await loadEnrollments(session);
    } catch {
      feedback.textContent = 'Justificante guardado. Vuelve a entrar para actualizar el estado.';
    }
  };
  return upload;
}

async function loadEnrollments(session) {
  const rows = await post('/rest/v1/rpc/bm_pinto_my_registration_tests', {}, session);
  const [rejections, discount, dorsals] = await Promise.all([
    post('/rest/v1/rpc/bm_pinto_my_registration_test_receipt_rejections', {}, session).catch(() => []),
    post('/rest/v1/rpc/bm_pinto_my_registration_test_membership_discount', {}, session).catch(() => null),
    post('/rest/v1/rpc/bm_pinto_my_registration_dorsals', {}, session),
  ]);
  if (token === session) {
    for (const row of rows) row.dorsals = dorsals.filter(d => d.registration_id === row.id);
    const membership = get('membershipDiscount');
    membership.hidden = !discount || Number(discount.discount) <= 0;
    membership.textContent = membership.hidden ? '' :
      'Descuento previsto en el alta de socio: ' + euro.format(discount.discount) + '.';
    enrollments.replaceChildren(...rows.map(row => enrollment(row, rejections)));
    applyPaymentFilter();
  }
  try {
    await loadMembershipRequests(session);
  } catch {
    if (token === session) {
      get('membershipRequests').replaceChildren();
      get('membershipRequestsStatus').textContent = 'No se pudieron consultar las solicitudes de socio. Pulsa actualizar para reintentarlo.';
    }
  }
  return rows;
}

function applyPaymentFilter() {
  const selected = paymentFilter.value;
  let matches = 0;
  for (const card of enrollments.children) {
    const payments = [...card.querySelectorAll('[data-payment-state]')];
    for (const payment of payments) {
      payment.hidden = Boolean(selected && payment.dataset.paymentState !== selected);
      if (!payment.hidden) matches++;
    }
    card.hidden = Boolean(selected && !payments.some(payment => !payment.hidden));
  }
  get('familyFilterEmpty').hidden = !selected || matches > 0;
}
paymentFilter.onchange = applyPaymentFilter;

refreshEnrollments.onclick = async () => {
  const session = token;
  if (!session || refreshEnrollments.disabled) return;
  refreshEnrollments.disabled = true;
  setMessage('Actualizando inscripciones y solicitudes de socio…');
  try {
    const rows = await loadEnrollments(session);
    if (token !== session) return;
    setMessage(rows.length
      ? 'Estado actualizado.'
      : 'Todavía no has enviado inscripciones desde esta aplicación. Consulta también el archivo del formulario anterior.', rows.length ? 'success' : 'info');
  } catch {
    if (token === session) setMessage('No se pudo actualizar. Si la sesión ha caducado, vuelve a entrar.', 'error');
  } finally {
    refreshEnrollments.disabled = false;
  }
};

let familyUserId = null;
async function applyFamilySession(session) {
  const next = session?.access_token || '';
  if (next === token) return;
  if(session?.user.id && session.user.id === familyUserId){token=next;return;}
  familyUserId=session?.user.id || null;
  token = next;
  enrollments.replaceChildren(); get('membershipRequests').replaceChildren();
  get('membershipRequestsStatus').textContent = ''; get('membershipDiscount').hidden = true;
  paymentFilter.value = ''; get('familyFilterEmpty').hidden = true;
  form.hidden = Boolean(token); get('family').hidden = !token;
  if (!token) { setMessage('Inicia sesión para consultar tus inscripciones.'); return; }
  setMessage('Cargando tus inscripciones y solicitudes de socio…');
  try {
    const rows = await loadEnrollments(next);
    if (token === next) setMessage(rows.length ? '' : 'Todavía no has enviado inscripciones desde esta aplicación. Consulta también el archivo del formulario anterior.');
  } catch { if (token === next) setMessage('No se pudieron cargar las inscripciones. Pulsa Actualizar estado.', 'error'); }
}
form.onsubmit = async event => {
  event.preventDefault(); const button=form.querySelector('button'); button.disabled=true;
  try { await window.ClubAuth.signIn(form.elements.email.value,form.elements.password.value); }
  catch(error) { setMessage(error.message,'error'); }
  finally { form.elements.password.value='';button.disabled=false; }
};
get('signout').onclick = () => window.ClubAuth.signOut();
window.ClubAuth.subscribe(applyFamilySession);
window.ClubAuth.getSession().then(applyFamilySession).catch(error=>setMessage(error.message,'error'));
