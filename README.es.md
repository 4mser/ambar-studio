<p align="center">
  <img src="docs/assets/hero.gif" width="100%" alt="ÁMBAR, una mascota de gel ámbar, junto al título AMBAR y el cabezal de una línea de tiempo">
</p>

<p align="center">
  <b>Video</b> &nbsp;·&nbsp; <b>Presentaciones</b> &nbsp;·&nbsp; <b>Documentos</b> &nbsp;·&nbsp; desde HTML
  <br><br>
  <a href="README.md">Read in English</a>
</p>

AMBAR Studio convierte páginas web en piezas terminadas. Escribes una escena en HTML, CSS y JavaScript; AMBAR la renderiza cuadro a cuadro en Chrome sin interfaz y la codifica con ffmpeg, con narración, música y efectos de sonido mezclados. Las mismas páginas se convierten en presentaciones y en documentos listos para imprimir.

Se apoya en una sola regla: **cada cuadro es una función del tiempo.** Una escena expone `render(t)` y no depende de nada más, así que cualquier momento se renderiza exactamente igual, en cualquier orden y las veces que quieras. Por eso el resultado es repetible, se revisa en git y se ajusta fácil después de cambiar un texto.

Todo lo que ves en este README lo renderizó AMBAR.

### `// 01` Qué trae

| | |
|---|---|
| **Video determinista** | Chrome recorre `render(t)` y lo envía a ffmpeg. 1080p a 30 fps por defecto, o el tamaño y la tasa que definas. |
| **La narración manda en la línea de tiempo** | Cada línea de narración es una marca. Las escenas cuelgan de las marcas, así que al editar una línea su escena se mueve con ella. |
| **Personajes y voces** | Varios personajes, cada uno con su voz, grabados en una sola toma por personaje y cortados en las pausas. Las correcciones de pronunciación no tocan los subtítulos, y `--verify` transcribe cada línea contra el guion. |
| **Una mezcla de verdad** | Música que baja bajo la voz con un seguidor de envolvente y hace caer su golpe en el momento que elijas, efectos sintetizados o alineados en su golpe, −14 LUFS. |
| **Movimiento que se asienta** | Cámaras, transiciones, subtítulos palabra por palabra, partículas, gráficos que se dibujan solos y grillas de pulsos, todo en función del tiempo. Sin rebotes ni sobrepasos. |
| **Un estudio** | Una línea de tiempo en el navegador con marcas de narración, avance cuadro a cuadro, zonas seguras y la mezcla sincronizada. |
| **Presentaciones y documentos** | Decks con presentador en el navegador y un PDF por deck; documentos A4, carta y A5, y páginas largas para infografías. Cada PDF se revisa: fuentes Type 3, sombras y cantidad de páginas. |
| **Imágenes fijas** | Carruseles, capturas para las tiendas, tarjetas de enlace, historias y portadas en todos sus tamaños, desde una plantilla y un archivo de datos. |
| **Tutoriales de producto** | Capturas de una app real con los datos privados difuminados, y luego cámara, cursor, tecleo y anotaciones que apuntan a los elementos por nombre. |
| **Hecho para Claude** | Una skill de Claude Code, un agente y un comando de autorrevisión, para que una IA haga una pieza completa y la revise. |
| **ÁMBAR** | La mascota, dibujada en SVG en cada cuadro: expresiones, parpadeos, mirada y habla con la voz real. |
| **Aprendido de trabajo real** | Las reglas de la casa salen de unas setenta piezas terminadas: qué funcionó, qué se rechazó y por qué. |

### `// 02` Hecho para Claude

AMBAR está pensado para que lo maneje un agente de IA. El repo trae una skill y un agente de Claude Code que conocen el flujo y las reglas de la casa, y un comando de revisión con el que el agente revisa su propio trabajo antes de darlo por terminado.

```bash
ambar skill    # enlaza la skill y el agente en ~/.claude
```

Después le pides a Claude Code lo que necesites, desde cualquier carpeta: *«un video de lanzamiento de 30 segundos para esta funcionalidad»*, *«un tutorial del registro en staging»*, *«un deck de 10 láminas a partir de este informe»*.

