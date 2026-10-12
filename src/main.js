import './styles.css';
import { RegionFlow } from './flow/RegionFlow.js';
import { ProfileStore } from './flow/ProfileStore.js';
import { MenuController } from './menu/MenuController.js';

const gameRoot = document.querySelector('#game-root');
const uiRoot = document.querySelector('#ui-root');
const flow = new RegionFlow(new ProfileStore());

let menu = null;
let game = null;
let gameModulePromise = null;

async function startGame(runConfig) {
  if (!game) {
    gameModulePromise ??= import('./game/GameApp.js');
    const { GameApp } = await gameModulePromise;
    game = new GameApp(gameRoot, {
      onPauseChange: (paused) => menu?.setPaused(paused),
      onHudUpdate: (time) => menu?.updateHud(time),
    });
  }
  game.start(runConfig);
}

menu = new MenuController(uiRoot, flow, {
  onStartRun: startGame,
  onReturnToHub: () => game?.stop(),
  onSetPause: (paused) => game?.setPaused(paused),
  onResume: () => game?.setPaused(false),
});

window.addEventListener('pagehide', () => {
  menu?.dispose();
  game?.dispose();
}, { once: true });
