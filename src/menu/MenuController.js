import { getUpgradeCost, PERMANENT_UPGRADES, RARITY_RATES } from '../data/economy.js';
import { REGIONS, STARTERS } from '../data/regions.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

export class MenuController {
  constructor(root, flow, { onStartRun = () => {}, onReturnToHub = () => {}, onSetPause = () => {}, onResume = () => {} } = {}) {
    this.root = root;
    this.flow = flow;
    this.onStartRun = onStartRun;
    this.onReturnToHub = onReturnToHub;
    this.onSetPause = onSetPause;
    this.onResume = onResume;
    this.activeTab = 'regions';
    this.paused = false;

    this.handleClick = this.handleClick.bind(this);
    this.root.addEventListener('click', this.handleClick);
    this.render();
  }

  render() {
    this.root.classList.toggle('is-in-game', this.flow.screen === 'run');

    switch (this.flow.screen) {
      case 'starter-select':
        this.root.innerHTML = this.renderStarterSelection();
        break;
      case 'region':
        this.root.innerHTML = this.renderRegionReady();
        break;
      case 'run':
        this.root.innerHTML = this.renderRunHud();
        break;
      case 'results':
        this.root.innerHTML = this.renderResults();
        break;
      case 'hub':
      default:
        this.root.innerHTML = this.renderHub();
        break;
    }
  }

  renderHub() {
    const { resources } = this.flow.profile;
    return `
      <div class="hub-shell">
        <header class="topbar">
          <button class="brand" type="button" aria-label="PokeBattle Survivor, inicio" data-action="tab" data-tab="regions">
            <span class="brand-mark">PB</span>
            <span class="brand-wordmark"><strong>POKEBATTLE</strong><small>SURVIVOR · 3D FIELD TEST</small></span>
          </button>
          <nav class="main-nav" aria-label="Menú principal">
            ${this.navButton('regions', 'Regiones')}
            ${this.navButton('pokedex', 'Pokédex')}
            ${this.navButton('upgrades', 'Mejoras')}
            ${this.navButton('gacha', 'Gachapón')}
          </nav>
          <div class="wallet" aria-label="Recursos">
            <span class="wallet-chip"><i class="wallet-icon coin">◆</i>${resources.coins}<small>MON</small></span>
            <span class="wallet-chip"><i class="wallet-icon ticket">▤</i>${resources.tickets}<small>TIX</small></span>
            <span class="wallet-chip"><i class="wallet-icon gem">✦</i>${resources.gems}<small>GEM</small></span>
          </div>
        </header>
        <main class="hub-content">
          ${this.renderHubTab()}
          <footer class="hub-footer"><span>PROTOTIPO 0.1</span><span>Partida local · progreso guardado en este navegador</span></footer>
        </main>
      </div>
    `;
  }

  navButton(tab, label) {
    return `<button class="nav-button ${this.activeTab === tab ? 'is-active' : ''}" data-action="tab" data-tab="${tab}" ${this.activeTab === tab ? 'aria-current="page"' : ''}>${label}</button>`;
  }

  renderHubTab() {
    if (this.activeTab === 'pokedex') return this.renderPokedex();
    if (this.activeTab === 'upgrades') return this.renderUpgrades();
    if (this.activeTab === 'gacha') return this.renderGacha();
    return this.renderRegions();
  }

