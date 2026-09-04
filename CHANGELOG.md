# ColorLink · Registro de cambios

Sistema de venta y operación de Pintuco. Dos aplicaciones independientes sobre
la misma base de datos:

| | Puerto | Para quién |
|---|---|---|
| **Tienda** | `8090` | El cliente: catálogo, carrito, pedidos, asistente |
| **Portal interno** | `8091` | El equipo: 18 módulos de operación |

Son dos despliegues separados a propósito: el cliente no recibe ni una línea
del portal interno, ni siquiera su pantalla de acceso.

---

## 2026-09-04

### Un asesor por pedido, y cada asesor ve solo lo suyo
- Todo el personal veía TODOS los pedidos de sus sedes. Ahora cada pedido se
  asigna a un **asesor** al crearse, al azar entre los que **cubren la sede**
  del pedido. Asignar a alguien un pedido que su propia RLS le va a ocultar es
  peor que no asignarlo.
- **Solo el rol ASESOR entra al sorteo.** Al administrador no se le asigna nada.
- **Si no hay asesor, se le dice al cliente** que le avisarán, y se le cumple:
  al entrar un asesor que cubra esa sede, los pedidos huérfanos se reparten y
  el cliente recibe el aviso.
- **«Asesor puro» ve solo lo suyo.** Quien además es de despacho, facturación o
  administración sigue viéndolo todo: taparle los pedidos rompería la operación
  y el fallo aparecería lejos de este cambio.
- **Si cambia la sede del pedido se revisa el asesor.** Sin esto el pedido
  conservaba un dueño que su propia RLS le ocultaba: nadie lo veía y figuraba
  como atendido.
- 5 pruebas nuevas.

### Los kits se administran desde el Catálogo
- Nueva pestaña **Kits**: crear, editar, archivar, ordenar pasos, **descuento en
  porcentaje** e imagen del kit y de cada paso.
- Un paso se arma eligiendo **producto y presentación del catálogo activo**. No
  hay campo de precio ni de etiqueta libre: el precio sale de la presentación,
  así que sube y baja con el catálogo y no puede quedarse viejo. Es exactamente
  lo que evitó que se repita lo de los cinco pasos con precios inventados.
- La tienda lee las mismas tablas: lo que se archive, edite o borre, el cliente
  lo ve al recargar.
- La escritura pasa de exigir `is_admin()` a `catalog.write`, como el resto del
  catálogo. Un kit es catálogo.

### Datos de demostración, marcados como tales
- Se llenaron los datos del emisor de la factura con un **NIT imposible de
  confundir con uno real** (`900.000.000-0`), razón social «(DEMOSTRACIÓN)» y
  pie de página «DOCUMENTO DE DEMOSTRACIÓN — sin validez fiscal». Un NIT
  plausible en una factura fotografiada deja de ser una demo.

### Pintu por voz: llamada en vivo con el asistente
- Llamada real por WebRTC contra la API Realtime. El audio va **directo** del
  navegador al proveedor; meterlo por una función de borde añadiría latencia en
  los dos sentidos y convertiría la conversación en un walkie-talkie.
- **La llave nunca llega al navegador.** Una función de borde nueva
  (`asistente-voz`) emite un token efímero de 10 minutos y fija ahí el modelo,
  la voz, las instrucciones y los topes: si el cliente pudiera elegirlos,
  cambiaría el modelo barato por el caro o borraría las reglas.
- **Al modelo NO se le manda el catálogo.** Se le dan cuatro herramientas y las
  ejecuta el navegador con la sesión de quien llama, así que **RLS sigue
  mandando**. Además la API de voz es con estado y relee el contexto en cada
  turno: un catálogo en las instrucciones se pagaría en cada frase.
- **`calcular_pintura` obliga a que la cuenta la haga la base**
  (`calculate_paint`, rendimiento real de ficha). Un modelo estimando galones
  es un cliente comprando de menos para su fachada.
- Personalidad: asesor colombiano, voz masculina (`cedar`), dos frases por
  turno, y fuera de pintura no entra.
- Topes de gasto desde el primer día: 5 minutos por llamada, corte por silencio
  a los 45 s en el navegador y a los 30 s en el servidor —los temporizadores de
  una pestaña en segundo plano se ralentizan, así que hacían falta los dos—, y
  el consumo a la vista durante la llamada.
