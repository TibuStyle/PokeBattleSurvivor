# Notas de Parche — PokeBattle Survivor

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
- Nuevo módulo `src/game/RunSession.js` desacoplado de Three.js y del DOM para simular hordas, colisiones de `Psicorrayo`, vida, orbes de XP y elección de mejoras en Node.
- Suite de pruebas ampliada en `tests/combat-v02.test.js` junto con `tests/region-flow.test.js` (10 pruebas automatizadas en total).

---

## v0.1.0 — Fundación del prototipo 3D
- Mapa regional con Kanto desbloqueado y Johto/Hoenn bloqueados por progresión.
- Selección única gratuita de Pokémon inicial por región persistida en `localStorage`.
- Pantallas de Pokédex, Mejoras permanentes y escaparate de Gachapón.
- Escena 3D en Three.js con bosque procedural, compañero geométrico y controles híbridos (`WASD` + apuntado con ratón + salto con `Espacio`).
