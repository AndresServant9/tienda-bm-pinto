/* Reglas compartidas por el selector y las pruebas. No contiene datos personales. */
(() => {
  'use strict';
  const categories = ['Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Sénior'];
  function categoryIndex(birthYear, seasonYear) {
    if (!Number.isInteger(birthYear) || !Number.isInteger(seasonYear) || birthYear < 1900 || birthYear > seasonYear) throw Error('Año de nacimiento incorrecto');
    return Math.min(6, Math.max(0, Math.floor((seasonYear - birthYear - 6) / 2)));
  }
  function conflicts(a, b, seasonYear) {
    if (a.division !== b.division) return false;
    return [seasonYear, seasonYear + 1].some(year => Math.abs(categoryIndex(a.birthYear, year) - categoryIndex(b.birthYear, year)) <= 1);
  }
  function checkFamily(players, seasonYear) {
    for (let i=0;i<players.length;i++) for (let j=i+1;j<players.length;j++) {
      if (players[i].number === players[j].number && conflicts(players[i], players[j], seasonYear)) {
        throw Error('El dorsal ' + players[i].number + ' coincide entre jugadores de esta inscripción que pueden jugar juntos. Elige otro número.');
      }
    }
  }
  const api = {categoryIndex, conflicts, checkFamily, categories};
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.ClubDorsals = api;
})();
