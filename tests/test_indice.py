"""Pruebas de herramientas/indice.py.

Uso:  python -m unittest discover -s tests -p "test_*.py"
"""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'herramientas'))
import indice  # noqa: E402

A = '́'


def palabra(vid, ru, es, acento=None):
    return {'id': vid, 'ru': ru, 'ru_acento': acento or ru, 'es': es, 'tipo': 'sustantivo', 'genero': 'm'}


def pags(*tramos):
    """pags((1, 7, 12), (2, 24, 24)) → [{"urok": 1, "desde": 7, "hasta": 12}, …]."""
    return [{'urok': u, 'desde': a, 'hasta': b} for u, a, b in tramos]


def clase(n, urok, titulo, gramatica=(), vocabulario=(), paginas='p. 1', **extra):
    """Clase mínima; por defecto cubre la p. 1 de su урок (paginas=None: sin el campo)."""
    c = {'schema_version': 1, 'id': f'clase_{n:02d}', 'urok': urok, 'titulo': titulo,
         'gramatica': list(gramatica), 'vocabulario': list(vocabulario), 'textos': [], 'frases_practica': [], **extra}
    if paginas is not None:
        c['paginas'] = pags((urok, 1, 1)) if paginas == 'p. 1' else paginas
    return c


def tema(nombre, repaso=None):
    g = {'tema': nombre, 'explicacion': '…', 'ejemplos': []}
    if repaso is not None:
        g['repaso'] = repaso
    return g


