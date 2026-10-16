"""Genera data/indice.md: un resumen compacto de todas las clases.

Lee data/clases/clase_NN.json (la clase de ejemplo no cuenta) y escribe:
encabezado, clases, temas de gramática con sus repasos, vocabulario,
páginas del libro cubiertas por урок y alertas de incoherencias.

Sirve para que quien genere la próxima clase sepa qué ids, temas y páginas
ya existen. Solo usa la biblioteca estándar de Python.

Uso:  python herramientas/indice.py
      python herramientas/indice.py --datos data/clases --salida data/indice.md --fecha 2026-10-16
"""

import argparse
import datetime
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ACENTO = '\u0301'
PATRON_ARCHIVO = re.compile(r'^clase_(\d+)\.json$')
UMBRAL_TEMAS = 0.8  # parecido (0–1) a partir del cual dos temas distintos se avisan


# --- carga ---

def cargar_clases(carpeta):
    """Devuelve (clases ordenadas por número, problemas de lectura)."""
    clases, problemas = [], []
    archivos = []
    for ruta in Path(carpeta).glob('clase_*.json'):
        m = PATRON_ARCHIVO.match(ruta.name)
        if m:
            archivos.append((int(m.group(1)), ruta))
    for numero, ruta in sorted(archivos):
        try:
            datos = json.loads(ruta.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError) as e:
            problemas.append(f'{ruta.name}: no se pudo leer ({e}).')
            continue
        if not isinstance(datos, dict):
            problemas.append(f'{ruta.name}: no es un objeto JSON.')
            continue
        datos['_numero'] = numero
        datos['_archivo'] = ruta.name
        clases.append(datos)
    return clases, problemas


def lista(clase, campo):
    v = clase.get(campo)
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


# --- normalización ---

def sin_acento(texto):
    """Quita el acento ruso (U+0301 combinante); deja las tildes del español."""
    return str(texto).replace(ACENTO, '')


def sin_tildes(texto):
    """Quita también las tildes latinas (á → a), pero no la breve de й ni la diéresis de ё."""
    return unicodedata.normalize('NFC', unicodedata.normalize('NFD', str(texto)).replace(ACENTO, ''))


def palabra_normal(ru):
    return sin_acento(ru).strip().lower()


def tema_limpio(tema):
    """Quita las referencias entre paréntesis («(p. 37)», «(repaso)») y los espacios de más."""
    t = re.sub(r'\s*\([^)]*\)', '', str(tema))
    return re.sub(r'\s+', ' ', t).strip(' .;,') or str(tema).strip()


