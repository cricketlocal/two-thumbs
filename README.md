# Two Thumbs 🪄🛡️

**Vertical mobile wizard duel** — one phone, two thumbs, zero mercy.

Top player swipes to launch air-hockey spells. Bottom player drags a paddle-shield that **grows +10% on every block** and **shrinks −10% on every miss** while the castle wall chips away. Roles swap each round. Built to go viral on couches, pubs, and sibling rivalries.

![License: MIT](https://img.shields.io/badge/license-MIT-gold)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-7b3cff)
![Stack](https://img.shields.io/badge/stack-HTML5%20Canvas-ff6b3d)

## Play now

**Live:** [cricketlocal.github.io/two-thumbs](https://cricketlocal.github.io/two-thumbs/)

Or open `index.html` locally in a mobile browser (or desktop Chrome/Edge/Firefox).

```bash
# optional local server (recommended)
cd two-thumbs
npx --yes serve .
# then open the printed URL on your phone
```

**Touch-first.** Desktop: drag to aim-swipe from the top half, move paddle in the bottom half (or ←/→ / A/D). Space launches a straight shot.

## Why it stands out

| Hook | Why it spreads |
|------|----------------|
| **Pass-and-play** | One device, two players, instant smack talk |
| **Air-hockey magic** | Spells rebound off neon rails — skill shots, not spam |
| **Paddle drama** | Grow on blocks, shrink on misses — clutch late-game tension |
| **Role swap** | Best of 3; both players attack and defend |
| **Juice** | Particles, combos, screen shake, synthesized SFX |
| **Endless Siege** | Solo high-score mode + local leaderboards |

## Modes

- **Duel Mode** — Hot-seat P1 vs P2, best of 3, role swap each round
- **Endless Siege** — One player uses both thumbs; survive waves; climb the board

## Roster

### Wizards (6)

| Wizard | School | Fantasy |
|--------|--------|---------|
| **Ember** | Fire | Fast fireballs; burns the wall |
| **Frost** | Ice | Chill orbs; blocks freeze the paddle |
| **Shade** | Shadow | Real bolt + fake decoy |
| **Volt** | Lightning | Fast lasers; extra rail rebounds |
| **Venom** | Nature | Splits on first wall bounce |
| **Arcane** | Arcane | Slow meteors; heavy damage |

### Defenders (6)

| Defender | Trait |
|----------|--------|
| **Iron Knight** | Wide sturdy shield; dampened grow/shrink |
| **Red Dragon** | Double-tap for fire breath (clears spells) |
| **Castle King** | Spawns side guards every 3 blocks |
| **Swift Ranger** | Fast slim paddle |
| **Stone Golem** | Wall takes ~45% less damage |
| **Hex Witch** | Chance to nullify spell specials on block |

## Power-ups

Triple Cast · Giant Shield · Time Freeze · Stone Mend · Haste Sigil · Magnet Aegis

## Controls

| Zone | Action |
|------|--------|
| **Top third** | Flick-swipe to cast (no aim line; speed = power) |
| **Bottom third** | Drag paddle-shield |
| **Dragon** | Double-tap bottom zone = fire breath |
| **Pause** | HUD button / `Esc` |

## Project layout

```
two-thumbs/
├── index.html
├── css/style.css
├── js/
│   ├── data.js       # roster + constants
│   ├── audio.js      # Web Audio SFX
│   ├── particles.js  # VFX system
│   ├── game.js       # duel engine
│   └── main.js       # menus, LB, loop
├── LICENSE           # MIT
└── README.md
```

## Packaging for stores

HTML5 builds wrap cleanly with:

- **Capacitor** / **Cordova** → native iOS & Android shells
- **PWA** → Add to Home Screen (manifest can be added in a follow-up)
- **Unity port** — same design doc; this HTML5 build is the playable vertical slice

## Design pillars (viral)

1. **Readable in 5 seconds** — tutorial is four cards
2. **Skill expression** — angle, power, rebound reads
3. **Spectator juice** — combos, PERFECT blocks, wall cracks, confetti
4. **Fair drama** — role swap prevents one-sided “I always attack”
5. **Zero install friction** — link, play, fight

## License

MIT — see [LICENSE](./LICENSE). Build on it, ship it, meme it.

---

Made for the scroll-stopping moment when someone says *“one more round.”*
