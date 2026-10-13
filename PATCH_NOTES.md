# Notas de Parche — PokeBattle Survivor

## v0.5.0 — Pointer Lock, habilidades desbloqueables y HUD de campo

Esta actualización parte del árbol publicado en `main` (que ya contiene v0.4.0), no de la rama histórica v0.1. Conserva los sistemas de v0.3 y posteriores: oleadas, élites, centinela/jefe, orbes, STAB/efectividad, retirada, mejoras permanentes y elección de tres cartas.

### 1. Controles y cámara
- Pointer Lock captura el ratón al hacer clic en la arena; movimiento relativo del ratón controla yaw/pitch detrás del compañero. `Esc` libera el cursor y pausa.
- WASD/flechas siguen el yaw de cámara. El cuerpo gira suavemente hacia el vector de movimiento o ataque; el ratón no aplica un giro instantáneo al Pokémon.
- Nueva sensibilidad ajustable (0,4×–2,4×), persistente en el navegador y modificable desde Guía o desde Pausa.

### 2. Progresión de habilidades
- Al iniciar solo está activo el básico automático. `Q` (especial) y `Shift` (esquiva) se muestran bloqueados y no responden a entrada ni a llamadas de la simulación hasta desbloquearse.
- Los desbloqueos pendientes se ofrecen entre las tres opciones de subida de nivel. Se conserva la elección de tres mejoras distintas y se elige solo una por nivel.
- Tras desbloquear Q aparecen mejoras dedicadas de daño, alcance y enfriamiento. Tras desbloquear Shift, Impulso Etéreo aumenta distancia y reduce enfriamiento.

### 3. Interfaz y assets
- Nueva Guía de campo con controles, progresión y sensibilidad; selección de inicial, Pokédex y HUD indican explícitamente el estado bloqueado.
- Se mantiene una interfaz responsive y se amplía la lectura de habilidades, cooldowns, mejoras y captura del ratón.
- No se incorporan GLB/GLTF ni texturas externas: la escena usa geometría procedural propia. No se usaron recursos de PokéSurvivor ni extracciones comerciales. Como no se verificó una licencia redistribuible específica para modelos de criatura, se optó por no descargarlos; ver `ASSET_LICENSES.md`.

### 4. Pruebas
- Añadidas pruebas de bloqueo/desbloqueo, opciones de nivel, mejoras de daño/alcance/cooldown y esquiva.
- Nuevas comprobaciones de sensibilidad, pitch de cámara y giro angular suave.

---

## v0.4.0 — Movimientos propios, tipos, especial con Q y cámara de tercera persona

Esta versión sustituye el Psicorrayo común por un conjunto de movimientos propios para cada inicial, añade tipos con efectividad y STAB, y lleva la cámara detrás del compañero.

### 1. Movimientos propios de cada inicial
- Cada inicial tiene un **ataque básico** (automático) y un **especial** (`Q`). Son los nueve iniciales regionales:
  - **Bulbasaur**: Látigo Cepa / Bomba Lodo.
  - **Charmander**: Ascuas / Lanzallamas.
  - **Squirtle**: Pistola Agua / Hidrobomba.
  - **Chikorita**: Hoja Afilada / Rayo Solar.
  - **Cyndaquil**: Ascuas / Giro Fuego.
  - **Totodile**: Pistola Agua / Cascada.
  - **Treecko**: Absorber / Megaagotar.
  - **Torchic**: Picotazo / Rueda Fuego.
  - **Mudkip**: Disparo Lodo / Surf.
- Psicorrayo permanece en el catálogo (`src/data/moves.js`) pero **no está asignado a ningún inicial**.
- Hay tres formas de ataque: **haz** perforante, **abanico** (`cone`, hasta `maxTargets` enemigos) y **área** alrededor del compañero (`burst`).
- La Pokédex y la pantalla de elección de inicial muestran los dos movimientos, su tipo, potencia, enfriamiento y descripción.

