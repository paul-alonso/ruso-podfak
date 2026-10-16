// Mini arnés de pruebas sin dependencias. Los resultados se muestran en la
// página y en <pre id="texto-plano"> (lo lee herramientas/validar.ps1 -Tests).

const pruebas = [];

export function prueba(nombre, fn) {
  pruebas.push({ nombre, fn });
}

export function igual(real, esperado, contexto = '') {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${contexto ? contexto + ': ' : ''}se esperaba ${b}, se obtuvo ${a}`);
}

export function cierto(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

export async function ejecutar() {
  const lineas = [];
  let fallos = 0;
  const pre = document.getElementById('texto-plano');
  for (const { nombre, fn } of pruebas) {
    pre.textContent = [...lineas, `… ${nombre}`].join('\n');
    try {
      await fn();
      lineas.push(`✓ ${nombre}`);
    } catch (e) {
      fallos++;
      lineas.push(`✗ ${nombre}\n    ${e.message}`);
    }
  }
  // Ver tests.html: se devuelve la configuración de sincronización apartada.
  if (window.syncApartado) localStorage.setItem('podfak_sync', window.syncApartado);
  lineas.push('', `${pruebas.length - fallos} de ${pruebas.length} pruebas correctas`);
  pre.textContent = lineas.join('\n');
  document.body.dataset.errores = fallos;
  document.body.dataset.estado = 'listo';
}
