-- Corrige la foto de la brocha: apuntaba a la página HTML del producto, no a la imagen.
-- La nueva es el og:image de esa página. Pendiente: nombre y página corresponden
-- a brochas distintas; lo debe decidir Pintuco.

update public.products
   set image_url = 'https://cdn-pintuco-col.plm.com.co/wp-content/uploads/2023/01/'
                   || 'brocha-estandar-cerda-blanca-3-pulg-pintuco-jpg.webp',
       updated_at = now()
 where image_url = 'https://www.pintuco.com.co/productos/'
                   || 'brocha-estandar-cerda-blanca-3-pulg-pintuco/';
