import { describe, it, expect } from 'vitest';
import { urlDeImagenSospechosa } from './ImagenConRespaldo';

/**
 * Imagen de producto cargada POR URL.
 *
 * Lo que se vigila:
 *   1. Que cargar por URL SIGA FUNCIONANDO. La validación existe para atajar
 *      un error concreto, no para cerrar la puerta: si rechazara una URL
 *      legítima, obligaría a subir el archivo cuando el cliente ya tiene la
 *      foto publicada en su propio sitio.
 *   2. Que se rechace la página de RESULTADOS de un buscador. Es el error real
 *      que ya pasó: un producto quedó con
 *      `https://www.google.com/imgres?q=Brocha...`, que devuelve 200 y
 *      `text/html`, así que el navegador solo puede pintar su icono de roto.
 */
describe('Imagen de producto por URL', () => {
  it('acepta las URL de imagen que ya usa el catálogo', () => {
    // Son las que hay hoy en la base. Ninguna tiene extensión de archivo, y
    // exigirla habría rechazado las once.
    const reales = [
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=900',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop',
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80',
    ];
    for (const u of reales) {
      expect(urlDeImagenSospechosa(u), u).toBeNull();
    }
  });

  it('acepta una URL cualquiera, con o sin extensión', () => {
    const validas = [
      'https://cdn.pintuco.com.co/productos/viniltex.jpg',
      'https://pintuco.com.co/wp-content/uploads/2026/01/koraza.webp',
      'http://mi-servidor.local/imagenes/producto',
      'https://ejemplo.co/img?id=884&size=lg',
      // Almacenamiento de Supabase: es la que produce el propio portal.
      'https://abc.supabase.co/storage/v1/object/public/productos/koraza-123.jpg',
      // Contenido de Google que SÍ son imágenes.
      'https://lh3.googleusercontent.com/abc123',
      'https://storage.googleapis.com/bucket/foto.png',
    ];
    for (const u of validas) {
      expect(urlDeImagenSospechosa(u), u).toBeNull();
    }
  });

  it('RECHAZA la página de resultados de Google Imágenes, con su explicación', () => {
    const aviso = urlDeImagenSospechosa(
      'https://www.google.com/imgres?q=Brocha%20Master&imgurl=https%3A%2F%2Fx.com%2Fa.jpg'
    );
    expect(aviso).toBeTruthy();
    // El mensaje tiene que decir QUÉ hacer, no solo que está mal.
    expect(aviso).toMatch(/clic derecho|dirección de la imagen/i);
  });

  it('rechaza otras páginas de búsqueda que se pegan por error', () => {
    expect(urlDeImagenSospechosa('https://www.google.com/search?q=pintura&tbm=isch')).toBeTruthy();
    expect(urlDeImagenSospechosa('https://www.bing.com/images/search?q=pintura')).toBeTruthy();
    expect(urlDeImagenSospechosa('https://www.pinterest.com/pin/123456789/')).toBeTruthy();
  });

  it('acepta una imagen alojada en Pinterest, que sí es un archivo', () => {
    expect(urlDeImagenSospechosa('https://i.pinimg.com/originals/ab/cd/foto.jpg')).toBeNull();
  });

  it('RECHAZA la página del producto en el sitio de Pintuco', () => {
    // Caso real: se pegó la URL de la ficha del producto en pintuco.com.co.
    // Es una página, termina en `/`, y el navegador solo pinta su icono roto.
    const aviso = urlDeImagenSospechosa(
      'https://www.pintuco.com.co/productos/brocha-estandar-cerda-blanca-3-pulg-pintuco/'
    );
    expect(aviso).toBeTruthy();
    expect(aviso).toMatch(/página del producto|dirección de la imagen/i);
  });

  it('la regla de la barra final no estorba a una URL de archivo', () => {
    // Ninguna de estas termina en `/`, así que siguen pasando.
    for (const u of [
      'https://www.pintuco.com.co/media/koraza.jpg',
      'https://images.unsplash.com/photo-123?auto=format',
      'http://mi-servidor.local/imagenes/producto',
      'https://ejemplo.co/img?id=884',
    ]) {
      expect(urlDeImagenSospechosa(u), u).toBeNull();
    }
  });

  it('exige que la dirección sea http o https', () => {
    expect(urlDeImagenSospechosa('ftp://servidor/foto.jpg')).toMatch(/http/i);
    expect(urlDeImagenSospechosa('solo-texto')).toMatch(/http/i);
    expect(urlDeImagenSospechosa('javascript:alert(1)')).toMatch(/http/i);
  });

  it('una URL vacía no es un error: significa «sin imagen»', () => {
    // Un producto sin foto es válido; el catálogo muestra el marcador.
    expect(urlDeImagenSospechosa('')).toBeNull();
    expect(urlDeImagenSospechosa('   ')).toBeNull();
  });
});
