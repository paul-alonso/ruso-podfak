import { prueba, igual, cierto } from './mini.js';
import { reunirFrases, elegirDistractores, ordenarPorResultados, barajar } from '../js/frases.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();

const frase = (clase, ru, es, alt_es = []) => ({ clase, clave: ru, ru, es, alt_es, alt_ru: [] });

prueba('reunirFrases une práctica y textos sin repetir', () => {
  const frases = reunirFrases([ejemplo]);
  igual(frases.length, 17); // 5 de práctica + 13 de los textos − «Кто это?» repetida
  const kto = frases.find(f => f.ru === 'Кто это?');
  igual([kto.clave, kto.lector, kto.ru_acento], ['p3', 't2-f1', 'Кто́ э́то?']);
  igual(frases.filter(f => f.ru === 'Кто это?').length, 1);
});

prueba('elegirDistractores: misma clase y anteriores, nunca un sinónimo', () => {
  const objetivo = frase('clase_02', 'Это кот.', 'Es un gato.', ['Esto es un gato.']);
  const candidatas = [
    objetivo,
    frase('clase_02', 'Это собака.', 'Es un perro.'),
    frase('clase_02', 'Вот кот.', 'Esto es un gato.'),   // significa lo mismo que una alternativa
    frase('clase_02', 'Это кот!', 'Es un gato.'),        // misma traducción
    frase('clase_01', 'дом', 'casa'),
    frase('clase_01', 'Это мама.', 'Es mamá.'),
    frase('clase_03', 'Это мой брат.', 'Es mi hermano.'), // clase posterior
  ];
  const orden = ['clase_01', 'clase_02', 'clase_03'];
  for (let i = 0; i < 20; i++) {
    const d = elegirDistractores(objetivo, candidatas, orden, 3).map(f => f.es).sort();
    igual(d, ['Es mamá.', 'Es un perro.', 'casa']);
  }
  // Si no bastan, se recurre a clases posteriores.
  const cuatro = elegirDistractores(objetivo, candidatas, orden, 4).map(f => f.es);
  cierto(cuatro.includes('Es mi hermano.'), cuatro.join(' | '));
});

prueba('elegirDistractores: prefiere frases de longitud parecida de la misma clase', () => {
  const objetivo = frase('clase_01', 'Мама там.', 'Mamá está allí.');
  const candidatas = [
    frase('clase_01', 'кот', 'gato'),
    frase('clase_01', 'Папа тут.', 'Papá está aquí.'),
    frase('clase_01', 'Брат дома.', 'El hermano está en casa.'),
    frase('clase_01', 'Сестра там.', 'La hermana está allí.'),
    frase('clase_01', 'Окно тут.', 'La ventana está aquí.'),
    frase('clase_01', 'Это очень большой и красивый дом.', 'Esta es una casa muy grande y bonita, de verdad.'),
    frase('clase_01', 'суп', 'sopa'),
    frase('clase_01', 'сок', 'zumo'),
  ];
  // Con n = 1 se sortea entre las 2 más parecidas: la de 3 palabras y una de las de 4.
  const posibles = new Set();
  for (let i = 0; i < 30; i++) posibles.add(elegirDistractores(objetivo, candidatas, ['clase_01'], 1)[0].es);
  const parecidas = ['Papá está aquí.', 'La hermana está allí.', 'La ventana está aquí.'];
  cierto([...posibles].every(es => parecidas.includes(es)), [...posibles].join(' | '));
});

prueba('ordenarPorResultados: falladas, luego nuevas, luego acertadas', () => {
  const a = frase('c', 'а', 'a');
  const b = frase('c', 'б', 'b');
  const c = frase('c', 'в', 'c');
  const resultados = { 'а|dictado': { ultimaOk: false, ultima: '2026-10-01' }, 'в|dictado': { ultimaOk: true, ultima: '2026-10-01' } };
  igual(ordenarPorResultados([c, b, a], 'dictado', () => resultados).map(f => f.ru), ['а', 'б', 'в']);
  // Otro modo: todas nuevas.
  igual(ordenarPorResultados([c, b, a], 'significado', () => resultados).length, 3);
});

prueba('barajar conserva los elementos', () => {
  igual(barajar([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
});
