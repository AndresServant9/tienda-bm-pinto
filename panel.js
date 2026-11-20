const base = 'https://dfwnzfznhnkcqrdcydnx.supabase.co';
const apiKey = 'sb_publishable_U3568BhgdgCt7ysDU5l1CA_1CenKkjU';
const get = id => document.getElementById(id);
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });
const filterDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
const statuses = { pending: 'Pendiente', in_review: 'En revisión', confirmed: 'Confirmado', not_applicable: 'No aplica' };
let token = '';
let rows = [];
let revision = 0;
let registrationPage = 1;
const registrationPageSize = 20;
function paginateRegistrations(entries, requestedPage) {
  const pages = Math.max(1, Math.ceil(entries.length / registrationPageSize));
  const page = Math.max(1, Math.min(pages, Number(requestedPage) || 1));
  const start = (page - 1) * registrationPageSize;
  return {page, pages, start, entries: entries.slice(start, start + registrationPageSize)};
}

const panelTabs = [...document.querySelectorAll('[data-panel-tab]')];
function selectPanel(id) {
  for (const tab of panelTabs) {
    const selected = tab.dataset.panelTab === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    get(tab.dataset.panelTab).hidden = !selected;
  }
  if (id === 'membersPane' && token && !memberLoaded) loadMembers();
}
for (const [index, tab] of panelTabs.entries()) {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panelTab));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % panelTabs.length;
    if (event.key === 'ArrowLeft') target = (index + panelTabs.length - 1) % panelTabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = panelTabs.length - 1;
    if (target === undefined) return;
    event.preventDefault();
    selectPanel(panelTabs[target].dataset.panelTab);
    panelTabs[target].focus();
  });
}

async function request(path, body) {
  if (token && !path.startsWith('/auth/')) {
    try { return await window.ClubAuth.authorized(path, body); }
    catch(error) { error.serverMessage=error.serverMessage||error.message;throw error; }
  }
  const headers = { apikey: apiKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = new Error('Solicitud rechazada');
    error.status = response.status;
    const data = await response.json().catch(() => ({}));
    error.code = data.code;
    error.serverMessage = data.message;
    throw error;
  }
  return response.json();
}

const rpc = (name, body = {}) => request('/rest/v1/rpc/' + name, body);
const reference = row => 'INS-' + row.id;

function teamName(player) {
  if (player.team === 'national') return 'Primera Nacional masculino';
  if (player.team === 'territorial') return 'Territorial masculino';
  const division = { female: 'femenino', male: 'masculino' }[player.division];
  return player.category + (division ? ' ' + division : ' · Rama sin especificar');
}

function item(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function agreementForm(row, account, refresh) {
  const form = document.createElement('form');
  const fields = document.createElement('div');
  const feedback = item('p', '');
  feedback.setAttribute('role', 'status');

  function addPayment(existing) {
    const payment = document.createElement('fieldset');
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '0.01';
    amount.max = '999999.99';
    amount.step = '0.01';
    amount.required = true;
    const due = document.createElement('input');
    due.type = 'date';
    due.required = true;
    if (existing) { amount.value = existing.amount; due.value = existing.due_on; }
    const remove = item('button', 'Quitar cuota');
    remove.type = 'button';
    remove.onclick = () => payment.remove();
    const amountLabel = item('label', 'Importe (€)');
    const dueLabel = item('label', 'Vencimiento');
    amountLabel.append(amount);
    dueLabel.append(due);
    payment.append(amountLabel, dueLabel, remove);
    fields.append(payment);
  }

  const add = item('button', 'Añadir cuota');
  add.type = 'button';
  add.onclick = () => addPayment();
  const save = item('button', 'Guardar cuotas');
  save.type = 'submit';
  const demand = item('button', 'Pago a demanda');
  demand.type = 'button';
  const record = item('button', 'Registrar ingreso');
  record.type = 'button';
  form.append(fields, add, ' ', save, ' ');
  const income = document.createElement('input');
  income.type = 'text';
  income.inputMode = 'decimal';
  const incomeLabel = item('label', 'Importe del ingreso (€)');
  incomeLabel.append(income);
  if (account.mode === 'demand') {
    const incomeFields = document.createElement('fieldset');
    incomeFields.append(item('legend', 'Pago a demanda'), incomeLabel, record);
    form.append(incomeFields);
  }
  else form.append(demand);
  form.append(feedback);
  const pending = account.installments.filter(payment => payment.status === 'pending');
  pending.forEach(addPayment);
  if (!pending.length) addPayment();

  async function update(action, data) {
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach(control => { control.disabled = true; });
    feedback.textContent = 'Guardando cambios…';
    try {
      await rpc('bm_pinto_edit_registration_test_payments', {
        p_registration_id: row.id, p_action: action, p_data: data, p_expected: account,
      });
      if (form.isConnected) {
        get('status').textContent = action === 'record' ? 'Ingreso registrado y descontado del saldo pendiente.' : 'Cuotas actualizadas.';
        refresh();
      }
    } catch (error) {
      if (!form.isConnected) return;
      feedback.textContent = error.code === '40001' ? 'Los pagos han cambiado. Pulsa Actualizar e inténtalo de nuevo.'
        : 'No se pudo guardar. Revisa los importes y vencimientos.';
      controls.forEach(control => { control.disabled = false; });
    }
  }

  demand.onclick = () => {
    if (window.confirm('¿Pasar el saldo pendiente a pago a demanda, sin vencimientos fijos?')) update('demand', {});
  };
  record.disabled = income.disabled = account.pending <= 0;
  record.onclick = () => {
    const amount = income.value.trim().replace(',', '.');
    if (!/^[0-9]+([.][0-9]{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > account.pending) {
      feedback.textContent = 'Introduce un importe positivo que no supere el saldo pendiente.';
      return;
    }
    update('record', { amount });
  };

  income.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    record.click();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const payments = Array.from(fields.children, payment => ({
      amount: payment.querySelector('input[type=number]').valueAsNumber,
      due_on: payment.querySelector('input[type=date]').value,
    }));
    if (!payments.length) {
      feedback.textContent = 'Añade al menos una cuota.';
      return;
    }
    await update('schedule', payments);
  };
  return form;
}

function matchesPaymentState(account, state) {
  if (!state) return true;
  if (!account) return false;
  if (state === 'agreement_pending') return account.agreement_pending === true;
  if (state === 'settled') return account.confirmed > 0 && account.pending === 0 && account.in_review === 0;
  return account[state] > 0;
}

function matchesDueFilter(payment, filter) {
  if (!filter) return true;
  if (payment.status !== 'pending' || !payment.due_on) return false;
  const today = filterDate.format(new Date());
  const end = new Date(today + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 7);
  return filter === 'overdue' ? payment.due_on < today
    : payment.due_on >= today && payment.due_on <= end.toISOString().slice(0, 10);
}

function searchableName(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300\u0301\u0302\u0308]/g, '');
}

