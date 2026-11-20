(() => {
  'use strict';
  const iban = 'ES2500810367180001796783';
  function render(container, concept = '') {
    const element = (tag, text) => {
      const node = document.createElement(tag);
      node.textContent = text;
      return node;
    };
    container.replaceChildren();
    container.className = 'transfer-details';
    container.append(element('h3', 'Pago por transferencia'));
    const details = document.createElement('dl');
    for (const [label, value] of [
      ['Titular', 'Club Balonmano Pinto'],
      ['IBAN', 'ES25 0081 0367 1800 0179 6783'],
      ...(concept ? [['Concepto', concept]] : []),
    ]) details.append(element('dt', label), element('dd', value));
    const feedback = element('p', '');
    feedback.className = 'transfer-feedback';
    feedback.setAttribute('role', 'status');
    const actions = element('div', '');
    actions.className = 'transfer-actions';
    for (const [label, value] of [['Copiar IBAN', iban], ...(concept ? [['Copiar concepto', concept]] : [])]) {
      const button = element('button', label);
      button.type = 'button';
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(value);
          feedback.textContent = label === 'Copiar IBAN' ? 'IBAN copiado.' : 'Concepto copiado.';
        } catch {
          feedback.textContent = 'No se pudo copiar automáticamente. Selecciona y copia el dato que aparece arriba.';
        }
      });
      actions.append(button);
    }
    container.append(details, actions, element('p', concept
      ? 'Transfiere el importe indicado en el resumen con este concepto y adjunta el justificante. El club revisará el ingreso.'
      : 'Utiliza el importe y el concepto del pago que corresponda en el resumen. Adjunta su justificante para que el club revise el ingreso.'), feedback);
  }
  window.ClubTransfers = Object.freeze({render});
})();
