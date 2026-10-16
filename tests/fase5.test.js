import { prueba, igual, cierto } from './mini.js';
import {
  repasar, siguienteIntervalo, sumarDias, textoIntervalo,
  reunirTarjetas, colaDelDia, intercalar, nuevasEmpezadas, NUEVAS_POR_DIA,
} from '../js/srs.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
const HOY = '2026-10-15';

// --- algoritmo ---

prueba('srs: primeros repasos 1 día → 3 días → ×ef', () => {
  let e = repasar(undefined, 'bien', HOY);
  igual([e.reps, e.intervalo, e.vence, e.ef, e.lapsos, e.primera], [1, 1, '2026-10-16', 2.5, 0, HOY]);
  e = repasar(e, 'bien', '2026-10-16');
  igual([e.reps, e.intervalo, e.vence], [2, 3, '2026-10-19']);
  e = repasar(e, 'bien', '2026-10-19');
  igual([e.intervalo, e.vence, e.primera], [8, '2026-10-27', HOY]); // round(3 × 2,5)
});

prueba('srs: fácil alarga y sube ef; difícil alarga poco y baja ef', () => {
  const base = { ef: 2.5, intervalo: 3, reps: 2, lapsos: 0 };
  const facil = repasar(base, 'facil', HOY);
  igual([facil.intervalo, facil.ef], [10, 2.65]); // round(3 × 2,5 × 1,3)
  const dificil = repasar(base, 'dificil', HOY);
  igual([dificil.intervalo, dificil.ef], [4, 2.35]);
  igual(repasar(undefined, 'facil', HOY).intervalo, 4);
});

prueba('srs: «otra vez» repite hoy, reinicia y cuenta el lapso; ef nunca baja de 1,3', () => {
  const e = repasar({ ef: 2.5, intervalo: 20, reps: 5, lapsos: 0 }, 'otra', HOY);
  igual([e.reps, e.intervalo, e.vence, e.lapsos, e.ef], [0, 0, HOY, 1, 2.3]);
  igual(repasar(e, 'bien', HOY).intervalo, 1);
  let f;
  for (let i = 0; i < 10; i++) f = repasar(f, 'otra', HOY);
  igual(f.ef, 1.3);
});

prueba('srs: el estado anterior no se modifica', () => {
  const e = { ef: 2.5, intervalo: 3, reps: 2, lapsos: 0 };
  repasar(e, 'bien', HOY);
  igual(e, { ef: 2.5, intervalo: 3, reps: 2, lapsos: 0 });
});

prueba('srs: fechas y textos de intervalo', () => {
  igual(sumarDias('2026-12-31', 1), '2027-01-01');
  igual(sumarDias('2026-02-28', 1), '2026-03-01');
  igual([0, 1, 12, 30, 45].map(textoIntervalo), ['hoy', '1 día', '12 días', '1 mes', '2 meses']);
  igual(siguienteIntervalo(undefined, 'otra'), 0);
});

// --- mazo y cola ---

const anadidas = {
  v_dom: { clave: 'v_dom', vocab_id: 'v_dom', ru: 'дом', es: 'casa', clase: 'clase_00_ejemplo' },
  forma_zovut: { clave: 'forma_zovut', ru: 'зовут', ru_acento: 'зову́т', es: 'llaman', clase: 'clase_00_ejemplo' },
};

prueba('reunirTarjetas: vocabulario + añadidas desde el Lector, sin repetir', () => {
  const mazo = reunirTarjetas([ejemplo], anadidas);
  igual(mazo.length, 16);
  igual(mazo.find(t => t.clave === 'v_dom').origen, 'vocabulario');
  igual(mazo.find(t => t.clave === 'forma_zovut').origen, 'lector');
});

prueba('reunirTarjetas: una añadida del vocabulario de otra clase usa los datos actuales', () => {
  const vocabulario = new Map([['v_kot', { id: 'v_kot', ru: 'кот', ru_acento: 'ко́т', es: 'gato (corregido)', clase: 'clase_01' }]]);
  const mazo = reunirTarjetas([], { v_kot: { clave: 'v_kot', vocab_id: 'v_kot', ru: 'кот', es: 'gato', clase: 'clase_01' } }, vocabulario);
  igual([mazo[0].es, mazo[0].clave, mazo[0].origen], ['gato (corregido)', 'v_kot', 'lector']);
});

const mazoFalso = n => Array.from({ length: n }, (_, i) => ({ clave: `v_${i}`, ru: `р${i}`, es: `e${i}` }));

prueba('colaDelDia: límite diario de nuevas, vencidas y modos separados', () => {
  const mazo = mazoFalso(30);
  let cola = colaDelDia(mazo, {}, 'ru-es', HOY);
  igual([cola.nuevas.length, cola.repasos.length, cola.nuevasRestantes], [NUEVAS_POR_DIA, 0, 10]);

  const estados = {
    'v_0|ru-es': { vence: '2026-10-10', primera: '2026-10-01' }, // atrasada
    'v_1|ru-es': { vence: HOY, primera: '2026-10-01' },
    'v_2|ru-es': { vence: '2026-10-20', primera: HOY },         // empezada hoy, no vence
    'v_3|es-ru': { vence: '2026-10-01', primera: HOY },         // otro modo
  };
  igual(nuevasEmpezadas(estados, 'ru-es', HOY), 1);
  cola = colaDelDia(mazo, estados, 'ru-es', HOY);
  igual(cola.repasos.map(t => t.clave), ['v_0', 'v_1']);
  igual(cola.nuevas.length, NUEVAS_POR_DIA - 1);
  cierto(cola.nuevas.some(t => t.clave === 'v_3'), 'v_3 es nueva en ru-es');
  igual(colaDelDia(mazo, estados, 'ru-es', HOY, { extra: 10 }).nuevas.length, 27);
});

prueba('intercalar reparte las nuevas entre los repasos', () => {
  igual(intercalar(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2']), ['r1', 'r2', 'n1', 'r3', 'r4', 'n2']);
  igual(intercalar([], ['n1']), ['n1']);
  igual(intercalar(['r1'], []), ['r1']);
});