- Al colgar, lo hablado **queda en el hilo escrito**: si no, el cliente cuelga y
  pierde el número de pedido que le acaban de decir.

### Dos funciones de borde que nunca se habían servido
- `asistente-ia` y `wompi-webhook` estaban en disco pero **no registradas en el
  runtime**: se añadieron después del último arranque y el registro se arma al
  arrancar. Devolvían 404. **El webhook de pagos es una de ellas.**
- Y la consulta de catálogo de `asistente-ia` pedía columnas que no existen
  (`category`, `ambiente`, `acabado`, `rendimiento`), así que al modelo le
  llegaba el catálogo **vacío** con la nota de que eran todos los datos
  disponibles. No se había notado porque sin llave ese código nunca corrió.

### El motor de diagnóstico se mudó a la base y dejó de inventar catálogo
- El diagnóstico técnico de cada proyecto —categoría de solución, nivel de
  atención, visita, productos, cantidades y presupuesto— lo calculaba el
  **navegador** y `create_project` guardaba lo que le llegara.
- **Recomendaba productos que no existen.** Sus 8 códigos y precios estaban
  escritos a mano: `PNT-10520 «Esmalte Sintético Pintulux 3 en 1»` a $89.900
  contra el real `PNT-MET-006` desde $39.900. Ninguno estaba en `products`: el
  cliente terminaba con una lista de materiales que no podía comprar.
- **Era el segundo motor.** La calculadora ya usaba `calculate_paint` con el
  rendimiento real de ficha; éste seguía con divisiones fijas (`area / 28`).
  La misma fachada daba dos respuestas según por dónde entrara el cliente.
- **El navegador decidía y el servidor obedecía.** Con la consola abierta
  cualquiera se fijaba su nivel de atención y su presupuesto. Ahora
  `create_project` **calcula** el diagnóstico y descarta el que le manden; hay
  una prueba que lo ataca a propósito.
- La regla del motor nuevo (`diagnosticar_proyecto`): **no emite una línea que
  no resuelva contra una fila real de `product_variants`**. Si el catálogo no
  tiene con qué resolver un caso, no recomienda nada y pide visita técnica.
- La presentación se elige **por costo**, no por tamaño: para 85 m² de Koraza
  salen 8 galones ($1.143.200) en vez de 2 cuñetes ($1.259.800).
- **La madera dejó de recibir vinilo de interior**: el motor viejo no tenía esa
  rama y caía en el «else». `PNT-MAD-007` existía desde el principio.
- **Sin área ya no inventa una obra de 85 m²** (`Number(data.areaM2) || 85`).
- Se retiró la advertencia «aplicar anticorrosivo antes de 4 horas»: el
  producto real es un 3 en 1 que, según su ficha, se aplica sobre óxido firme.
- 9 pruebas nuevas (488 en total).

### `strict` activado en TypeScript, y lo que estaba tapando
- Al encenderlo salieron **10.491 errores**. El 99% eran uno solo repetido:
  **`@types/react` y `@types/react-dom` nunca se instalaron**. Toda la
  aplicación se estaba comprobando con React —componentes, props, hooks,
  eventos— como `any`. Instalarlos dejó **11 errores reales**.
- De esos 11, cuatro eran defectos de verdad, no ruido de tipos:
  - **El cargador de fotos del proyecto reventaba al adjuntar la primera.**
    `CreateProjectPage` pasaba `onPhotosChange` y el componente espera
    `onChange`: la función llegaba `undefined` y explotaba al llamarla.
  - **Solicitar visita técnica mandaba el proyecto vacío.** Se le pasaba
    `project` al modal, que espera `projectId` y `projectName`: el RPC recibía
    `undefined` y el diálogo anunciaba «Proyecto: undefined».
  - **Dos diálogos salían a lo ancho de la pantalla.** El visor de fotos y el de
    soluciones pedían `maxWidth="max-w-4xl"`, una clase de Tailwind donde el
    componente espera un tamaño (`'lg'`, `'3xl'`…). Al no encontrarlo se
    quedaban sin ancho máximo. Se añadió `'4xl'`, que era el que faltaba.
  - Una rama muerta en el diagnóstico comparaba el nivel de atención con
    `'Urgente'`, un valor que ese tipo no puede tomar.
