// Teclado cirílico opcional (distribución ЙЦУКЕН) para escribir en ruso sin
// instalar un teclado en el sistema. Lo usan Traducción y, en la fase 4, el
// dictado de Escucha.
//
// - En pantalla: las teclas escriben en el campo sin quitarle el foco, y
//   inputmode="none" evita que se abra además el teclado del móvil.
// - En el PC: mientras está activo, el teclado físico escribe en cirílico
//   según la posición de cada tecla (Q → й, W → ц, Ñ/; → ж…).

import { h } from './comun.js';

const FILAS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбюё'];

/** event.code → letra en ЙЦУКЕН (independiente de la distribución del sistema). */
export const POR_POSICION = Object.fromEntries([
  ...[...'qwertyuiop'].map((l, i) => [`Key${l.toUpperCase()}`, 'йцукенгшщз'[i]]),
  ['BracketLeft', 'х'], ['BracketRight', 'ъ'],
  ...[...'asdfghjkl'].map((l, i) => [`Key${l.toUpperCase()}`, 'фывапролд'[i]]),
  ['Semicolon', 'ж'], ['Quote', 'э'],
  ...[...'zxcvbnm'].map((l, i) => [`Key${l.toUpperCase()}`, 'ячсмить'[i]]),
  ['Comma', 'б'], ['Period', 'ю'], ['Backquote', 'ё'],
]);

function escribir(campo, texto) {
  campo.setRangeText(texto, campo.selectionStart, campo.selectionEnd, 'end');
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

function borrar(campo) {
  let { selectionStart: a, selectionEnd: b } = campo;
  if (a === b) {
    if (a === 0) return;
    a = [...campo.value.slice(0, a)].slice(0, -1).join('').length; // no partir pares sustitutos
  }
  campo.setRangeText('', a, b, 'end');
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Crea el teclado para `campo` (input o textarea). Devuelve
 * { elemento, activar(bool) }; inactivo, el teclado está oculto y el campo
 * se comporta con normalidad.
 */
export function crearTeclado(campo) {
  let activo = false;
  const tecla = (texto, accion, extra = {}) => h('button', { type: 'button', class: 'tecla', ...extra, 'data-accion': accion }, texto);

  const elemento = h('div', { class: 'teclado', role: 'group', 'aria-label': 'Teclado ruso', hidden: true },
    FILAS.map((fila, i) => h('div', { class: 'teclado-fila' },
      [...fila].map(l => tecla(l, l, { lang: 'ru' })),
      i === 2 && tecla('⌫', 'borrar', { class: 'tecla ancha', 'aria-label': 'Borrar' }))),
    h('div', { class: 'teclado-fila' },
      tecla('-', '-'),
      tecla('espacio', ' ', { class: 'tecla espacio' }),
      tecla('?', '?')));

  // Que tocar una tecla no quite el foco al campo (ni cierre el teclado del sistema).
  elemento.addEventListener('pointerdown', e => { if (e.target.closest('.tecla')) e.preventDefault(); });
  elemento.addEventListener('mousedown', e => { if (e.target.closest('.tecla')) e.preventDefault(); });
  elemento.addEventListener('click', e => {
    const b = e.target.closest('.tecla');
    if (!b || campo.readOnly || campo.disabled) return;
    if (b.dataset.accion === 'borrar') borrar(campo);
    else escribir(campo, b.dataset.accion);
  });

  campo.addEventListener('keydown', e => {
    if (!activo || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const letra = POR_POSICION[e.code];
    // Si el sistema ya escribe en cirílico (teclado ruso instalado), no se toca nada.
    // 'Dead': en el teclado español, ´ y ` (posiciones de э y х) son teclas muertas.
    if (!letra || (e.key.length !== 1 && e.key !== 'Dead') || /\p{Script=Cyrillic}/u.test(e.key)) return;
    e.preventDefault();
    escribir(campo, e.shiftKey ? letra.toUpperCase() : letra);
  });

  return {
    elemento,
    activar(si) {
      activo = si;
      elemento.hidden = !si;
      if (si) campo.setAttribute('inputmode', 'none');
      else campo.removeAttribute('inputmode');
    },
  };
}