### 2. Tipos, efectividad y STAB
- Nueva tabla de **18 tipos** (`src/data/typeChart.js`) con ×2, ×0,5 y ×0 (inmunidad). Los tipos defensores combinados multiplican sus efectividades (Fuego contra Bicho/Acero = ×4).
- Fórmula de daño por impacto: `round(potencia × 0,5 × (1 + 0,25 × rango de poder) × STAB × efectividad)`.
- **STAB ×1,5** cuando el tipo del movimiento coincide con un tipo del compañero.
- Los enemigos inmunes se excluyen antes de resolver la forma del ataque. Un haz que vuelve a golpear al mismo enemigo hace la mitad de daño.
- Los enemigos tienen tipos propios: Caterpie (Bicho); Weedle y Spinarak (Bicho/Veneno); Hoothoot (Normal/Volador); Poochyena (Siniestro); Numel (Fuego/Tierra); Onix (Roca/Tierra); Ursaring (Normal); Aggron (Acero/Roca); Mewtwo (Psíquico); Groudon (Tierra). El jefe Ho-Oh / Lugia se simplifica a Volador.

### 3. Especial con Q y enfriamiento visible
- `Q` lanza el especial del compañero. Si sigue en enfriamiento, la pulsación se rechaza y el HUD lo indica.
- El panel de ataques del HUD muestra cada movimiento con su tecla, su barra de enfriamiento y el tiempo restante. El último golpe muestra su eficacia (`Muy eficaz`, `Poco eficaz`, `Sin efecto`) y si tuvo STAB.
- El básico sigue siendo automático.

### 4. Cámara de tercera persona
- La cámara queda **detrás y baja** respecto al compañero (distancia ~7,4, altura base ~2,35, leve subida al saltar) y mira un poco por delante del personaje. Antes era cenital.
- El movimiento es **relativo a la cámara**: `W` avanza hacia donde mira la cámara.
- **La cámara sigue al apuntado solo mientras el cursor se mueve**, fuera de una zona muerta de ~18°. Seguirlo siempre hacía girar la cámara sin parar cuando el cursor quedaba fijo fuera del centro.
- Parámetros en `src/game/cameraRig.js` (`CAMERA_RIG`) y funciones puras, probadas sin Three.js.

### 5. Mejoras de partida renombradas
- Las mejoras de partida pasan a nombres genéricos: `attackPower` (Foco Ofensivo, antes Foco Psíquico), `attackCadence`, `attackPrism` y `attackWave`.
- Las mejoras permanentes conservan sus ids. Las mejoras de partida no se guardan en el perfil, así que el renombre no afecta a partidas guardadas.

### 6. Pokédex e interfaz
- La Pokédex agrupa los compañeros por región. Cada tarjeta muestra sus movimientos, su cobertura súper eficaz y su estado, pero **los movimientos solo aparecen si el compañero está desbloqueado**.
- La pantalla de elección de inicial muestra los movimientos de cada compañero antes de elegir.
- El pie del hub indica `PROTOTIPO 0.4`.

### 7. Pruebas y arquitectura
- Nuevas suites: `typechart-v04` (tabla de tipos), `moves-v04` (movesets y parámetros), `attacks-v04` (daño, STAB, formas, especial y enfriamiento), `camera-v04` (cámara y controles) y `pokedex-v04` (Pokédex e interfaz).
- `combat-v02` y `combat-v03` se migran a la nueva API (`firePrimary` / `cooldowns.basic`).
- La suite completa pasa con **60 pruebas** (18 de versiones anteriores + 42 nuevas).
- `RunSession` expone `fireAttack(slot)`, `castSpecial()` y un snapshot con `basicAttack`, `specialAttack` y `lastAttackSeq`.
- `package.json` y `package-lock.json` pasan a **0.4.0**.

---

## v0.3.0 — Esquiva, élites, centinela a los 4 min y retirada táctica

Este parche amplía el bucle de supervivencia con herramientas de supervivencia, amenazas diferenciadas y un arco de partida con hito y salida opcional.

### 1. Esquiva / Dash (Shift)
- **Impulso evasivo**: pulsar `Shift` ejecuta una esquiva rápida en la dirección de movimiento (u orientación si no hay input). La esquiva otorga **invulnerabilidad breve** y permite salir de anillos de contacto o de zonas de jefe.
- **Enfriamiento**: **2,4 s** base, con una mejora específica de partida (**Impulso Etéreo**) que reduce el enfriamiento un 20% por rango y amplía la distancia un 15%.
- **Feedback visual**: estela de anillos cian en el punto de arranque, parpadeo etéreo del compañero mientras dura la invulnerabilidad y estado en el HUD (`LISTA` o enfriamiento en segundos).