- **El tope de 6 fotos tampoco existía.** `maxPhotos={6}` se venía pasando a un
  componente que no lo recibía, así que un proyecto podía subir las que
  quisiera a Storage. Ahora se aplica y se ve en el contador.
- `npm run lint` (que es `tsc --noEmit`) pasa a comprobar de verdad.

### Reabrir una vinculación rechazada
- Rechazar era **definitivo**: la solicitud solo la crea el disparador de alta,
  así que a quien se rechazara por error había que vincularlo entrando a la
  base. Ahora se reabre desde «ya resueltas», en los dos portales.
- Se reabre **la misma fila**, no una nueva: conserva su fecha original y en
  `audit_logs` quedan el rechazo, la reapertura y la decisión final, en ese
  orden. Quien vuelve a decidir ve que a esa persona ya la habían rechazado.
- Una APROBADA **no** se reabre: sacar a alguien de la empresa es dar de baja
  al miembro, no deshacer su vinculación por la puerta de atrás.

### `invoices.subtotal_cop` se llamaba como lo que NO era
- Guardaba la suma de las líneas **con el IVA dentro** —el precio de góndola en
  Colombia ya lo incluye—, no la base imponible, que está en
  `taxable_base_cop`. Exportar esa cifra a la DIAN como base es declarar de más
  y pagar IVA sobre el IVA: en la única factura emitida serían $419.700 en vez
  de $352.689,08.
- La trampa era doble: en `invoice_items` la columna `subtotal_cop` significa
  justo lo contrario, la base **sin** IVA. Mismo nombre, sentido opuesto, en el
  mismo documento.
- La cabecera pasa a **`items_total_cop`**, con el comentario de la columna
  diciendo qué es y qué no. Las líneas conservan su nombre y ganan el suyo.
- Renombrar no tocó los datos y PostgreSQL actualizó solo la restricción que la
  nombraba. A mano solo había que seguir `issue_pos_invoice` —la única función
  que la escribe— y un `select` de `ReciboPOS.tsx` que la pedía sin usarla.
- 12 pruebas nuevas (479 en total), incluida una que emite una factura de
  verdad y fija las dos convenciones al peso.

### Aprobar la vinculación de un empleado a su empresa
- `resolve_join_request` llevaba desde el 30 de agosto en la base **con cero
  usos**: el alta creaba la solicitud y no existía una sola pantalla para
  resolverla. El segundo comprador de una constructora se registraba, leía
  «queda pendiente de aprobación» y ahí se quedaba para siempre.
- Faltaba además el dato sin el cual no se puede decidir: **quién pide entrar**.
  `profiles` no se deja leer por alguien de fuera de la empresa y quien solicita
  todavía lo es, así que el dueño solo veía un `user_id`. Ahora el listado sale
  de `solicitudes_de_vinculacion()`, SECURITY DEFINER con la misma guarda que
  la función de resolver: nunca muestra una solicitud que su usuario no pueda
  resolver.
- **Tienda** (`/mi-cuenta`): el dueño o administrador de la empresa ve quién
  pide entrar, con correo, teléfono, ciudad y el NIT con el que se registró.
  Aprueba o rechaza, y rechazar pide confirmación porque **desde el registro no
  se puede volver a pedir**. En el panel aparece además un aviso con el número
  de pendientes; sin él, la pantalla vivía en el perfil y nadie la encontraba.
- **Portal interno** (`Clientes`, solo administrador): las de todas las
  empresas, para destrabar soporte cuando el dueño de una cuenta no aparece.
- Dos correcciones en `resolve_join_request`: exigía rol OWNER/ADMIN pero **no
  miraba el `status` del vínculo**, así que quien fue dado de baja de la empresa
  seguía pudiendo meter gente en ella; y el `on conflict do nothing` dejaba la
  solicitud APROBADA y a la persona INACTIVA si ya había sido miembro antes.
- 11 pruebas nuevas.

---

## 2026-09-03

