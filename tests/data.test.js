import { prueba, igual, cierto } from './mini.js';
import {
  quitarAcentos, idVocabulario, segmentar, parsearJSON,
  validarClase, validarIndice, cargarIndice, cargarClase,
} from '../js/data.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
const copia = () => JSON.parse(JSON.stringify(ejemplo));

/** Valida una copia modificada del ejemplo y devuelve el informe. */
function validarCon(modificar, opciones = { idEsperado: 'clase_00_ejemplo' }) {
  const c = copia();
  modificar(c);
  return validarClase(c, opciones);
}

function tieneProblema(lista, ruta, fragmento) {
  return lista.some(p => p.ruta === ruta && p.mensaje.includes(fragmento));
}

function exigeError(inf, ruta, fragmento) {
  cierto(tieneProblema(inf.errores, ruta, fragmento),
    `se esperaba error en ${ruta} con «${fragmento}»; hubo: ${JSON.stringify(inf.errores)}`);
}

function exigeAviso(inf, ruta, fragmento) {
  cierto(inf.ok, `no se esperaban errores: ${JSON.stringify(inf.errores)}`);
  cierto(tieneProblema(inf.avisos, ruta, fragmento),
    `se esperaba aviso en ${ruta} con «${fragmento}»; hubo: ${JSON.stringify(inf.avisos)}`);
}

// --- Utilidades de texto ---

prueba('quitarAcentos quita U+0301 y conserva й y ё', () => {
  igual(quitarAcentos('Мо́й ёж'), 'Мой ёж');
  igual(quitarAcentos('й'), 'й');
});

prueba('idVocabulario translitera de forma determinista', () => {
  igual(idVocabulario('дом'), 'v_dom');
  igual(idVocabulario('сестра́'), 'v_sestra');
  igual(idVocabulario('Меня зовут'), 'v_menya_zovut');
  igual(idVocabulario('по-русски'), 'v_po_russki');
  igual(idVocabulario('объявление'), 'v_obyavlenie');
  igual(idVocabulario('щёлк'), 'v_shchyolk');
});

prueba('segmentar separa palabras, espacios y puntuación', () => {
  const { segmentos } = segmentar('Нет, мама там.', ['Нет', 'мама', 'там']);
  igual(segmentos.map(s => s.texto), ['Нет', ', ', 'мама', ' ', 'там', '.']);
  igual(segmentos.map(s => s.token), [0, undefined, 1, undefined, 2, undefined]);
});

prueba('segmentar detecta palabras sin tokenizar o incompletas', () => {
  cierto(segmentar('Это мой дом.', ['Это', 'дом']).error.mensaje.includes('sin tokenizar antes de "дом"'), 'hueco');
  cierto(segmentar('Это мой дом.', ['Это', 'мой']).error.mensaje.includes('al final'), 'final');
  cierto(segmentar('Это мой.', ['Это', 'мо']).error.mensaje.includes('no es una palabra completa'), 'parcial');
  cierto(segmentar('Это дом.', ['это', 'дом']).error.mensaje.includes('mayúsculas'), 'mayúsculas');
});

prueba('parsearJSON indica línea y columna de un JSON roto', () => {
  const { problema } = parsearJSON('{\n  "id": "clase_01",\n  "urok": 1,\n}');
  cierto(problema && problema.includes('línea 4'), problema);
});

prueba('parsearJSON acepta BOM', () => {
  igual(parsearJSON('﻿[1]').datos, [1]);
});

// --- Validación de clases ---

prueba('la clase de ejemplo es válida y sin avisos', () => {
  const inf = validarClase(copia(), { idEsperado: 'clase_00_ejemplo' });
  igual(inf.errores, []);
  igual(inf.avisos, []);
});

prueba('falta un campo de un token', () => {
  const inf = validarCon(c => delete c.textos[0].frases[0].tokens[2].es);
  exigeError(inf, 'textos[0].frases[0].tokens[2].es', 'falta el campo');
  cierto(inf.lineas()[0].startsWith('✗ clase_00_ejemplo → textos[0].frases[0].tokens[2].es'), inf.lineas()[0]);
});

prueba('tipo incorrecto', () => {
  exigeError(validarCon(c => { c.urok = '1'; }), 'urok', 'número entero');
  exigeError(validarCon(c => { c.vocabulario = {}; }), 'vocabulario', 'lista');
});

prueba('raíz que no es objeto', () => {
  exigeError(validarClase([1, 2]), '(raíz)', 'objeto');
});

prueba('versión de esquema incompatible', () => {
  exigeError(validarCon(c => { c.schema_version = 2; }), 'schema_version', 'no es compatible');
});

prueba('id distinto del nombre de archivo', () => {
  exigeError(validarCon(c => { c.id = 'clase_01'; }), 'id', 'clase_00_ejemplo.json');
});

prueba('fecha y urok fuera de rango', () => {
  exigeError(validarCon(c => { c.fecha = '2026-02-30'; }), 'fecha', 'AAAA-MM-DD');
  exigeError(validarCon(c => { c.urok = 12; }), 'urok', 'entre 1 y 11');
});