function matchesPlayerFilters(player, team, category, kit) {
  return (!team || teamName(player) === team) && (!category || player.category === category) &&
    (!kit || player.hasKit === (kit === 'owned'));
}

function filteredRegistrations() {
  const query = get('reference').value.trim().toLowerCase();
  const nameQuery = searchableName(query);
  const accountFilter = get('accountFilter').value;
  const team = get('team').value;
  const category = get('categoryFilter').value;
  const kit = get('kitFilter').value;
  const from = get('registrationFrom').value;
  const until = get('registrationUntil').value;
  const state = get('paymentState').value;
  const mode = get('paymentMode').value;
  const due = get('dueFilter').value;
  return rows.filter(row => {
    const received = filterDate.format(new Date(row.received_at));
    return (reference(row).toLowerCase().includes(query.replace(/^ins-prueba-/, 'ins-')) || row.accountEmail?.toLowerCase().includes(query) ||
      row.summary.players.some(player => player.name && searchableName(player.name).includes(nameQuery))) &&
      (!accountFilter || row.accountLinked === (accountFilter === 'linked')) &&
      (!from || received >= from) && (!until || received <= until) &&
      row.summary.players.some(player => matchesPlayerFilters(player, team, category, kit)) &&
      matchesPaymentState(row.paymentFlags, state) &&
      (!mode || row.paymentFlags?.mode === mode) &&
      (!due || row.paymentFlags?.installments?.some(payment => matchesDueFilter(payment, due)));
  });
}

function renderPaymentTotals(filtered) {
  const totals = get('filteredPaymentTotals');
  const entries = filtered.filter(row => row.paymentFlags);
  totals.textContent = '';
  if (entries.length) {
    const amount = name => money.format(entries.reduce((sum, row) =>
      sum + Math.round(Number(row.paymentFlags[name] ?? 0) * 100), 0) / 100);
    totals.textContent = [
      entries.length === filtered.length ? 'Importes de todas las inscripciones filtradas' : 'Importes disponibles (' + entries.length + ' de ' + filtered.length + ')',
      'Confirmado ' + amount('confirmed'), 'En revisión ' + amount('in_review'), 'Pendiente ' + amount('pending'),
    ].join(' · ');
  }
}

function filteredKits(registrations) {
  const team = get('team').value;
  const category = get('categoryFilter').value;
  const kit = get('kitFilter').value;
  return registrations.flatMap(row => row.summary.players
    .filter(player => !player.hasKit && matchesPlayerFilters(player, team, category, kit))
    .map(player => ({row, player})));
}

function registrationDetails(row) {
  const section = document.createElement('details');
  const content = item('div', '');
  section.append(item('summary', 'Ver ficha y autorizaciones'), content);
  let loading = false;
  section.ontoggle = async () => {
    if (!section.open || loading || content.childElementCount) return;
    loading = true;
    content.textContent = 'Consultando ficha…';
    try {
      const record = await rpc('bm_pinto_read_registration_test_details', { p_id: row.id });
      if (!section.isConnected) return;
      content.textContent = '';
      if (!record) {
        content.append(item('p', 'Esta inscripción se guardó antes de habilitar la ficha completa.'));
        return;
      }
      const contact = record.contact;
      content.append(item('p', [contact.name, contact.email, contact.phone].join(' · ')));
      record.players.forEach((player, index) => {
        const name = row.summary.players[index]?.name || 'Jugador ' + (index + 1);
        content.append(item('strong', name),
          item('p', [
            'Nacimiento ' + player.birth.split('-').reverse().join('/'),
            player.playerId && 'DNI/NIE del jugador ' + player.playerId,
            player.guardianId && 'DNI/NIE del responsable ' + player.guardianId,
            player.address, player.town, 'Empadronado en Pinto ' + player.registeredInPinto,
          ].filter(Boolean).join(' · ')),
          item('p', 'Actividades fuera del pabellón ' + player.authorizations.outings +
            ' · Transporte con el equipo ' + player.authorizations.transport +
            ' · Publicación de imágenes ' + player.authorizations.images));
      });
      content.append(item('small', 'Registrado ' + date.format(new Date(record.recorded_at)) +
        ' · Versión de autorizaciones ' + record.authorization_version));
    } catch {
      if (section.isConnected) content.textContent = 'No se pudo consultar la ficha. Cierra y vuelve a abrir para reintentar.';
    } finally {
      loading = false;
    }
  };
  return section;
}

