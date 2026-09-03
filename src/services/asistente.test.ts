import { describe, it, expect } from 'vitest';
import {
  intencionDe, areaMencionada, pedidoMencionado, saludo, responder, NOMBRE,
} from './asistente';

/**
 * El asistente: entender la pregunta.
 *
 * Se prueba la parte que decide QUÉ consultar, porque es donde un error se
 * nota: entender mal manda a la persona a la respuesta equivocada, y peor,
 * puede hacer que el asistente hable con seguridad de algo que no le
 * preguntaron.
 *
 * Lo que NO se prueba aquí es la redacción: eso se ve en pantalla. Lo que se
 * vigila es que la intención salga bien escrita de cualquier forma —con
 * tildes o sin ellas, en mayúsculas, con el número de pedido completo o solo
 * la cifra— porque así es como escribe la gente.
 */
describe('El asistente entiende la pregunta', () => {
  it('reconoce que preguntan por un pedido', () => {
    for (const frase of [
      '¿dónde va mi pedido?',
      'donde esta mi orden',
      '¿Cuándo LLEGA?',
      'quiero rastrear el envío',
      'ya despacharon lo mío',
    ]) {
      expect(intencionDe(frase), frase).toBe('PEDIDO');
    }
  });

  it('reconoce que preguntan qué producto usar', () => {
    for (const frase of [
      'qué pintura me sirve para la fachada',
      'tengo humedad en el techo',
      'necesito algo para madera',
      'que producto recomiendan para metal',
    ]) {
      expect(intencionDe(frase), frase).toBe('PRODUCTO');
    }
  });

  it('reconoce que preguntan por una tienda', () => {
    for (const frase of [
      '¿dónde queda la tienda?',
      'cual es el horario del punto de retiro',
      'a qué dirección voy a recoger',
    ]) {
      expect(intencionDe(frase), frase).toBe('TIENDA');
    }
  });

  it('reconoce que quieren hablar con una persona', () => {
    for (const frase of [
      'quiero hablar con un asesor',
      'necesito una persona',
      'tengo un reclamo',
    ]) {
      expect(intencionDe(frase), frase).toBe('PERSONA');
    }
  });

  it('responde a un saludo presentándose, no con «no entendí»', async () => {
    // Era la peor primera impresión posible: «hola» caía en desconocida y el
    // asistente contestaba que no había entendido.
    for (const frase of ['hola', 'buenas', 'buenos días', 'qué más', 'quiubo']) {
      expect(intencionDe(frase), frase).toBe('SALUDO');
      const r = await responder(frase, [], false);
      expect(r.texto, frase).toContain(NOMBRE);
      expect(r.texto, frase).not.toMatch(/no te entend/i);
    }
  });

  it('un saludo con pregunta responde la PREGUNTA, no el saludo', async () => {
    // «hola, dónde va mi pedido» tiene que atender lo que de verdad se pide.
    expect(intencionDe('hola, donde va mi pedido')).toBe('PEDIDO');
    expect(intencionDe('buenas, que pintura sirve para fachada')).toBe('PRODUCTO');
  });

  it('dice quién es sin fingir ser una persona', async () => {
    const r = await responder('¿eres un bot?', [], false);
    expect(r.texto).toContain(NOMBRE);
    expect(r.texto).toMatch(/no soy una persona/i);
  });

  it('agradece y se despide sin quedarse mudo', async () => {
    expect(intencionDe('muchas gracias')).toBe('GRACIAS');
    expect(intencionDe('chao')).toBe('DESPEDIDA');
    expect((await responder('gracias', [], false)).texto).toMatch(/con gusto/i);
  });

  it('NO adivina cuando no entiende', () => {
    // Es lo más importante: preferir «no sé» a una respuesta plausible. Una
    // recomendación inventada sobre cuánta pintura comprar cuesta dinero.
    for (const frase of ['asdfgh', '¿?', 'xyz123']) {
      expect(intencionDe(frase), frase).toBe('DESCONOCIDA');
    }
  });

  it('saca el área de la frase, se escriba como se escriba', () => {
    expect(areaMencionada('tengo 85 metros cuadrados')).toBe(85);
    expect(areaMencionada('son 120 m2')).toBe(120);
    expect(areaMencionada('la fachada tiene 42.5 m²')).toBe(42.5);
    // Coma decimal, que es como se escribe en Colombia.
    expect(areaMencionada('unos 30,5 mts')).toBe(30.5);
  });

  it('no inventa un área donde no la hay', () => {
    expect(areaMencionada('quiero pintar la sala')).toBeNull();
    expect(areaMencionada('pedido 000106')).toBeNull();
    // Un número suelto sin unidad no es un área: podría ser cualquier cosa.
    expect(areaMencionada('necesito 3')).toBeNull();
  });

  it('encuentra el pedido por su número completo o por la cifra', () => {
    const pedidos = [
      { id: 'a', numero: 'ORD-PNT-000106' },
      { id: 'b', numero: 'ORD-PNT-000401' },
    ] as never;

    expect(pedidoMencionado('qué pasó con ORD-PNT-000401', pedidos)?.id).toBe('b');
    // Como lo dice la gente: solo la cifra, sin los ceros de relleno.
    expect(pedidoMencionado('el pedido 106', pedidos)?.id).toBe('a');
    expect(pedidoMencionado('mi pedido 000106', pedidos)?.id).toBe('a');
  });

  it('entiende una pregunta que solo trae el NÚMERO del pedido', () => {
    // FALLO REAL: al elegir del desplegable se enviaba
    // «¿Dónde va ORD-PNT-000029?» y contestaba «no te entendí». Ninguna de sus
    // palabras clave estaba —«ord-pnt» no es «orden»— así que la frase más
    // clara posible caía en desconocida. Que el asistente no entienda lo que
    // él mismo acaba de ofrecer es de lo peor que puede pasar.
    for (const frase of [
      '¿Dónde va ORD-PNT-000029?',
      'ORD-PNT-000106',
      'que paso con DEMO-2411-35427',
    ]) {
      expect(intencionDe(frase), frase).toBe('PEDIDO');
    }
  });

  it('entiende las formas de preguntar sin decir «pedido»', () => {
    for (const frase of ['¿dónde va?', 'como va lo mio', 'ya salió?', '¿en qué va?']) {
      expect(intencionDe(frase), frase).toBe('PEDIDO');
    }
  });

  it('pedir un asesor SOBRE un pedido gana a consultar su estado', () => {
    // Es lo que manda el desplegable al elegir «hablar con una persona».
    expect(intencionDe('Quiero hablar con un asesor sobre ORD-PNT-000029'))
      .toBe('PERSONA');
  });

  it('un número que no es de pedido no dispara la intención', () => {
    // Sin esto, cualquier código con guiones —un color, un SKU— se leería
    // como un pedido.
    expect(intencionDe('el color es blanco 001')).not.toBe('PEDIDO');
    expect(intencionDe('tengo 85 metros')).not.toBe('PEDIDO');
  });

  it('sin sesión NO ofrece lo que no puede hacer', () => {
    // La burbuja también se le muestra a quien navega sin cuenta —es justo
    // quien más pregunta qué pintura usar— pero un botón «¿Dónde va mi
    // pedido?» que acaba pidiéndole la cuenta es una promesa rota.
    const invitado = saludo(null, false);
    const etiquetas = (invitado.acciones ?? []).map((a) => a.etiqueta);
    expect(etiquetas.some((e) => /pedido/i.test(e))).toBe(false);
    expect(etiquetas.some((e) => /pintura/i.test(e))).toBe(true);

    const conCuenta = saludo('Carlos', true);
    expect((conCuenta.acciones ?? []).some((a) => /pedido/i.test(a.etiqueta))).toBe(true);
    expect(conCuenta.texto).toContain('Carlos');
  });

  it('sin sesión, preguntar por un pedido invita a entrar en vez de mentir', async () => {
    // Consultar pedidos sin sesión devuelve lista vacía, así que sin este
    // desvío el asistente le diría «no tienes pedidos» a alguien que sí los
    // tiene, solo por no haber entrado.
    const r = await responder('¿dónde va mi pedido?', [], false);
    expect(r.texto).toMatch(/cuenta/i);
    expect((r.acciones ?? []).some((a) => a.ir?.pagina === 'login')).toBe(true);
  });

  it('sin sesión, pedir un asesor da el teléfono en vez de dejar tirado', async () => {
    const r = await responder('quiero hablar con un asesor', [], false);
    expect(r.texto).toMatch(/01 8000 111-247/);
  });

  it('devuelve null si el número no es de esta persona', () => {
    const pedidos = [{ id: 'a', numero: 'ORD-PNT-000106' }] as never;
    // No se cae al primero por descarte: eso le mostraría a alguien el estado
    // de un pedido por el que no preguntó.
    expect(pedidoMencionado('el pedido 999', pedidos)).toBeNull();
  });
});
