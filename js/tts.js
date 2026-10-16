// Audio en ruso con la Web Speech API (speechSynthesis). Elige la mejor voz
// rusa disponible y evita los fallos habituales de Chrome (voces que llegan
// tarde, síntesis «pausada», frase nueva perdida justo después de cancelar).

const sintesis = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let promesaVoces = null;
let actual = null; // referencia a la frase en curso: si no, Chrome a veces no emite onend

const esRusa = v => /^ru([-_]|$)/i.test(v.lang);

/**
 * Elige la mejor voz rusa de la lista, o null si no hay ninguna. Con conexión
 * se prefieren las voces neuronales en línea (Edge, Chrome); sin conexión,
 * las instaladas en el dispositivo.
 */
export function elegirVoz(voces, { enLinea = true } = {}) {
  const rusas = voces.filter(esRusa);
  if (!rusas.length) return null;
  const puntos = v => {
    let p = 0;
    if (/^ru[-_]ru$/i.test(v.lang)) p += 1;
    if (/google/i.test(v.name)) p += 2;
    if (/natural|online|neural/i.test(v.name)) p += 3;
    if (!enLinea) p += v.localService ? 10 : -10;
    return p;
  };
  return rusas.reduce((mejor, v) => (puntos(v) > puntos(mejor) ? v : mejor));
}

/** Espera a que el navegador publique sus voces (máx. 2,5 s). */
export function cargarVoces() {
  if (!sintesis) return Promise.resolve([]);
  promesaVoces ??= new Promise(resolver => {
    const intentar = () => {
      const voces = sintesis.getVoices();
      if (voces.length) resolver(voces);
    };
    intentar();
    sintesis.addEventListener('voiceschanged', intentar);
    setTimeout(() => resolver(sintesis.getVoices()), 2500);
  });
  return promesaVoces;
}

/** 'ok' | 'sin-voz' (hay voces, ninguna rusa) | 'desconocido' (no publica voces) | 'no-soportado'. */
export async function estadoVoz() {
  if (!sintesis) return 'no-soportado';
  const voces = await cargarVoces();
  if (!voces.length) return 'desconocido';
  return voces.some(esRusa) ? 'ok' : 'sin-voz';
}

/**
 * Lee `texto` en ruso. Corta lo que estuviera sonando. Devuelve una promesa
 * que se resuelve con true si terminó de leerse.
 */
export async function hablar(texto, { velocidad = 1, alEmpezar, alTerminar } = {}) {
  if (!sintesis) {
    alTerminar?.();
    return false;
  }
  await cargarVoces();
  const ocupada = sintesis.speaking || sintesis.pending;
  sintesis.cancel();
  return new Promise(resolver => {
    const u = new SpeechSynthesisUtterance(texto);
    const voz = elegirVoz(sintesis.getVoices(), { enLinea: navigator.onLine });
    u.lang = voz ? voz.lang.replace('_', '-') : 'ru-RU';
    if (voz) u.voice = voz;
    u.rate = velocidad;

    let terminada = false;
    const fin = ok => {
      if (terminada) return;
      terminada = true;
      if (actual === u) actual = null;
      alTerminar?.();
      resolver(ok);
    };
    u.onstart = () => alEmpezar?.();
    u.onend = () => fin(true);
    u.onerror = () => fin(false);
    actual = u;

    const decir = () => {
      sintesis.resume();
      sintesis.speak(u);
    };
    // Tras cancel(), Chrome puede descartar una frase que se pida en el mismo instante.
    if (ocupada) setTimeout(decir, 60);
    else decir();
  });
}

export function detener() {
  sintesis?.cancel();
}
