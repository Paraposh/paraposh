# Milestone (g): save system and star tree

## What it adds
- **Save** (`src/save/save.ts`): one JSON blob in localStorage under `lanekeep.save`, with a `version`. Older versions are lifted step by step through `MIGRATIONS` (v1 stored stars only, v2 adds meta ranks and settings). Malformed fields are dropped. An unreadable or future-version save is copied to `lanekeep.save.corrupt` and the game starts fresh, so nothing is silently destroyed. Blocked or full storage never throws; the game just runs without saving. Saves happen after each result, each upgrade purchase and each mute toggle.
- **Star tree** (`data/meta-upgrades.json`, schema in `data/schemas/meta-upgrades.schema.json`, logic in `src/meta/meta.ts`): total earned stars minus stars spent are spendable on permanent upgrades. Costs are per rank, prerequisites must be listed earlier in the file (no cycles).
- Upgrades are applied by `applyMeta`, which returns a modified copy of the game data at level start. The sim never knows about meta progression, so replays of a given data set stay deterministic.
- Map screen has an Upgrades button (shows unspent stars); the menu has a two-click "Reset progress".

## Design decisions (ambiguous in the brief)
- Refund is free and total ("Refund all"), so players can experiment without fear. Stars are never lost.
- Stars come from best result per level (replaying cannot farm more than 3 per level).
- Spell cooldown reduction is capped at 50% in total.
- Tower damage bonus applies to archer, mage and mortar tiers and their specializations; barracks soldiers and the hero are not affected by it.

## What's tunable
| Knob | Where |
|---|---|
| Upgrade names, costs, ranks, per-rank size, prerequisites | `data/meta-upgrades.json` |
| Effect kinds available | `EffectKind` and `applyMeta` in `src/meta/meta.ts` |
| Cooldown reduction cap | `MAX_COOLDOWN_REDUCTION` |
| Save format and migrations | `src/save/save.ts` |

## Balance note
Full star tree with 3 stars on the single level costs far more than 3 stars, so only a few early ranks are reachable until more levels exist. With only level 1 in the campaign, the bot balance tests intentionally run without meta upgrades.
