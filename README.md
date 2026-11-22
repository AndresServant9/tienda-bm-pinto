# Desarrollo de dorsales en inscripciones

Rama `desarrollo/inscripciones-dorsales`. No integrar aun en `main`.

## Entorno aislado

Ejecutar `npm ci`, `npm test` y `npm run dev`. Abrir
`http://127.0.0.1:8140/inscripciones` en el mismo ordenador.
Cuenta ficticia: `familia@example.test`, clave de demostracion `PruebaLocal123!`.
Con el servidor arrancado, `npm run test:form` comprueba el formulario en DOM.
`npm run test:http` ensaya reserva, consulta familiar y dos envios simultaneos
contra la base ficticia local. Estos ensayos dejan inscripciones ficticias en esa base.

La base PostgreSQL local PGlite esta en `.dev-data/database`, excluida de Git.
El servidor escucha solo en `127.0.0.1`. Usa personas ficticias y no envia correo.
`dev-guard.js` redirige las llamadas de Supabase al servidor de pruebas; fuera de
localhost las bloquea. La CSP de esta rama tambien bloquea Supabase operativo.
La base de demostracion simplifica pagos y altas; la integracion de la migracion
se ha ensayado ademas contra una restauracion local de las funciones reales.

## Regla de dorsal

Numeros 1-99. Se separan masculino y femenino. Un numero ocupado se bloquea
cuando las categorias coinciden o son consecutivas esta temporada o la siguiente.
Se compara por ano de nacimiento, desde prebenjamin hasta senior. Senior y Primera
Nacional comparten el grupo senior para esta comprobacion, confirmado por el club.
Los duplicados actuales entre ambos equipos se respetan como historicos; no se
permiten nuevas asignaciones conflictivas entre Territorial y Nacional.
Un dorsal ya asignado solo se reconoce si esta vinculado a la cuenta verificada,
nombre normalizado y cohorte del jugador. Escribir el nombre de otra persona no
permite apropiarse de su numero.

Las coincidencias que ya existian se respetan por decision del club. La importacion
privada las marca como `preserve_existing`; sus titulares conservan el numero aunque
coincidan con otro dorsal antiguo. Tambien se permite ese caso dentro de una familia.
Las nuevas asignaciones siguen bloqueadas por los dorsales existentes. Una familia no
puede concederse esa excepcion desde el formulario. Al preparar una nueva temporada
debe conservarse la marca historica al trasladar las asignaciones de sus titulares.

Se consulta sin mostrar nombres ajenos. Se reserva en la misma transaccion que la
inscripcion. Un bloqueo transaccional vuelve a validar disponibilidad al enviar.
El mismo envio es idempotente; un reintento distinto o con numero ocupado se rechaza.
El dorsal aparece en resumen, Mis inscripciones, panel y columna Numero del pack.
El selector abre una ventana compacta con busqueda y cuadricula desplazable,
en lugar del desplegable nativo de casi toda la pantalla.

## Hoja anterior

La copia y el informe de asignaciones reales quedan fuera del repositorio.
Puede auditarse un JSON privado con `node dev/import-private-audit.cjs RUTA_JSON`.
Se guarda en otra base local `.dev-data/sheet-audit`; no se usa como demo publica.
Por decision del club, las anotaciones con prefijo BAJA: dejan de reservar numero;
se conservan sus registros con estado released. DUDA: sigue pendiente y reservando.
Una duda solo se libera mediante decision expresa del club por registro; la decision
privada se conserva al reimportar, aunque la hoja original siga mostrando DUDA.
Las coincidencias historicas entre jugadores activos se conservan sin reasignar.
Los nombres abreviados y las asignaciones sin titular requieren conciliacion del club.

La consulta local `http://127.0.0.1:8140/inscripciones?dorsales=hoja` carga la copia
privada `../private-dorsales/140-registros.json` en una base independiente en memoria.
Solo devuelve numeros disponibles, siempre como visitante, sin recuperar titulares.
No permite enviar inscripciones. No modifica la hoja ni mezcla reservas con el demo.
Si falta la copia privada, la consulta falla sin recurrir a Supabase operativo.

`dev/link-history.cjs` propone vinculos por nombre completo normalizado, rama y
cohorte, con unicidad en ambos sentidos. Las abreviaturas solo generan sugerencias.
`dev/import-private-links.cjs RUTA_JSON` importa los vinculos exactos a sheet-audit.
Se conserva fecha completa y hashes SHA256 de los correos historicos, nunca el
correo en claro en esta tabla. La recuperacion de un dorsal exige cuenta con correo
verificado coincidente, nombre y fecha completa. El titular queda fijado solo al
guardar toda la inscripcion, dentro de la misma transaccion. Un cambio posterior
del correo de la misma cuenta no pierde el dorsal ya recuperado.

El club autoriza vincular nombre y primer apellido cuando la correspondencia es
unica en ambas listas. Activar esa regla expresamente con
`--club-unique-prefix` al importar el JSON producido por el comparador con
`allowUniqueAbbreviations: true`. No se aceptan nombres solos ni apellidos parciales.
Si hay nombres repetidos en otra cohorte, quedan pendientes igualmente.
Los homonimos solo se resuelven con una decision privada explicita del club,
procesada por `dev/confirmed-links.cjs` y pasada al importador mediante
`--club-decisions RUTA_JSON`. No existe una excepcion desde el formulario publico.
El club confirmo los cuatro casos pendientes: dos pares de homonimos distintos
y dos jugadores repetidos en Territorial/Nacional. Se conserva una reserva por
jugador repetido, sin borrar las entradas de origen ni liberar su numero.
En una segunda revision de los 67 casos el club confirmo 21 bajas, 10 identidades
con nombres compuestos omitidos y una titular pendiente de identificar. Los nombres
compuestos solo se aceptan con decision expresa, conservando todos los tokens del
nombre abreviado y su orden; el comparador automatico sigue siendo mas estricto.
Tras confirmar edades, una rama incorrecta del historico y nombres femeninos,
el resultado privado actual es 176 jugadores vinculados, 11 reservas activas sin ficha
y una reserva en revision. Los cambios de fecha se guardan en una copia revisada
del historico con sus decisiones; el original se conserva sin editar.
Son 187 reservas activas, una en revision, 51 bajas y
2 copias consolidadas, con las 241 entradas originales conservadas.
Los alias masculinos confirmados por el club se muestran con su nombre completo
en la copia revisada; se conservan los nombres originales y la decision privada.
Oliver figura como nacido en 2020. Los anos historicos imposibles siguen pendientes
de confirmacion, sin asumir un ano a partir de sus dos ultimas cifras.

## Antes de integrar

- Respetar coincidencias historicas y confirmar bajas; vincular dorsales existentes con jugadores.
- El selector se ha probado en navegador de escritorio y vistas de 390 y 320 pixeles,
  sin desbordamiento horizontal. Falta probar teclado tactil en Android/iOS reales.
- Hacer prueba de concurrencia con dos conexiones PostgreSQL independientes.
- Preparar el despliegue coordinado de SQL `sql/140-dorsales.sql` y formulario.
- Retirar expresamente guardas de desarrollo y configuracion de demo en un cambio
  de lanzamiento revisado. Nunca copiar esta rama directamente a produccion.
- No aplicar SQL 140 a Supabase operativo mientras `main` use el formulario anterior.

Entrenadores, asistencia y convocatorias quedan fuera de este desarrollo.