### 2. Enemigos élite con auras
- Desde la **oleada 3**, los enemigos normales tienen una probabilidad de nacer como **élite** con un aura de color y estadísticas amplificadas:
  - **Celeridad** (cian): +55% velocidad, +80% HP.
  - **Masa** (naranja): −22% velocidad, +220% HP, +40% daño.
  - **Furia** (rosa): +18% velocidad, +120% HP, +60% daño.
- Los élites tienen **más XP**, anillo de aura visible y un contador dedicado en el informe de expedición.

### 3. Minijefe / centinela a los 4 minutos
- Pasados los **4 minutos** de partida aparece un **centinela regional** como hito intermedio (Onix en Kanto, Ursaring en Johto, Aggron en Hoenn).
- El centinela aparece con un anillo de aura dorada, barra de vida dedicada y entrega una **bonificación garantizada de monedas + 1 ticket** al ser derrotado, sin finalizar la expedición.
- El **jefe regional** aparece **30 segundos después de derrotar al centinela** o al alcanzar los 10 minutos de expedición, dando un arco de partida más legible.

### 4. Psicorrayo automático
- El Psicorrayo se dispara ahora **automáticamente** hacia la orientación del cursor cuando está fuera de enfriamiento, al estilo del género de supervivencia. El clic ya no es necesario mantenerlo pulsado para seguir combatiendo.
- Se mantiene el sistema de enfriamiento, perforación y daño por primer impacto, pero ahora el apuntado define únicamente el rumbo del haz.

### 5. Retirada táctica
- El menú de pausa (`Esc`) añade un botón **“Retirarse con botín”** que finaliza la expedición sin victoria, pero conserva una **fracción de recompensas** (30% del coeficiente temporal frente al 45% de supervivencia normal, sin gema de victoria).
- “Abandonar expedición” sigue volviendo al mapa sin guardar recompensas del run actual.

### 6. HUD y UX
- Nueva fila de habilidad con el estado de la **esquiva** (Shift) en el panel lateral.
- Banner de **centinela** (dorado) y de **jefe regional** (magenta) diferenciados.
- Se añade `Shift esquiva` a la línea de controles; el arcaísmo “clic para disparar” se sustituye por “disparo auto”.
- El informe final muestra el estado de la expedición (victoria / retirada / derrota), bajas de élite y si el centinela fue abatido.

### 7. Pruebas y arquitectura
- Se añade `tests/combat-v03.test.js` con **6 nuevas pruebas** que cubren élites, centinela, dash, retirada táctica y fuego automático.
- `RunSession` ahora expone `dash()`, `extract()`, campos de minijefe, auras de élite y banderas de estado (`extracted`, `eliteKills`, `miniBossDefeated`).
- `GameApp` sincroniza anillos de aura, marcadores de centinela/jefe, estelas de esquiva y el nuevo flujo de salida táctica.
- La suite completa pasa con **18 pruebas** (10 de v0.2 + 2 suites de flujo + 6 de v0.3).

---

## v0.2.0 — Hordas, Psicorrayo con daño, Vida, Orbes de XP y Mejoras 1 de 3

Esta versión transforma la arena 3D de prueba en un bucle jugable completo de supervivencia e integra la progresión dentro de la partida con el flujo regional y de recompensas.

### 1. Hordas regionales y jefe de expedición
- **Oleadas progresivas (`RunSession`)**: aparición continua de enemigos alrededor del jugador en anillos exteriores, con escalado de vida, daño de contacto y ritmo de aparición cada 20 segundos (`OLEADA 01`, `02`, `03`…).
- **Perfiles por región (`src/data/combat.js`)**:
  - **Kanto**: `Caterpie` y `Weedle`, con `Mewtwo` como jefe regional.
  - **Johto**: `Spinarak` y `Hoothoot`, con `Ho-Oh / Lugia` como jefe regional.
  - **Hoenn**: `Poochyena` y `Numel`, con `Groudon` como jefe regional.
- **Separación y lectura en 3D (`GameApp`)**: los enemigos se desplazan hacia el jugador evitando apilarse en un único punto, muestran siluetas geométricas diferenciadas con barra de vida flotante, destello de impacto y ondas de derrota.

