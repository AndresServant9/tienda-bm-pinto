const profile = document.querySelector('#profile');
const renewal = document.querySelector('#renewal');
const statusMessage = document.querySelector('#status');
const choices = [...document.querySelectorAll('input[name="kind"]')];
const receiptStep = document.querySelector('#receiptStep');
const requestSummary = document.querySelector('#requestSummary');
const api = 'https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_submit_membership_request';
const key = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const currency = new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'});
let draft;
let reviewRequestId = crypto.randomUUID();

function identifierValue(form) {
  return form.elements.identifier.value.replace(/[\s.-]/g, '').toUpperCase();
}
function isValidMembershipIdentifier(identifier) {
  if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(identifier)) return false;
  const digits = identifier.slice(0, -1).replace(/^[XYZ]/, letter => ({X: '0', Y: '1', Z: '2'})[letter]);
  return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits) % 23] === identifier.slice(-1);
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.hidden = true;
  statusMessage.dataset.kind = 'info';
}

function selectMode() {
  draft = null;
  receiptStep.reset();
  receiptStep.hidden = true;
  const renew = choices.find(choice => choice.checked).value === 'renew';
  profile.hidden = renew;
  renewal.hidden = !renew;
  clearStatus();
}
for (const choice of choices) choice.addEventListener('change', selectMode);
for (const form of [profile, renewal]) {
  form.oninput = clearStatus;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    const identifier = form.elements.identifier;
    const normalized = identifierValue(form);
    statusMessage.hidden = false;
    statusMessage.dataset.kind = 'error';
    if (!isValidMembershipIdentifier(normalized)) {
      statusMessage.textContent = 'DNI o NIE incorrecto. Revisa el número y la letra del documento.';
      identifier.focus();
      return;
    }
    const kind = form === profile ? 'new' : 'renew';
    const data = Object.fromEntries(new FormData(form));
    delete data.identifier;
    let reservation;
    const requestId = kind === 'new' ? reviewRequestId : crypto.randomUUID();
    if (kind === 'new') {
      const controls = [...form.elements, ...choices];
      controls.forEach(control => { control.disabled = true; });
      statusMessage.textContent = 'Comprobando las inscripciones y calculando la cuota…';
      statusMessage.dataset.kind = 'info';
      try {
        const response = await fetch(new URL('/rest/v1/rpc/bm_pinto_prepare_membership_quote', api), {
          method: 'POST',
          headers: {apikey: key, 'Content-Type': 'application/json'},
          body: JSON.stringify({p_id: requestId, p_identifier: normalized, p_email: data.email.trim()}),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (error.message?.startsWith('Ya consta como socio en')) throw Error(error.message);
          if (error.message === 'Ya hay una solicitud para este documento') {
            throw Error('Ya hay una solicitud para este documento. Contacta con el club.');
          }
          if (error.message?.startsWith('El DNI y el correo corresponden') ||
            error.message === 'Revisa el DNI o NIE y el correo del alta') {
            throw Error(error.message);
          }
          throw Error('No se pudo comprobar el descuento. Vuelve a revisar el alta antes de transferir.');
        }
        reservation = await response.json();
        if (!reservation?.id) throw Error('No se pudo confirmar la reserva. Vuelve a intentarlo.');
        reviewRequestId = reservation.id;
      } catch (error) {
        statusMessage.dataset.kind = 'error';
        statusMessage.textContent = error.message;
        return;
      } finally {
        controls.forEach(control => { control.disabled = false; });
      }
    }
    if (kind === 'renew') {
      const controls = [...form.elements, ...choices];
      controls.forEach(control => { control.disabled = true; });
      statusMessage.textContent = 'Comprobando el histórico de socios…';
      statusMessage.dataset.kind = 'info';
      try {
        const result = await fetch(new URL('/rest/v1/rpc/bm_pinto_check_membership_test_renewal', api), {
          method: 'POST',
          headers: {apikey: key, 'Content-Type': 'application/json'},
          body: JSON.stringify({p_identifier: normalized}),
          signal: AbortSignal.timeout(12000),
        });
        if (result.status === 429) throw Error('Hay demasiadas consultas. Inténtalo dentro de un minuto.');
        if (!result.ok) throw Error('No se pudo comprobar el padrón. Inténtalo de nuevo.');
        if (await result.json() !== true) {
          statusMessage.dataset.kind = 'error';
          statusMessage.textContent = 'Ese documento no consta en las temporadas admitidas para renovar. Revisa el DNI o NIE o contacta con el club.';
          return;
        }
      } catch (error) {
        statusMessage.dataset.kind = 'error';
        statusMessage.textContent = error.message;
        return;
      } finally {
        controls.forEach(control => { control.disabled = false; });
      }
    }
    draft = {submission: {p_id: reservation?.id ?? requestId, p_identifier: normalized, p_kind: kind, p_profile: data}};
    requestSummary.textContent = kind === 'new'
      ? data.fullName + ' · ' + data.email + ' · ' +
        (reservation ? 'Importe a transferir: ' + currency.format(reservation.base_fee - reservation.membership_discount) + '.' +
          (reservation.membership_discount > 0
            ? ' Como la inscripción ya está pagada, aplicamos ' + currency.format(reservation.membership_discount) + ' de descuento en tu cuota de socio.' : '') +
          (reservation.pending_installment_discount > 0
            ? ' Al validar el justificante, se aplicará un ajuste de ' + currency.format(reservation.pending_installment_discount) + ' en la última cuota de la inscripción.' : '')
          : 'Cuota anual general: 35 €.')
      : 'Renovación comprobada en el histórico de socios · Cuota anual general: 35 €.';
    window.ClubTransfers.render(document.querySelector('#transferDetails'),
      'SOCIO 2026/2027 ' + (kind === 'new' ? data.fullName.trim() : normalized));
    clearStatus();
    form.hidden = true;
    receiptStep.hidden = false;
    receiptStep.elements.receipt.focus();
  };
}
document.querySelector('#editRequest').onclick = selectMode;
receiptStep.onsubmit = async event => {
  event.preventDefault();
  if (!draft) return;
  const file = receiptStep.elements.receipt.files[0];
  statusMessage.hidden = false;
  statusMessage.dataset.kind = 'error';
  if (!file?.size || file.size > 5 * 1024 * 1024) {
    statusMessage.textContent = 'Selecciona un PDF, JPG o PNG de hasta 5 MB.';
    return;
  }
  const controls = [...receiptStep.elements, ...choices];
  controls.forEach(control => { control.disabled = true; });
  statusMessage.textContent = 'Enviando solicitud…';
  statusMessage.dataset.kind = 'info';
  try {
    const encoded = await window.ClubReceipts.read(file);
    const response = await fetch(api, {
      method: 'POST',
      headers: {apikey: key, 'Content-Type': 'application/json'},
      body: JSON.stringify({...draft.submission, p_receipt: encoded, p_privacy: {version:'2026-2027-v3', acknowledged:receiptStep.elements.privacyRead.checked}}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (failure.message === 'No se pudo tramitar la solicitud' || failure.code === '23505') {
        throw Error('Ya hay una solicitud de alta o renovación para este documento en 2026/2027. Contacta con el club si necesitas corregirla.');
      }
      if (failure.message === 'Formato de justificante no admitido' ||
          failure.message === 'Adjunta un justificante de hasta 5 MB') {
        throw Error('El archivo adjunto debe ser un PDF, JPG o PNG de hasta 5 MB.');
      }
      if (failure.message === 'El documento no consta en el padrón de 2025/2026' || failure.message === 'El documento no consta en el padrón histórico de socios') {
        throw Error('El documento no consta en el padrón anterior. Revisa el DNI o NIE o contacta con el club.');
      }
      if (failure.code === 'PGRST202') throw Error('El envío de solicitudes aún no está habilitado en Supabase.');
      throw Error('No se pudo guardar la solicitud. Puedes volver a intentar el mismo envío.');
    }
    const reference = await response.json();
    if (typeof reference !== 'string' || !reference.startsWith('SOCIO-PRUEBA-')) {
      throw Error('No se pudo confirmar la recepción. Puedes volver a intentar el mismo envío.');
    }
    reviewRequestId = crypto.randomUUID();
    profile.reset();
    renewal.reset();
    selectMode();
    statusMessage.hidden = false;
    statusMessage.textContent = 'Solicitud recibida. El club revisará el justificante y te enviará el carné cuando la valide.';
    statusMessage.dataset.kind = 'success';
  } catch (error) {
    statusMessage.dataset.kind = 'error';
    statusMessage.textContent = error instanceof TypeError || error.name === 'TimeoutError'
      ? 'No se pudo confirmar el envío. Revisa la conexión y vuelve a intentar el mismo envío.'
      : error.message || 'No se pudo leer el justificante. Selecciona el archivo de nuevo.';
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
};
selectMode();