function render() {
  const filtered = filteredRegistrations();
  get('exportRegistrations').disabled = filtered.length === 0;
  get('exportPlayers').disabled = filtered.length === 0;
  const kits = filteredKits(filtered);
  const exportable = kits.filter(({player}) => player.equipment);
  const measuredAtClub = exportable.filter(({player}) => player.equipment.fitted).length;
  get('exportKits').disabled = exportable.length === 0;
  get('kitExportSummary').textContent = kits.length
    ? [
      exportable.length + ' packs exportables',
      measuredAtClub ? measuredAtClub + ' con tallas tomadas en el club (sin talla en el Excel)' : '',
      kits.length > exportable.length ? (kits.length - exportable.length) + ' sin datos de prendas' : '',
    ].filter(Boolean).join(' · ')
    : 'Ningún jugador de la selección necesita el pack.';
  const due = get('dueFilter').value;
  get('exportInstallments').disabled = !filtered.some(row =>
    row.paymentFlags?.installments?.some(payment => matchesDueFilter(payment, due)));
  get('count').textContent = filtered.length + (filtered.length === 1 ? ' inscripción' : ' inscripciones');
  const pagination = paginateRegistrations(filtered, registrationPage);
  registrationPage = pagination.page;
  for (const info of document.querySelectorAll('[data-page-information]')) {
    info.textContent = filtered.length
      ? 'Página ' + pagination.page + ' de ' + pagination.pages + ' · Mostrando ' + (pagination.start + 1) + '–' + (pagination.start + pagination.entries.length) + ' de ' + filtered.length
      : '0 resultados';
  }
  for (const button of document.querySelectorAll('[data-page-previous]')) button.disabled = pagination.page === 1;
  for (const button of document.querySelectorAll('[data-page-next]')) button.disabled = pagination.page === pagination.pages;
  get('emptyRegistrations').hidden = filtered.length > 0;
  renderPaymentTotals(filtered);
  get('registrations').replaceChildren(...pagination.entries.map(row => {
    const entry = document.createElement('li');
    const details = document.createElement('details');
    details.append(item('summary', 'Ver cuotas y estado'));
    details.addEventListener('toggle', async () => {
      if (!details.open || details.querySelector('p')) return;
      const status = item('p', 'Consultando cuotas…');
      details.append(status);
      try {
        const account = await rpc('bm_pinto_registration_test_payments', { p_registration_id: row.id });
        if (!details.isConnected) return;
        row.paymentFlags = account;
        const mode = get('paymentMode').value;
        const due = get('dueFilter').value;
        if (!matchesPaymentState(account, get('paymentState').value) || (mode && account.mode !== mode) ||
          (due && !account.installments.some(payment => matchesDueFilter(payment, due)))) {
          render();
          return;
        }
        renderPaymentTotals(filteredRegistrations());
        status.textContent = account.agreement_pending ? 'Acuerdo pendiente de concretar' :
          [account.mode === 'demand' ? 'Pago a demanda' : account.mode === 'agreement' ? 'Acuerdo de pago con el club' : account.mode === 'single' ? 'Pago único' : 'Pago fraccionado',
            'Total ' + money.format(account.total), 'Confirmado ' + money.format(account.confirmed),
            'En revisión ' + money.format(account.in_review), 'Pendiente ' + money.format(account.pending)].join(' · ');
        const installments = document.createElement('ul');
        for (const payment of account.installments) {
          const line = document.createElement('li');
          line.className = 'payment-row';
          line.append(item('span', (payment.due_on ? 'Cuota ' + payment.installment + ' · ' + payment.due_on.split('-').reverse().join('/') : 'Ingreso sin vencimiento · ' + date.format(new Date(payment.confirmed_at))) + ' · ' +
            money.format(payment.amount) + ' · ' + statuses[payment.status]));
          if (payment.status === 'pending' || payment.status === 'in_review') {
            const button = item('button', 'Confirmar ingreso');
            button.type = 'button';
            button.addEventListener('click', async () => {
              if (!window.confirm('¿Has comprobado el ingreso de ' + money.format(payment.amount) + '?')) return;
              button.disabled = true;
              try {
                await rpc('bm_pinto_confirm_registration_test_payment', {
                  p_registration_id: row.id,
                  p_schedule: payment.schedule,
                  p_installment: payment.installment,
                });
                if (!details.isConnected) return;
                status.remove();
                installments.remove();
                details.querySelector(':scope > button')?.remove();
                details.querySelector(':scope > details')?.remove();
                details.dispatchEvent(new Event('toggle'));
                get('status').textContent = 'Ingreso confirmado.';
              } catch {
                if (!details.isConnected) return;
                get('status').textContent = 'No se pudo confirmar el ingreso. Actualiza las cuotas antes de reintentarlo.';
                button.disabled = false;
              }
            });
            line.append(' ', button);
          }
          if (payment.status === 'in_review' || payment.receipt_received_at) {
            const download = item('button', 'Descargar justificante');
            download.type = 'button';
            download.onclick = async () => {
              download.disabled = true;
              try {
                const receipt = await rpc('bm_pinto_download_registration_test_receipt', {
                  p_id: row.id, p_schedule: payment.schedule, p_installment: payment.installment,
                });
                if (!receipt) throw new Error('Archivo no disponible');
                if (!details.isConnected) return;
                const bytes = Uint8Array.from(atob(receipt.file), char => char.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: receipt.mime }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'justificante.' + { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[receipt.mime];
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                if (details.isConnected) get('status').textContent = 'No se pudo descargar el justificante.';
              } finally {
                download.disabled = false;
              }
            };
            line.append(' ', download);
          }
          if (payment.status === 'in_review' && payment.receipt_received_at) {
            const reject = item('button', 'Rechazar justificante');
            reject.type = 'button';
            const rejection = document.createElement('details');
            const reason = document.createElement('textarea');
            reason.maxLength = 300;
            const reasonLabel = item('label', 'Motivo visible para la familia');
            reasonLabel.append(reason);
            const feedback = item('p', '');
            feedback.setAttribute('role', 'status');
            rejection.append(item('summary', 'Rechazar justificante…'), reasonLabel, reject, feedback);
            reject.onclick = async () => {
              if (!reason.value.trim()) {
                feedback.textContent = 'Escribe el motivo del rechazo.';
                reason.focus();
                return;
              }
              const controls = [...line.querySelectorAll('button:not(:disabled)')];
              controls.forEach(button => { button.disabled = true; });
              try {
                await rpc('bm_pinto_reject_registration_test_receipt', {
                  p_id: row.id, p_schedule: payment.schedule, p_installment: payment.installment, p_reason: reason.value.trim(),
                });
                if (!details.isConnected) return;
                get('status').textContent = 'Justificante rechazado. La familia ya puede adjuntar otro.';
                details.replaceChildren(details.querySelector('summary'));
                if (details.open) details.dispatchEvent(new Event('toggle'));
              } catch (error) {
                if (!details.isConnected) return;
                get('status').textContent = error.code === 'PGRST202'
                  ? 'Ejecuta el SQL 41 para habilitar el rechazo con motivo.'
                  : 'No se pudo rechazar el justificante. Actualiza el panel y comprueba el estado de la cuota.';
                controls.forEach(button => { button.disabled = false; });
              }
            };
            line.append(rejection);
          }
          installments.append(line);
        }
        details.append(installments);
        {
          const editor = document.createElement('details');
          editor.append(item('summary', 'Modificar cuotas'), agreementForm(row, account, () => {
            details.replaceChildren(details.querySelector('summary'));
            if (details.open) details.dispatchEvent(new Event('toggle'));
          }));
          details.append(editor);
        }
        if (!['agreement', 'demand'].includes(account.mode) && account.confirmed === 0 && account.in_review === 0 && account.pending > 0) {
          const agreement = item('button', 'Activar acuerdo de pago con el club');
          agreement.type = 'button';
          agreement.addEventListener('click', async () => {
            if (!window.confirm('¿Dejar el calendario estándar en pausa hasta concretar el acuerdo?')) return;
            agreement.disabled = true;
            try {
              await rpc('bm_pinto_activate_registration_test_agreement', { p_registration_id: row.id });
              if (!details.isConnected) return;
              status.remove();
              installments.remove();
              agreement.remove();
              details.querySelector(':scope > details')?.remove();
              details.dispatchEvent(new Event('toggle'));
              get('status').textContent = 'Acuerdo activado.';
            } catch (error) {
              if (!details.isConnected) return;
              get('status').textContent = error.code === '23514'
                ? 'La inscripción ya tiene pagos registrados. Actualiza el panel.'
                : 'No se pudo activar el acuerdo.';
              agreement.disabled = false;
            }
          });
          details.append(agreement);
        }
      } catch {
        status.remove();
        get('status').textContent = 'No se pudieron consultar las cuotas. Cierra y vuelve a abrir el desglose para reintentar.';
      }
    });
    const teams = row.summary.players.map(player => teamName(player));
    if (row.summary.players.some(player => player.name)) {
      const roster = document.createElement('ul');
      roster.className = 'registration-players';
      for (const player of row.summary.players) {
        const member = document.createElement('li');
        member.append(item('strong', player.name || 'Jugador sin nombre registrado'),
          item('span', teamName(player)));
        const equipment = player.equipment;
        const kitInfo = player.hasKit ? 'Ya tiene el pack inicial'
          : !equipment ? 'Necesita el pack · Datos de prendas sin registrar'
          : [
            equipment.role === 'goalkeeper' ? 'Pack de portero' : 'Pack de jugador',
            equipment.fitted ? 'Tallas tomadas en el club' : 'Camisetas ' + equipment.shirt + ' · Pantalón ' + equipment.trousers,
            'Estampado ' + equipment.printName,
          ].join(' · ');
        const kitDetail = item('small', kitInfo);
        kitDetail.className = 'registration-kit';
        member.append(kitDetail);
        roster.append(member);
      }
      entry.append(roster, item('small', date.format(new Date(row.received_at)) + ' · Referencia ' + reference(row)));
    } else {
      entry.append(item('strong', reference(row)), item('p', date.format(new Date(row.received_at)) + ' · ' + teams.join(', ')));
    }
    if (typeof row.accountLinked === 'boolean') {
      entry.append(item('p', row.accountLinked ? row.accountEmail || 'Cuenta vinculada' : 'Sin cuenta vinculada'));
    }
    entry.append(registrationDetails(row), details);
    const deletion = document.createElement('details');
    const remove = item('button', 'Eliminar esta inscripción');
    remove.type = 'button';
    const confirmDeletion = document.createElement('input');
    confirmDeletion.type = 'checkbox';
    const confirmation = item('label', 'Confirmo que esta es la inscripción duplicada');
    confirmation.prepend(confirmDeletion);
    confirmation.className = 'delete-confirmation';
    remove.disabled = true;
    confirmDeletion.onchange = () => { remove.disabled = !confirmDeletion.checked; };
    const result = item('p', '');
    result.setAttribute('role', 'status');
    deletion.append(item('summary', 'Eliminar duplicado'),
      item('p', 'Comprueba la referencia y el justificante antes de eliminar. Se borrarán también los datos y archivos de esta inscripción.'),
      confirmation, remove, result);
    remove.onclick = async () => {
      if (!token || remove.disabled) return;
      const session = token;
      remove.disabled = confirmDeletion.disabled = true;
      result.textContent = 'Eliminando inscripción…';
      try {
        const deleted = await rpc('bm_pinto_delete_registration_test', {p_id: row.id});
        if (token !== session) return;
        rows = rows.filter(registration => registration.id !== row.id);
        render();
        get('status').textContent = deleted ? 'Inscripción eliminada.' : 'La inscripción ya se había eliminado.';
      } catch (error) {
        if (token !== session) return;
        result.textContent = error.code === '23514' ? 'Esta inscripción tiene pagos confirmados y no se puede eliminar.'
          : error.code === 'PGRST202' ? 'Ejecuta el SQL 51 para habilitar esta opción.'
          : 'No se pudo eliminar la inscripción. Actualiza el panel antes de reintentar.';
        remove.disabled = false;
        confirmDeletion.disabled = false;
      }
    };
    entry.append(deletion);
    return entry;
  }));
}

async function load() {
  const current = ++revision;
  const [response, paymentStates] = await Promise.all([
    rpc('bm_pinto_list_registration_tests'),
    rpc('bm_pinto_registration_test_payment_states').catch(error => {
      if (error.status === 404 || error.code === 'PGRST202') return null;
      throw error;
    }),
  ]);
  if (revision !== current) return;
  rows = response.sort((a, b) => new Date(b.received_at) - new Date(a.received_at) || a.id.localeCompare(b.id));
  const paymentFilter = get('paymentState');
  paymentFilter.disabled = !paymentStates;
  get('reviewReceipts').disabled = !paymentStates;
  paymentFilter.title = paymentStates ? '' : 'Ejecuta el SQL 39 para activar este filtro.';
  if (!paymentStates) paymentFilter.value = '';
  const flags = new Map((paymentStates ?? []).map(state => [state.id, state.payment_flags]));
  const modeFilter = get('paymentMode');
  modeFilter.disabled = !paymentStates?.some(state => state.payment_flags.mode);
  if (modeFilter.disabled) modeFilter.value = '';
  const dueFilter = get('dueFilter');
  dueFilter.disabled = !paymentStates?.some(state => Array.isArray(state.payment_flags.installments));
  if (dueFilter.disabled) dueFilter.value = '';
  const accountFilter = get('accountFilter');
  accountFilter.disabled = !paymentStates?.some(state => typeof state.payment_flags.account_linked === 'boolean');
  if (accountFilter.disabled) accountFilter.value = '';
  for (const row of rows) {
    row.paymentFlags = flags.get(row.id);
    row.accountLinked = row.paymentFlags?.account_linked;
    row.accountEmail = row.paymentFlags?.account_email;
  }
  const select = get('team');
  const previous = select.value;
  const teams = [...new Set(rows.flatMap(row => row.summary.players.map(teamName)))].sort((a, b) => a.localeCompare(b, 'es'));
  select.replaceChildren(new Option('Todos los equipos', ''), ...teams.map(team => new Option(team, team)));
  if (teams.includes(previous)) select.value = previous;
  const category = get('categoryFilter');
  const previousCategory = category.value;
  const categories = [...new Set(rows.flatMap(row => row.summary.players.map(player => player.category)))].sort((a, b) => a.localeCompare(b, 'es'));
  category.replaceChildren(new Option('Todas las categorías', ''), ...categories.map(name => new Option(name, name)));
  if (categories.includes(previousCategory)) category.value = previousCategory;
  render();
}

get('login').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
  try { await window.ClubAuth.signIn(form.elements.email.value,form.elements.password.value); }
  catch(error) { get('status').textContent=error.message; }
  finally { form.elements.password.value='';button.disabled=false; }
});

