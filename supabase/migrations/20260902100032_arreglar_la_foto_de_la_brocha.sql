-- ============================================================
-- Arreglar la única foto rota del catálogo
-- ============================================================
-- «Brocha Master Cerdas Mixtas Pintuco 3"» tenía guardada la dirección de la
-- PÁGINA del producto en pintuco.com.co, no la de la imagen:
--
--   https://www.pintuco.com.co/productos/brocha-estandar-cerda-blanca-3-pulg-pintuco/
--
-- Devuelve 200 y `text/html`, así que el navegador solo podía pintar su icono
-- de roto. Es el error que ya motivó `ImagenConRespaldo` y sus avisos.
--
-- La dirección nueva NO está inventada: se sacó de esa misma página, del
-- `og:image` que publica Pintuco, y está alojada en su propio CDN. Comprobada:
-- responde 200 con `image/webp`.
--
-- Se verificaron las once fotos del catálogo una por una siguiendo redirecciones
-- y mirando el tipo de contenido devuelto. Esta era la única que no era imagen;
-- las otras diez responden `image/jpeg`.
--
-- OJO, HAY UNA INCOHERENCIA QUE NO ME CORRESPONDE RESOLVER: el producto se
-- llama «Brocha Master Cerdas Mixtas» y la página enlazada es de la «Brocha
-- Estándar Cerda Blanca». Son dos referencias distintas. Se corrige la foto
-- —que era lo roto— con la imagen de la página que estaba puesta, pero alguien
-- de Pintuco tiene que decidir cuál de las dos brochas se vende y ajustar el
-- nombre o la foto en consecuencia. Cambiar el nombre del producto por mi
-- cuenta sería inventar el catálogo.

update public.products
   set image_url = 'https://cdn-pintuco-col.plm.com.co/wp-content/uploads/2023/01/'
                   || 'brocha-estandar-cerda-blanca-3-pulg-pintuco-jpg.webp',
       updated_at = now()
 where image_url = 'https://www.pintuco.com.co/productos/'
                   || 'brocha-estandar-cerda-blanca-3-pulg-pintuco/';
