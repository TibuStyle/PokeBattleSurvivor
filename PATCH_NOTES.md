# Notas de Parche — PokeBattle Survivor

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
