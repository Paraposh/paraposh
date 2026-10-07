# Milestone (f): UI and juice

## What it adds
- Screens: Menu, Map, Level (Prepare, Wave, Win/Lose), Results, driven by `GameFlow` (`src/game/flow.ts`). Illegal transitions throw.
- Campaign map from `data/campaign.json` (positions, unlock requirements). Progress keeps best stars per level (in memory until milestone g).
- DOM overlay (`src/ui/ui.ts`) over a PixiJS canvas. All numbers shown come from pure view models (`src/ui/viewModels.ts`), covered by unit tests.
- Controls: click a free spot to build, click a tower for stats, upgrade, specialize, sell. Click ground to move the hero. Right-click sets the nearest barracks rally. Keys: Space pause, 1/2 speed, N call wave, M meteor, F reinforcements, H hero ability, Esc cancel.
- Juice (render only, never feeds the sim): floating damage and gold numbers, particles, rings, screen shake on splash, spells, leaks and boss phases, red flash on a leak, spell telegraphs.
- Sound: original WebAudio synth effects (`src/audio/sfx.ts`), mute toggle. Starts after the first click.

## What's tunable
| Knob | Where |
|---|---|
| Shake size, particle counts, number sizes | `src/render/juice.ts` |
| Colors and sizes of towers and enemies | `src/render/renderer.ts` |
| Sound pitch and volume | `src/audio/sfx.ts` |
| Map node positions and unlocks | `data/campaign.json` |
| Spell hotkeys | `HOTKEYS` in `src/ui/viewModels.ts` |
| Pick radius for build spots | `pick()` in `src/ui/picking.ts` |

## Notes
- The per-attempt seed is random and chosen in `main.ts`, outside the sim. Each attempt is still reproducible from its seed.
- Results appear 0.9s after the end so the final effects play.