### 2. Psicorrayo con daño real, perforación y empuje
- **Impacto sobre la horda**: el disparo de `Psicorrayo` (clic izquierdo o mantener pulsado) lanza uno o varios haces psíquicos sobre el plano de combate, calculando intersección contra el radio de cada enemigo dentro del alcance y grosor del rayo.
- **Perforación y retroceso**: cada haz perfora múltiples objetivos ordenados por cercanía, inflige daño escalable, aplica knockback para abrir espacio y respeta su tiempo de enfriamiento.
- **Retroalimentación visual**: núcleo brillante + aura psíquica en 3D, anillos de impacto sobre cada objetivo alcanzado y actualización en tiempo real de las estadísticas del ataque en el HUD.

### 3. Sistema de vida (PS) y fin de expedición
- **Puntos de salud (`PS`)**: el compañero inicia con `100 PS` base bonificados por la mejora permanente **Reservas vitales** (`+5%` por rango) y mejoras de campo.
- **Contacto y ventana de gracia**: el contacto con enemigos a ras de suelo reduce PS, aplica un ligero empuje defensivo y activa una ventana breve de invulnerabilidad (`0.55 s`) con parpadeo visual para evitar muertes instantáneas en un solo fotograma. Saltar (`Espacio`) permite esquivar temporalmente el contacto raso.
- **Resolución de partida**:
  - **Derrota**: al caer a `0 PS`, la partida concluye y entrega una recompensa proporcional al tiempo sobrevivido, bajas y nivel alcanzado.
  - **Retirada táctica**: desde el menú de pausa (`Esc` / botón `Ⅱ`) es posible retirarse conservando el botín acumulado.
  - **Victoria**: derrotar al jefe regional completa la región, entrega bonificación de monedas, tickets y gemas, y desbloquea la siguiente región.

### 4. Orbes de experiencia (XP) e imán
- **Botín por baja**: cada enemigo derrotado suelta un orbe de experiencia 3D luminoso en su posición con valor acorde a la especie.
- **Atracción magnética**: al entrar en el radio de imán (escalable con la mejora permanente **Imán de experiencia** y mejoras en partida), los orbes se aceleran hacia el jugador y se absorben automáticamente al contacto.
- **Curva de nivel**: cada orbe suma XP (bonificada por **Estudio de campo**); al completar la barra de experiencia, el jugador sube de nivel.

### 5. Elección de una de tres mejoras al subir de nivel
- **Pausa táctica de nivel**: cada subida de nivel pausa la acción y despliega un modal con **3 tarjetas distintas** seleccionadas del catálogo de mejoras de campo (`RUN_UPGRADES`), elegibles con clic o con las teclas rápidas `1`, `2` y `3`:
  1. **Foco Psíquico** (`◈`): `+25%` de daño de Psicorrayo y `+1` objetivo perforado.
  2. **Pulso Mental** (`ϟ`): `−15%` de enfriamiento de Psicorrayo.
  3. **Prisma Psíquico** (`❖`): `+1` haz adicional en abanico y `+12%` de alcance.
  4. **Onda Telequinética** (`◎`): `+25%` de ancho de haz y `+35%` de empuje contra la horda.
  5. **Cuerpo Resiliente** (`♥`): `+25 PS` máximos y recupera `30 PS` al instante.
  6. **Paso Ligero** (`↗`): `+12%` de velocidad de movimiento.
  7. **Atracción Astral** (`⌖`): `+35%` de radio de imán de orbes y `+15%` de XP.

### 6. Pruebas y arquitectura
- Módulo `src/game/RunSession.js` desacoplado de Three.js y del DOM para simular hordas, colisiones de `Psicorrayo`, vida, orbes de XP y elección de mejoras en Node.
- Suite de pruebas en `tests/combat-v02.test.js` junto con `tests/region-flow.test.js` (10 pruebas automatizadas en v0.2).

---

## v0.1.0 — Fundación del prototipo 3D
- Mapa regional con Kanto desbloqueado y Johto/Hoenn bloqueados por progresión.
- Selección única gratuita de Pokémon inicial por región persistida en `localStorage`.
- Pantallas de Pokédex, Mejoras permanentes y escaparate de Gachapón.
- Escena 3D en Three.js con bosque procedural, compañero geométrico y controles híbridos (`WASD` + apuntado con ratón + salto con `Espacio`).