| Pieza | Qué hace |
|---|---|
| **Skill `ambar`** | El flujo (brief → una pieza de prueba → plan → construcción → voz → revisión → render) y las reglas aprendidas de piezas terminadas: tiempos desde la narración, movimiento sin rebotes, zonas seguras y tamaños mínimos, redacción sobria y sin exageraciones, nada inventado, datos privados difuminados, nunca capturar producción. Una referencia por formato, más `craft.md` con la razón de cada regla. |
| **Brief `AMBAR.md`** | Las reglas propias de cada proyecto: audiencia, objetivo, idioma, voz, tono, marca, palabras que usar y evitar, fuentes, qué difuminar. `ambar new` lo crea; la skill lo lee antes que nada y lo sigue por sobre lo predeterminado. |
| **`ambar check`** | La revisión automática: errores de la página y archivos faltantes, texto fuera de cuadro, cortado o superpuesto, rótulos de diagramas cruzados por una línea o tapados por una figura, texto demasiado chico para leerse, contenido muy pequeño o cargado a un borde, marcas sin narración, y si `render(t)` depende solo de `t`. Genera una hoja de contacto que luego el agente mira. `--json` para agentes. |
| **Agente `ambar-producer`** | Produce una pieza completa a partir de un brief. Uno por pieza para hacer varias en paralelo. |

<p align="center">
  <img src="docs/assets/check.png" width="100%" alt="Hoja de contacto que genera ambar check para el tutorial de Harbor: seis cuadros de muestra con sus tiempos">
</p>

### Música y recursos abiertos

`music/` trae tres pistas de Kevin MacLeod con licencia CC BY 4.0 que cualquier proyecto puede usar (`"music": { "file": "@ambar/music/inspired.mp3" }`); los créditos están en `music/README.md`. Para todo lo demás (música, sonidos, voces, fuentes, íconos, fotos y librerías que funcionan con `render(t)`) la skill mantiene una guía con las licencias revisadas en `.claude/skills/ambar/references/resources.md`.

### `// 03` Para empezar

Requiere Node 20+ y `ffmpeg` (`brew install ffmpeg` en macOS).

```bash
git clone https://github.com/4mser/ambar-studio.git
cd ambar-studio
npm install
npm link                      # deja disponible el comando `ambar`

ambar studio examples/launch  # abre el video de lanzamiento en el estudio
ambar render examples/launch  # → examples/launch/out/launch.mp4
```

Un proyecto propio:

```bash
ambar new mi-video            # o: ambar new mi-deck --deck · ambar new mi-doc --doc
ambar studio mi-video
```

### `// 04` Una escena

Una composición es una carpeta con un `index.html`. Este es todo el contrato:

```html
<link rel="stylesheet" href="/@ambar/runtime/ambar.css">
<div id="stage"><h1 id="title"></h1></div>

<script type="module">
  import { video, cue, words, rise } from '/@ambar/runtime/ambar.js'

  let title

  video({
    setup () {
      title = words(document.getElementById('title'), 'Hola, {mundo}.')
    },
    render (t) {
      rise(title, t, cue('hello', 0.8).start)   // las palabras suben cuando la narración dice «hello»
    }
  })
</script>
```

El runtime trae lo necesario para que el movimiento se sienta bien: curvas de easing (`out`, `inOut`, `outBack`, `spring`, …), `span` para lo que entra, se queda y sale, `keys` para keyframes, `rise` y `fadeUp` para texto, `type` para escritura, `count` para números y `hash` para partículas deterministas.

<p align="center">
  <img src="docs/assets/launch-scenes.png" width="100%" alt="Cuatro escenas del video de lanzamiento: el título AMBAR, código que se escribe solo, tres tarjetas y tres formatos de salida">
</p>

### `// 05` Narración y sonido

`ambar.json` va junto a la escena. Las líneas se convierten en marcas, y los efectos se ubican en segundos o relativos a una marca:

```json
{
  "voice": { "provider": "gemini", "name": "Sulafat", "language": "es-US", "mode": "take" },
  "voices": { "ambar": { "name": "Leda", "style": "A cheerful little mascot" } },
  "lines": [
    { "id": "hello", "text": "Te presento a NGINX.", "say": "Te presento a Engine X." },
    { "id": "hola",  "speaker": "ambar", "text": "¡Hola! Yo te acompaño.", "pause": 0.6 }
  ],
  "music": { "file": "music.mp3", "gain": 0.6, "hit": 15.25, "at": "hola" },
  "sfx": [
    { "type": "whoosh", "at": "hello-0.3", "gain": 0.14 },
    { "file": "sfx/sello.wav", "at": "hola+0.8" }
  ]
}
```

| Voz | Notas |
|---|---|
| `say` | Voces de macOS, sin conexión ni clave. Sirve para borradores. |
| `gemini` | Texto a voz de Gemini, con modelos de respaldo y reintentos. Lee `AMBAR_GEMINI_API_KEY`, o en macOS el ítem `ambar-gemini` del Llavero, y ninguna otra clave. |

- **Personajes.** `speaker` elige una voz de `voices`. Con `"mode": "take"` cada personaje lee todas sus líneas en una sola toma, que AMBAR corta en las pausas más largas: las líneas grabadas una por una suenan a personas distintas. `ambar voice --recut` vuelve a cortar sin grabar.
- **Pronunciación.** `say` es lo que lee la voz, `text` lo que muestra la pantalla y `caption` lo que muestran los subtítulos. `tone` define cómo se dice una línea.
- **Ritmo.** Las pausas largas dentro de una línea se acortan a `maxPause` (0,32 s), `tempo` acelera una toma lenta hasta 1,15×, y cada línea lleva fundidos cortos para que ninguna termine en seco.
- **Para la escena.** `voice/timings.json` trae cada marca con su texto, su personaje y los tiempos de cada palabra; `voice/envelope.json` dice qué tan fuerte suena cada línea cuadro a cuadro, para que una mascota hable con la voz real.
- **Verificación.** `ambar voice --verify` transcribe cada línea al pie de la letra y avisa de palabras que faltan o sobran y de líneas demasiado lentas.
- **Música.** Baja bajo la voz con un seguidor de envolvente. `hit` + `at` hacen coincidir un momento de la pista con una marca; `stop` la corta en seco o la frena como una cinta.
- **Efectos.** `whoosh`, `tap`, `tick`, `click`, `pop`, `impact`, `kick`, `riser`, `heartbeat`, `drone`, `applause` y `glitch`, sintetizados con semilla fija (sin campanitas: se ven baratas). Un efecto con `file` cae en su punto más fuerte.
- **Máster.** Con saturación suave y normalizado a −14 LUFS (`loudness`). `ambar render --cover 3.2` también escribe `<nombre>-cover.mp4` con ese cuadro primero, porque los feeds usan el cuadro 0 como miniatura.

### `// 06` Movimiento

El lenguaje de movimiento de las piezas terminadas, como funciones del tiempo.

| Módulo | Qué trae |
|---|---|
| `ambar.js` | Easing (`ease.settle`, una curva críticamente amortiguada que nunca se pasa), `seeded`, `noise1`, `remap`, `revealLines`, `scramble`, `counter`, y formatos con nombre: `video({ format: 'post' })` para 4:5, `reel`, `story`, `square`, `card`, con `ctx.safe` diciéndote dónde van títulos, contenido y subtítulos |
| `motion.js` | Una `camera` que encuadra cualquier elemento y se mueve en una sola línea recta sin mostrar el borde del cuadro, `breathe`, `punch` sin vibración, `handheld`, `beats` y `acts` para cortar al ritmo de la música, `smoothPath`, `reversals` para revisar, y `sim()`, que repite con exactitud una simulación con estado en cualquier cuadro |
| `fx.js` | Partículas sin estado (polvo, estallidos, confeti, estelas, `morph` hacia una forma nueva) y las pocas transiciones que permite el estilo de la casa: fundidos, barridos de luz en los cortes, una revelación circular, una aparición desde el desenfoque |
| `charts.js` | Gráficos planos de línea, barras, anillo, minilínea y calor que se dibujan solos, armados una vez y actualizados por atributos |
| `captions.js` | Los tiempos de cada palabra convertidos en subtítulos de dos líneas que se iluminan palabra por palabra, con el nombre y la figurita de quien habla; `talk()` lee la envolvente de la voz |

