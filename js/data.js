// Carga y validación de las clases (esquema v1, ver PROMPT_GENERAR_JSON.md).
// Todas las herramientas leen los datos a través de este módulo: si una clase
// tiene errores se descarta con un informe claro, y el resto sigue funcionando.

export const VERSION_ESQUEMA = 1;
const URL_DATOS = new URL('../data/', import.meta.url);

// ---------------------------------------------------------------------------
// Utilidades de texto ruso
// ---------------------------------------------------------------------------

const MARCAS_ACENTO = /[́̀]/g;
const VOCALES = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
const LETRA = /[\p{L}\p{N}]/u;
const PARTE_DE_PALABRA = /[\p{L}\p{N}̀́]/u;
const PALABRAS = /[\p{L}\p{N}̀́]+/gu;
const CIRILICO = /\p{Script=Cyrillic}/u;
const LATINO = /\p{Script=Latin}/u;

/** Quita solo las marcas de acento. Conserva й y ё (no usa NFD + borrar diacríticos). */
export function quitarAcentos(s) {
  return s.replace(MARCAS_ACENTO, '').normalize('NFC');
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** id determinista de una palabra de vocabulario: «Меня зовут» → v_menya_zovut. */
export function idVocabulario(ru) {
  const base = [...quitarAcentos(ru).toLowerCase()].map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return 'v_' + base;
}

/**
 * Divide una frase en segmentos siguiendo sus palabras (tokens) en orden.
 * Devuelve { segmentos: [{ texto, token? }] } o { error: { indice, mensaje } }.
 * Espacios y puntuación quedan en segmentos sin `token`.
 */
export function segmentar(frase, palabras) {
  const segmentos = [];
  let pos = 0;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    const j = frase.indexOf(p, pos);
    if (j === -1) {
      const pista = frase.toLowerCase().includes(p.toLowerCase(), pos) ? ' (revisa mayúsculas)' : '';
      const tras = i ? ` después de "${palabras[i - 1]}"` : '';
      return { error: { indice: i, mensaje: `"${p}" no aparece en la frase${tras}${pista}` } };
    }
    const hueco = frase.slice(pos, j);
    if (LETRA.test(hueco)) {
      return { error: { indice: i, mensaje: `hay texto sin tokenizar antes de "${p}": "${hueco.trim()}"` } };
    }
    const siguiente = frase[j + p.length];
    if (siguiente && PARTE_DE_PALABRA.test(siguiente)) {
      return { error: { indice: i, mensaje: `"${p}" no es una palabra completa de la frase` } };
    }
    if (hueco) segmentos.push({ texto: hueco });
    segmentos.push({ texto: p, token: i });
    pos = j + p.length;
  }
  const resto = frase.slice(pos);
  if (LETRA.test(resto)) {
    return { error: { indice: palabras.length, mensaje: `hay texto sin tokenizar al final: "${resto.trim()}"` } };
  }
  if (resto) segmentos.push({ texto: resto });
  return { segmentos };
}

// ---------------------------------------------------------------------------
// Nombres y títulos de clase
// ---------------------------------------------------------------------------

const RE_NOMBRE_CLASE = /^clase_(\d+)(?:_(.+))?$/;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** clase_07 → «Clase 7»; clase_00_ejemplo → «Clase 0 (ejemplo)». */
export function nombreClase(id) {
  const m = RE_NOMBRE_CLASE.exec(id);
  if (!m) return id;
  return `Clase ${Number(m[1])}${m[2] ? ` (${m[2].replace(/_/g, ' ')})` : ''}`;
}

/** '2026-10-07' → «07 oct»; sin fecha → «sin fecha». Abreviaturas fijas (no dependen del navegador). */
export function fechaCorta(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  return m ? `${m[3]} ${MESES[Number(m[2]) - 1]}` : 'sin fecha';
}

