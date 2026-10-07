# Art pass

All art is original vector drawing in code (`src/render/art.ts`), so there are no image files and nothing is copied.

- **Map:** `drawTerrain` paints meadow patches, a packed-dirt road with ruts and pebbles, a pond with lily pads, trees, bushes, rocks, flowers and mossy stone build pads. It is drawn once per level and uses its own small seeded PRNG so the scenery is identical every visit. Trees keep clear of the road and build spots.
- **Towers:** distinct silhouettes (wooden archer tower, stone mage tower with a floating crystal, wheeled mortar, blue barracks with a banner). Each tier adds height, banners, barrels or crystals; specializations tint the accent. Shooters recoil or flash when they fire.
- **Enemies:** nine unique designs, drawn facing their direction of travel with a walk cycle: runner, brute, wisp, bat, shaman, archer, ogre (turns red when enraged), brood mother, crowned warlord. Everything on the ground is sorted back to front.
- **Units and projectiles:** footmen, summoned reinforcements, caped hero, arrows, magic bolts, mortar shells, falling meteors.

## What's tunable
Colors, sizes and counts are plain numbers in `art.ts` (tree count in `drawTerrain`, per-enemy shapes in `drawEnemy`). Hitboxes and balance are untouched.
