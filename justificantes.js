(() => {
  'use strict';
  const maximum = 5 * 1024 * 1024;
  function failure(message) {
    const error = new Error(message);
    error.name = 'ReceiptError';
    return error;
  }
  async function validate(file) {
    if (!file || !file.size) throw failure('Selecciona un justificante PDF, JPG o PNG. El archivo no puede estar vacío.');
    if (file.size > maximum) throw failure('El justificante supera los 5 MB. Selecciona un archivo más pequeño.');
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer()); }
    catch { throw failure('No se pudo leer el archivo. Vuelve a seleccionarlo desde tu dispositivo.'); }
    const begins = signature => signature.every((value,index) => bytes[index] === value);
    if (begins([0x25,0x50,0x44,0x46,0x2d])) return 'application/pdf';
    if (begins([0xff,0xd8,0xff])) return 'image/jpeg';
    if (begins([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
    throw failure('Formato no admitido. Usa un PDF, JPG o PNG. Si la foto está en HEIC, guárdala o expórtala como JPG antes de adjuntarla.');
  }
  async function read(file) {
    await validate(file);
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result || '').split(',')[1];
        if (data) resolve(data);
        else reject(failure('No se pudo leer el justificante. Vuelve a seleccionarlo.'));
      };
      reader.onerror = reader.onabort = () => reject(failure('No se pudo leer el justificante. Vuelve a seleccionarlo.'));
      reader.readAsDataURL(file);
    });
  }
  const api = Object.freeze({validate,read});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ClubReceipts = api;
})();