prueba('vocal latina con tilde en vez de acento cirílico', () => {
  exigeError(validarCon(c => { c.vocabulario[0].ru_acento = 'дóм'; }), 'vocabulario[0].ru_acento', 'mezcla letras latinas');
});

prueba('apóstrofo como acento', () => {
  exigeError(validarCon(c => { c.vocabulario[1].ru_acento = "ма'ма"; }), 'vocabulario[1].ru_acento', 'acento suelto');
});

prueba('acento en el campo sin acentos', () => {
  exigeError(validarCon(c => { c.vocabulario[0].ru = 'до́м'; }), 'vocabulario[0].ru', 'no debe llevar acentos');
});

prueba('ru_acento no coincide con ru', () => {
  exigeError(validarCon(c => { c.textos[0].frases[0].ru_acento = 'Э́то мо́я до́м.'; }),
    'textos[0].frases[0].ru_acento', 'no coincide');
});

prueba('acento de un token distinto del de ru_acento', () => {
  exigeError(validarCon(c => { c.textos[0].frases[2].tokens[2].a = 'мама́'; }),
    'textos[0].frases[2].tokens[2].a', 'acentuación de ru_acento');
});

prueba('palabra de la frase sin token', () => {
  exigeError(validarCon(c => { c.textos[0].frases[0].tokens.splice(1, 1); }),
    'textos[0].frases[0].tokens[1]', 'sin tokenizar antes de "дом"');
});

prueba('token con puntuación', () => {
  exigeError(validarCon(c => { c.textos[0].frases[0].tokens[2].t = 'дом.'; }),
    'textos[0].frases[0].tokens[2].t', 'una sola palabra');
});

prueba('ids repetidos', () => {
  exigeError(validarCon(c => { c.vocabulario[1].id = 'v_dom'; }), 'vocabulario[1].id', 'repetido');
  exigeError(validarCon(c => { c.textos[1].frases[1].id = 'f1'; }), 'textos[1].frases[1].id', 'repetido');
});

prueba('formato de id incorrecto', () => {
  exigeError(validarCon(c => { c.vocabulario[0].id = 'dom'; }), 'vocabulario[0].id', 'formato');
  exigeError(validarCon(c => { c.textos[0].id = 'texto1'; }), 'textos[0].id', 'formato');
});

prueba('género inválido', () => {
  exigeError(validarCon(c => { c.vocabulario[0].genero = 'masc'; }), 'vocabulario[0].genero', 'm, f, n o pl');
});

prueba('avisos: id de vocabulario no esperado, acento sin marcar, campo desconocido, tipo raro', () => {
  exigeAviso(validarCon(c => { c.vocabulario[0].id = 'v_casa'; }), 'vocabulario[0].id', '"v_dom"');
  exigeAviso(validarCon(c => { c.vocabulario[1].ru_acento = 'мама'; }), 'vocabulario[1].ru_acento', 'no tiene el acento');
  exigeAviso(validarCon(c => { c.vocabulario[0].ru_accento = 'до́м'; }), 'vocabulario[0].ru_accento', 'campo desconocido');
  exigeAviso(validarCon(c => { c.vocabulario[0].tipo = 'nombre'; }), 'vocabulario[0].tipo', 'no es un tipo conocido');
});

prueba('se permiten homónimos con sufijo en el id', () => {
  const inf = validarCon(c => { c.vocabulario[0].id = 'v_dom_casa'; });
  igual(inf.avisos, []);
});

// --- Índice y carga ---

prueba('validarIndice detecta ids repetidos y raíz incorrecta', () => {
  const entrada = { id: 'clase_01', urok: 1, titulo: 'x', fecha: '2026-10-01' };
  exigeError(validarIndice([entrada, entrada]), '[1].id', 'repetido');
  exigeError(validarIndice({}), '(raíz)', 'lista');
});

prueba('cargarIndice carga data/index.json', async () => {
  const { indice, informe } = await cargarIndice();
  cierto(informe.ok, informe.lineas().join('\n'));
  cierto(indice.some(e => e.id === 'clase_00_ejemplo'), 'las pruebas añaden clase_00_ejemplo al índice');
});

prueba('data/index.json no incluye la clase de ejemplo (la app no la muestra)', async () => {
  const datos = await (await fetch('../data/index.json', { cache: 'no-cache' })).json();
  cierto(Array.isArray(datos) && datos.length > 0, 'index.json vacío');
  cierto(!datos.some(e => /_ejemplo$/.test(e.id)), 'clase_00_ejemplo sigue en index.json');
});

prueba('cargarClase carga el ejemplo', async () => {
  const { clase, informe } = await cargarClase('clase_00_ejemplo');
  cierto(clase && informe.ok, informe.lineas().join('\n'));
});

prueba('cargarClase de un archivo inexistente no rompe y explica el problema', async () => {
  const { clase, informe } = await cargarClase('clase_99');
  igual(clase, null);
  exigeError(informe, '(archivo)', 'no existe el archivo data/clases/clase_99.json');
});