get('checkScheduledReminder').onclick = async event => {
  const button = event.currentTarget;
  const status = get('scheduledReminderStatus');
  const session = token;
  button.disabled = true;
  status.textContent = 'Consultando el último envío…';
  try {
    const run = await rpc('bm_pinto_latest_registration_reminders');
    if (token !== session) return;
    status.textContent = run ? [run.date.split('-').reverse().join('/'),
      'Enviados: ' + run.sent, 'En cola: ' + run.queued, 'En curso: ' + run.sending,
      'Fallidos: ' + run.failed, 'Sin confirmar: ' + run.uncertain, 'Cancelados: ' + run.cancelled].join(' · ')
      : 'El sistema de recordatorios reales todavía no ha registrado ninguna ejecución.';
  } catch {
    if (token === session) status.textContent = 'No se pudo consultar el estado de los avisos. Vuelve a intentarlo en unos instantes.';
  } finally {
    button.disabled = false;
  }
};
function resetPageAndRender() {
  registrationPage = 1;
  render();
}
for (const id of ['team', 'paymentState', 'paymentMode', 'accountFilter', 'dueFilter', 'categoryFilter', 'kitFilter', 'registrationFrom', 'registrationUntil']) {
  get(id).addEventListener('change', resetPageAndRender);
}
function changeRegistrationPage(offset) {
  registrationPage += offset;
  render();
  get('registrationList').open = true;
  get('count').scrollIntoView({block: 'start', behavior: 'smooth'});
}
for (const button of document.querySelectorAll('[data-page-previous]')) button.onclick = () => changeRegistrationPage(-1);
for (const button of document.querySelectorAll('[data-page-next]')) button.onclick = () => changeRegistrationPage(1);
get('reviewReceipts').onclick = () => {
  clearRegistrationFilters();
  get('paymentState').value = 'in_review';
  get('registrationList').open = true;
  resetPageAndRender();
};
function clearRegistrationFilters() {
  for (const id of ['team', 'categoryFilter', 'kitFilter', 'paymentState', 'paymentMode', 'accountFilter', 'dueFilter', 'reference', 'registrationFrom', 'registrationUntil']) {
    get(id).value = '';
  }
}
get('clearRegistrationFilters').onclick = () => {
  clearRegistrationFilters();
  resetPageAndRender();
};
function downloadCsv(table, filename) {
  const csvCell = value => {
    const content = String(value);
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(content) ? "'" + content : content;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = table.map(columns => columns.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPayments(detail) {
  if (!token) return;
  const filtered = filteredRegistrations();
  if (!filtered.length) return;
  const decimal = new Intl.NumberFormat('es-ES', {
    useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const formatAmount = value => value == null ? '' : decimal.format(value);
  const modes = {single: 'Pago único', split: 'Pago fraccionado', agreement: 'Acuerdo con el club', demand: 'Pago a demanda'};
  const table = [detail
    ? ['Referencia', 'Jugadores', 'Equipos', 'Modalidad de pago', 'Calendario', 'Cuota o ingreso', 'Vencimiento', 'Importe (€)', 'Estado']
    : ['Referencia', 'Jugadores', 'Fecha de inscripción', 'Categorías', 'Equipos', 'Modalidad de pago', 'Confirmado (€)',
      'En revisión (€)', 'Pendiente (€)', 'Acuerdo por concretar']];
  const due = get('dueFilter').value;
  for (const row of filtered) {
    const account = row.paymentFlags;
    const names = row.summary.players.map(player => player.name).filter(Boolean).join(' / ');
    const teams = [...new Set(row.summary.players.map(teamName))].join(' / ');
    if (detail) {
      for (const payment of account?.installments ?? []) {
        if (!matchesDueFilter(payment, due)) continue;
        table.push([reference(row), names, teams, modes[account.mode] ?? '',
          payment.schedule === 'standard' ? 'Estándar' : 'Acuerdo',
          payment.installment, payment.due_on?.split('-').reverse().join('/') ?? '',
          formatAmount(payment.amount), statuses[payment.status] ?? '']);
      }
      continue;
    }
    table.push([
      reference(row), names, date.format(new Date(row.received_at)),
      [...new Set(row.summary.players.map(player => player.category))].join(' / '),
      teams,
      modes[account?.mode] ?? '',
      formatAmount(account?.confirmed), formatAmount(account?.in_review), formatAmount(account?.pending),
      account ? (account.agreement_pending ? 'Sí' : 'No') : '',
    ]);
  }
  downloadCsv(table, detail ? 'cuotas.csv' : 'inscripciones.csv');
}
get('exportRegistrations').onclick = () => exportPayments(false);
get('exportInstallments').onclick = () => exportPayments(true);
get('exportKits').onclick = () => {
  if (!token) return;
  const garments = [];
  let missing = 0;
  for (const {row, player} of filteredKits(filteredRegistrations())) {
      const equipment = player.equipment;
      if (!equipment) {
        missing++;
        continue;
      }
      const goalkeeper = equipment.role === 'goalkeeper';
      const pattern = player.division === 'female' ? 'CHICA' : player.division === 'male' ? 'CHICO' : '';
      const base = {
        'CHICO/A': pattern, Categoria: player.category, Cantidad: 1,
        OBSERVACIONES: [player.name, teamName(player), equipment.fitted ? 'Tallas tomadas en el club' : '', reference(row)].filter(Boolean).join(' · '),
      };
      garments.push(
        {...base, 'TIPO DE PRENDA': goalkeeper ? 'Camiseta de portero · Primera equipación' : 'Camiseta de jugador · Primera equipación',
          Color: goalkeeper ? '' : 'Roja', NOMBRE: equipment.printName, Talla: equipment.shirt},
        {...base, 'TIPO DE PRENDA': goalkeeper ? 'Camiseta de portero · Segunda equipación' : 'Camiseta de jugador · Segunda equipación',
          NOMBRE: equipment.printName, Talla: equipment.shirt},
        {...base, 'TIPO DE PRENDA': goalkeeper ? 'Pantalón largo de portero' : 'Pantalón corto de jugador',
          Talla: equipment.trousers},
      );
  }
  if (garments.length) {
    const url = URL.createObjectURL(new Blob([buildWorkbook(garments)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'packs-iniciales.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  get('status').textContent = (garments.length ? 'Packs descargados: ' + garments.length / 3 + '.' : 'No hay packs con datos de prendas para descargar.') +
    (missing ? ' Sin datos de prendas: ' + missing + ' jugadores de inscripciones anteriores.' : '');
};
get('exportPlayers').onclick = () => {
  if (!token) return;
  const team = get('team').value;
  const category = get('categoryFilter').value;
  const kit = get('kitFilter').value;
  const table = [['Jugador', 'Categoría', 'Equipo', 'Pack inicial', 'Referencia']];
  for (const row of filteredRegistrations()) {
    for (const player of row.summary.players) {
      if (!matchesPlayerFilters(player, team, category, kit)) continue;
      table.push([player.name ?? '', player.category, teamName(player),
        player.hasKit ? 'Ya lo tiene' : 'Lo necesita', reference(row)]);
    }
  }
  if (table.length > 1) downloadCsv(table, 'jugadores.csv');
};
get('reminderPreview').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = get('reminderStatus');
  const results = get('reminderResults');
  const session = token;
  button.disabled = true;
  results.replaceChildren();
  status.textContent = 'Consultando avisos…';
  try {
    const reminders = await rpc('bm_pinto_preview_registration_reminders', {
      p_today: form.elements.previewDate.value,
    });
    if (token !== session) return;
    const byRecipient = new Map();
    for (const reminder of reminders) {
      const recipient = reminder.recipient.trim().toLowerCase();
      if (!byRecipient.has(recipient)) byRecipient.set(recipient, []);
      byRecipient.get(recipient).push(reminder);
    }
    for (const [recipient, payments] of byRecipient) {
      const entry = item('li', '');
      const preview = document.createElement('details');
      const totalCents = payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
      preview.append(item('summary', recipient + ' · ' + money.format(totalCents / 100)));
      preview.append(
        item('strong', 'Recordatorio de cuotas · Club Balonmano Pinto'),
        item('p', 'Hola, estas son las cuotas pendientes que vencen dentro de 7 días.'),
      );
      const list = document.createElement('ul');
      for (const payment of payments) {
        list.append(item('li', [
          (payment.player_names ?? ['Inscripción del club']).join(' · '), payment.payment_label,
          payment.due_on.split('-').reverse().join('/'), money.format(payment.amount),
        ].join(' · ')));
      }
      const link = item('a', 'Mis inscripciones');
      link.href = 'mis-inscripciones.html';
      const nextStep = item('p', 'Puedes consultar el estado de las cuotas y adjuntar tus justificantes en ');
      nextStep.append(link, '.');
      preview.append(list, nextStep);
      entry.append(preview);
      results.append(entry);
    }
    status.textContent = reminders.length
      ? new Intl.NumberFormat('es-ES').format(byRecipient.size) + (byRecipient.size === 1 ? ' correo previsto' : ' correos previstos') +
        ' · ' + reminders.length + (reminders.length === 1 ? ' cuota' : ' cuotas')
      : 'No hay avisos para esa fecha.';
  } catch {
    if (token === session) status.textContent = 'No se pudo consultar la vista previa.';
  } finally {
    button.disabled = false;
  }
};
get('reference').addEventListener('input', resetPageAndRender);
let memberRows = [];
let memberRoutes = {};
let memberPage = 1;
let memberLoaded = false;
let memberLoadRevision = 0;
let memberSearchRevision = 0;
let memberDocumentIds = null;
let memberLookupBusy = false;
let memberActionBusy = false;
let memberManagementReady = false;
function membershipState(row) {
  return row.archived_at ? 'archived' : row.rejected_at ? 'rejected' : row.approved_at ? 'approved' : row.awaiting_receipt ? 'awaiting' : 'pending';
}
function applyMemberManagement(metadata) {
  const byId = new Map(metadata.map(row => [row.id, row]));
  for (const row of memberRows) Object.assign(row, byId.get(row.id) || {});
}
function memberDocumentQuery() {
  const normalized = get('memberSearch').value.replace(/[\s.-]/g, '').toUpperCase();
  return /^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(normalized) ? normalized : '';
}
function filteredMembers() {
  const query = searchableName(get('memberSearch').value.trim());
  const state = get('memberState').value;
  const kind = get('memberKind').value;
  const byDocument = Boolean(memberDocumentQuery());
  return memberRows.filter(row => (state ? membershipState(row) === state : !row.archived_at) && (!kind || row.kind === kind) &&
    (byDocument ? memberDocumentIds?.has(row.id) : !query ||
      searchableName([row.profile?.fullName, row.profile?.email].filter(Boolean).join(' ')).includes(query)));
}
function renderMembers() {
  if (memberActionBusy) return;
  const session = token;
  const status = get('membershipRequestStatus');
  const list = get('membershipRequests');
  const routes = memberRoutes;
  const filtered = filteredMembers();
  const pagination = paginateRegistrations(filtered, memberPage);
  memberPage = pagination.page;
  const requests = pagination.entries;
  list.replaceChildren();
  const counts = state => memberRows.filter(row => membershipState(row) === state).length;
  const countFilters = get('membershipCountFilters');
  countFilters.replaceChildren();
  if (memberLoaded) for (const [state, label] of [['pending','Por validar'],['awaiting','Sin justificante'],
    ['approved','Validadas'],['rejected','Rechazadas'],['','Todas sin archivar'],['archived','Archivadas']]) {
    const button = item('button', '');
    button.type = 'button';
    button.append(item('strong', state ? counts(state) : memberRows.filter(row => !row.archived_at).length), label);
    button.setAttribute('aria-pressed', String(get('memberState').value === state));
    button.disabled = memberLookupBusy;
    button.onclick = () => {get('memberState').value = state; memberPage = 1; status.textContent = ''; renderMembers();};
    countFilters.append(button);
  }
  get('membershipCounts').textContent = memberLoaded ? 'Mostrando ' + requests.length + ' de ' + memberRows.length +
    ' solicitudes en total · ' + filtered.length + ' coinciden con los filtros.' : '';
  const selectedState = get('memberState').value;
  get('membershipHelp').hidden = !memberLoaded || !['awaiting','rejected','archived'].includes(selectedState);
  get('membershipHelp').textContent = selectedState === 'awaiting'
    ? 'Estas solicitudes todavía no tienen justificante y no se pueden validar. Si una solicitud se ha abandonado, puedes cancelarla para liberar su reserva de descuento.'
    : selectedState === 'archived' ? 'Las archivadas no aparecen en el listado habitual. Sacarlas del archivo las devuelve a Rechazadas; no las valida ni reactiva.'
    : 'Puedes archivar las rechazadas para retirarlas del listado habitual. Se conservarán sus datos y justificantes.';
  get('memberPrevious').disabled = memberPage === 1 || memberLookupBusy;
  get('memberNext').disabled = memberPage === pagination.pages || memberLookupBusy;
  get('memberPageInformation').textContent = memberLookupBusy ? 'Buscando DNI/NIE…' : !memberLoaded ? 'Consulta las solicitudes para empezar.' :
    filtered.length ? 'Página ' + memberPage + ' de ' + pagination.pages + ' · Mostrando ' + (pagination.start + 1) + '–' +
    (pagination.start + requests.length) + ' de ' + filtered.length : 'No hay solicitudes que coincidan con estos filtros.';
  const requestMembershipCard = (id, campaign) => request('/functions/v1/' +
    (campaign ? 'enviar-carne-socio-campana' : 'enviar-carne-socio-prueba'), {id});
    for (const request of requests) {
      const campaign = routes[request.id]?.campaign === true;
      if (campaign) request.card_state = routes[request.id].state;
      const entry = item('li', '');
      entry.dataset.memberId = request.id;
      entry.tabIndex = -1;
      const title = [request.kind === 'renew' ? 'Renovación' : 'Alta',
        request.profile?.fullName || request.profile?.email || 'Datos pendientes de completar'].join(' · ');
      const result = item('p', request.rejected_at ? 'Rechazada' : request.approved_at ? 'Validada' :
        request.awaiting_receipt ? 'Descuento reservado · Pendiente de justificante' : 'Pendiente de revisión');
      const discounts = item('p', '');
      function showMembershipDiscounts(data) {
        const fee = Number(data.membership_discount || 0);
        const installment = Number(data.installment_discount || 0);
        discounts.textContent = [
          fee ? 'Descuento en la cuota de socio: ' + money.format(fee) + ' · Cuota calculada: ' + money.format(35 - fee) : '',
          installment ? 'Ajuste en la última cuota de inscripción: ' + money.format(installment) : '',
        ].filter(Boolean).join(' · ');
      }
      showMembershipDiscounts(request);
      const cardStatus = item('p', {
        sent: campaign ? 'Carné enviado al correo del socio.' : 'Comprobación del carné enviada al buzón del club.',
        sending: 'Envío en curso o pendiente de comprobar.',
        uncertain: 'Envío sin confirmar. Revisa el buzón del club.',
        failed: 'Falló la preparación del carné. Puedes reintentar.',
      }[request.card_state] ?? '');
      cardStatus.setAttribute('role', 'status');
      const sendCard = item('button', campaign ? 'Enviar carné al socio' : 'Enviar comprobación al club');
      sendCard.type = 'button';
      sendCard.hidden = !request.approved_at || ['sent', 'sending', 'uncertain'].includes(request.card_state);
      async function sendApprovedCard() {
        if (location.protocol === 'file:') {
          cardStatus.textContent = 'La solicitud está validada. Abre el panel publicado en la web del club para enviar el carné.';
          return;
        }
        sendCard.disabled = true;
        cardStatus.textContent = 'Preparando el carné…';
        try {
          const result = await requestMembershipCard(request.id, campaign);
          if (token !== session || !entry.isConnected) return;
          cardStatus.textContent = result.message;
          request.card_state = 'sent';
          if (routes[request.id]) routes[request.id].state = 'sent';
          sendCard.hidden = true;
          return true;
        } catch (error) {
          if (token !== session || !entry.isConnected) return;
          cardStatus.textContent = error.serverMessage || 'No se confirmó el envío. Comprueba el buzón del club.';
          return false;
        } finally {
          sendCard.disabled = false;
        }
      }
      sendCard.onclick = sendApprovedCard;
      if (request.kind === 'renew') result.textContent += request.previous_member
        ? ' · Documento en el padrón anterior' : ' · Documento sin coincidencia en el padrón anterior';
      if (request.kind === 'renew' && request.previous_member && !request.profile?.email) {
        result.textContent += ' · Falta importar el correo del socio';
      }
      const download = item('button', 'Descargar justificante');
      download.type = 'button';
      download.hidden = Boolean(request.awaiting_receipt);
      const approve = item('button', 'Validar y ver siguiente');
      approve.type = 'button';
      approve.hidden = Boolean(request.approved_at || request.rejected_at || request.awaiting_receipt ||
        (request.kind === 'renew' && (!request.previous_member || !request.profile?.email)));
      const rejectRequest = item('button', request.awaiting_receipt ? 'Cancelar solicitud incompleta' : 'Rechazar solicitud');
      rejectRequest.type = 'button';
      rejectRequest.className = 'secondary';
      rejectRequest.hidden = Boolean(request.approved_at || request.rejected_at);
      rejectRequest.onclick = async () => {
        if (memberActionBusy) return;
        if (!window.confirm(request.awaiting_receipt
          ? '¿Cancelar esta solicitud sin justificante? Se liberará su reserva de descuento y podrá enviarse una nueva con el mismo documento.'
          : '¿Rechazar esta solicitud? El socio podrá enviar una nueva con el mismo documento.')) return;
        memberActionBusy = true;
        approve.disabled = rejectRequest.disabled = true;
        try {
          const rejected = await rpc('bm_pinto_reject_membership_test', {p_id: request.id});
          if (token !== session || !entry.isConnected) return;
          if (!rejected) throw Error('La solicitud ya cambió de estado.');
          result.textContent = 'Rechazada · Se puede enviar una nueva solicitud';
          request.rejected_at = new Date().toISOString();
          approve.hidden = rejectRequest.hidden = true;
        } catch {
          if (token === session && entry.isConnected) status.textContent = 'No se pudo rechazar. Consulta de nuevo las solicitudes.';
        } finally {
          approve.disabled = rejectRequest.disabled = false;
          memberActionBusy = false;
          if (token === session) renderMembers();
        }
      };
      const archiveRequest = item('button', request.archived_at ? 'Sacar del archivo' : 'Archivar solicitud');
      archiveRequest.type = 'button';
      archiveRequest.className = 'secondary';
      archiveRequest.hidden = !memberManagementReady || !request.rejected_at || Boolean(request.approved_at);
      archiveRequest.onclick = async () => {
        if (memberActionBusy) return;
        memberActionBusy = true;
        archiveRequest.disabled = true;
        try {
          const metadata = await rpc('bm_pinto_manage_membership_requests', {p_id: request.id, p_archived: !request.archived_at});
          if (token !== session) return;
          const wasArchived = Boolean(request.archived_at);
          applyMemberManagement(metadata);
          status.textContent = wasArchived ? 'Solicitud devuelta a Rechazadas.' : 'Solicitud archivada. Puedes recuperarla en Archivadas.';
        } catch {
          if (token === session) status.textContent = 'No se pudo cambiar el archivo. Actualiza las solicitudes antes de reintentarlo.';
        } finally {
          memberActionBusy = false;
          if (token === session) renderMembers();
        }
      };
      download.onclick = async () => {
        download.disabled = true;
        try {
          const receipt = await rpc('bm_pinto_review_membership_test', {p_id: request.id});
          if (token !== session || !entry.isConnected) return;
          const extension = {'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png'}[receipt?.mime];
          if (!extension) throw Error('Archivo no disponible');
          const bytes = Uint8Array.from(atob(receipt.file), char => char.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], {type: receipt.mime}));
          const link = document.createElement('a');
          link.href = url;
          link.download = 'justificante-socio-' + request.id + '.' + extension;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
          if (token === session) status.textContent = 'No se pudo descargar el justificante.';
        } finally {
          download.disabled = false;
        }
      };
      approve.onclick = async () => {
        if (memberActionBusy) return;
        if (!window.confirm('¿Has comprobado el ingreso? Se validará esta solicitud, se enviará el carné y se mostrará la siguiente pendiente.')) return;
        memberActionBusy = true;
        approve.disabled = rejectRequest.disabled = true;
        status.textContent = 'Validando solicitud…';
        const queue = filteredMembers();
        const position = queue.findIndex(row => row.id === request.id);
        const nextIds = queue.slice(position + 1).concat(queue.slice(0, position))
          .filter(row => membershipState(row) === 'pending').map(row => row.id);
        let approved = false;
        try {
          const validated = await rpc('bm_pinto_review_membership_test', {p_id: request.id, p_approve: true});
          if (token !== session || !entry.isConnected) return;
          if (!validated?.approved_at) throw Error('Solicitud no disponible');
          Object.assign(request, validated);
          approved = true;
          approve.hidden = true;
          rejectRequest.hidden = true;
          result.textContent = 'Validada';
          showMembershipDiscounts(validated);
          sendCard.hidden = false;
          const sent = await sendApprovedCard();
          if (token === session) status.textContent = sent ? 'Solicitud validada y carné enviado.' :
            'Solicitud validada. No se confirmó el envío del carné; compruébalo en el filtro Validadas antes de repetirlo.';
        } catch {
          if (token === session) status.textContent = approved
            ? 'Solicitud validada. Consulta el estado del carné en Validadas.' : 'No se pudo validar la solicitud. Actualiza antes de reintentarlo.';
        } finally {
          approve.disabled = rejectRequest.disabled = false;
          memberActionBusy = false;
          if (token === session) {
            const remaining = filteredMembers();
            const next = nextIds.map(id => remaining.find(row => row.id === id)).find(Boolean);
            if (approved && next) memberPage = Math.floor(remaining.indexOf(next) / registrationPageSize) + 1;
            renderMembers();
            if (approved && next) get('membershipRequests').querySelector('[data-member-id="' + next.id + '"]')?.focus();
          }
        }
      };
      entry.append(item('strong', title), item('p', 'Referencia SOCIO-' + request.id));
      if (request.received_at) {
        const days = Math.max(0, Math.floor((Date.now() - new Date(request.received_at).getTime()) / 86400000));
        const age = item('p', 'Recibida el ' + date.format(new Date(request.received_at)) +
          (request.awaiting_receipt && !request.rejected_at ? ' · ' + (days ? days + (days === 1 ? ' día' : ' días') : 'Menos de un día') + ' sin justificante' : ''));
        age.className = 'member-age';
        entry.append(age);
      }
      if (request.archived_at) entry.append(item('p', 'Archivada el ' + date.format(new Date(request.archived_at))));
      if (request.profile?.email) entry.append(item('p', request.profile.email));
      if (!approve.hidden) entry.append(item('p', campaign
        ? 'Al validar se enviará el carné al correo del socio.' : 'Esta solicitud está configurada para una comprobación interna; el carné no se enviará al socio.'));
      entry.append(result, discounts, download, ' ', approve, ' ', rejectRequest, ' ', archiveRequest, ' ', sendCard, cardStatus);
      list.append(entry);
    }
}
async function searchMembers() {
  const current = ++memberSearchRevision;
  const session = token;
  memberPage = 1;
  memberDocumentIds = null;
  const identifier = memberDocumentQuery();
  memberLookupBusy = Boolean(identifier);
  get('membershipRequestStatus').textContent = '';
  renderMembers();
  if (!identifier || !session) return;
  try {
    const ids = await rpc('bm_pinto_find_membership_requests', {p_identifier: identifier});
    if (token !== session || current !== memberSearchRevision) return;
    memberDocumentIds = new Set(ids);
  } catch {
    if (token !== session || current !== memberSearchRevision) return;
    get('membershipRequestStatus').textContent = 'No se pudo buscar el documento. Vuelve a intentarlo o busca por nombre o correo.';
  } finally {
    if (token === session && current === memberSearchRevision) {
      memberLookupBusy = false;
      renderMembers();
    }
  }
}
async function loadMembers() {
  const session = token;
  if (!session || memberActionBusy) return;
  const revision = ++memberLoadRevision;
  const button = get('loadMembershipRequests');
  button.disabled = true;
  get('membershipRequestStatus').textContent = 'Consultando solicitudes…';
  try {
    const [requests, routes, management] = await Promise.all([
      rpc('bm_pinto_review_membership_test', {p_id: null}), rpc('bm_pinto_membership_card_routes', {}),
      rpc('bm_pinto_manage_membership_requests', {}).catch(() => null),
    ]);
    if (token !== session || revision !== memberLoadRevision) return;
    memberRows = requests;
    memberRoutes = routes;
    memberManagementReady = Array.isArray(management);
    if (memberManagementReady) applyMemberManagement(management);
    memberLoaded = true;
    get('membershipRequestStatus').textContent = memberManagementReady ? '' : 'La gestión de archivo no está disponible. Actualiza las solicitudes o contacta con el administrador.';
    if (memberDocumentQuery()) await searchMembers();
    else renderMembers();
  } catch {
    if (token === session) get('membershipRequestStatus').textContent = 'No se pudieron consultar las solicitudes de socios.';
  } finally {
    button.disabled = false;
  }
}
get('loadMembershipRequests').onclick = loadMembers;
get('memberSearch').addEventListener('input', searchMembers);
for (const id of ['memberState', 'memberKind']) get(id).addEventListener('change', () => {
  memberPage = 1; get('membershipRequestStatus').textContent = ''; renderMembers();
});
get('clearMemberFilters').onclick = () => {
  get('memberSearch').value = '';
  get('memberState').value = 'pending';
  get('memberKind').value = '';
  searchMembers();
};
for (const [id, offset] of [['memberPrevious', -1], ['memberNext', 1]]) get(id).onclick = () => {
  memberPage += offset;
  renderMembers();
  get('memberPageInformation').scrollIntoView({block: 'center'});
};
get('refresh').addEventListener('click', async () => {
  try {
    await load();
    get('status').textContent = '';
  } catch {
    if (token) get('status').textContent = 'No se pudo actualizar. Si la sesión ha caducado, vuelve a entrar.';
  }
});
function clearPanelSession() {
  memberLoadRevision++;
  memberSearchRevision++;
  memberRows = [];
  memberRoutes = {};
  memberLoaded = false;
  memberPage = 1;
  memberDocumentIds = null;
  memberLookupBusy = false;
  memberActionBusy = false;
  memberManagementReady = false;
  get('memberSearch').value = '';
  get('memberState').value = 'pending';
  get('memberKind').value = '';
  get('membershipRequests').replaceChildren();
  get('membershipRequestStatus').textContent = '';
  get('membershipCounts').textContent = '';
  get('membershipCountFilters').replaceChildren();
  get('membershipHelp').hidden = true;
  revision++;
  token = '';
  rows = [];
  registrationPage = 1;
  selectPanel('registrationsPane');
  get('registrations').replaceChildren();
  get('reminderResults').replaceChildren();
  get('reminderStatus').textContent = '';
  get('scheduledReminderStatus').textContent = '';
  clearRegistrationFilters();
  get('status').textContent = '';
  get('panel').hidden = true;
  get('login').hidden = false;
}
get('logout').addEventListener('click', () => window.ClubAuth.signOut());
let accessRevision=0, panelUserId=null;
async function applyPanelSession(session) {
  if(session?.user.id && session.user.id === panelUserId && token){token=session.access_token;return;}
  panelUserId=session?.user.id || null;
  const current=++accessRevision;
  clearPanelSession();
  get('login').hidden=Boolean(session);
  if (!session) return;
  get('status').textContent='Comprobando los permisos del club…';
  const admin=await window.ClubAuth.isAdmin();
  if(current!==accessRevision)return;
  if(!admin){get('status').textContent='Tu cuenta no tiene permisos de administración.';return;}
  token=session.access_token;
  try { await load(); if(current!==accessRevision)return;get('panel').hidden=false;get('status').textContent=''; }
  catch { if(current===accessRevision)get('status').textContent='No se pudo cargar el panel. Pulsa Actualizar o vuelve a abrirlo.'; }
}
window.ClubAuth.subscribe(applyPanelSession);
window.ClubAuth.getSession().then(applyPanelSession).catch(error=>{get('status').textContent=error.message;});
