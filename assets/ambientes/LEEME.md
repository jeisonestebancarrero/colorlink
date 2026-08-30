# Fotos para el simulador de ambientes

Aquí van las fotos reales sobre las que el cliente prueba los colores.

## Qué foto sirve

- Una pared amplia y despejada, tomada de frente o con poca perspectiva.
- Luz pareja: si media pared está quemada por el sol, el color se ve falso.
- Horizontal, mínimo 1200 px de ancho. JPG o WebP.
- Sin personas identificables ni marcas de terceros.

## Nombres esperados

| Archivo         | Ambiente en la pantalla |
|-----------------|-------------------------|
| `fachada.jpg`   | Fachada Exterior        |
| `sala.jpg`      | Sala & Muro Focal       |
| `habitacion.jpg`| Habitación Principal    |
| `oficina.jpg`   | Oficina / Comercial     |

## Por qué hace falta además una máscara

Pintar solo el muro exige saber qué pixeles son muro. Con una foto cualquiera
eso requiere un modelo de segmentación —varios megabytes y resultados
inconsistentes—, así que se hace como en los visualizadores de las marcas: se
traza una vez el contorno del muro de cada foto y queda guardado.

Cuando dejes las fotos aquí, se traza el contorno de cada una y el simulador
pasa a usarlas. Mientras no estén, funciona con las escenas dibujadas, que
pintan el muro correctamente aunque no sean fotográficas.