<p align="center">
  <img src="docs/assets/motion.png" width="100%" alt="Cuatro cuadros del ejemplo de movimiento en 4:5: una curva que se asienta, una cámara encuadrando una tarjeta, gráficos que se dibujan solos y partículas que forman la palabra AMBAR">
</p>

### `// 07` El estudio

`ambar studio <proyecto>` abre la composición en un estudio local: recorres la línea de tiempo, avanzas cuadro a cuadro, saltas a cualquier marca de narración, activas las zonas seguras y reproduces la mezcla sincronizada.

<p align="center">
  <img src="docs/assets/studio.png" width="100%" alt="AMBAR Studio con el video de lanzamiento, las zonas seguras activas y cinco marcas de narración en la línea de tiempo">
</p>

### `// 08` Tutoriales sobre apps reales

`ambar capture` recorre una app web con Chrome sin interfaz, siguiendo los pasos de `capture.json`, y guarda una captura por paso más la posición de cada elemento que nombres. Todo lo que coincida con `redact` se difumina en el navegador antes de la captura, así que los datos privados nunca llegan a un PNG.

```json
{
  "url": "app/index.html",
  "redact": ["[data-private]"],
  "shots": [
    { "name": "login", "boxes": { "email": "#email", "signin": "#signin" } },
    { "name": "board", "actions": [{ "type": "#email", "text": "alex@harbor.example" }, { "click": "#signin" }, { "waitFor": "#list" }],
      "boxes": { "list": "#list", "user": "[data-private]" } }
  ]
}
```

`runtime/screen.js` convierte esas capturas en un screencast dentro de un notebook, un navegador o un teléfono. Cámara, cursor, tecleo, focos y anotaciones son funciones del tiempo como todo lo demás, y apuntan a los elementos por nombre (`'login.email'`), no por píxel.

```js
const sc = screencast(stage, await loadShots(), { device: 'laptop' })
sc.show(t, [[0, 'login'], [signin.start + 4.6, 'board']])
sc.camera(t, [[signin.start, 1, [720, 450]], [signin.start + 0.6, 1.55, 'login.card']])
sc.cursor(t, [[signin.start + 0.85, 'login.email'], [signin.start + 4.35, 'login.signin']], clicks)
sc.type(t, { box: 'login.email', text: 'alex@harbor.example', at: signin.start + 1.1 })
sc.callout(t, { box: 'board.user', text: 'Private data is blurred', from: board.start + 3.2 })
```

`ambar capture` también puede grabar una app en movimiento. Agrega `recordings` a `capture.json` y cada clip se graba cuadro a cuadro con un reloj virtual: los temporizadores, los cuadros de animación, las fechas y las animaciones CSS de la app solo avanzan de a un cuadro, así que un equipo lento graba clips fluidos y dos grabaciones dan los mismos cuadros. Los toques, la escritura, los desplazamientos, los arrastres y las marcas se programan al cuadro exacto, y cada toque queda anotado para que la escena dibuje el dedo donde y cuando tocó. Las páginas reciben una fecha y zona horaria fijas, almacenamiento precargado y las zonas seguras de un teléfono. Ninguna escritura sale del navegador: se bloquea o se simula, y puedes retener respuestas lentas para grabar una carga justo cuando la necesitas.

```json
"recordings": [{
  "name": "create", "seconds": 6,
  "actions": [
    { "at": 0.4, "click": "text=New task" },
    { "at": 1.0, "type": "Ship the new landing page", "every": 2 },
    { "at": 3.1, "click": "text=Save task" },
    { "at": 3.8, "mark": "saved", "boxes": { "task": ".task.new" } }
  ]
}]
```

