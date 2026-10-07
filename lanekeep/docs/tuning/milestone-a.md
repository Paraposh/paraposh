# Milestone (a): what's tunable

Everything below lives in `data/`; no code change needed.

| Knob | File | Effect |
|---|---|---|
| `tickRate` | config.json | Sim Hz (60). Changing it rescales every seconds-based value. |
| `startingLives` | config.json | Lives pool (20). |
| `laneOffsetJitter` | config.json | Random lateral wobble as a fraction of `laneSpacing`. |
| `projectileLeadIterations` | config.json | Accuracy of the lead solver (4 is plenty). |
| `pathSamplesPerSegment` | config.json | Spline bake resolution. |
| `resistMin` / `resistMax` | config.json | Clamp on armor / magic resist (0 to 0.9). |
| `hp`, `speed`, `armor`, `magicResist`, `bounty`, `livesCost` | enemies.json | Per-enemy stats. Speed is world units/sec. |
| `cost`, `range`, `damage` [min,max], `cooldown`, `projectile.speed` | towers.json (tiers[]) | Archer stats. |
| `points`, `lanes`, `laneSpacing` | levels/level-01.json | Path shape and width. |
| `startGold`, `buildSpots` | levels/level-01.json | Economy start, spot positions. |
| `groups[].count / interval / startDelay`, `preDelay` | waves/level-01.waves.json | Spawn timing. |

## Behaviour notes
- Projectiles are committed: they fly to the predicted intercept point and damage the target on arrival if it is still alive. If it died or leaked in flight, the shot fizzles. Homing/miss rules can be added later.
- Targeting: furthest along path within range, ties to the lowest entity id. Flyers are skipped unless the tower has `antiAir`.
- Only wave 1 runs, auto-started. Wave sequencing, early call and economy arrive in milestone (d).
- Damage uses `dmg * (1 - resist)` with clamping already; pen/shred/splash arrive in (b).
