const season = {
  year: 2026,
  singlePaymentCutoff: '2026-07-01',
  dates: ['antes del 1 de julio', 'antes del 15 de septiembre', 'antes del 24 de diciembre'],
  categories: [
    {minBirth: 2019, name: 'Prebenjamín', federated: false, installments: [80,150,150]},
    {minBirth: 2017, name: 'Benjamín', federated: false, installments: [80,150,150]},
    {minBirth: 2015, name: 'Alevín', federated: true, installments: [80,200,160]},
    {minBirth: 2013, name: 'Infantil', federated: true, installments: [80,200,160]},
    {minBirth: 2011, name: 'Cadete', federated: true, installments: [80,200,160]},
    {minBirth: 2009, name: 'Juvenil', federated: true, installments: [80,200,160]},
    {minBirth: 0, name: 'Sénior', federated: true, installments: [80,200,160]},
  ],
};
function madridDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
function singlePaymentDeadline(now = new Date()) {
  return madridDate(now) <= season.singlePaymentCutoff
    ? 'con vencimiento el 1 de julio de 2026'
    : 'el día en que envíes la inscripción';
}
function categoryFor(date) {
  if (!date || Number(date.slice(0, 4)) > season.year) return null;
  return season.categories.find(category => Number(date.slice(0, 4)) >= category.minBirth);
}
function ageOnDate(birth, today = new Date()) {
  if (!birth) return null;
  const [year, month, day] = birth.split('-').map(Number);
  const beforeBirthday = today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - Number(beforeBirthday);
}
function calculate(players, member, day = madridDate()) {
  const eligible = players.filter(player => player.team !== 'national' && player.category?.name !== 'Sénior' &&
    player.birth && ageOnDate(player.birth, new Date(day + 'T12:00:00')) < 18);
  const siblings = players.length > 1;
  const lines = players.map(player => {
    const exempt = player.team === 'national';
    const playerMember = player.member ?? member;
    const memberDiscount = !exempt && playerMember ? 10 : 0;
    const discount = exempt ? 0 : (siblings ? 10 : 0) + memberDiscount;
    const payments = exempt ? [0,0,0] : [...player.category.installments];
    if (player.hasKit) payments[0] = 0;
    payments[2] -= discount;
    if (!exempt && day >= '2026-12-01') {
      const month = Number(day.slice(5, 7));
      const tenths = {12: 8, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2}[month] ?? 2;
      const annual = player.category.installments[1] + player.category.installments[2];
      const fixed = !player.category.federated ? 0 :
        ['Juvenil', 'Sénior'].includes(player.category.name) ? 18760 : 6516;
      const prorated = Math.round(fixed + (annual * 100 - fixed) * tenths / 10) / 100;
      payments.splice(0, 3, Math.max(0, prorated + payments[0] - discount), 0, 0);
    } else if (day >= '2026-09-15') {
      payments[0] += payments[1];
      payments[1] = 0;
    }
    return {...player, member: playerMember, memberDiscount, discount, payments, total: payments.reduce((sum, value) => sum + value, 0)};
  });
  return {lines, laterDiscount: Math.min(20, eligible.filter(player => !(player.member ?? member)).length * 10)};
}
function normalizeIdentifier(value) {
  return String(value || '').replace(/[\s.-]/g, '').toUpperCase();
}
function isValidIdentifier(value) {
  const document = normalizeIdentifier(value);
  if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(document)) return false;
  const digits = document.slice(0, -1).replace(/^[XYZ]/, letter => ({X: '0', Y: '1', Z: '2'})[letter]);
  return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits) % 23] === document.slice(-1);
}
function scheduledPayments(amounts, deadlines) {
  return amounts.map((amount, index) => ({amount, deadline: deadlines[index]}))
    .filter(payment => payment.amount > 0)
    .map((payment, index) => ({...payment, label: 'Pago ' + (index + 1)}));
}
if (typeof module !== 'undefined') module.exports = {categoryFor, calculate, singlePaymentDeadline, scheduledPayments, isValidIdentifier};
if (typeof document !== 'undefined') {
  const form = document.querySelector('#registration');
  const container = document.querySelector('#players');
  const summary = document.querySelector('#summary');
  const proratedSeason = madridDate() >= '2026-12-01';
  document.querySelector('#splitPaymentOption').hidden = proratedSeason;
  document.querySelector('#proratedPaymentNote').hidden = !proratedSeason;
  const reviewStatus = document.querySelector('#reviewStatus');
  const memberStatus = document.createElement('p');memberStatus.className='form-message';memberStatus.tabIndex=-1;memberStatus.setAttribute('role','status');
  form.querySelector('button[type=submit]').before(memberStatus);
  const memberSummary=document.createElement('p');document.querySelector('#membership').after(memberSummary);
  let reviewing=false,reviewRevision=0;
  function setStatus(element, text, kind = 'error') {
    element.dataset.kind = kind;
    element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    element.textContent = text;
    if (text && kind === 'error') {
      element.focus({preventScroll: true});
      element.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }
  function validateDocument(input) {
    const valid = input.disabled || (!input.required && !input.value.trim()) || isValidIdentifier(input.value);
    const text = valid ? '' : 'DNI/NIE incorrecto. Revisa el número y la letra.';
    input.setCustomValidity(text);
    input.setAttribute('aria-invalid', String(!valid));
    input.documentError.textContent = text;
    input.documentError.hidden = valid;
    return valid;
  }
  function bindDocument(input) {
    const error = document.createElement('small');
    error.className = 'form-message document-error';
    error.dataset.kind = 'error';
    error.hidden = true;
    error.id = 'document-error-' + crypto.randomUUID();
    input.insertAdjacentElement('afterend', error);
    input.documentError = error;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    input.addEventListener('blur', () => validateDocument(input));
    input.addEventListener('invalid', () => validateDocument(input));
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      if (input.getAttribute('aria-invalid') === 'true') validateDocument(input);
    });
  }
  const confirmRegistration = document.querySelector('#confirmRegistration');
  const printRegistration = document.querySelector('#printRegistration');
  const accountFields = document.querySelector('#registrationAccount');
  const accountEmail = document.querySelector('#registrationEmail');
  const accountPassword = document.querySelector('#registrationPassword');
  const openMyRegistrations = document.querySelector('#openMyRegistrations');
  const firstReceipt = document.querySelector('#firstReceipt');
  const firstReceiptField = document.querySelector('#firstReceiptField');
  const firstReceiptLabel = document.querySelector('#firstReceiptLabel');
  for (const input of [accountEmail, accountPassword, firstReceipt]) {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (reviewStatus.dataset.kind === 'error') setStatus(reviewStatus, '', 'info');
    });
  }
  function firstReceiptAmount(registration) {
    const data = registration?.data;
    if (!data || (data.registration_day < season.singlePaymentCutoff &&
      !data.players.some(player => !player.hasKit && player.team !== 'national'))) return 0;
    return data.payment === 'single' ? data.total : data.players.reduce((total, player) => total + player.payments[0], 0);
  }
  function updateFirstReceipt() {
    const amount = firstReceiptAmount(reviewedRegistration);
    firstReceiptField.hidden = amount <= 0;
    firstReceiptLabel.textContent = 'Justificante del primer pago (' +
      new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount) + ') · PDF, JPG o PNG, máximo 5 MB';
  }

  document.querySelector('#editRegistration').onclick = () => {
    summary.hidden = true;
    container.querySelector('[name="playerName"]').focus();
  };
  const registrationApi = 'https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_submit_registration_test';
  const publishableKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
  const signup = document.querySelector('#registrationSignup');
  const verify = document.querySelector('#registrationVerify');
  const signupStatus = document.querySelector('#registrationSignupStatus');
  bindDocument(form.elements.contactIdentifier);
  bindDocument(signup.elements.identifier);
  let pendingAccount;
  let clubSession;
  function applyClubSession(session) {
    clubSession = session ? {email:session.user.email.toLowerCase(), token:session.access_token} : null;
    if (clubSession) accountEmail.value = clubSession.email;
    accountEmail.readOnly = Boolean(clubSession);
    accountEmail.closest('label').hidden = Boolean(clubSession);
    const accountHint = accountFields.querySelector('p');
    if (accountHint) accountHint.textContent = clubSession
      ? 'La inscripción se guardará en tu cuenta del club. No necesitas volver a iniciar sesión.'
      : 'Introduce el correo y la contraseña de tu cuenta del club.';
    const recoveryLink = accountFields.querySelector('a[href*="recuperar-cuenta"]');
    if (recoveryLink) recoveryLink.hidden = Boolean(clubSession);
    accountPassword.closest('label').hidden = Boolean(clubSession);
    document.querySelector('#createRegistrationAccount').hidden = Boolean(clubSession);
    const title = accountFields.querySelector('h3');
    if (title) title.textContent = clubSession ? 'Sesión iniciada · ' + clubSession.email : 'Ya tengo cuenta';
  }
  window.ClubAuth.subscribe(applyClubSession);
  applyClubSession(window.ClubAuth.current());
  function prefillAccount() {
    const values = {
      fullName: form.elements.contact.value.trim(),
      phone: form.elements.phone.value.trim(),
      identifier: form.elements.contactIdentifier.value.trim(),
      email: form.elements.email.value.trim(),
    };
    for (const [name, value] of Object.entries(values)) {
      const input = signup.elements[name];
      if (!input.value || input.value === input.dataset.contactValue) {
        input.value = value;
        input.dataset.contactValue = value;
        if (name === 'identifier') {
          input.setCustomValidity('');
          input.removeAttribute('aria-invalid');
          input.documentError.hidden = true;
        }
      }
    }
  }
  document.querySelector('#createRegistrationAccount').addEventListener('toggle', event => {
    if (event.currentTarget.open) prefillAccount();
  });
  async function accountRequest(path, body, token) {
    const headers = {apikey: publishableKey, 'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(new URL(path, registrationApi), {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return {ok: response.ok, data: await response.json().catch(() => ({}))};
  }
  signup.onsubmit = async event => {
    event.preventDefault();
    const button = signup.querySelector('button');
    if (button.disabled) return;
    const fields = new FormData(signup);
    const email = fields.get('email').trim().toLowerCase();
    const password = fields.get('password');
    const identifier = normalizeIdentifier(fields.get('identifier'));
    const name = fields.get('fullName').trim();
    const phone = fields.get('phone').trim();
    if (!name || !phone) {
      setStatus(signupStatus, 'Introduce el nombre completo y el teléfono del titular.');
      return;
    }
    if (!isValidIdentifier(identifier)) {
      validateDocument(signup.elements.identifier);
      setStatus(signupStatus, 'DNI/NIE incorrecto. Revisa el número y la letra del documento del titular.');
      signup.elements.identifier.focus();
      return;
    }
    if (password !== fields.get('repeat')) {
      setStatus(signupStatus, 'Las contraseñas no coinciden.');
      signup.elements.repeat.focus();
      return;
    }
    button.disabled = true;
    setStatus(signupStatus, 'Solicitando código…', 'info');
    try {
      const {ok, data} = await accountRequest('/auth/v1/signup', {
        email, password, data: {store_name: name, store_phone: phone, club_identifier_pending:identifier},
      });
      if (['user_already_exists', 'email_exists'].includes(data.code) || data.identities?.length === 0) {
        accountEmail.value = email;
        throw Error('Ese correo ya está registrado. Inicia sesión con tu cuenta del club.');
      }
      if (!ok) throw Error('No se pudo crear la cuenta. Comprueba los datos o inténtalo más tarde.');
      pendingAccount = {email, identifier};
      lastCodeSent = Date.now();
      signup.reset();
      signup.hidden = true;
      verify.hidden = false;
      setStatus(signupStatus, 'Introduce el código que hemos enviado a tu correo.', 'info');
      verify.elements.code.focus();
    } catch (error) {
      setStatus(signupStatus, error.message);
    } finally {
      button.disabled = false;
    }
  };
  verify.onsubmit = async event => {
    event.preventDefault();
    const button = verify.querySelector('button');
    if (!pendingAccount || button.disabled) return;
    button.disabled = true;
    try {
      if (!pendingAccount.token) {
        const result = await accountRequest('/auth/v1/verify', {
          email: pendingAccount.email, token: verify.elements.code.value.trim(), type: 'email',
        });
        if (!result.ok || !result.data.access_token) throw Error('El código es incorrecto o ha caducado.');
        pendingAccount.token = result.data.access_token;
        pendingAccount.session = result.data;
      }
      const saved = await accountRequest('/rest/v1/rpc/bm_pinto_save_customer_identifier',
        {identifier: pendingAccount.identifier}, pendingAccount.token);
      if (!saved.ok) throw Error('Correo verificado. Pulsa Verificar correo para reintentar el guardado del DNI/NIE.');
      await window.ClubAuth.acceptSession(pendingAccount.session);
      clubSession = {email: pendingAccount.email, token: pendingAccount.token};
      accountEmail.value = clubSession.email;
      pendingAccount = null;
      verify.reset();
      verify.hidden = true;
      setStatus(signupStatus, 'Cuenta del club verificada. Ya puedes enviar la inscripción.', 'success');
      document.querySelector('#createRegistrationAccount summary').textContent = 'Cuenta del club creada';
    } catch (error) {
      setStatus(signupStatus, error.message);
    } finally {
      button.disabled = false;
    }
  };
  let lastCodeSent = 0;
  document.querySelector('#resendRegistrationCode').onclick = async event => {
    if (!pendingAccount || pendingAccount.token) return;
    const button = event.currentTarget;
    if (button.disabled) return;
    if (Date.now() - lastCodeSent < 60000) {
      setStatus(signupStatus, 'Espera un minuto antes de solicitar otro código.', 'info');
      return;
    }
    button.disabled = true;
    try {
      const result = await accountRequest('/auth/v1/resend', {type:'signup', email:pendingAccount.email});
      if (!result.ok) throw Error('No se pudo reenviar el código. Espera un minuto y vuelve a intentarlo.');
      lastCodeSent = Date.now();
      setStatus(signupStatus, 'Código solicitado. Revisa el correo no deseado y usa el último código recibido.', 'info');
    } catch (error) { setStatus(signupStatus, error.message); }
    finally { button.disabled = false; }
  };
  document.querySelector('#changeRegistrationEmail').onclick = () => {
    if (verify.querySelector('button').disabled) return;
    const email = pendingAccount?.email || '';
    pendingAccount = null;
    verify.reset();
    verify.hidden = true;
    signup.hidden = false;
    prefillAccount();
    signup.elements.email.value = email;
    setStatus(signupStatus, 'Corrige el correo y solicita la verificación. Si la cuenta ya existe, inicia sesión o recupera la contraseña.', 'info');
    signup.elements.email.focus();
  };
  let reviewedRegistration = null;
  let reviewedPayload = '';
  let registrationKey = '';
  let registrationSending = false;
  confirmRegistration.onclick = async () => {
    if (!reviewedRegistration || registrationSending) return;
    const registration = reviewedRegistration;
    const needsReceipt = firstReceiptAmount(registration) > 0;
    const file = firstReceipt.files[0];
    const existingSession = clubSession?.email === accountEmail.value.trim().toLowerCase() && clubSession;
    if (!existingSession && (!accountEmail.value.trim() || !accountEmail.checkValidity() || !accountPassword.value)) {
      setStatus(reviewStatus, 'Introduce el correo y la contraseña de tu cuenta del club.');
      accountEmail.setAttribute('aria-invalid', String(!accountEmail.value.trim() || !accountEmail.checkValidity()));
      accountPassword.setAttribute('aria-invalid', String(!accountPassword.value));
      return;
    }
    if (needsReceipt && (!file?.size || file.size > 5 * 1024 * 1024)) {
      setStatus(reviewStatus, 'Adjunta un justificante de hasta 5 MB para el primer pago.');
      firstReceipt.focus();
      return;
    }
    registrationSending = true;
    confirmRegistration.disabled = true;
    accountFields.disabled = true;
    setStatus(reviewStatus, 'Enviando inscripción…', 'info');
    try {
      const encodedReceipt = needsReceipt ? await window.ClubReceipts.read(file) : null;
      const headers = {apikey: publishableKey, 'Content-Type': 'application/json'};
      let endpoint = registrationApi;
      const payload = {submission_id: registration.id, submission: registration.data, p_details: registration.details};
      {
        const session = await window.ClubAuth.getSession() || await window.ClubAuth.signIn(accountEmail.value.trim(), accountPassword.value);
        headers.Authorization = 'Bearer ' + session.access_token;
        endpoint = registrationApi.replace('bm_pinto_submit_registration_test', 'bm_pinto_submit_registration_test_details');
        payload.first_receipt = encodedReceipt;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) {
          clubSession = null;
          throw Error('La sesión ha caducado. Introduce de nuevo el correo y la contraseña para enviar la inscripción; los datos del formulario se conservan.');
        }
        const failure = await response.json().catch(() => ({}));
        if (failure.code === 'PGRST202') throw Error('El envío de inscripciones no está disponible. Contacta con el club.');
        if(failure.code==='PT409')throw Error(/socio/i.test(failure.message || '') ? 'No se ha encontrado socio en la temporada actual.' : failure.message || 'Los datos de la inscripción han cambiado. Vuelve a revisarlos.');
        if(failure.code==='PT410') {
          await Promise.all([...container.children].map(player => refreshDorsal(player, true)));
          throw Error('El dorsal elegido ya no está disponible. Selecciona otro y vuelve a revisar la inscripción.');
        }
        if(failure.message==='Revisa los importes de la inscripción')throw Error('El importe ha cambiado. Actualiza el formulario y pulsa Revisar inscripción.');
        if (failure.message === 'Ficha de prueba incorrecta') throw Error('Revisa los datos de contacto, el domicilio y las autorizaciones.');
        if (failure.code === '22P02' || failure.message === 'Jugador de prueba incorrecto') {
          throw Error('No se pudieron validar los datos del pack. Revisa las tallas o contacta con el club.');
        }
        if (failure.message === 'Formato no admitido' || failure.message === 'Archivo demasiado grande') {
          throw Error('El justificante debe ser un PDF, JPG o PNG de hasta 5 MB.');
        }
        throw Error('No se pudo enviar la inscripción. Puedes reintentar el mismo envío.');
      }
      const reference = await response.json();
      if (typeof reference !== 'string' || !reference.startsWith('INS-PRUEBA-')) throw Error('No se pudo comprobar la recepción.');
      if (reviewedRegistration?.id !== registration.id) return;
      setStatus(reviewStatus, 'Inscripción recibida correctamente por el club.' +
        ' Ya está disponible en Mis inscripciones.' +
        (needsReceipt ? ' Justificante recibido para revisión.' : ''), 'success');
      firstReceipt.value = '';
      accountFields.hidden = true;
      openMyRegistrations.hidden = false;
      confirmRegistration.hidden = true;
      printRegistration.hidden = false;
      printRegistration.focus();
    } catch (error) {
      if (reviewedRegistration?.id === registration.id) setStatus(reviewStatus,
        error instanceof TypeError || error.name === 'TimeoutError'
          ? 'No se pudo confirmar la recepción. Consulta Mis inscripciones antes de editar los datos; si no aparece, reintenta el mismo envío.'
          : error.message);
    } finally {
      registrationSending = false;
      confirmRegistration.disabled = false;
      accountFields.disabled = false;
      accountPassword.value = '';
    }
  };
  printRegistration.onclick = () => window.print();

  const authorizationDetails = document.querySelector('#authorizationDetails');
  const privacyDetails = document.querySelector('#privacyDetails');
  for (const button of document.querySelectorAll('[data-privacy]')) {
    button.addEventListener('click', () => privacyDetails.showModal());
  }
  const authorizationTexts = {
    nonFederatedProtocol: 'Prebenjamín y Benjamín: según el procedimiento del club, la atención se realiza a través de la sanidad pública (Seguridad Social). Avisa al entrenador y al Padre/Madre/Tutor y acude al centro de salud o a las urgencias públicas según la necesidad. En una urgencia vital, llama al 112. No se aplica el circuito de Nueva Mutua Sanitaria ni sus centros privados concertados a estas categorías.',

    outings: 'Al elegir Sí, autorizas al jugador o jugadora a participar en actividades de balonmano fuera del pabellón Sandra Aguilar y a acudir a otras instalaciones deportivas bajo la supervisión del entrenador o de la persona designada por el club.',
    transport: 'Al elegir Sí, autorizas los desplazamientos a partidos o entrenamientos en coche particular de un compañero o entrenador previo acuerdo entre las partes. También autorizas los desplazamientos a torneos del club en transporte contratado o en vehículos particulares de familias o entrenadores, con información previa del viaje.',
    images: 'Al elegir Sí, autorizas al Club Balonmano Pinto a utilizar fotografías del jugador o jugadora tomadas durante las actividades del club en la web del club, memorias y publicaciones informativas de esas actividades. No incluye campañas publicitarias ajenas al club. Elegir No no impide inscribirse ni participar. Puedes retirar el consentimiento escribiendo a balonmanopinto1@gmail.com; la retirada no afecta a usos anteriores lícitos. Si se trata de un menor, debe actuar su representante con facultades para autorizar, respetando el interés y la voluntad del menor. Consulta el aviso de privacidad para conocer tus derechos.',
  };
  form.addEventListener('click', event => {
    const link = event.target.closest('[data-authorization]');
    if (!link) return;
    event.preventDefault();
    document.querySelector('#authorizationTitle').textContent = link.textContent;
    const content = document.querySelector('#authorizationText');
    if (link.dataset.authorization === 'federatedProtocol') {
      content.replaceChildren(document.querySelector('#federatedProtocol').content.cloneNode(true));
    } else {
      content.textContent = authorizationTexts[link.dataset.authorization];
    }
    authorizationDetails.showModal();
  });
  const euro = new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'});
  const field = (player, name) => player.querySelector('[name="' + name + '"]');
  const sizes = ['2XS','XS','S','M','L','XL','2XL','3XL'];
  let contactMode;
  let guardianContact = {name: '', identifier: ''};
  function updateContact() {
    const players = [...container.children];
    const dated = players.filter(player => ageOnDate(field(player, 'birth').value) !== null);
    const minor = dated.some(player => ageOnDate(field(player, 'birth').value) < 18);
    const mode = minor ? 'guardian' : dated.length ? 'adult' : null;
    const fields = document.querySelector('#contactFields');
    fields.hidden = !mode;
    document.querySelector('#guardianMemberField').hidden = !minor;
    form.elements.member.disabled = !minor;
    for (const name of ['contact', 'contactIdentifier', 'email', 'phone']) form.elements[name].disabled = !mode;
    if (!mode) return;
    if (contactMode === 'guardian' && mode !== 'guardian') {
      guardianContact = {name: form.elements.contact.value, identifier: form.elements.contactIdentifier.value};
    }
    if (mode === 'guardian' && contactMode !== 'guardian') {
      form.elements.contact.value = guardianContact.name;
      form.elements.contactIdentifier.value = guardianContact.identifier;
    }
    if (mode === 'adult') {
      form.elements.contact.value = field(dated[0], 'playerName').value;
      form.elements.contactIdentifier.value = field(dated[0], 'playerId').value;
    }
    contactMode = mode;
    for (const [id, name] of [['contactNameField', 'contact'], ['contactIdentifierField', 'contactIdentifier']]) {
      document.querySelector('#' + id).hidden = !minor;
      form.elements[name].readOnly = !minor;
    }
    document.querySelector('#contactLegend').textContent = minor ? 'Padre/Madre/Tutor' : 'Datos de contacto del jugador';
    document.querySelector('#contactHelp').textContent = minor
      ? 'Introduce los datos del Padre/Madre/Tutor responsable de los menores. Los usaremos también si creas una cuenta del club.'
      : 'Datos de contacto de ' + (form.elements.contact.value || 'la persona inscrita') + '. Para crear la cuenta usaremos su nombre y DNI/NIE, que ya has indicado arriba.';
  }
  function renumber() {
    [...container.children].forEach((player, index) => {
      player.querySelector('legend').textContent = 'Jugador ' + (index + 1);
      player.querySelector('.remove').hidden = container.children.length === 1;
    });
    updateContact();
  }
  async function refreshDorsal(player, force = false) {
    const birth = field(player, 'birth').value, division = field(player, 'division').value;
    const name = field(player, 'playerName').value.trim();
    const select = field(player, 'dorsal'), status = player.querySelector('.dorsal-status');
    const key = [birth, division, name, window.ClubAuth?.current()?.user?.id || 'guest'].join('|');
    if (!force && player.dorsalKey === key) return player.dorsalPromise;
    player.dorsalKey = key;
    const previous = select.value, revision = (player.dorsalRevision || 0) + 1;
    player.dorsalRevision = revision;
    select.disabled = true;
    select.replaceChildren(new Option('Indica nacimiento, rama y nombre', ''));
    status.textContent = '';
    if (!birth || !division || !name || !field(player, 'birth').checkValidity()) return;
    select.replaceChildren(new Option('Consultando dorsales…', ''));
    status.textContent = 'Comprobando los números disponibles…';
    player.dorsalPromise = (async () => {
      try {
        const session = await window.ClubAuth.getSession();
        const response = await fetch('https://dfwnzfznhnkcqrdcydnx.supabase.co/rest/v1/rpc/bm_pinto_dorsal_options', {
          method: 'POST', headers: {apikey: publishableKey, 'Content-Type': 'application/json', ...(session?.access_token ? {Authorization: 'Bearer ' + session.access_token} : {})},
          body: JSON.stringify({p_birth: birth, p_division: division, p_name: name}), signal: AbortSignal.timeout(15000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.available) || data.available.some(n => !Number.isInteger(n) || n < 1 || n > 99)) throw Error('No se pudieron comprobar los dorsales. Vuelve a intentarlo.');
        if (revision !== player.dorsalRevision || !player.isConnected) return;
        select.replaceChildren(new Option(data.available.length ? 'Selecciona un dorsal' : 'No hay dorsales disponibles', ''), ...data.available.map(n => new Option(String(n), String(n))));
        select.disabled = false;
        if (data.own_number && data.available.includes(data.own_number)) select.value = String(data.own_number);
        else if (data.available.includes(Number(previous))) select.value = previous;
        status.dataset.kind = 'info';
        status.textContent = data.own_number ? 'Se conserva tu dorsal asignado: ' + data.own_number + '.' :
          data.available.length ? 'Solo se muestran los dorsales disponibles. Se reservará al confirmar la inscripción.' : 'El club debe revisar las asignaciones. Contacta con nosotros.';
      } catch (error) {
        if (revision !== player.dorsalRevision) return;
        select.replaceChildren(new Option('No se pudo consultar. Reintenta la comprobación.', ''));
        status.dataset.kind = 'error'; status.textContent = error.message;
        player.dorsalKey = '';
      }
    })();
    return player.dorsalPromise;
  }
  function updatePlayer(player) {
    const category = categoryFor(field(player, 'birth').value);
    const showOtherTown = field(player, 'town').value === 'other';
    const otherTown = field(player, 'otherTown');
    otherTown.disabled = !showOtherTown;
    otherTown.required = showOtherTown;
    player.querySelector('.other-town').hidden = !showOtherTown;
    const birth = field(player, 'birth').value;
    const age = ageOnDate(birth);
    const minor = age !== null && age < 18;
    const ownMembership = field(player, 'ownMember');
    const ownMembershipVisible = age !== null && age >= 18;
    if(!ownMembershipVisible)ownMembership.checked=false;
    ownMembership.disabled = !ownMembershipVisible;
    player.querySelector('.own-membership').hidden = !ownMembershipVisible;
    const noPlayerId = field(player, 'noPlayerId');
    noPlayerId.disabled = !minor;
    if (!minor) noPlayerId.checked = false;
    player.querySelector('.no-player-id').hidden = !minor;
    const federationIdRequired = age !== null && age >= 14;
    player.querySelector('.player-id-warning').hidden = !(category?.federated && federationIdRequired && noPlayerId.checked);
    const playerId = field(player, 'playerId');
    playerId.disabled = noPlayerId.checked;
    playerId.required = !noPlayerId.checked;
    if (playerId.disabled) {
      playerId.setCustomValidity('');
      playerId.documentError.hidden = true;
      playerId.removeAttribute('aria-invalid');
    }
    const reportHealth = field(player, 'hasHealth').value === 'yes';
    const health = field(player, 'health');
    health.disabled = !reportHealth;
    health.required = reportHealth;
    const healthConsent = field(player, 'healthConsent');
    healthConsent.disabled = !reportHealth;
    healthConsent.required = reportHealth;
    if (!reportHealth) healthConsent.checked = false;
    if (!reportHealth) health.value = '';
    player.querySelector('.health-detail').hidden = !reportHealth;
    const seniorMale = category?.name === 'Sénior' && field(player, 'division').value === 'male';
    field(player, 'team').disabled = !seniorMale;
    player.querySelector('.senior').hidden = !seniorMale;
    player.querySelector('.category').textContent = category?.name || '';
    player.querySelector('.trouser-label').textContent = field(player, 'kitRole').value === 'goalkeeper'
      ? 'Talla de pantalón largo' : 'Talla de pantalón';
    const protocol = player.querySelector('.protocol');
    protocol.hidden = !category;
    if (category) {
      const link = protocol.querySelector('a');
      link.dataset.authorization = category.federated ? 'federatedProtocol' : 'nonFederatedProtocol';
      link.textContent = category.federated ? 'Protocolo de accidentes para federados' : 'Protocolo de accidentes para no federados';
    }
    const needsKit = field(player, 'hasKit').value === 'no';
    player.querySelector('.kit-fields').hidden = !needsKit;
    for (const name of ['kitRole', 'printName', 'fitted']) {
      field(player, name).disabled = !needsKit;
    }
    for (const name of ['shirt', 'shorts']) {
      field(player, name).disabled = !needsKit || field(player, 'fitted').checked;
    }
    updateContact();
    refreshDorsal(player);
  }
  function addPlayer() {
    const player = document.querySelector('#player').content.firstElementChild.cloneNode(true);
    const helpId = 'dorsal-help-' + crypto.randomUUID();
    player.querySelector('#dorsalHelp').id = helpId;
    field(player, 'dorsal').setAttribute('aria-describedby', helpId);
    bindDocument(field(player, 'playerId'));
    for (const [name, options] of [
      ['shirt', ['7/8 XS','5/6 XS','3/4 XS',...sizes,'4XL']],
      ['shorts', ['6/5 XS','4/3 XS',...sizes]],
    ]) field(player, name).replaceChildren(new Option('Selecciona', ''), ...options.map(size => new Option(size, size)));
    const today = new Date();
    const dateParts = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
    field(player, 'birth').max = dateParts.map(part => String(part).padStart(2, '0')).join('-');
    player.addEventListener('change', () => updatePlayer(player));
    player.addEventListener('input', event => {
      updateContact();
      if (['playerName','birth','division'].includes(event.target.name)) {
        clearTimeout(player.dorsalTimer);
        player.dorsalTimer = setTimeout(() => refreshDorsal(player), 350);
      }
    });
    player.querySelector('.remove').onclick = () => {
      player.remove();
      renumber();
      summary.hidden = true;
    };
    container.append(player);
    updatePlayer(player);
    renumber();
    return field(player, 'playerName');
  }
  addPlayer();
  document.querySelector('#add').onclick = () => {summary.hidden = true; addPlayer().focus();};
  form.addEventListener('input', () => {summary.hidden = true;reviewRevision++;});
  form.addEventListener('change', () => {summary.hidden = true;reviewRevision++;});
  form.onsubmit = async event => {
    event.preventDefault();
    if(reviewing)return;
    updateContact();
    const documents = [...container.querySelectorAll('[name="playerId"]'), form.elements.contactIdentifier];
    const invalidDocument = documents.map(input => ({input, valid: validateDocument(input)})).find(result => !result.valid);
    if (invalidDocument) {
      invalidDocument.input.focus();
      invalidDocument.input.reportValidity();
      return;
    }
    const reviewButton=form.querySelector('button[type=submit]'),revision=reviewRevision;
    reviewing=true;reviewButton.disabled=true;
    try{
    await Promise.all([...container.children].map(player => refreshDorsal(player, true)));
    const dorsalPlayers = [...container.children].map(player => ({
      number: Number(field(player, 'dorsal').value), division: field(player, 'division').value,
      birthYear: Number(field(player, 'birth').value.slice(0,4)),
    }));
    if (dorsalPlayers.some(player => !Number.isInteger(player.number) || player.number < 1 || player.number > 99)) throw Error('Selecciona un dorsal disponible para cada jugador.');
    window.ClubDorsals.checkFamily(dorsalPlayers, season.year);
    const lookupResults=new Map();
    async function isMember(identifier){
      const normalized=normalizeIdentifier(identifier);
      if(!normalized)return false;
      if(!lookupResults.has(normalized)){
        setStatus(memberStatus,'Comprobando los DNI de socio…','info');
        const response=await accountRequest('/rest/v1/rpc/bm_pinto_check_public_member',{identifier:normalized});
        if(!response.ok||typeof response.data!=='boolean')throw Error('No se pudo comprobar la condición de socio. Vuelve a revisar la inscripción en unos instantes.');
        lookupResults.set(normalized,response.data);
      }
      return lookupResults.get(normalized);
    }
    const checkedPlayers=new Map(),membershipMessages=[];
    const guardianClaim=form.elements.member.checked&&!form.elements.member.disabled;
    const guardianMatches=guardianClaim?await isMember(form.elements.contactIdentifier.value):false;
    if(guardianClaim)membershipMessages.push(guardianMatches?'Padre/Madre/Tutor: socio comprobado.':'No se ha encontrado socio en la temporada actual.');
    for(const player of container.children){
      const minor=ageOnDate(field(player,'birth').value)<18;
      const ownClaim=!minor&&!field(player,'ownMember').disabled&&field(player,'ownMember').checked;
      const identifier=field(player,'playerId').disabled?(minor?form.elements.contactIdentifier.value:''):field(player,'playerId').value;
      const ownMatches=ownClaim?await isMember(identifier):false;
      checkedPlayers.set(player,ownMatches||(minor&&guardianMatches));
      if(ownClaim)membershipMessages.push((container.children.length>1?field(player,'playerName').value.trim()+': ':'')+(ownMatches?'Socio comprobado.':'No se ha encontrado socio en la temporada actual.'));
    }
    if(revision!==reviewRevision)throw Error('Has cambiado datos durante la comprobación. Pulsa de nuevo Revisar inscripción.');
    setStatus(memberStatus,'','info');
    prefillAccount();
    const players = [...container.children].map(player => ({
      name: field(player, 'playerName').value.trim(),
      birth: field(player, 'birth').value,
      dorsal: Number(field(player, 'dorsal').value),
      member: checkedPlayers.get(player),
      category: categoryFor(field(player, 'birth').value),
      division: field(player, 'division').value,
      team: field(player, 'team').disabled ? 'standard' : field(player, 'team').value,
      hasKit: field(player, 'hasKit').value === 'yes',
      kit: field(player, 'hasKit').value === 'yes' ? 'Ya tiene el pack inicial' : field(player, 'fitted').checked ? 'Tallas tomadas en el club' :
        'Camiseta ' + field(player, 'shirt').value + ' · Pantalón ' + field(player, 'shorts').value,
      printName: field(player, 'printName').value.trim(),
      kitRole: field(player, 'kitRole').value,
      fitted: field(player, 'fitted').checked,
      shirt: field(player, 'shirt').value,
      shorts: field(player, 'shorts').value,
      town: field(player, 'town').value === 'other' ? field(player, 'otherTown').value.trim() : field(player, 'town').value,
      registeredInPinto: field(player, 'registeredInPinto').value,
      authorizations: [
        ['Actividades fuera del pabellón', field(player, 'outings').value],
        ['Transporte con el equipo', field(player, 'transport').value],
        ['Publicación de imágenes', field(player, 'images').value],
      ],
    }));
    const undecided = players.some(player => !player.team);
    const now = new Date();
    const day = madridDate(now);
    if (day > '2027-06-30') {
      summary.hidden = true;
      window.alert('La temporada 2026/2027 ya ha finalizado.');
      return;
    }
    const calculated = calculate(players, false, day);
    memberSummary.textContent=[...new Set(membershipMessages)].join(' ');
    const payment = day >= '2026-12-01' ? 'single' : form.elements.payment.value;
    const singleDeadline = singlePaymentDeadline(now);
    const deadlines = [day >= season.singlePaymentCutoff ? 'el día de la inscripción' : season.dates[0], ...season.dates.slice(1)];
    const list = document.querySelector('#breakdown');
    list.replaceChildren(...players.map((player, index) => {
      const item = document.createElement('li');
      const line = player.team ? calculated.lines[index] : null;
      item.textContent = [player.name, player.category.name, 'Dorsal ' + player.dorsal, player.kit, player.hasKit ? '' : 'Estampado ' + player.printName,
        !line ? 'Equipo pendiente de confirmar' : line.team === 'national' ? 'Primera Nacional · Exento' :
          euro.format(line.total) + (line.discount ? ' con ' + euro.format(line.discount) + ' de descuento' : '')].filter(Boolean).join(' · ');
      const kitContents = document.createElement('small');
      const garments = player.kitRole === 'goalkeeper'
        ? 'Primera y segunda camiseta de juego y pantalón largo'
        : 'Camiseta roja de primera equipación, camiseta de segunda equipación y pantalón corto de juego';
      kitContents.textContent = 'Pack inicial · ' + garments + ' · Incluye ropa de calentamiento';
      if (!player.hasKit) item.append(kitContents);
      const permissions = document.createElement('small');
      permissions.textContent = player.authorizations.map(([title, choice]) => title + ' ' + choice).join(' · ');
      item.append(permissions);
      const residence = document.createElement('small');
      residence.textContent = player.town + ' · Empadronado en Pinto ' + player.registeredInPinto;
      item.append(residence);
      if (line && line.total > 0) {
        const payments = payment === 'single'
          ? [{label: 'Pago único', amount: line.total, deadline: singleDeadline}]
          : scheduledPayments(line.payments, deadlines);
        const table = document.createElement('ul');
        for (const {label, amount, deadline} of payments.filter(entry => entry.amount > 0)) {
          const row = document.createElement('li');
          const concept = [label, player.name, player.category.name].join(' ').toLocaleUpperCase('es-ES');
          row.textContent = label + ' · ' + euro.format(amount) + ' ' + deadline;
          const reference = document.createElement('small');
          reference.textContent = 'Concepto de transferencia ' + concept;
          row.append(reference);
          if (navigator.clipboard?.writeText) {
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'copy-concept';
            copy.textContent = 'Copiar concepto';
            copy.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(concept);
                copy.textContent = 'Concepto copiado';
              } catch {
                copy.textContent = 'Selecciona el texto para copiarlo';
              }
            });
            row.append(copy);
          }
          table.append(row);
        }
        item.append(table);
      }
      return item;
    }));
    const total = Math.round(calculated.lines.reduce((sum, line) => sum + line.total * 100, 0)) / 100;
    const familyPayments = scheduledPayments(deadlines.map((date, index) =>
      calculated.lines.reduce((sum, line) => sum + line.payments[index], 0)), deadlines);
    document.querySelector('#total').textContent = undecided ? 'Total pendiente de confirmar el equipo' : 'TOTAL A PAGAR · ' + euro.format(total);
    const transferDetails = document.querySelector('#transferDetails');
    transferDetails.hidden = undecided || total <= 0;
    if (!transferDetails.hidden) window.ClubTransfers.render(transferDetails);
    document.querySelector('#schedule').textContent = undecided ? '' : payment === 'single'
      ? 'Pago único de ' + euro.format(total) + ' ' + singleDeadline + '.'
      : familyPayments.map(({deadline, label, amount}) => label + ' · ' + euro.format(amount) + ' ' + deadline).join(' | ');
    document.querySelector('#membership').textContent = !undecided && calculated.laterDiscount
      ? payment === 'split'
        ? 'Si os hacéis socios más adelante, el descuento de 10 € por menor elegible se aplicará al último pago pendiente. Si ya están confirmados todos los pagos, se aplicará a la cuota de socio, hasta 20 €.'
        : 'Si os hacéis socios después de confirmar el pago único, el descuento previsto en el alta es de ' + euro.format(calculated.laterDiscount) + '.'
      : '';
    setStatus(reviewStatus, undecided ? 'El equipo está pendiente de confirmar por el club.' : '', 'info');
    const testData = {
      registration_day: day,
      payment,
      member: false,
      total,
      players: calculated.lines.map(line => ({
        name: line.name.slice(0, 120),
        category: line.category.name, team: line.team, division: line.division, hasKit: line.hasKit, member: line.member,
        ...(!line.hasKit && { equipment: {
          role: line.kitRole, printName: line.printName, fitted: line.fitted,
          shirt: line.fitted ? '' : line.shirt, trousers: line.fitted ? '' : line.shorts,
        } }),
        payments: line.payments,
      })),
    };
    const details = {
      dorsals: players.map(player => player.dorsal),
      privacy: {version: '2026-2027-v3', acknowledged: form.elements.privacyRead.checked},
      contact: {
        name: form.elements.contact.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
      },
      players: [...container.children].map((player, index) => ({
        birth: field(player, 'birth').value,
        playerId: field(player, 'playerId').disabled ? '' : field(player, 'playerId').value.trim(),
        guardianId: ageOnDate(field(player, 'birth').value) < 18 ? form.elements.contactIdentifier.value.trim() : '',
        address: field(player, 'address').value.trim(),
        town: players[index].town,
        registeredInPinto: players[index].registeredInPinto,
        health: field(player, 'health').disabled ? '' : field(player, 'health').value.trim(),
        healthConsent: !field(player, 'healthConsent').disabled && field(player, 'healthConsent').checked,
        authorizations: Object.fromEntries(['outings', 'transport', 'images'].map(name => [name, field(player, name).value])),
      })),
    };
    const payload = JSON.stringify([testData, details]);
    if (payload !== reviewedPayload) {
      reviewedPayload = payload;
      registrationKey = crypto.randomUUID();
    }
    reviewedRegistration = undecided ? null : {id: registrationKey, data: testData, details};
    firstReceipt.value = '';
    updateFirstReceipt();
    confirmRegistration.hidden = undecided;
    accountFields.hidden = undecided;
    openMyRegistrations.hidden = true;
    printRegistration.hidden = true;
    summary.hidden = false;
    summary.focus();
    }catch(error){summary.hidden=true;setStatus(memberStatus,error.message);}
    finally{reviewing=false;reviewButton.disabled=false;}
  };
}