En una escena, `sc.clip('create', t - at, { rate: 1.3 })` reproduce el clip dentro del dispositivo. `sc.frame` acerca el teléfono hacia un punto, `sc.ring` rodea un elemento medido y `sc.popout` saca una tarjeta de la pantalla. `ambar capture <proyecto> --only create` vuelve a grabar solo ese clip.

<p align="center">
  <img src="docs/assets/tutorial.png" width="100%" alt="Cuatro momentos del tutorial de Harbor: el correo tecleándose, el tablero con la dirección difuminada, el diálogo de nueva tarea y la tarea guardada">
</p>

### `// 09` Presentaciones, documentos e imágenes fijas

Cada `<section class="slide">` es una lámina. Abre el HTML para presentar (flechas, espacio, `F` para pantalla completa) o expórtalo:

```bash
ambar slides examples/deck/deck.html   # → out/deck.pdf + un PNG por lámina
ambar doc examples/report/report.html  # → out/report.pdf (A4)
ambar doc infografia.html --long --png  # → una página PDF larga + un PNG armado por tramos
```

`ambar doc` acepta `--paper a4|letter|a5`, páginas que fluyen con numeración y `--long` para infografías pensadas para recorrerse con scroll. Cada PDF se revisa antes y después de imprimir: las sombras salen de la impresión (los visores las dibujan como bloques grises), se avisa de fuentes variables o negritas falsas porque se imprimen como Type 3, se cuentan los canvas transparentes y debe haber una página del PDF por hoja. `runtime/fonts.css` trae Inter e IBM Plex Mono estáticas.

<p align="center">
  <img src="docs/assets/deck.png" width="100%" alt="Seis láminas del deck de ejemplo en tonos ámbar">
</p>

<p align="center">
  <img src="docs/assets/report.png" width="78%" alt="Dos páginas A4 del informe de ejemplo: una portada oscura con ÁMBAR y una página clara con la tabla de comandos">
</p>

**Imágenes fijas.** `ambar stills plantilla.html` renderiza cada elemento de un archivo de datos en cada tamaño que pide: publicaciones y carruseles de Instagram (4:5), historias, capturas para App Store y Google Play, gráficos destacados, íconos, tarjetas de enlace @2x y portadas de Facebook, cada uno con su zona segura. Cada imagen se captura a su tamaño exacto cuando la página está lista. Un texto que se sale del cuadro o que su caja recorta es un error, un carrusel puede dibujarse como un solo panorama y cortarse para que al deslizar se lea como una sola imagen, y `--webp`, `--format png8` y `--sheet` te dan copias para la web, PNG livianos para dibujos de líneas y una hoja de contacto. `ambar new` trae plantillas para todo eso: `--carousel`, `--store`, `--og`, `--infographic`, `--proposal`.

<p align="center">
  <img src="docs/assets/carousel.png" width="100%" alt="Seis láminas de carrusel en 4:5 sobre una misma grilla, con una línea que las cruza">
</p>

<p align="center">
  <img src="docs/assets/store.png" width="100%" alt="Cinco capturas para App Store: un titular, un teléfono con la app y una tarjeta flotante">
</p>

### `// 10` Comandos

