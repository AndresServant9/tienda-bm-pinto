# Desarrollo de dorsales en inscripciones

Versión de integración 161. Las migraciones 140 y 160 y el padrón privado de dorsales deben estar instalados antes de publicar esta versión.

## Entorno aislado

Ejecutar `npm ci`, `npm test` y `npm run dev`. Abrir
`http://127.0.0.1:8140/inscripciones` en el mismo ordenador.
Cuenta ficticia: `familia@example.test`, clave de demostracion `PruebaLocal123!`.
Con el servidor arrancado, `npm run test:form` comprueba el formulario en DOM.
`npm run test:http` ensaya reserva, consulta familiar y dos envios simultaneos
contra la base ficticia local. Estos ensayos dejan inscripciones ficticias en esa base.

La base PostgreSQL local PGlite esta en `.dev-data/database`, excluida de Git.
El servidor escucha solo en `127.0.0.1`. Usa personas ficticias y no envia correo.
El servidor local inyecta `dev-guard.js` para dirigir las llamadas a la base ficticia.
Las páginas publicadas no cargan esa guarda y mantienen la CSP de producción.
La base de demostracion simplifica pagos y altas; la integracion de la migracion
se ha ensayado ademas contra una restauracion local de las funciones reales.

## Regla de dorsal

Numeros 1-99. Benjamín y Prebenjamín comparten numeracion entre masculino y
femenino: ninguna nueva alta de esos dos grupos puede repetir dorsal, aunque
sea de otra rama. Desde Alevín las ramas se comprueban por separado. Un numero ocupado se bloquea
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
el resultado privado actual es 176 jugadores vinculados, 13 reservas activas sin ficha
y una reserva en revision. Los cambios de fecha se guardan en una copia revisada
del historico con sus decisiones; el original se conserva sin editar.
Son 189 reservas activas, una en revision, 51 bajas y
2 copias consolidadas. Se conservan las 241 entradas originales y dos nuevas
reservas autorizadas del club, incluidas en la copia privada mediante un archivo
adicional persistente. No se duplica una fila por cada rama: la regla compartida
bloquea el numero en ambas al consultar y confirmar una inscripcion.
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
- Instalar SQL 140 y 160 junto con la importación privada revisada antes del cambio de frontend; los envíos antiguos sin dorsal quedan cerrados durante esa transición.

Entrenadores, asistencia y convocatorias quedan fuera de este desarrollo.


## Fichas familiares (desarrollo 160)

La ficha se abre pulsando el nombre del jugador en el panel, el archivo o Mis
inscripciones. `http://127.0.0.1:8140/ficha-jugador.html` muestra el listado familiar.
Tras `npm run dev`, usar `familia@example.test` y `PruebaLocal123!`. La cuenta
`admin@example.test` usa la misma contraseña ficticia para revisar la vinculación;
`otra@example.test` comienza sin acceso. No se envían correos.

Cada menor tiene identidad propia por nombre completo y nacimiento dentro de su
familia. El documento del tutor nunca identifica a los hermanos como una persona.
Los pedidos se consultan una sola vez por las cuentas familiares confirmadas y se
muestran en las fichas de todos los menores. Los adultos necesitan cuenta propia
vinculada por su documento; no heredan el acceso financiero de sus padres.

El formulario permite un responsable adicional opcional, que queda pendiente.
Anotar su correo no concede acceso ni incorpora sus compras. Solo el administrador
puede confirmar una cuenta existente y verificada. Si ya pertenece a otra familia,
se exige revisar el caso: no se fusionan familias automáticamente. El archivo
antiguo se previsualiza y requiere confirmar su relación; una familia solo puede
confirmar su propio correo. Las fechas o identidades ambiguas necesitan revisión.

La ficha reúne datos deportivos, dorsal, autorizaciones, responsables, cuotas,
pedidos y solicitudes de socio. En inscripciones con varios jugadores los importes
se identifican como compartidos, sin repartir pagos confirmados de manera ficticia.
Se muestran hasta los 100 pedidos más recientes. Las solicitudes se asocian por
los correos confirmados; este cambio no importa ni modifica el padrón histórico.
La foto es opcional y privada, reducida a 512 píxeles, sin metadatos y con un máximo
almacenado de 512 KB; no se crea ninguna URL pública.

Comprobaciones: `npm run test:family`, `npm run test:profile`,
`npm run test:family-http` (requiere servidor), además de los tests existentes.
SQL `sql/160-familias-y-fichas.sql` va después del 140. Solo se ha aplicado a bases
locales de ensayo y a una restauración local; no ejecutar ni desplegar sobre la
tienda operativa. Las guardas de desarrollo siguen activas. Para publicar hará
falta preparar la integración coordinada con main y revisar las relaciones reales.


## Contactos familiares que compran como invitados (162)

El club puede añadir un nombre, correo de compras y relación familiar desde la
ficha, incluso si esa persona no tiene usuario. Solo un administrador puede
confirmar el contacto. Se muestra previamente que sus pedidos aparecerán para
las cuentas autorizadas de esa familia. Esta operación no crea cuentas, no vincula
sesiones y no concede permiso para iniciar sesión; autorizar una cuenta verificada
sigue siendo una operación separada.

Los correos ya confirmados o las cuentas asignadas a otra familia requieren revisión,
sin fusiones automáticas. Cada confirmación queda auditada y puede revocarse para
contactos sin acceso de cuenta, sin borrar sus pedidos. La vinculación de una cuenta
ya autorizada debe revisarse como acceso, no como contacto de compras.

Aplicar `sql/162-contactos-familia-sin-cuenta.sql` después del 160. Pruebas:
`npm run test:contacts`, `npm run test:profile` y `node dev/test-production.cjs`.


## Compras personales de adultos (163)

Las fichas de mayores de edad muestran compras y cuenta propias, sin los contactos
ni las compras de sus padres o hermanos. El club confirma los correos personales
de compra, también para compras como invitado. El vínculo de compras no crea ni
autoriza usuarios. El acceso a la ficha usa una operación separada con cuenta
verificada y DNI/NIE coincidente. Los correos ya vinculados a otro jugador se
bloquean hasta revisar la identidad; se puede revocar un correo adicional.

En el archivo, el adulto tiene un flujo propio «Vincular compras del jugador».
Se propone el correo de envío válido; no se usan marcadores como un punto. Los
menores conservan el flujo de responsables. Un adulto archivado no se incorpora
a la familia del responsable para recuperar sus compras.

Aplicar `sql/163-compras-personales-adultos.sql` después del 162. Se conservan
las definiciones anteriores en una tabla privada. `npm run test:adult` comprueba
el aislamiento, compras de invitado, cuenta propia, documento, archivo y textos.
El caso ficticio local está en `/ficha-jugador.html?history=1631` (admin de prueba).