/**
 * Título visible de una clase (o de su entrada del índice):
 * «Clase N · DD mmm · Урок X · tema», con tema = tema_corto o, si no hay, titulo.
 * Con { urok: false } se omite el урок (p. ej. dentro de un grupo por урок).
 */
export function tituloClase(c, { urok = true } = {}) {
  return [nombreClase(c.id), fechaCorta(c.fecha), urok && `Урок ${c.urok}`, c.tema_corto || c.titulo]
    .filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Informe de problemas
// ---------------------------------------------------------------------------

export class Informe {
  constructor(origen) {
    this.origen = origen;
    this.errores = [];
    this.avisos = [];
  }
  error(ruta, mensaje) { this.errores.push({ ruta, mensaje }); }
  aviso(ruta, mensaje) { this.avisos.push({ ruta, mensaje }); }
  get ok() { return this.errores.length === 0; }
  /** Líneas legibles: «✗ clase_03 → textos[1].frases[2].tokens[0].es: falta el campo…» */
  lineas() {
    const linea = (marca, p) => `${marca} ${this.origen} → ${p.ruta}: ${p.mensaje}`;
    return [...this.errores.map(p => linea('✗', p)), ...this.avisos.map(p => linea('⚠', p))];
  }
}

// ---------------------------------------------------------------------------
// Comprobaciones genéricas
// ---------------------------------------------------------------------------

const TIPOS_CAMPO = {
  texto: { es: v => typeof v === 'string', nombre: 'un texto' },
  entero: { es: v => Number.isInteger(v), nombre: 'un número entero' },
  lista: { es: v => Array.isArray(v), nombre: 'una lista [ ]' },
};

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unir = (ruta, nombre) => (ruta ? `${ruta}.${nombre}` : nombre);

function describir(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'nada (falta el campo)';
  if (Array.isArray(v)) return 'una lista';
  if (typeof v === 'string') return `el texto "${v.length > 40 ? v.slice(0, 40) + '…' : v}"`;
  if (typeof v === 'number') return `el número ${v}`;
  if (typeof v === 'object') return 'un objeto';
  return String(v);
}

/** Lee y comprueba un campo. Devuelve su valor si es válido, o undefined. */
function campo(inf, obj, nombre, ruta, tipo, { opcional = false, vacio = false } = {}) {
  const r = unir(ruta, nombre);
  const v = obj[nombre];
  if (v === undefined || (opcional && v === null)) {
    if (!opcional) inf.error(r, `falta el campo (debe ser ${TIPOS_CAMPO[tipo].nombre})`);
    return undefined;
  }
  if (!TIPOS_CAMPO[tipo].es(v)) {
    inf.error(r, `debe ser ${TIPOS_CAMPO[tipo].nombre}, pero es ${describir(v)}`);
    return undefined;
  }
  if (tipo === 'texto' && !vacio && v.trim() === '') {
    inf.error(r, 'no puede estar vacío');
    return undefined;
  }
  return v;
}

/** Comprueba una lista de objetos y valida cada elemento. Devuelve la lista o undefined. */
function lista(inf, obj, nombre, ruta, validarElemento, { opcional = false, noVacia = false } = {}) {
  const l = campo(inf, obj, nombre, ruta, 'lista', { opcional });
  if (l === undefined) return undefined;
  const r = unir(ruta, nombre);
  if (noVacia && l.length === 0) inf.error(r, 'la lista no puede estar vacía');
  l.forEach((el, i) => {
    if (esObjeto(el)) validarElemento(inf, el, `${r}[${i}]`);
    else inf.error(`${r}[${i}]`, `debe ser un objeto { }, pero es ${describir(el)}`);
  });
  return l;
}

function listaDeTextos(inf, obj, nombre, ruta, opciones = {}, alValidar) {
  const l = campo(inf, obj, nombre, ruta, 'lista', opciones);
  if (l === undefined) return;
  l.forEach((v, i) => {
    const r = `${unir(ruta, nombre)}[${i}]`;
    if (typeof v !== 'string' || v.trim() === '') inf.error(r, `debe ser un texto no vacío, pero es ${describir(v)}`);
    else if (alValidar) alValidar(v, r);
  });
}

function camposDesconocidos(inf, obj, permitidos, ruta) {
  for (const k of Object.keys(obj)) {
    if (!permitidos.includes(k)) inf.aviso(unir(ruta, k), 'campo desconocido (¿error de escritura?); se ignora');
  }
}

function idsUnicos(inf, elementos, ruta) {
  const vistos = new Map();
  (elementos ?? []).forEach((el, i) => {
    if (!esObjeto(el) || typeof el.id !== 'string') return;
    if (vistos.has(el.id)) inf.error(`${ruta}[${i}].id`, `"${el.id}" está repetido (ya se usa en ${ruta}[${vistos.get(el.id)}])`);
    else vistos.set(el.id, i);
  });
}

function comprobarFormatoId(inf, id, ruta, patron, descripcion) {
  if (id !== undefined && !patron.test(id)) inf.error(ruta, `"${id}" no tiene el formato ${descripcion}`);
}

function comprobarFecha(inf, fecha, ruta) {
  if (fecha === undefined) return;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    inf.error(ruta, `"${fecha}" no es una fecha válida con formato AAAA-MM-DD`);
  }
}

