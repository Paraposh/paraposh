# Milestone (b): damage / armor model, what's tunable

## Formulas (all in `src/sim/math`)
- `resist_eff = clamp(resist - shred - pen, resistMin, resistMax)`
- physical: `dmg * (1 - armor_eff)`; magic: `dmg * (1 - magicResist_eff)`; true: `dmg`.
- Splash: `dmg * resistFormula * splashFactor(d)`, where `splashFactor = lerp(1, splashEdgeMult, d / radius)` inside the radius and 0 outside. Centre is the projectile's landing point, not the target.
- Shred lands after the damage of the hit that applied it, so the first hit never benefits from its own shred.

## Data knobs
| Knob | File | Effect |
|---|---|---|
| `armorPen`, `magicPen` | towers.json tier | Flat reduction (fraction points) to the target's resist for that tower's hits. |
| `shred.armor / magic` | towers.json tier | Resist removed per stack. |
| `shred.duration`, `shred.maxStacks` | towers.json tier | Stack lifetime (refreshed on each hit) and cap. |
| `splash.radius` | towers.json tier | Blast radius in world units. Hits only enemies the tower could target (no flyers for ground-only towers). |
| `minRange` | towers.json tier | Artillery dead zone around the tower. |
| `splashEdgeMult` | config.json | Damage multiplier at the rim of a blast (0.4 default). |
| `resistMin`, `resistMax` | config.json | Hard clamp on effective resist. |
| New enemies: `armored_brute` (armor 0.5), `arcane_wisp` (mr 0.6), `cave_bat` (flying) | enemies.json | Counter-play for each tower. |
| New towers: `mage` (magic, anti-air, magic shred), `mortar` (splash, armor shred, ground only) | towers.json | |

## Notes
- Wave 1 now contains all four enemy types. Only wave 1 runs until milestone (d).
- Tower upgrade tiers and the two tier-4 specializations are not built yet; each tower still has tier 1 only. The `armorPen`/`shred` fields are already tier-level so specializations can set them.
