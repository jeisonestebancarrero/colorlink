import { describe, it, expect } from 'vitest';
import { urlDeImagenSospechosa } from './ImagenConRespaldo';

/**
 * La validación debe aceptar cualquier URL de imagen legítima y rechazar páginas HTML
 * pegadas por error (resultados de buscador, fichas de producto), que responden 200.
 */
describe('Imagen de producto por URL', () => {
  it('acepta las URL de imagen que ya usa el catálogo', () => {
    // URL del catálogo actual: ninguna tiene extensión, así que exigirla las rechazaría.
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
      // Supabase Storage, la que genera el propio portal.
      'https://abc.supabase.co/storage/v1/object/public/productos/koraza-123.jpg',
      // Dominios de Google que sí sirven imágenes.
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
    // El mensaje debe indicar qué hacer, no solo que está mal.
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
    // Ficha de producto en pintuco.com.co: es una página HTML y termina en `/`.
    const aviso = urlDeImagenSospechosa(
      'https://www.pintuco.com.co/productos/brocha-estandar-cerda-blanca-3-pulg-pintuco/'
    );
    expect(aviso).toBeTruthy();
    expect(aviso).toMatch(/página del producto|dirección de la imagen/i);
  });

  it('la regla de la barra final no estorba a una URL de archivo', () => {
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
    // Producto sin foto es válido: el catálogo muestra el marcador.
    expect(urlDeImagenSospechosa('')).toBeNull();
    expect(urlDeImagenSospechosa('   ')).toBeNull();
  });
});
