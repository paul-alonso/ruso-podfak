# Esquema de datos (versión 1)

Referencia de los archivos que lee la app: `data/index.json` y un `data/clases/clase_NN.json` por clase. El validador (`validar.html`, o `herramientas\validar.ps1` desde PowerShell) aplica exactamente estas reglas:

- **Error (✗)**: la clase no se carga en la app hasta corregirlo.
- **Aviso (⚠)**: la clase se carga, pero conviene revisarlo.

Ejemplo completo y válido, con todos los campos opcionales: [`data/clases/clase_00_ejemplo.json`](data/clases/clase_00_ejemplo.json). Instrucciones para generar el JSON a partir del PDF de una clase: [`PROMPT_GENERAR_JSON.md`](PROMPT_GENERAR_JSON.md).

Todos los textos van en UTF-8. Los campos que no están en este documento se ignoran, con un aviso de «campo desconocido».

---

## `data/index.json`

Una lista con una entrada por clase:

```json
[
  { "id": "clase_02", "urok": 1, "titulo": "Р, Л, Ш, Ж, Ч y «Кто это? Что это?»", "fecha": "2026-10-11" }
]
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `clase_NN`; igual que el nombre del archivo de la clase. Sin repetir. |
| `urok` | sí | Número del урок (1–11). |
| `titulo` | sí | El mismo que en la clase. |
| `fecha` | no | `AAAA-MM-DD`. Si la clase no tiene fecha, omítela aquí también. |

Si `urok`, `titulo` o `fecha` no coinciden con los de la clase, el validador avisa. La app usa los datos de la clase.

---

## Clase

```json
{
  "schema_version": 1,
  "id": "clase_02",
  "fecha": "2026-10-11",
  "urok": 1,
  "titulo": "Р, Л, Ш, Ж, Ч y «Кто это? Что это?» (Урок 1, pp. 12–22)",
  "tema_corto": "Кто это? Что это?",
  "profesor": "Ирина Петровна",
  "paginas": [{ "urok": 1, "desde": 12, "hasta": 22 }, { "urok": 2, "desde": 24, "hasta": 24 }],
  "gramatica": [ … ],
  "vocabulario": [ … ],
  "textos": [ … ],
  "frases_practica": [ … ]
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `schema_version` | sí | Siempre `1`. |
| `id` | sí | `clase_NN` (dos cifras o más), igual que el nombre del archivo. |
| `fecha` | no | Fecha de la clase, `AAAA-MM-DD`. Sin ella, el título muestra «sin fecha». |
| `urok` | sí | Número del урок (1–11). |
| `titulo` | sí | Tema de la clase, en español; puede ser largo e incluir páginas del libro. |
| `tema_corto` | no | Versión breve del tema (≤ 40 caracteres) para el título visible. Si falta, se usa `titulo`, y el validador avisa cuando `titulo` pasa de 50 caracteres. |
| `profesor` | no | Nombre del profesor o profesora. Se muestra en el Lector. |
| `paginas` | recomendado | Páginas del libro que cubre la clase (ver abajo). Si falta, aviso. |
| `gramatica` | sí | Lista (puede estar vacía). |
| `vocabulario` | sí | Lista de palabras nuevas de esta clase. |
| `textos` | sí | Lista de textos y diálogos. |
| `frases_practica` | sí | Lista de frases para Traducir y Escuchar. |

### Páginas del libro: `paginas`

Lista de tramos, uno por урок y bloque de páginas seguidas:

```json
"paginas": [{ "urok": 1, "desde": 12, "hasta": 22 }, { "urok": 2, "desde": 24, "hasta": 24 }]
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `urok` | sí | Número del урок (1–11) al que pertenecen esas páginas (puede no ser el de la clase). |
| `desde` | sí | Primera página, entero ≥ 1. |
| `hasta` | sí | Última página, entero ≥ `desde`. Para una sola página, igual a `desde`. |

`herramientas/indice.py` usa este campo para la tabla de clases y las páginas cubiertas por урок de `data/indice.md`. Las páginas que aparezcan en el `titulo` son solo texto: no cuentan.

### Título visible

La app muestra cada clase como:

```
Clase N · DD mmm · Урок X · tema
```

- **N**: el número del `id` (`clase_02` → 2).
- **DD mmm**: la `fecha` con el día a dos cifras y el mes abreviado (`07 oct`), o «sin fecha».
- **X**: el `urok`.
- **tema**: `tema_corto` o, si no hay, `titulo`.

Ejemplo: `Clase 2 · 11 oct · Урок 1 · Кто это? Что это?`. En el selector, las clases se agrupan por урок y dentro de cada grupo se muestran sin la parte «Урок X».

### Procedencia: `fuente` y `repaso`

Campos opcionales para distinguir el material:

| Campo | Dónde | Valores | En el Lector |
|---|---|---|---|
| `fuente` | gramática, palabras del vocabulario, textos y frases de los textos | `"clase"` (lo visto en clase; es lo normal) o `"libro"` (material tomado del libro) | etiqueta discreta **Libro** |
| `repaso` | gramática y textos | `true` o `false` | etiqueta discreta **Repaso** |

- Si falta `fuente`, se entiende `"clase"`. La etiqueta **Libro** solo aparece con `"libro"`.
- Una frase hereda la `fuente` de su texto. Solo se etiqueta si es del libro dentro de un texto de clase (en un texto del libro ya lleva la etiqueta el texto).
- `repaso: true` marca lo que repasa contenidos de clases anteriores.
- Cualquier otro valor es un error. `repaso` en palabras o frases es un campo desconocido (aviso).

---

## Gramática

```json
{ "tema": "Entonación de la pregunta", "explicacion": "…", "ejemplos": ["Кто это? (ИК-2)"], "fuente": "libro", "repaso": true }
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `tema` | sí | Título del punto de gramática. |
| `explicacion` | sí | Clara, para principiantes absolutos, en español. |
| `ejemplos` | sí | Lista de textos (formato libre, p. ej. `"сад [сат]"`). Puede estar vacía. |
| `fuente` | no | `"clase"` o `"libro"`. |
| `repaso` | no | `true` o `false`. |

## Vocabulario

```json
{ "id": "v_dom", "ru": "дом", "ru_acento": "до́м", "es": "casa", "tipo": "sustantivo", "genero": "m", "nota": "", "fuente": "clase" }
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `v_` + transliteración de `ru` (ver PROMPT_GENERAR_JSON.md). Homónimos: `v_zamok_castillo`. Sin repetir en la clase. |
| `ru` | sí | Forma de diccionario, sin acento. |
| `ru_acento` | sí | La misma con el acento (U+0301 tras la vocal tónica); sin acentos debe dar `ru`. |
| `es` | sí | Traducción. |
| `tipo` | sí | `sustantivo`, `verbo`, `adjetivo`, `adverbio`, `pronombre`, `numeral`, `preposicion`, `conjuncion`, `particula`, `interjeccion` o `expresion`. |
| `genero` | sustantivos | `m`, `f`, `n` o `pl`. |
| `nota` | no | Pronunciación, formas, uso. |
| `fuente` | no | `"clase"` o `"libro"`. |

## Textos

```json
{ "id": "t2", "titulo": "Диалог", "fuente": "libro", "repaso": true, "frases": [ … ] }
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `t1`, `t2`, … sin repetir. |
| `titulo` | sí | En ruso o en español. |
| `frases` | sí | Lista no vacía. |
| `fuente` | no | `"clase"` o `"libro"`. |
| `repaso` | no | `true` o `false`. |

### Frases de los textos

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `f1`, `f2`, … sin repetir dentro del texto. |
| `ru` | sí | La frase sin acentos, con su puntuación. |
| `ru_acento` | sí | La misma con acentos; sin acentos debe dar `ru`. |
| `es` | sí | Traducción natural. |
| `tokens` | sí | Una entrada por palabra, en orden (ver abajo). |
| `fuente` | no | `"clase"` o `"libro"` (si no, la del texto). |

### Tokens

| Campo | Obligatorio | Regla |
|---|---|---|
| `t` | sí | La palabra tal como aparece en `ru`. Una sola palabra, sin puntuación. |
| `a` | sí | La misma palabra tal como aparece en `ru_acento` (igual a `t` si no lleva acento). |
| `lema` | sí | Forma de diccionario, sin acento. |
| `es` | sí | Significado en esta frase. |
| `gram` | sí | Análisis breve. |
| `vocab_id` | no | Id de la palabra en el vocabulario de esta clase o de una anterior. |

Los tokens, en orden, deben reconstruir `ru`, y sus `a` deben reconstruir `ru_acento`. La puntuación no se tokeniza.

## Frases de práctica

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `p1`, `p2`, … |
| `ru` | sí | Sin acentos. |
| `ru_acento` | recomendado | Con acentos. |
| `es` | sí | Traducción principal. |
| `alternativas_es` | no | Otras traducciones al español que se aceptan. |
| `alternativas_ru` | no | Otras formulaciones rusas que se aceptan (ES→RU). |

---

## Acentos

- U+0301 (acento combinante) justo después de la vocal tónica: `до́м`. Nunca vocales latinas con tilde, apóstrofos ni `´`.
- `ё` siempre como `ё` y sin marca de acento.
- Los campos sin acento (`ru`, `t`, `lema`, `alternativas_ru`) no llevan U+0301.

## Compatibilidad

`tema_corto`, `profesor`, `paginas`, `fuente` y `repaso` se añadieron sin cambiar `schema_version`. `fecha` pasó de obligatoria a opcional. Los JSON anteriores siguen siendo válidos tal cual.
