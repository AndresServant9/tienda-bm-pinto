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
Nacional comparten el grupo senior para esta comprobacion.
Un dorsal ya asignado solo se reconoce si esta vinculado a la cuenta verificada,
nombre normalizado y cohorte del jugador. Escribir el nombre de otra persona no
permite apropiarse de su numero.

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
No se liberan automaticamente las anotaciones BAJA/DUDA ni se reasignan conflictos.
Los nombres abreviados y las asignaciones sin titular requieren conciliacion del club.

## Antes de integrar

- Resolver conflictos y confirmar bajas; vincular dorsales existentes con jugadores.
- El selector se ha probado en navegador de escritorio y vistas de 390 y 320 pixeles,
  sin desbordamiento horizontal. Falta probar teclado tactil en Android/iOS reales.
- Hacer prueba de concurrencia con dos conexiones PostgreSQL independientes.
- Preparar el despliegue coordinado de SQL `sql/140-dorsales.sql` y formulario.
- Retirar expresamente guardas de desarrollo y configuracion de demo en un cambio
  de lanzamiento revisado. Nunca copiar esta rama directamente a produccion.
- No aplicar SQL 140 a Supabase operativo mientras `main` use el formulario anterior.

Entrenadores, asistencia y convocatorias quedan fuera de este desarrollo.