class ConCarpeta(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def escribir(self, nombre, datos):
        texto = datos if isinstance(datos, str) else json.dumps(datos, ensure_ascii=False)
        (self.dir / nombre).write_text(texto, encoding='utf-8')

    def generar(self, *clases, fecha='2026-10-16'):
        for c in clases:
            self.escribir(f"{c['id']}.json", c)
        cs, problemas = indice.cargar_clases(self.dir)
        return indice.generar(cs, fecha, problemas)


def seccion(texto, titulo):
    return texto.split(f'## {titulo}\n', 1)[1].split('\n## ', 1)[0]


class Carga(ConCarpeta):
    def test_orden_numerico_y_sin_ejemplo(self):
        self.escribir('clase_10.json', clase(10, 3, 'Diez'))
        self.escribir('clase_02.json', clase(2, 1, 'Dos'))
        self.escribir('clase_00_ejemplo.json', clase(0, 2, 'Ejemplo'))
        self.escribir('notas.json', {})
        cs, problemas = indice.cargar_clases(self.dir)
        self.assertEqual([c['_numero'] for c in cs], [2, 10])
        self.assertEqual(problemas, [])

    def test_json_roto_es_alerta_y_no_detiene(self):
        self.escribir('clase_01.json', clase(1, 1, 'Uno'))
        self.escribir('clase_02.json', '{ roto')
        cs, problemas = indice.cargar_clases(self.dir)
        texto = indice.generar(cs, '2026-10-16', problemas)
        self.assertEqual(len(cs), 1)
        self.assertIn('clase_02.json: no se pudo leer', seccion(texto, 'Alertas'))


class Encabezado(ConCarpeta):
    def test_fecha_rango_y_proxima(self):
        texto = self.generar(clase(1, 1, 'Uno'), clase(2, 1, 'Dos'), clase(9, 3, 'Nueve'))
        self.assertIn('Generado 2026-10-16 · clases 1–9 (3) · próxima: clase_10', texto)

    def test_sin_clases(self):
        texto = self.generar()
        self.assertIn('ninguna clase · próxima: clase_01', texto)
        self.assertIn('Ninguna.', seccion(texto, 'Alertas'))


class Clases(ConCarpeta):
    def test_fila_con_paginas_de_varios_urok_y_tema_corto(self):
        texto = self.generar(clase(2, 1, 'Р, Л', paginas=pags((2, 24, 24), (1, 12, 22)), fecha='2026-10-11', tema_corto='Кто это?'))
        self.assertIn('2 | 2026-10-11 | У1 · pp. 12–22; У2 p. 24 | Кто это?', seccion(texto, 'Clases'))

    def test_sin_fecha_sin_paginas_y_sin_tema_corto(self):
        texto = self.generar(clase(3, 2, 'Genitivo | plural (Урок 2, pp. 7–9)', paginas=None))
        s = seccion(texto, 'Clases')
        self.assertIn('3 | sin fecha | У2 | Genitivo \\| plural *', s)  # las páginas del titulo no cuentan
        self.assertIn('Sin `tema_corto`', s)
        self.assertIn('Sin `paginas` (o con todos los tramos mal escritos): clase 3.', seccion(texto, 'Alertas'))

    def test_tramos_mal_escritos_se_ignoran(self):
        c = clase(1, 1, 'a', paginas=[{'urok': 1, 'desde': 7, 'hasta': 9}, {'urok': 1, 'desde': 12, 'hasta': 10},
                                      {'urok': '2', 'desde': 1, 'hasta': 2}, {'urok': 2, 'desde': True, 'hasta': 3}, 'p. 5'])
        self.assertEqual(indice.paginas_de(c), {1: {7, 8, 9}})
        self.assertEqual(indice.paginas_de(clase(1, 1, 'a', paginas={'urok': 1})), {})


class Temas(ConCarpeta):
    def test_introducido_y_repasos_con_normalizacion(self):
        texto = self.generar(
            clase(1, 1, 'a', [tema(f'Мо{A}й, моя{A}, моё')]),
            clase(2, 1, 'b', [tema('мой, моя, моё (repaso)', repaso=True)]),
            clase(3, 1, 'c', [tema('Мой — моя — моё (p. 30)', repaso=True), tema('Nuevo')]),
        )
        s = seccion(texto, 'Temas')
        self.assertIn('- Мой, моя, моё → 1 → 2, 3', s)
        self.assertIn('- Nuevo → 3 → —', s)
        self.assertEqual(s.count('моё'), 1)

    def test_solo_repaso_y_dos_introducciones(self):
        texto = self.generar(
            clase(1, 1, 'a', [tema('Género')]),
            clase(2, 1, 'b', [tema('Genero'), tema('Ь final', repaso=True)]),
        )
        s = seccion(texto, 'Temas')
        self.assertIn('- Género → 1 (también 2) → —', s)  # sin tilde es el mismo tema
        self.assertIn('- Ь final → — (solo repaso) → 2', s)

    def test_temas_casi_iguales(self):
        texto = self.generar(
            clase(1, 1, 'a', [tema('Consonantes duras y blandas; ь'), tema('О átona → [а]')]),
            clase(2, 1, 'b', [tema('Consonantes duras y blandas (pares)', repaso=True), tema('Е átona → [и]'),
                              tema('Entonacion de la pregunta'), tema('Entonación de las preguntas')]),
        )
        s = seccion(texto, 'Alertas')
        self.assertIn('Temas casi iguales: «Consonantes duras y blandas; ь» (clase 1) y «Consonantes duras y blandas» (clase 2).', s)
        self.assertIn('«Entonacion de la pregunta» (clase 2) y «Entonación de las preguntas» (clase 2)', s)
        self.assertNotIn('átona', s)  # «О átona → [а]» y «Е átona → [и]» son temas distintos


class Vocabulario(ConCarpeta):
    def test_fila_con_acento_y_clases(self):
        texto = self.generar(
            clase(1, 1, 'a', vocabulario=[palabra('v_dom', 'дом', 'casa', f'до{A}м')]),
            clase(3, 1, 'b', vocabulario=[palabra('v_dom', 'дом', 'casa'), palabra('v_brat', 'брат', 'hermano')]),
        )
        s = seccion(texto, 'Vocabulario')
        self.assertIn(f'v_dom | до{A}м | casa | 1, 3', s)
        self.assertLess(s.index('v_brat'), s.index('v_dom'))  # orden alfabético por id

    def test_alertas_de_ids(self):
        texto = self.generar(
            clase(1, 1, 'a', vocabulario=[palabra('v_zamok', 'замок', 'castillo'), palabra('v_luk', 'лук', 'cebolla')]),
            clase(2, 1, 'b', vocabulario=[palabra('v_zamok_cerradura', f'замо{A}к', 'cerradura', f'замо{A}к'),
                                          palabra('v_luk', 'люк', 'escotilla')]),
        )
        s = seccion(texto, 'Alertas')
        self.assertIn('Misma palabra «замок» con distinto vocab_id: v_zamok (clase 1); v_zamok_cerradura (clase 2).', s)
        self.assertIn('Mismo vocab_id v_luk con distinta palabra: «лук» (clase 1); «люк» (clase 2).', s)

    def test_misma_palabra_mismo_id_no_alerta(self):
        texto = self.generar(
            clase(1, 1, 'a', vocabulario=[palabra('v_dom', 'дом', 'casa')]),
            clase(2, 1, 'b', vocabulario=[palabra('v_dom', 'Дом', 'casa', f'До{A}м')]),
        )
        self.assertIn('Ninguna.', seccion(texto, 'Alertas'))


class Paginas(ConCarpeta):
    def test_rangos_por_urok_y_huecos(self):
        texto = self.generar(
            clase(1, 1, 'a', paginas=pags((1, 7, 12))),
            clase(2, 1, 'b', paginas=pags((1, 12, 15), (2, 24, 24))),
            clase(3, 2, 'c', paginas=pags((2, 27, 30))),
        )
        s = seccion(texto, 'Páginas del libro')
        self.assertIn('- Урок 1: 7–15', s)
        self.assertIn('- Урок 2: 24, 27–30 (huecos: 25–26)', s)

    def test_rangos(self):
        self.assertEqual(indice.rangos([5, 1, 2, 3, 9, 10]), '1–3, 5, 9–10')


class Linea(ConCarpeta):
    def test_main_escribe_utf8_con_lf(self):
        self.escribir('clase_01.json', clase(1, 1, 'Привет', paginas=pags((1, 7, 8))))
        salida = self.dir / 'indice.md'
        with contextlib.redirect_stdout(io.StringIO()):
            indice.main(['--datos', str(self.dir), '--salida', str(salida), '--fecha', '2026-01-02'])
        crudo = salida.read_bytes()
        self.assertNotIn(b'\r\n', crudo)
        self.assertTrue(crudo.decode('utf-8').startswith('# Índice de clases\n'))


class DatosReales(unittest.TestCase):
    def test_las_clases_del_proyecto_generan_indice(self):
        cs, problemas = indice.cargar_clases(indice.RAIZ / 'data' / 'clases')
        texto = indice.generar(cs, '2026-10-16', problemas)
        self.assertEqual(problemas, [])
        for titulo in ('Clases', 'Temas', 'Vocabulario', 'Páginas del libro', 'Alertas'):
            self.assertIn(f'\n## {titulo}\n', texto)
        filas = seccion(texto, 'Clases').splitlines()
        self.assertFalse(any(f.startswith('0 | ') for f in filas))  # sin la clase de ejemplo


if __name__ == '__main__':
    unittest.main()