def tema_normal(tema):
    """Clave para agrupar temas: sin paréntesis, acentos, mayúsculas ni puntuación; ё = е."""
    t = sin_tildes(tema_limpio(tema)).lower().replace('ё', 'е')
    t = re.sub(r'[^\w\[\]]+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


# --- páginas ---

def es_entero(v):
    return isinstance(v, int) and not isinstance(v, bool)


def paginas_de(clase):
    """{урок: {páginas}} a partir del campo "paginas": [{"urok": 1, "desde": 7, "hasta": 12}, …].

    Los tramos mal escritos se ignoran (el validador ya los marca como error)."""
    resultado = {}
    tramos = clase.get('paginas')
    for t in tramos if isinstance(tramos, list) else []:
        if not isinstance(t, dict) or not all(es_entero(t.get(k)) for k in ('urok', 'desde', 'hasta')):
            continue
        if t['desde'] <= t['hasta']:
            resultado.setdefault(t['urok'], set()).update(range(t['desde'], t['hasta'] + 1))
    return resultado


def rangos(numeros):
    """[1, 2, 3, 5] → '1–3, 5'."""
    numeros = sorted(numeros)
    partes, i = [], 0
    while i < len(numeros):
        j = i
        while j + 1 < len(numeros) and numeros[j + 1] == numeros[j] + 1:
            j += 1
        partes.append(str(numeros[i]) if i == j else f'{numeros[i]}–{numeros[j]}')
        i = j + 1
    return ', '.join(partes)


def paginas_texto(por_urok, urok_clase):
    """«pp. 12–22; У2 p. 24»: las páginas del урок de la clase van sin repetir el урок."""
    def una(u, ps):
        prefijo = '' if u == urok_clase else f'У{u} '
        return prefijo + ('p. ' if len(ps) == 1 else 'pp. ') + rangos(ps)
    orden = sorted(por_urok.items(), key=lambda x: (x[0] != urok_clase, x[0] is None, x[0] or 0))
    return '; '.join(una(u, ps) for u, ps in orden)


# --- secciones ---

def celda(texto):
    return str(texto).replace('|', '\\|').replace('\n', ' ').strip()


def tema_de_clase(clase):
    corto = clase.get('tema_corto')
    if isinstance(corto, str) and corto.strip():
        return corto.strip()
    return tema_limpio(clase.get('titulo', '')) + ' *'


def seccion_clases(clases):
    filas = ['## Clases', '', 'N | fecha | урок y páginas | tema_corto', '---|---|---|---']
    sin_corto = False
    for c in clases:
        tema = tema_de_clase(c)
        sin_corto = sin_corto or tema.endswith(' *')
        pags = paginas_texto(paginas_de(c), c.get('urok'))
        urok = f"У{c.get('urok', '?')}" + (f' · {pags}' if pags else '')
        filas.append(' | '.join([str(c['_numero']), c.get('fecha') or 'sin fecha', celda(urok), celda(tema)]))
    if sin_corto:
        filas += ['', '\\* Sin `tema_corto`: se muestra el `titulo`.']
    return filas


def agrupar_temas(clases):
    """{clave: {'nombre', 'intro': [n], 'repaso': [n]}} en orden de aparición."""
    temas = {}
    for c in clases:
        for g in lista(c, 'gramatica'):
            if not isinstance(g.get('tema'), str) or not g['tema'].strip():
                continue
            clave = tema_normal(g['tema'])
            t = temas.setdefault(clave, {'nombre': sin_acento(tema_limpio(g['tema'])), 'intro': [], 'repaso': []})
            destino = t['repaso'] if g.get('repaso') is True else t['intro']
            if c['_numero'] not in destino:
                destino.append(c['_numero'])
    return temas


def seccion_temas(temas):
    filas = ['## Temas', '', 'tema → introducido en → repasado en']
    for t in temas.values():
        if t['intro']:
            intro = str(t['intro'][0]) + (f" (también {', '.join(map(str, t['intro'][1:]))})" if len(t['intro']) > 1 else '')
        else:
            intro = '— (solo repaso)'
        repaso = ', '.join(map(str, t['repaso'])) or '—'
        filas.append(f"- {t['nombre']} → {intro} → {repaso}")
    return filas


def agrupar_vocabulario(clases):
    """{vocab_id: [(clase, ru, ru_acento, es)]}."""
    vocab = {}
    for c in clases:
        for v in lista(c, 'vocabulario'):
            vid = v.get('id')
            if isinstance(vid, str) and vid:
                vocab.setdefault(vid, []).append((c['_numero'], str(v.get('ru', '')), str(v.get('ru_acento') or v.get('ru', '')), str(v.get('es', ''))))
    return vocab


def seccion_vocabulario(vocab):
    filas = ['## Vocabulario', '', 'vocab_id | ruso | español | clases', '---|---|---|---']
    for vid in sorted(vocab):
        usos = vocab[vid]
        clases = sorted({n for n, *_ in usos})
        _, _, acento, es = usos[0]
        filas.append(' | '.join([vid, celda(acento), celda(es), ', '.join(map(str, clases))]))
    return filas


def seccion_paginas(clases):
    por_urok = {}
    for c in clases:
        for u, ps in paginas_de(c).items():
            por_urok.setdefault(u, set()).update(ps)
    filas = ['## Páginas del libro', '']
    if not por_urok:
        return filas + ['(Ninguna clase tiene el campo `paginas`.)']
    for u in sorted(por_urok, key=lambda x: (x is None, x or 0)):
        ps = por_urok[u]
        huecos = sorted(set(range(min(ps), max(ps) + 1)) - ps)
        filas.append(f'- Урок {u}: {rangos(ps)}' + (f' (huecos: {rangos(huecos)})' if huecos else ''))
    return filas


def alertas(clases, vocab, temas, problemas):
    salida = list(problemas)

    # Clases sin páginas del libro.
    sin_paginas = [str(c['_numero']) for c in clases if not paginas_de(c)]
    if sin_paginas:
        salida.append(f"Sin `paginas` (o con todos los tramos mal escritos): clase {', '.join(sin_paginas)}.")

    # Misma palabra rusa con distinto vocab_id.
    por_palabra = {}
    for vid, usos in vocab.items():
        for n, ru, _, _ in usos:
            por_palabra.setdefault(palabra_normal(ru), {}).setdefault(vid, set()).add(n)
    for ru, ids in sorted(por_palabra.items()):
        if len(ids) > 1:
            detalle = '; '.join(f"{vid} (clase {', '.join(map(str, sorted(ns)))})" for vid, ns in sorted(ids.items()))
            salida.append(f'Misma palabra «{ru}» con distinto vocab_id: {detalle}.')

    # Mismo vocab_id con distinta palabra.
    for vid in sorted(vocab):
        formas = {}
        for n, ru, _, _ in vocab[vid]:
            formas.setdefault(palabra_normal(ru), set()).add(n)
        if len(formas) > 1:
            detalle = '; '.join(f"«{ru}» (clase {', '.join(map(str, sorted(ns)))})" for ru, ns in sorted(formas.items()))
            salida.append(f'Mismo vocab_id {vid} con distinta palabra: {detalle}.')

    # Temas casi iguales escritos distinto.
    claves = list(temas)
    for i, a in enumerate(claves):
        for b in claves[i + 1:]:
            if parecidos(a, b):
                ca = sorted(set(temas[a]['intro'] + temas[a]['repaso']))
                cb = sorted(set(temas[b]['intro'] + temas[b]['repaso']))
                salida.append(f"Temas casi iguales: «{temas[a]['nombre']}» (clase {', '.join(map(str, ca))}) "
                              f"y «{temas[b]['nombre']}» (clase {', '.join(map(str, cb))}).")

    filas = ['## Alertas', '']
    return filas + ([f'- {a}' for a in salida] or ['Ninguna.'])


def parecidos(a, b):
    if a == b:
        return False
    corto, largo = sorted((a, b), key=len)
    if len(corto) >= 10 and largo.startswith(corto):
        return True
    # Parecido letra a letra y además en las palabras: «о atona а» y «е atona и» no lo son.
    # Cada palabra del más corto debe tener una casi igual en el otro («la» ~ «las»).
    if difflib.SequenceMatcher(None, a, b).ratio() < UMBRAL_TEMAS:
        return False
    otras = largo.split()
    return all(any(difflib.SequenceMatcher(None, p, q).ratio() >= 0.75 for q in otras) for p in corto.split())


# --- documento ---

def generar(clases, fecha, problemas=()):
    numeros = [c['_numero'] for c in clases]
    if numeros:
        rango = f'clases {numeros[0]}–{numeros[-1]} ({len(numeros)})' if len(numeros) > 1 else f'clase {numeros[0]}'
        proxima = f'clase_{numeros[-1] + 1:02d}'
    else:
        rango, proxima = 'ninguna clase', 'clase_01'
    temas = agrupar_temas(clases)
    vocab = agrupar_vocabulario(clases)
    partes = [
        ['# Índice de clases', '',
         f'Generado {fecha} · {rango} · próxima: {proxima}', '',
         'Archivo generado por `herramientas/indice.py`; no editar a mano.'],
        seccion_clases(clases),
        seccion_temas(temas),
        seccion_vocabulario(vocab),
        seccion_paginas(clases),
        alertas(clases, vocab, temas, problemas),
    ]
    return '\n\n'.join('\n'.join(p) for p in partes) + '\n'


def main(argv=None):
    p = argparse.ArgumentParser(description='Genera data/indice.md a partir de data/clases/*.json.')
    p.add_argument('--datos', default=str(RAIZ / 'data' / 'clases'))
    p.add_argument('--salida', default=str(RAIZ / 'data' / 'indice.md'))
    p.add_argument('--fecha', default=datetime.date.today().isoformat())
    args = p.parse_args(argv)

    clases, problemas = cargar_clases(args.datos)
    texto = generar(clases, args.fecha, problemas)
    Path(args.salida).write_text(texto, encoding='utf-8', newline='\n')
    n_alertas = sum(1 for linea in texto.split('## Alertas', 1)[1].splitlines() if linea.startswith('- '))
    print(f'{args.salida}: {len(clases)} clases, {n_alertas} alertas.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