### Roles configurables
- Crear, renombrar y archivar roles desde el portal. **Un rol creado no se
  elimina, se archiva**: en PostgreSQL un valor de enum se añade pero no se
  borra.
- **Matriz rol × aplicación**: decide qué ve cada rol sin tocar persona por
  persona. `set_role_view` existía en la base desde el principio **sin ninguna
  pantalla**, así que esto solo se podía hacer entrando a la base.
- Un rol nuevo nace **sin ningún acceso**. Heredarlos de otro sería la forma
  más silenciosa de dar acceso de más.
- Los roles del sistema no se archivan, ni los que alguien tenga puesto.
- `Permisos` **nunca se había registrado en `app_views`**: la pantalla existía
  y no aparecía en ningún menú. Ahora está, y solo la ve el administrador.

### Datos de demostración retirados
- Borrados **233 pedidos** de las cuentas demo y todo lo derivado. Quedan los 8
  pedidos reales.
- **El catálogo no se tocó**: 11 productos, 25 presentaciones, 120 colores,
  7 tiendas.
- Retiradas las **credenciales demo que viajaban en el paquete JavaScript** de
  la tienda, contraseña incluida, y los tres botones de «Caso Horizonte» que
  iniciaban sesión con ellas.
- Las pruebas que usaban pedidos sembrados ahora **crean el suyo y lo borran**.

### Despliegue dentro del repositorio
- `docker-compose.yml`, `docker/` y `.dockerignore` **estaban fuera del
  repositorio**, un nivel por encima. Si se perdía esa carpeta, se perdía cómo
  se despliega el sistema.
- Movidos dentro. El contexto de construcción pasa a ser la raíz del proyecto,
  así que los `COPY COLOR-LINK/...` de los Dockerfile y las rutas del
  `.dockerignore` se ajustaron. Verificado reconstruyendo y levantando antes de
  retirar los originales: mismos contenedores, mismos puertos.
- El `.env` del compose vive ahora en la raíz del repositorio y **sigue fuera de
  git** (`.gitignore` excluye `.env*`). Las dos variables que necesita están
  documentadas en `.env.example`.

### Contraseñas
- El administrador puede **escribir** la contraseña provisional de otra persona,
  o dejar que se genere. En los dos casos **la cuenta queda obligada a
  cambiarla al entrar**.

---

## 2026-09-02

### Seguridad
- **Seis vistas de reportes saltaban RLS.** `v_cartera` se leía **sin iniciar
  sesión**: 4 facturas y $991.300 con nombre de cliente y mora. En PostgreSQL
  una vista corre con los permisos de su dueño salvo que lleve
  `security_invoker`. Las otras cinco exponían estado de resultados, libro
  auxiliar, balance, ventas y **costo y margen por producto**.
- Cerrado el hueco y documentada la regla para las nueve vistas del sistema.
- **Las notas internas del chat** no le llegan al cliente: lo impide la
  política de la base, no un filtro de pantalla.

### Asistente de la tienda (Pintu)
- Asistente **de reglas**: consulta pedidos, catálogo y tiendas reales. Cuando
  no sabe, lo dice y pasa la conversación a una persona.
- **Capa de IA opcional**, construida y a la espera de una llave. Al modelo se
  le pasan los datos ya consultados y se le pide que redacte: nunca aporta
  hechos. Si falla, cae a las reglas sin mostrar un error.
- La llave **no viaja al navegador** y el contexto se lee **con la sesión de
  quien pregunta**, así que RLS sigue mandando.

### Conversación del pedido
- El cliente **ve y responde** desde el detalle del pedido y desde la burbuja
  del asistente: es el mismo hilo.
- **Acuse de lectura** (un chulo = enviado, dos = lo abrió el otro lado),
  marcado por LADOS y no por persona: si no, un compañero abriendo el hilo haría
  creer que el cliente lo leyó.
- **Campana de mensajes sin leer** en los dos portales, separada de la de
  avisos. El aviso solo se quita **al abrir la conversación**.
- La conversación se puede **dar por atendida**, y se cierra sola cuando el
  pedido llega a entregado o cancelado. Mientras el pedido siga en curso, el
  cliente siempre puede escribir.