function comprobarUrok(inf, urok, ruta) {
  if (urok !== undefined && (urok < 1 || urok > 11)) inf.error(ruta, `debe estar entre 1 y 11, pero es ${urok}`);
}

const FUENTES = ['clase', 'libro'];

/** Campos opcionales de procedencia: fuente ("clase" | "libro") y, si se permite, repaso (true/false). */
function comprobarProcedencia(inf, obj, ruta, { repaso = false } = {}) {
  const fuente = campo(inf, obj, 'fuente', ruta, 'texto', { opcional: true });
  if (fuente !== undefined && !FUENTES.includes(fuente)) {
    inf.error(unir(ruta, 'fuente'), `debe ser "clase" o "libro", pero es "${fuente}"`);
  }
  if (repaso && obj.repaso !== undefined && obj.repaso !== null && typeof obj.repaso !== 'boolean') {
    inf.error(unir(ruta, 'repaso'), `debe ser true o false, pero es ${describir(obj.repaso)}`);
  }
}

const LARGO_TEMA_CORTO = 40;
const LARGO_TITULO = 50;

// ---------------------------------------------------------------------------
// Comprobaciones de texto ruso
// ---------------------------------------------------------------------------

function comprobarRuso(inf, texto, ruta, { acentos }) {
  for (const [palabra] of texto.matchAll(PALABRAS)) {
    if (CIRILICO.test(palabra) && LATINO.test(palabra)) {
      inf.error(ruta, `"${palabra}" mezcla letras latinas y cirílicas (¿una vocal latina con tilde en vez de vocal cirílica + U+0301?)`);
    }
  }
  if (/[´ˊ'’`]/.test(texto)) {
    inf.error(ruta, 'contiene un signo de acento suelto (´ \' ’); el acento debe ser U+0301 justo después de la vocal');
  }
  if (!acentos && /́/.test(texto)) {
    inf.error(ruta, 'no debe llevar acentos (van en el campo acentuado: ru_acento o a)');
  }
  if (acentos) comprobarAcentuacion(inf, texto, ruta);
}

function comprobarAcentuacion(inf, texto, ruta) {
  for (const [palabra] of texto.matchAll(PALABRAS)) {
    let acentos = 0;
    for (let k = 0; k < palabra.length; k++) {
      if (palabra[k] !== '́') continue;
      acentos++;
      const previa = palabra[k - 1];
      if (!previa || !VOCALES.includes(previa)) inf.error(ruta, `en "${palabra}" el acento no va justo después de una vocal`);
      else if (previa === 'ё' || previa === 'Ё') inf.aviso(ruta, `"${palabra}": la ё ya es tónica, sobra el acento`);
    }
    const vocales = [...palabra].filter(c => VOCALES.includes(c)).length;
    if (acentos > 1) inf.aviso(ruta, `"${palabra}" tiene ${acentos} acentos`);
    else if (acentos === 0 && vocales >= 2 && !/[ёЁ]/.test(palabra)) inf.aviso(ruta, `"${palabra}" no tiene el acento marcado`);
  }
}

function mismaBase(inf, sinAcento, conAcento, ruta, nombreSin) {
  const base = quitarAcentos(conAcento);
  if (base !== sinAcento) inf.error(ruta, `sin acentos queda "${base}", que no coincide con ${nombreSin} "${sinAcento}"`);
}

// ---------------------------------------------------------------------------
// Validación de una clase
// ---------------------------------------------------------------------------

const RE_ID_CLASE = /^clase_\d{2,}(_[a-z0-9]+)*$/;
const RE_ID_VOCAB = /^v_[a-z0-9]+(_[a-z0-9]+)*$/;
const TIPOS_PALABRA = ['sustantivo', 'verbo', 'adjetivo', 'adverbio', 'pronombre', 'numeral',
  'preposicion', 'conjuncion', 'particula', 'interjeccion', 'expresion'];
const GENEROS = ['m', 'f', 'n', 'pl'];

function validarGramatica(inf, g, r) {
  camposDesconocidos(inf, g, ['tema', 'explicacion', 'ejemplos', 'fuente', 'repaso'], r);
  comprobarProcedencia(inf, g, r, { repaso: true });
  campo(inf, g, 'tema', r, 'texto');
  campo(inf, g, 'explicacion', r, 'texto');
  listaDeTextos(inf, g, 'ejemplos', r);
}

function validarVocablo(inf, v, r) {
  camposDesconocidos(inf, v, ['id', 'ru', 'ru_acento', 'es', 'tipo', 'genero', 'nota', 'fuente'], r);
  comprobarProcedencia(inf, v, r);
  const ru = campo(inf, v, 'ru', r, 'texto');
  if (ru !== undefined) comprobarRuso(inf, ru, `${r}.ru`, { acentos: false });
  const ac = campo(inf, v, 'ru_acento', r, 'texto');
  if (ac !== undefined) {
    comprobarRuso(inf, ac, `${r}.ru_acento`, { acentos: true });
    if (ru !== undefined) mismaBase(inf, ru, ac, `${r}.ru_acento`, 'ru');
  }
  campo(inf, v, 'es', r, 'texto');

  const id = campo(inf, v, 'id', r, 'texto');
  comprobarFormatoId(inf, id, `${r}.id`, RE_ID_VOCAB, 'v_<transliteración> (solo a-z, 0-9 y _)');
  if (id !== undefined && RE_ID_VOCAB.test(id) && ru !== undefined) {
    const esperado = idVocabulario(ru);
    if (id !== esperado && !id.startsWith(esperado + '_')) {
      inf.aviso(`${r}.id`, `se esperaba "${esperado}" (o "${esperado}_<sufijo>" para homónimos)`);
    }
  }

  const tipo = campo(inf, v, 'tipo', r, 'texto');
  if (tipo !== undefined && !TIPOS_PALABRA.includes(tipo)) {
    inf.aviso(`${r}.tipo`, `"${tipo}" no es un tipo conocido (${TIPOS_PALABRA.join(', ')})`);
  }
  const genero = campo(inf, v, 'genero', r, 'texto', { opcional: true, vacio: true });
  if (genero) {
    if (!GENEROS.includes(genero)) inf.error(`${r}.genero`, `debe ser m, f, n o pl, pero es "${genero}"`);
  } else if (tipo === 'sustantivo') {
    inf.aviso(`${r}.genero`, 'los sustantivos deberían indicar el género (m, f, n o pl)');
  }
  campo(inf, v, 'nota', r, 'texto', { opcional: true, vacio: true });
}

function validarToken(inf, tk, r) {
  camposDesconocidos(inf, tk, ['t', 'a', 'lema', 'es', 'gram', 'vocab_id'], r);
  const t = campo(inf, tk, 't', r, 'texto');
  if (t !== undefined) {
    if (/[^\p{L}\p{N}-]/u.test(t)) inf.error(`${r}.t`, `"${t}" debe ser una sola palabra, sin espacios, acentos ni puntuación`);
    else comprobarRuso(inf, t, `${r}.t`, { acentos: false });
  }
  const a = campo(inf, tk, 'a', r, 'texto');
  if (a !== undefined) {
    comprobarRuso(inf, a, `${r}.a`, { acentos: true });
    if (t !== undefined) mismaBase(inf, t, a, `${r}.a`, 't');
  }
  const lema = campo(inf, tk, 'lema', r, 'texto');
  if (lema !== undefined) comprobarRuso(inf, lema, `${r}.lema`, { acentos: false });
  campo(inf, tk, 'es', r, 'texto');
  campo(inf, tk, 'gram', r, 'texto');
  const vocabId = campo(inf, tk, 'vocab_id', r, 'texto', { opcional: true });
  comprobarFormatoId(inf, vocabId, `${r}.vocab_id`, RE_ID_VOCAB, 'v_<transliteración>');
}

function validarFrase(inf, f, r) {
  camposDesconocidos(inf, f, ['id', 'ru', 'ru_acento', 'es', 'tokens', 'fuente'], r);
  comprobarProcedencia(inf, f, r);
  comprobarFormatoId(inf, campo(inf, f, 'id', r, 'texto'), `${r}.id`, /^f\d+$/, 'f1, f2, …');
  const ru = campo(inf, f, 'ru', r, 'texto');
  if (ru !== undefined) comprobarRuso(inf, ru, `${r}.ru`, { acentos: false });
  const ac = campo(inf, f, 'ru_acento', r, 'texto');
  if (ac !== undefined) {
    comprobarRuso(inf, ac, `${r}.ru_acento`, { acentos: true });
    if (ru !== undefined) mismaBase(inf, ru, ac, `${r}.ru_acento`, 'ru');
  }
  campo(inf, f, 'es', r, 'texto');

  const tokens = lista(inf, f, 'tokens', r, validarToken, { noVacia: true });
  if (!tokens || ru === undefined) return;
  const rutaToken = i => (i < tokens.length ? `${r}.tokens[${i}]` : `${r}.tokens`);
  const textosOk = tokens.every(tk => esObjeto(tk) && typeof tk.t === 'string' && tk.t.trim());
  if (!textosOk) return;
  const seg = segmentar(ru, tokens.map(tk => tk.t));
  if (seg.error) {
    inf.error(rutaToken(seg.error.indice), seg.error.mensaje);
    return;
  }
  // Los tokens acentuados deben reconstruir ru_acento exactamente igual.
  const acentosOk = tokens.every(tk => typeof tk.a === 'string' && quitarAcentos(tk.a) === tk.t);
  if (ac !== undefined && quitarAcentos(ac) === ru && acentosOk) {
    const segA = segmentar(ac, tokens.map(tk => tk.a));
    if (segA.error) {
      const i = Math.min(segA.error.indice, tokens.length - 1);
      inf.error(`${r}.tokens[${i}].a`, `no coincide con la acentuación de ru_acento (${segA.error.mensaje})`);
    }
  }
}

function validarTexto(inf, t, r) {
  camposDesconocidos(inf, t, ['id', 'titulo', 'frases', 'fuente', 'repaso'], r);
  comprobarProcedencia(inf, t, r, { repaso: true });
  comprobarFormatoId(inf, campo(inf, t, 'id', r, 'texto'), `${r}.id`, /^t\d+$/, 't1, t2, …');
  campo(inf, t, 'titulo', r, 'texto');
  const frases = lista(inf, t, 'frases', r, validarFrase, { noVacia: true });
  idsUnicos(inf, frases, `${r}.frases`);
}

function validarPractica(inf, p, r) {
  camposDesconocidos(inf, p, ['id', 'ru', 'ru_acento', 'es', 'alternativas_es', 'alternativas_ru'], r);
  comprobarFormatoId(inf, campo(inf, p, 'id', r, 'texto'), `${r}.id`, /^p\d+$/, 'p1, p2, …');
  const ru = campo(inf, p, 'ru', r, 'texto');
  if (ru !== undefined) comprobarRuso(inf, ru, `${r}.ru`, { acentos: false });
  const ac = campo(inf, p, 'ru_acento', r, 'texto', { opcional: true });
  if (ac !== undefined) {
    comprobarRuso(inf, ac, `${r}.ru_acento`, { acentos: true });
    if (ru !== undefined) mismaBase(inf, ru, ac, `${r}.ru_acento`, 'ru');
  }
  campo(inf, p, 'es', r, 'texto');
  listaDeTextos(inf, p, 'alternativas_es', r, { opcional: true });
  listaDeTextos(inf, p, 'alternativas_ru', r, { opcional: true },
    (v, rr) => comprobarRuso(inf, v, rr, { acentos: false }));
}

/**
 * Valida el objeto de una clase. `idEsperado` es el nombre del archivo
 * (sin .json); si se indica, el campo id debe coincidir.
 */
export function validarClase(datos, { idEsperado = null, origen = null } = {}) {
  const inf = new Informe(origen ?? idEsperado ?? (esObjeto(datos) && typeof datos.id === 'string' ? datos.id : 'clase'));
  if (!esObjeto(datos)) {
    inf.error('(raíz)', `el archivo debe contener un objeto { … }, pero contiene ${describir(datos)}`);
    return inf;
  }
  camposDesconocidos(inf, datos, ['schema_version', 'id', 'fecha', 'urok', 'titulo', 'tema_corto', 'profesor',
    'gramatica', 'vocabulario', 'textos', 'frases_practica'], '');

  const version = campo(inf, datos, 'schema_version', '', 'entero');
  if (version !== undefined && version !== VERSION_ESQUEMA) {
    inf.error('schema_version', `la versión ${version} no es compatible; esta app usa la versión ${VERSION_ESQUEMA}`);
  }
  const id = campo(inf, datos, 'id', '', 'texto');
  comprobarFormatoId(inf, id, 'id', RE_ID_CLASE, 'clase_NN (p. ej. clase_07)');
  if (id !== undefined && idEsperado && id !== idEsperado) {
    inf.error('id', `es "${id}", pero el archivo se llama "${idEsperado}.json"`);
  }
  comprobarFecha(inf, campo(inf, datos, 'fecha', '', 'texto', { opcional: true }), 'fecha');
  comprobarUrok(inf, campo(inf, datos, 'urok', '', 'entero'), 'urok');
  const titulo = campo(inf, datos, 'titulo', '', 'texto');
  const temaCorto = campo(inf, datos, 'tema_corto', '', 'texto', { opcional: true });
  campo(inf, datos, 'profesor', '', 'texto', { opcional: true });
  // El título visible es «Clase N · DD mmm · Урок X · tema»: un tema largo no cabe en el selector.
  if (temaCorto !== undefined && temaCorto.length > LARGO_TEMA_CORTO) {
    inf.aviso('tema_corto', `tiene ${temaCorto.length} caracteres; mejor ${LARGO_TEMA_CORTO} o menos para que se lea en el selector`);
  } else if (temaCorto === undefined && titulo !== undefined && titulo.length > LARGO_TITULO) {
    inf.aviso('tema_corto', `el titulo tiene ${titulo.length} caracteres: añade un tema_corto (≤ ${LARGO_TEMA_CORTO}) para el título de la clase`);
  }

  lista(inf, datos, 'gramatica', '', validarGramatica);
  const vocabulario = lista(inf, datos, 'vocabulario', '', validarVocablo);
  idsUnicos(inf, vocabulario, 'vocabulario');
  const textos = lista(inf, datos, 'textos', '', validarTexto);
  idsUnicos(inf, textos, 'textos');
  const practica = lista(inf, datos, 'frases_practica', '', validarPractica);
  idsUnicos(inf, practica, 'frases_practica');

  if (textos?.length === 0 && practica?.length === 0) {
    inf.aviso('textos', 'la clase no tiene frases: Lector, Traducción y Escucha no tendrán contenido');
  }
  return inf;
}

// ---------------------------------------------------------------------------
// Validación del índice y de las referencias entre clases
// ---------------------------------------------------------------------------

function validarEntradaIndice(inf, e, r) {
  camposDesconocidos(inf, e, ['id', 'urok', 'titulo', 'fecha'], r);
  comprobarFormatoId(inf, campo(inf, e, 'id', r, 'texto'), `${r}.id`, RE_ID_CLASE, 'clase_NN (p. ej. clase_07)');
  comprobarUrok(inf, campo(inf, e, 'urok', r, 'entero'), `${r}.urok`);
  campo(inf, e, 'titulo', r, 'texto');
  comprobarFecha(inf, campo(inf, e, 'fecha', r, 'texto', { opcional: true }), `${r}.fecha`);
}

export function validarIndice(datos) {
  const inf = new Informe('index.json');
  if (!Array.isArray(datos)) {
    inf.error('(raíz)', `debe ser una lista [ … ], pero es ${describir(datos)}`);
    return inf;
  }
  datos.forEach((e, i) => {
    if (esObjeto(e)) validarEntradaIndice(inf, e, `[${i}]`);
    else inf.error(`[${i}]`, `debe ser un objeto { }, pero es ${describir(e)}`);
  });
  idsUnicos(inf, datos, '');
  return inf;
}

/** Comprueba vocab_id entre clases ya validadas (en orden). Solo genera avisos. */
export function validarReferencias(clases) {
  const inf = new Informe('referencias entre clases');
  const definidos = new Map();
  for (const c of clases) {
    for (const v of c.vocabulario) {
      const previo = definidos.get(v.id);
      if (previo && previo.ru !== v.ru) {
        inf.aviso(`${c.id} → ${v.id}`, `"${v.ru}" usa el mismo id que "${previo.ru}" en ${previo.clase}`);
      } else if (!previo) {
        definidos.set(v.id, { ru: v.ru, clase: c.id });
      }
    }
  }
  for (const c of clases) {
    for (const t of c.textos) {
      for (const f of t.frases) {
        f.tokens.forEach((tk, i) => {
          if (tk.vocab_id && !definidos.has(tk.vocab_id)) {
            inf.aviso(`${c.id} → ${t.id}/${f.id}.tokens[${i}]`, `vocab_id "${tk.vocab_id}" no está en el vocabulario de ninguna clase`);
          }
        });
      }
    }
  }
  return inf;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

function normalizarNFC(v) {
  if (typeof v === 'string') return v.normalize('NFC');
  if (Array.isArray(v)) return v.map(normalizarNFC);
  if (esObjeto(v)) for (const k of Object.keys(v)) v[k] = normalizarNFC(v[k]);
  return v;
}

/** Parsea texto JSON. Devuelve { datos } o { problema } con línea y columna. */
export function parsearJSON(texto) {
  texto = texto.replace(/^﻿/, '');
  try {
    return { datos: normalizarNFC(JSON.parse(texto)) };
  } catch (e) {
    let linea, columna;
    const lc = /line (\d+) column (\d+)/.exec(e.message);
    const pos = /position (\d+)/.exec(e.message);
    if (lc) [linea, columna] = [+lc[1], +lc[2]];
    else if (pos) {
      const antes = texto.slice(0, +pos[1]).split('\n');
      [linea, columna] = [antes.length, antes[antes.length - 1].length + 1];
    }
    if (!linea) return { problema: `JSON mal formado: ${e.message}` };
    const contenido = (texto.split('\n')[linea - 1] ?? '').trim().slice(0, 80);
    return { problema: `JSON mal formado en la línea ${linea}, columna ${columna} («${contenido}»): ${e.message}` };
  }
}

async function leerJSON(url, nombre) {
  let resp;
  try {
    resp = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    return { problema: `no se pudo leer ${nombre} (${e.message}). ¿Abriste la app con un servidor local y no con doble clic?` };
  }
  if (resp.status === 404) return { problema: `no existe el archivo ${nombre}` };
  if (!resp.ok) return { problema: `error HTTP ${resp.status} al leer ${nombre}` };
  return parsearJSON(await resp.text());
}

/**
 * Solo para las pruebas: tests.html define podfakIndicePrueba con entradas que
 * se añaden al índice (la clase de ejemplo, que la app no muestra). Fuera de
 * tests.html y de sus iframes no tiene ningún efecto.
 */
function entradasDePrueba() {
  try {
    const lista = globalThis.window?.parent?.podfakIndicePrueba;
    return Array.isArray(lista) ? lista : [];
  } catch {
    return []; // padre de otro origen
  }
}

const ordenarPorId = (a, b) => a.id.localeCompare(b.id, 'es', { numeric: true });

/**
 * Carga data/index.json. Devuelve { indice, informe }; `indice` contiene solo
 * las entradas válidas, ordenadas por id.
 */
export async function cargarIndice() {
  const { datos: leidos, problema } = await leerJSON(new URL('index.json', URL_DATOS), 'data/index.json');
  if (problema) {
    const inf = new Informe('index.json');
    inf.error('(archivo)', problema);
    return { indice: [], informe: inf };
  }
  const extra = entradasDePrueba();
  const datos = Array.isArray(leidos) ? [...extra.filter(e => !leidos.some(d => d?.id === e.id)), ...leidos] : leidos;
  const informe = validarIndice(datos);
  const conError = i => informe.errores.some(p => p.ruta.startsWith(`[${i}]`));
  const indice = Array.isArray(datos) ? datos.filter((e, i) => !conError(i)) : [];
  // Si un id está repetido, se queda solo la primera entrada.
  const unicos = indice.filter((e, i) => indice.findIndex(o => o.id === e.id) === i);
  return { indice: unicos.sort(ordenarPorId), informe };
}

/**
 * Carga y valida data/clases/<id>.json. Devuelve { clase, informe }; `clase`
 * es null si hay errores. Si se pasa la entrada del índice, avisa de diferencias.
 */
export async function cargarClase(id, entradaIndice = null) {
  const nombre = `data/clases/${id}.json`;
  const { datos, problema } = await leerJSON(new URL(`clases/${id}.json`, URL_DATOS), nombre);
  if (problema) {
    const inf = new Informe(id);
    inf.error('(archivo)', problema);
    return { clase: null, informe: inf };
  }
  const informe = validarClase(datos, { idEsperado: id });
  if (entradaIndice && esObjeto(datos)) {
    for (const k of ['urok', 'titulo', 'fecha']) {
      if (datos[k] !== undefined && datos[k] !== entradaIndice[k]) {
        informe.aviso(k, `index.json dice ${describir(entradaIndice[k])}, pero la clase dice ${describir(datos[k])}`);
      }
    }
  }
  return { clase: informe.ok ? datos : null, informe };
}

/** Carga varias clases en paralelo. Devuelve { clases, informes } (clases válidas, en orden). */
export async function cargarClases(entradas) {
  const resultados = await Promise.all(entradas.map(e => cargarClase(e.id, e)));
  return {
    clases: resultados.map(r => r.clase).filter(Boolean),
    informes: resultados.map(r => r.informe),
  };
}