| Comando | Qué hace |
|---|---|
| `ambar studio <proyecto>` | Estudio con línea de tiempo en el navegador |
| `ambar render <proyecto>` | Narración, mezcla, cuadros y codificación → `out/<nombre>.mp4` |
| `ambar render <proyecto> --frames 0,1.5,3` | Imágenes PNG en esos segundos |
| `ambar render <proyecto> --gif out.gif` | Un GIF en loop (`--from`, `--to`, `--gif-fps`, `--width`) |
| `ambar render <proyecto> --cover 3.2` | También `<nombre>-cover.mp4`, con ese cuadro primero para la miniatura del feed |
| `ambar voice <proyecto>` | Graba la narración y escribe las marcas, los tiempos de cada palabra y la envolvente de la voz (`--force`, `--recut`) |
| `ambar voice <proyecto> --verify` | Transcribe cada línea y la compara con el guion |
| `ambar mix <proyecto>` | Narración, música y efectos → `out/mix.wav` |
| `ambar capture <proyecto>` | Capturas, posiciones de elementos y grabaciones en movimiento de una app, según `capture.json` (`--only` vuelve a grabar algunos clips) |
| `ambar embed <proyecto>` | La composición como reproductor web en vivo, con capítulos, sonido y subtítulos (`--out`) |
| `ambar check <objetivo>` | Revisión automática y hoja de contacto (`--json`, `--at`) → `out/check/` |
| `ambar slides <deck.html>` | PDF y PNG de un deck |
| `ambar doc <doc.html>` | PDF de un documento (`--paper a4\|letter\|a5`, `--long`, `--png`), revisado |
| `ambar stills <plantilla.html>` | Cada elemento × tamaño de una plantilla de imágenes fijas (`--data`, `--sizes`, `--sheet`, `--webp`) |
| `ambar new <carpeta>` | Un video nuevo, `--deck`, `--doc`, `--carousel`, `--store`, `--og`, `--infographic` o `--proposal`, desde una plantilla |
| `ambar skill` | Enlaza la skill y el agente de Claude Code en `~/.claude` (`--remove`) |

### `// 11` Cómo funciona

```
bin/ambar.js            CLI
src/commands/           studio · render · voice · mix · capture · check · slides · doc · stills · embed · new · skill
src/lib/                servidor local, Chrome sin interfaz, ffmpeg, línea de tiempo, análisis de audio, efectos sintetizados, WAV, revisión de PDF
runtime/                lo que importan las escenas: ambar.js (tiempo, easing, texto, formatos) · motion · fx · charts · captions · screen · player · slides · doc · stills · fuentes
studio/                 el estudio con línea de tiempo
mascot/ambar.js         ÁMBAR, un SVG por cuadro
.claude/               la skill ambar (SKILL.md + referencias) y el agente ambar-producer
examples/               video de lanzamiento · hero · tutorial · movimiento · deck · informe
templates/              video · deck · doc · carrusel · tienda · og · infografía · propuesta · el brief AMBAR.md
```

Un servidor local publica el proyecto en `/` y AMBAR en `/@ambar/`, así una escena importa el runtime igual sin importar dónde esté. `ambar render` graba la narración, abre la escena en Chrome sin interfaz, llama a `render(f / fps)` en cada cuadro, envía las capturas a ffmpeg (H.264, CRF 17), mezcla el audio y une ambos.

Medido en un Apple M5 Pro: el video de lanzamiento de 24 segundos en 1080p, con cinco líneas de narración y doce efectos, se renderiza en 28,7 segundos.

### `// 12` ÁMBAR

ÁMBAR es la mascota: gel ámbar con un núcleo de miel oscura y ojos de cápsula. `mascot()` la dibuja en SVG para el cuadro actual, así que se mueve con la escena y se renderiza como todo lo demás.

```js
mascot({ x: 960, y: 520, R: 180, t, expr: 'feliz', mira: [0.4, 0], chispas: 0.8 })
```

Expresiones: `normal`, `feliz`, `pensativa`, `sorprendida`, `enojada`, `triste`, `dormida` (o `happy`, `thinking`, `surprised`, `angry`, `sad`, `sleepy`), o una mezcla de ellas con `pesos`. Las mezclas suman los lóbulos de las siluetas, así que un cambio de ánimo nunca salta.

**Viva solo a partir del tiempo.** Habla siguiendo la envolvente real de la voz (`talk()` de `captions.js`), y `blinks`, `moods`, `gazeAt` y `smoothPath` resuelven parpadeos, cambios de ánimo, mirada y llegadas. `AmbarKit.ambar.figure()` pone una ÁMBAR pequeña en el subtítulo.

### `// 13` Desarrollo

```bash
npm test                # runtime, movimiento, subtítulos, mascota, audio, mezcla, imágenes fijas, PDF, captura, revisión y skill
npm run readme-assets   # vuelve a renderizar todas las imágenes de este README
```