  renderRegions() {
    const unlockedCount = REGIONS.filter((region) => this.flow.isRegionUnlocked(region.id)).length;
    const lastRegion = REGIONS.find((region) => this.flow.isRegionUnlocked(region.id) && !this.flow.getRegionProgress(region.id).cleared);
    const suggestedRegion = lastRegion ?? REGIONS.find((region) => this.flow.isRegionUnlocked(region.id)) ?? REGIONS[0];
    const chosen = suggestedRegion && this.flow.getRegionProgress(suggestedRegion.id)?.starterId;
    const chosenStarter = chosen ? suggestedRegion.starters.find((starter) => starter.id === chosen) : null;

    return `
      <section class="welcome-row">
        <div class="welcome-copy">
          <span class="eyebrow"><span class="status-dot"></span> PROTOCOLO DE CAMPO · REGIÓN ${String(suggestedRegion.generation).padStart(2, '0')}</span>
          <h1>Elige tu región.<br /><em>Sobrevive a la horda.</em></h1>
          <p>Una aventura breve para probar el combate 3D, el movimiento libre y las builds de cada inicial.</p>
          <div class="welcome-actions">
            <button class="button button--primary" data-action="open-region" data-region-id="${suggestedRegion.id}">
              ${chosenStarter ? 'Continuar expedición' : 'Elegir inicial'} <span aria-hidden="true">↗</span>
            </button>
            <span class="micro-copy">${unlockedCount}/${REGIONS.length} regiones disponibles</span>
          </div>
        </div>
        <aside class="dispatch-card">
          <div class="dispatch-card__top"><span>PRÓXIMA EXPEDICIÓN</span><span class="dispatch-pulse">● EN ESPERA</span></div>
          <div class="dispatch-map" style="--map-a:${suggestedRegion.palette[0]};--map-b:${suggestedRegion.palette[1]}">
            <span class="map-cross map-cross--one"></span><span class="map-cross map-cross--two"></span>
            <span class="map-coordinate">${suggestedRegion.name.toUpperCase()} / ZONA 01</span>
            <span class="map-pin">⌖</span>
            <span class="map-contour map-contour--one"></span><span class="map-contour map-contour--two"></span>
          </div>
          <div class="dispatch-card__body">
            <div><small>ESCENARIO</small><strong>${escapeHtml(suggestedRegion.mapName)}</strong></div>
            <div><small>COMPAÑERO</small><strong>${chosenStarter ? escapeHtml(chosenStarter.name) : 'Aún por elegir'}</strong></div>
          </div>
          <div class="dispatch-card__boss"><span>OBJETIVO DE REGIÓN</span><strong>⚠ ${escapeHtml(suggestedRegion.boss)}</strong></div>
        </aside>
      </section>

      <section class="region-section">
        <div class="section-heading">
          <div><span class="eyebrow">RUTA DE PROGRESIÓN</span><h2>Regiones</h2></div>
          <span class="section-count">${String(unlockedCount).padStart(2, '0')} ABIERTA${unlockedCount === 1 ? '' : 'S'}</span>
        </div>
        <div class="region-grid">
          ${REGIONS.map((region) => this.renderRegionCard(region)).join('')}
        </div>
      </section>
    `;
  }

  renderRegionCard(region) {
    const progress = this.flow.getRegionProgress(region.id);
    const unlocked = this.flow.isRegionUnlocked(region.id);
    const starter = progress?.starterId ? region.starters.find((entry) => entry.id === progress.starterId) : null;
    const previous = REGIONS[REGIONS.indexOf(region) - 1];
    const stateLabel = !unlocked ? `BLOQUEADA · ${previous?.boss ?? region.unlockHint}` : progress.cleared ? 'REGIÓN SUPERADA' : 'DISPONIBLE';
    const actionLabel = !unlocked ? 'Bloqueada' : starter ? 'Entrar' : 'Elegir inicial';

    return `
      <article class="region-card ${unlocked ? '' : 'is-locked'} ${progress?.cleared ? 'is-cleared' : ''}" style="--region-a:${region.palette[0]};--region-b:${region.palette[1]}">
        <div class="region-card__visual">
          <span class="region-card__gen">GEN ${String(region.generation).padStart(2, '0')}</span>
          <span class="region-glyph" aria-hidden="true">${region.name.slice(0, 1)}</span>
          <span class="region-card__state">${escapeHtml(stateLabel)}</span>
        </div>
        <div class="region-card__body">
          <div class="region-card__title"><div><h3>${escapeHtml(region.name)}</h3><span>${escapeHtml(region.mapName)}</span></div>${progress?.cleared ? '<span class="clear-mark">✓</span>' : ''}</div>
          <div class="region-card__meta"><span>JEFE <b>${escapeHtml(region.boss)}</b></span><span>INICIAL <b>${starter ? escapeHtml(starter.name) : '—'}</b></span></div>
          <button class="button ${unlocked ? 'button--secondary' : 'button--locked'}" data-action="open-region" data-region-id="${region.id}" ${unlocked ? '' : 'disabled'}>${actionLabel}<span aria-hidden="true">${unlocked ? '→' : '⌑'}</span></button>
        </div>
      </article>
    `;
  }