### Facturación y tesorería
- **Anular factura** con motivo obligatorio. Se niega si ya tiene recaudos:
  anularla dejaría el dinero del cliente sin respaldo. El asiento se **reversa**,
  no se borra.
- **Egresos de tesorería** con contrapartida contable **obligatoria**: un egreso
  no dice por sí solo qué se pagó.
- **`configurar_pasarela` nunca había funcionado**: metía un `smallint` en una
  columna `uuid` y fallaba siempre, deshaciendo el cambio. No se había notado
  porque no existía pantalla que la llamara.

### Clientes
- **Personas naturales**, que no existían en la pantalla. Van por función de
  base porque distinguir un cliente de un empleado exige leer `user_roles`, que
  solo el administrador puede consultar.
- Vista de **tarjetas** con foto o iniciales de color, y filtro
  empresas/personas.
- **Ficha editable que avisa al cliente**: fecha, hora, quién y qué cambió, con
  el valor **guardado** (los disparadores normalizan, así que anunciar lo
  enviado mostraría algo distinto de lo que ve en su perfil).
- Limpiados **62 usuarios y 71 empresas** que las pruebas habían acumulado, y
  arregladas tres limpiezas que fallaban en silencio.

### Interfaz
- **Exportar a CSV y PDF** en todas las pantallas con listado, con criterio
  propio en cada una.
- **Iconos en los títulos** de los 18 módulos, con el mismo icono del menú.
- Diálogos, carrito y avisos pasados a **portal**: colgados del contenido
  quedaban por debajo de la cabecera y se veían cortados.
- El portal usa **todo el ancho** disponible.

---

## Antes de 2026-09-02

Ver `git log`. Resumen de lo que ya existía: catálogo con carta de 120 colores,
simulador de color sobre fotos reales, carrito con IVA desglosado, cotización
imprimible, seguimiento con mapa, pago por webhook firmado de Wompi,
facturación POS con asiento automático, contabilidad completa, analítica,
proyectos y visitas técnicas, multi-sede con RLS, diccionario DIVIPOLA del DANE
completo, correos automáticos desde la base, y 2FA para el personal interno.

---

## Lo que falta

### Bloqueante
1. **Llaves de Wompi.** Hoy `payments_test_mode = true`: **aprueba el cobro sin
   cobrar**.
2. **NIT de la empresa.** Sin él la factura no sirve. No se inventa.
3. **Cambiar las contraseñas sembradas.** `pintuco2025*` estuvo publicada en el
   paquete de la tienda. Darlas por comprometidas.

### Datos que faltan de Pintuco
- Precios y costos reales (hoy estimados por categoría) y stock real.
- 10 de las 11 fotos del catálogo son de Unsplash.
- «Brocha Master **Cerdas Mixtas**» tiene la foto de la «Cerda **Blanca**»: son
  dos referencias distintas y hay que decir cuál se vende.
- Direcciones reales de los 7 puntos de venta.
- Barrios de Medellín: su capa responde 403 desde fuera. **No inventar barrios.**

### Listo pero apagado
- **La IA del asistente**: falta la llave de `platform.openai.com`.
  **ChatGPT Plus no sirve** — es otra cuenta y se cobra por uso.

### Deuda técnica
- Migrar a Supabase Cloud y Render (hay que registrar las URL de redirección de
  Google).
- Pintu es de reglas: cada forma nueva de preguntar hay que enseñársela.

---

## Cómo se despliega

`npm run build` **no despliega nada**: los contenedores hornean el `dist` al
construir la imagen. Desde la raíz de este repositorio:

```bash
docker compose build admin colorlink
docker compose up -d admin colorlink
```

Hace falta un `.env` en la raíz con `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` (ver `.env.example`). No está en git: el compose lo
lee al construir y esas dos variables se hornean en el bundle del navegador,
que es correcto — la `anon key` está diseñada para ser pública y toda la
autorización la aplica Row Level Security.

Para comprobar qué se está sirviendo de verdad:

```bash
curl -s http://127.0.0.1:8091/ | grep -oE 'admin-[A-Za-z0-9_-]+\.js'
```

Las migraciones se aplican con
`docker exec -i supabase_db_colorlink psql -U postgres < archivo.sql` y después
`notify pgrst, 'reload schema';`.
