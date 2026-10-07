import { Application } from 'pixi.js';
import { loadCampaign, loadLevelData, loadMeta } from './data/load';
import { applyMeta, buy, respec, starsAvailable } from './meta/meta';
import { defaultSave, loadSave, resetSave, writeSave, type KeyValueStore } from './save/save';
import { GameFlow } from './game/flow';
import { newProgress, recordResult } from './game/progress';
import { Renderer } from './render/renderer';
import { Sfx } from './audio/sfx';
import { FixedStepLoop } from './sim/loop';
import { Sim } from './sim/sim';
import { nearestBarracks, pick } from './ui/picking';
import { Ui } from './ui/ui';
import type { SimEvent } from './sim/core/types';


async function boot(): Promise<void> {
  const campaign = loadCampaign();
  const meta = loadMeta();
  // localStorage can be missing or blocked (private windows); the game then simply runs without saving.
  let store: KeyValueStore | undefined;
  try { store = window.localStorage; } catch { store = undefined; }
  let save = store ? loadSave(store).save : defaultSave();
  const persist = (): void => { if (store) writeSave(store, save); };
  const flow = new GameFlow();
  const sfx = new Sfx();
  sfx.muted = save.settings.muted;
  let sim: Sim | undefined;
  let loop: FixedStepLoop | undefined;
  let newStars = 0;
  let pointer: [number, number] = [0, 0];
  let showUpgrades = false;

  const stage = document.getElementById('stage') as HTMLElement;
  const app = new Application();
  await app.init({ width: 1280, height: 720, background: 0x1b2a1f, antialias: true });
  stage.insertBefore(app.canvas, stage.firstChild);
  const renderer = new Renderer(app);

  const startLevel = (id: string): void => {
    const data = applyMeta(loadLevelData(id), meta, save.meta);
    // The seed is chosen here, outside the sim, so every attempt differs but each is reproducible from its seed.
    sim = new Sim(data, (Math.random() * 0x7fffffff) | 0);
    loop = new FixedStepLoop(sim);
    loop.speed = ui.speed;
    renderer.clear();
    ui.closePopup();
    ui.armedSpell = null;
  };

  const ui = new Ui(document.getElementById('ui') as HTMLElement, {
    onPlay: () => { ui.confirmReset = false; sfx.unlock(); sfx.play('click'); flow.openMap(); },
    onSelectLevel: (id) => { sfx.play('click'); flow.startLevel(id); startLevel(id); },
    onBackToMenu: () => flow.backToMenu(),
    onRetry: () => { flow.retry(); startLevel(flow.levelId); },
    onContinue: () => {
      const r = flow.result;
      const i = campaign.levels.findIndex((l) => l.id === flow.levelId);
      const next = r?.won ? campaign.levels[i + 1] : undefined;
      if (next) { flow.backToMap(); flow.startLevel(next.id); startLevel(next.id); } else flow.backToMap();
    },
    onQuitLevel: () => { sim = undefined; flow.backToMap(); },
    onBuild: (spotId, towerId) => { sim?.queue({ type: 'placeTower', spotId, towerId }); ui.closePopup(); },
    onUpgrade: (towerId) => sim?.queue({ type: 'upgradeTower', towerId }),
    onSpecialize: (towerId, specId) => { sim?.queue({ type: 'specialize', towerId, specId }); ui.closePopup(); },
    onSell: (towerId) => { sim?.queue({ type: 'sellTower', towerId }); ui.closePopup(); },
    onCallWave: () => sim?.queue({ type: 'callWave' }),
    onSpeed: (s) => { ui.speed = s; if (loop) loop.speed = s; },
    onSpell: (key, needsTarget) => {
      if (key.startsWith('hero:') || !needsTarget) sim?.queue({ type: 'heroAbility' });
      else ui.armedSpell = ui.armedSpell === key ? null : key;
    },
    onMute: (m) => { sfx.muted = m; save.settings.muted = m; persist(); },
    onOpenUpgrades: () => { showUpgrades = true; },
    onCloseUpgrades: () => { showUpgrades = false; },
    onBuyUpgrade: (id) => { if (buy(meta, save.progress, save.meta, id)) { sfx.play('build'); persist(); } },
    onRespec: () => { respec(save.meta); persist(); },
    onResetSave: () => {
      if (!ui.confirmReset) { ui.confirmReset = true; return; }
      ui.confirmReset = false;
      if (store) resetSave(store);
      save = defaultSave();
      ui.muted = false; sfx.muted = false;
    },
  });

  ui.muted = save.settings.muted;

  const toWorld = (ev: PointerEvent | MouseEvent): [number, number] => {
    const r = app.canvas.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 1280, ((ev.clientY - r.top) / r.height) * 720];
  };

  app.canvas.addEventListener('pointermove', (ev) => { pointer = toWorld(ev); });
  app.canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (!sim || flow.screen !== 'level') return;
    const [x, y] = toWorld(ev);
    const id = nearestBarracks(sim, x, y);
    if (id !== undefined) sim.queue({ type: 'setRally', towerId: id, x, y });
  });
  app.canvas.addEventListener('pointerdown', (ev) => {
    if (!sim || flow.screen !== 'level' || ev.button !== 0) return;
    sfx.unlock();
    const [x, y] = toWorld(ev);
    if (ui.armedSpell) {
      sim.queue({ type: 'castSpell', spellId: ui.armedSpell, x, y });
      ui.armedSpell = null;
      return;
    }
    const p = pick(sim, x, y);
    if (p.kind === 'tower') ui.showTowerPopup(p.towerId);
    else if (p.kind === 'spot') ui.showBuildPopup(p.spotId);
    else {
      ui.closePopup();
      sim.queue({ type: 'moveHero', x, y });
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (!sim || flow.screen !== 'level') return;
    const k = ev.key.toLowerCase();
    if (k === ' ') { ev.preventDefault(); ui.speed = ui.speed === 0 ? 1 : 0; if (loop) loop.speed = ui.speed; }
    else if (k === '1' || k === '2') { ui.speed = Number(k); if (loop) loop.speed = ui.speed; }
    else if (k === 'escape') { ui.armedSpell = null; ui.closePopup(); }
    else if (k === 'n') sim.queue({ type: 'callWave' });
    else if (k === 'h') sim.queue({ type: 'heroAbility' });
    else if (k === 'm' && sim.data.level.spells.includes('meteor')) ui.armedSpell = 'meteor';
    else if (k === 'f' && sim.data.level.spells.includes('reinforcements')) ui.armedSpell = 'reinforcements';
  });

  const SOUND: Partial<Record<SimEvent['type'], Parameters<Sfx['play']>[0]>> = {
    projectileFired: 'shoot', projectileHit: 'hit', meleeHit: 'hit', enemyKilled: 'kill', towerPlaced: 'build',
    towerUpgraded: 'build', spellCast: 'spell', spellImpact: 'spell', splashImpact: 'hit', enemyLeaked: 'leak',
    waveStarted: 'wave', heroLevelUp: 'levelup', won: 'win', lost: 'lose',
  };

  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (flow.screen === 'menu') return ui.menu();
    if (flow.screen === 'map') return showUpgrades ? ui.upgrades(meta, save.progress, save.meta) : ui.map(campaign, save.progress.stars, starsAvailable(meta, save.progress, save.meta));
    if (!sim || !loop) return;

    const alpha = loop.advance(dt);
    for (const ev of sim.drainEvents()) {
      renderer.juice.handle(ev);
      if (ev.type === 'towerPlaced') {
        const t = sim.towers.get(ev.id);
        if (t) renderer.juice.towerPlaced(t.x, t.y);
      }
      const s = SOUND[ev.type];
      if (s) sfx.play(s);
    }
    const armedDef = ui.armedSpell ? sim.data.spells[ui.armedSpell] : undefined;
    renderer.draw(sim, alpha, { selectedTowerId: ui.selectedTowerId, armedSpellRadius: armedDef?.kind === 'areaDamage' ? armedDef.radius : null, pointer }, dt);

    const result = flow.update(sim);
    if (result) {
      newStars = recordResult(save.progress, result);
      persist();
      const name = campaign.levels.find((l) => l.id === result.levelId)?.name ?? result.levelId;
      const i = campaign.levels.findIndex((l) => l.id === result.levelId);
      // Let the banner effects play for a moment before the results card appears.
      setTimeout(() => ui.results(result, name, newStars, !!campaign.levels[i + 1]), 900);
    }
    if (flow.screen === 'level') ui.level(sim);
  });
}

void boot();
