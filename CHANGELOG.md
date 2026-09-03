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
3. **Aprobar la vinculación de un empleado a su empresa.**
   `resolve_join_request` sigue con cero usos: el registro crea la solicitud y
   no hay pantalla para resolverla.
4. **Cambiar las contraseñas sembradas.** `pintuco2025*` estuvo publicada en el
   paquete de la tienda. Darlas por comprometidas.
5. **Los archivos de despliegue viven fuera de este repositorio**
   (`../docker-compose.yml` y `../docker/`). Si se pierde esa carpeta, se pierde
   cómo se despliega.

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
- Activar `strict` en `tsconfig.json`.
- Migrar a Supabase Cloud y Render (hay que registrar las URL de redirección de
  Google).
- El motor de diagnóstico corre en el navegador.
- `invoices.subtotal_cop` guarda el total **con** IVA; la base está en
  `taxable_base_cop`. El nombre invita a equivocarse al exportar a la DIAN.
- Pintu es de reglas: cada forma nueva de preguntar hay que enseñársela.

---

## Cómo se despliega

`npm run build` **no despliega nada**: los contenedores hornean el `dist` al
construir la imagen. Desde la carpeta que contiene este repositorio:

```bash
docker compose build admin colorlink
docker compose up -d admin colorlink
```

Para comprobar qué se está sirviendo de verdad:

```bash
curl -s http://127.0.0.1:8091/ | grep -oE 'admin-[A-Za-z0-9_-]+\.js'
```

Las migraciones se aplican con
`docker exec -i supabase_db_colorlink psql -U postgres < archivo.sql` y después
`notify pgrst, 'reload schema';`.