  renderPokedex() {
    const unlockedCount = this.flow.profile.unlockedPokemon.length;
    return `
      <section class="page-heading">
        <span class="eyebrow">ARCHIVO DE CAMPO · ${String(unlockedCount).padStart(2, '0')} REGISTRADOS</span>
        <h1>Pokédex</h1>
        <p>Tu inicial gratuito queda registrado al entrar por primera vez a cada región. Los demás compañeros se incorporarán al gachapón regional.</p>
      </section>
      <div class="dex-grid">
        ${STARTERS.map((starter, index) => {
          const region = REGIONS.find((entry) => entry.id === starter.regionId);
          const unlocked = this.flow.isPokemonUnlocked(starter.id);
          const progress = this.flow.getRegionProgress(starter.regionId);
          const isStarter = progress?.starterId === starter.id;
          return `
            <article class="dex-card ${unlocked ? 'is-unlocked' : 'is-unknown'}">
              <div class="dex-card__art" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
                <span class="dex-index">#${String(index + 1).padStart(3, '0')}</span>
                <span class="creature-orb" aria-hidden="true"><i></i></span>
                ${unlocked ? '' : '<span class="dex-lock">⌑</span>'}
              </div>
              <div class="dex-card__body"><span class="eyebrow">${escapeHtml(region.name)} · INICIAL</span><h3>${unlocked ? escapeHtml(starter.name) : 'Compañero sin registrar'}</h3><div class="type-row">${starter.types.map((type) => `<span class="type-chip">${escapeHtml(type)}</span>`).join('')}</div><span class="dex-status">${isStarter ? '★ INICIAL ELEGIDO' : unlocked ? 'REGISTRADO' : 'POR DESBLOQUEAR'}</span></div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  renderUpgrades() {
    const { coins } = this.flow.profile.resources;
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">PROGRESIÓN PERMANENTE · ${coins} MONEDAS</span>
        <h1>Mejoras</h1>
        <p>Gasta monedas de expedición en mejoras globales. Los rangos se conservan al cambiar de compañero.</p>
      </section>
      <div class="upgrade-grid">
        ${PERMANENT_UPGRADES.map((upgrade) => {
          const level = this.flow.profile.upgrades[upgrade.id] ?? 0;
          const maxed = level >= upgrade.maxLevel;
          const cost = getUpgradeCost(upgrade, level);
          const canBuy = !maxed && coins >= cost;
          return `
            <article class="upgrade-card">
              <div class="upgrade-card__icon">${upgrade.icon}</div>
              <div class="upgrade-card__copy"><span class="eyebrow">RANGO ${String(level).padStart(2, '0')} / ${upgrade.maxLevel}</span><h3>${escapeHtml(upgrade.name)}</h3><p>${escapeHtml(upgrade.detail)}</p></div>
              <div class="upgrade-card__action"><div class="level-track" aria-label="Rango ${level} de ${upgrade.maxLevel}">${Array.from({ length: upgrade.maxLevel }, (_, slot) => `<i class="${slot < level ? 'is-filled' : ''}"></i>`).join('')}</div><button class="button button--secondary" data-action="buy-upgrade" data-upgrade-id="${upgrade.id}" ${canBuy ? '' : 'disabled'}>${maxed ? 'Rango máximo' : `Mejorar · ${cost} ◆`}</button></div>
            </article>
          `;
        }).join('')}
      </div>
      <p class="implementation-note"><span>i</span> Las compras y el guardado local ya están cableados; las monedas se conectarán a las recompensas cuando exista la pantalla de fin de partida.</p>
    `;
  }

  renderGacha() {
    const { tickets, gems } = this.flow.profile.resources;
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">RECLUTAMIENTO · ${tickets} TICKETS · ${gems} GEMAS</span>
        <h1>Gachapón</h1>
        <p>El gacha amplía tu Pokédex; no bloquea regiones ni vende poder. Las probabilidades son visibles antes de cada tirada.</p>
      </section>
      <div class="gacha-layout">
        <article class="gacha-panel gacha-panel--normal"><div class="gacha-panel__label">01 / GACHA NORMAL</div><div class="gacha-illustration">✳</div><h2>Encuentros regionales</h2><p>Usa tickets ganados jugando para desbloquear compañeros de la región ya descubierta.</p><div class="rarity-list">${RARITY_RATES.map((rarity) => `<div class="rarity-row"><span><i style="--rarity-color:${rarity.color}"></i>${rarity.label}</span><b>${rarity.percent}%</b></div>`).join('')}</div><div class="coming-soon">SISTEMA DE TIRADAS · SIGUIENTE FASE</div></article>
        <article class="gacha-panel gacha-panel--shiny"><div class="gacha-panel__label">02 / GACHA SHINY</div><div class="gacha-illustration gacha-illustration--shiny">✦</div><h2>Variocolor</h2><p>Las gemas se reservarán para aspectos shiny de Pokémon que ya hayas desbloqueado; nunca alteran sus estadísticas.</p><div class="shiny-note"><span>◆</span><div><b>Solo cosmético</b><small>La especie debe estar ya en tu Pokédex.</small></div></div><div class="coming-soon">COSTE EN GEMAS · POR BALANCEAR</div></article>
      </div>
    `;
  }

  renderStarterSelection() {
    const region = this.flow.selectedRegion;
    if (!region) return this.renderHub();
    return `
      <main class="focus-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al mapa</button><span class="focus-step">PASO 01 <i></i> 02</span></header>
        <section class="starter-intro"><span class="eyebrow">${escapeHtml(region.name.toUpperCase())} · PRIMERA EXPEDICIÓN</span><h1>Elige a tu<br /><em>compañero inicial.</em></h1><p>Esta elección gratuita se ofrece una sola vez al abrir una región. Los otros iniciales podrán desbloquearse más adelante.</p></section>
        <section class="starter-grid" aria-label="Pokémon iniciales de ${escapeHtml(region.name)}">
          ${region.starters.map((starter, index) => `
            <article class="starter-card" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
              <div class="starter-card__number">0${index + 1} <span>· ${starter.types.map(escapeHtml).join(' / ')}</span></div>
              <div class="starter-card__art"><div class="starter-orb" aria-hidden="true"><i></i></div><span class="starter-orbit starter-orbit--one"></span><span class="starter-orbit starter-orbit--two"></span></div>
              <div class="starter-card__copy"><h2>${escapeHtml(starter.name)}</h2><p>${this.starterFlavour(starter)}</p></div>
              <button class="button button--primary starter-pick" data-action="pick-starter" data-starter-id="${starter.id}">Elegir ${escapeHtml(starter.name)} <span aria-hidden="true">↗</span></button>
            </article>
          `).join('')}
        </section>
        <p class="focus-footnote">La selección se guarda automáticamente en este navegador. No necesitas una cuenta para probar el prototipo.</p>
      </main>
    `;
  }

  starterFlavour(starter) {
    const flavour = {
      bulbasaur: 'Crecimiento paciente, raíces firmes y control del terreno.',
      charmander: 'Mucho ritmo y una afinidad natural por el daño explosivo.',
      squirtle: 'Defensa estable y control seguro cuando la horda se cierra.',
      chikorita: 'Apoyo y aguante para convertir el bosque en tu territorio.',
      cyndaquil: 'Presión ofensiva y fuego constante para abrirte paso.',
      totodile: 'Empuje frontal y control de espacio a corta distancia.',
      treecko: 'Movilidad y precisión para atravesar los huecos de la horda.',
      torchic: 'Ráfagas rápidas y una escalada de daño agresiva.',
      mudkip: 'Equilibrio entre resistencia y control del campo.',
    };
    return flavour[starter.id] ?? 'Un compañero listo para la aventura.';
  }

  renderRegionReady() {
    const region = this.flow.selectedRegion;
    const progress = this.flow.selectedProgress;
    const starter = region?.starters.find((entry) => entry.id === progress?.starterId);
    if (!region || !starter) return this.renderStarterSelection();

    return `
      <main class="focus-screen region-ready-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al mapa</button><span class="focus-step">${escapeHtml(region.name.toUpperCase())} <i></i> EXPEDICIÓN</span></header>
        <section class="ready-layout">
          <div class="ready-copy"><span class="eyebrow"><span class="status-dot"></span> REGIÓN DISPONIBLE · GEN ${String(region.generation).padStart(2, '0')}</span><h1>${escapeHtml(region.mapName)}<br /><em>te espera.</em></h1><p>Sobrevive a las oleadas, reúne experiencia y construye una combinación de movimientos antes de desafiar a ${escapeHtml(region.boss)}.</p>
            <div class="ready-objectives"><div><small>ENEMIGOS DETECTADOS</small><b>${region.enemies.map(escapeHtml).join(' · ')}</b></div><div><small>JEFE DE REGIÓN</small><b class="boss-text">${escapeHtml(region.boss)}</b></div></div>
            <button class="button button--primary button--launch" data-action="enter-run">Entrar a la partida <span aria-hidden="true">↗</span></button>
            <p class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover <span>·</span> ratón apuntar <span>·</span> clic disparar</p>
          </div>
          <aside class="partner-card" style="--creature-color:${starter.color};--creature-accent:${starter.accent}"><span class="eyebrow">COMPAÑERO DE ESTA REGIÓN</span><div class="partner-art"><div class="starter-orb" aria-hidden="true"><i></i></div></div><h2>${escapeHtml(starter.name)}</h2><div class="type-row">${starter.types.map((type) => `<span class="type-chip">${escapeHtml(type)}</span>`).join('')}</div><div class="partner-card__stat"><span>HABILIDAD DE APUNTADO</span><b>Psicorrayo <small>· clic izquierdo</small></b></div><div class="partner-card__stat"><span>MOVIMIENTO 3D</span><b>WASD <small>· salto con espacio</small></b></div></aside>
        </section>
      </main>
    `;
  }

  renderRunHud() {
    const run = this.flow.activeRun;
    if (!run) return '';
    return `
      <div class="run-hud">
        <header class="run-hud__top">
          <div class="run-location"><span class="run-emblem">${run.regionName.slice(0, 1)}</span><div><small>${escapeHtml(run.regionName)} · EXPEDICIÓN</small><b>${escapeHtml(run.mapName)}</b></div></div>
          <div class="run-timer"><small>TIEMPO</small><b id="run-clock">00:00</b></div>
          <button class="hud-pause" data-action="pause-run" aria-label="Pausar partida">Ⅱ</button>
        </header>
        <div class="run-hud__bottom"><span class="run-companion"><i style="--creature-color:${run.starter.color}"></i>${escapeHtml(run.starter.name)}</span><span class="run-control-line"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover <span>·</span> <kbd>SPACE</kbd> saltar <span>·</span> <kbd>CLIC</kbd> Psicorrayo</span><button class="run-pause-text" data-action="pause-run">PAUSA <span>Ⅱ</span></button></div>
        </div>
        ${this.paused ? `
          <div class="pause-backdrop"><section class="pause-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="eyebrow">PARTIDA EN PAUSA</span><h2 id="pause-title">Toma aire.</h2><p>La horda espera. Tu progreso de región está guardado entre sesiones.</p><button class="button button--primary" data-action="resume-run">Volver a la partida <span>↗</span></button><button class="text-button pause-exit" data-action="return-hub">Abandonar expedición</button></section></div>
        ` : ''}
      </div>
    `;
  }

  renderResults() {
    const result = this.flow.lastRunSummary;
    if (!result) return this.renderHub();
    const region = REGIONS.find((entry) => entry.id === result.regionId);
    return `
      <main class="focus-screen results-screen"><span class="eyebrow">INFORME DE EXPEDICIÓN · ${escapeHtml(region?.name ?? '')}</span><h1>${result.victory ? 'Región superada.' : 'Expedición terminada.'}</h1><p>Tiempo de campo: ${this.formatTime(result.elapsedSeconds)} · Monedas: ${result.rewards.coins} · Tickets: ${result.rewards.tickets} · Gemas: ${result.rewards.gems}</p>${result.unlockedRegionId ? `<p class="unlock-banner">Nueva región disponible: ${escapeHtml(REGIONS.find((entry) => entry.id === result.unlockedRegionId)?.name ?? result.unlockedRegionId)}</p>` : ''}<button class="button button--primary" data-action="back-to-hub">Volver al mapa <span>↗</span></button></main>
    `;
  }

  async handleClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;

    switch (target.dataset.action) {
      case 'tab':
        this.activeTab = target.dataset.tab ?? 'regions';
        this.render();
        break;
      case 'open-region':
        this.flow.selectRegion(target.dataset.regionId);
        this.render();
        break;
      case 'pick-starter':
        this.flow.chooseStarter(target.dataset.starterId);
        this.render();
        break;
      case 'enter-run': {
        const runConfig = this.flow.enterRun();
        if (!runConfig) {
          this.render();
          break;
        }
        this.paused = false;
        this.render();
        try {
          await this.onStartRun(runConfig);
        } catch (error) {
          this.flow.returnToHub();
          this.render();
          this.showError(`No se pudo iniciar WebGL: ${error.message}`);
        }
        break;
      }
      case 'buy-upgrade': {
        const result = this.flow.purchaseUpgrade(target.dataset.upgradeId);
        this.render();
        if (!result.ok) this.showError(result.reason === 'not-enough-coins' ? `Necesitas ${result.cost} monedas para esa mejora.` : 'Esa mejora ya está al máximo.');
        break;
      }
      case 'pause-run':
        this.onSetPause(!this.paused);
        break;
      case 'resume-run':
        this.onSetPause(false);
        this.onResume();
        break;
      case 'return-hub':
      case 'back-to-hub':
        this.onReturnToHub();
        this.flow.returnToHub();
        this.activeTab = 'regions';
        this.paused = false;
        this.render();
        break;
      default:
        break;
    }
  }

  setPaused(paused) {
    this.paused = paused;
    if (this.flow.screen === 'run') this.render();
  }

  updateHud({ elapsedSeconds }) {
    const clock = this.root.querySelector('#run-clock');
    if (clock) clock.textContent = this.formatTime(elapsedSeconds);
  }

  formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const remainder = (safeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    this.root.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  dispose() {
    this.root.removeEventListener('click', this.handleClick);
  }
}
