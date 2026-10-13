# Fishslop design tokens

Direction: **bathyscaphe instrument panel.** The HUD reads like the gauges of a 1960s research submersible: dark enamel panels, brass bezels, green phosphor readouts, hull-marking stencil type. The 3D reef carries the colour; the interface stays quiet around it.

The one loud element is the **sonar scope** (bottom-left): a round phosphor display with a brass bezel, a rotating sweep, and blips for fish, coins, pulses and the Veilfin.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#04141c` | Page background, text on coral buttons |
| `--phosphor` | `#9cffb0` | Sonar, meters, focus rings, "ready" states |
| `--brass` | `#e0a93b` | Coins, prices, scope bezel |
| `--coral` | `#ff6b4a` | Primary action, the sub's paint, the logo's second word |
| `--foam` | `#eaf4f1` | Body text |
| `--silt` | `#86a3a2` | Labels, secondary text |

Panels are `rgba(4, 20, 28, 0.74)` with a 1px phosphor hairline at 16% and a backdrop blur.

## Type

- **Display:** Big Shoulders Stencil Display 900. Used for the logo, coin count, tier name and panel titles. Stencil letterforms echo hull markings.
- **Body:** Instrument Sans 400–600. Buttons, toasts and descriptions.
- **Readouts:** Martian Mono 400–500, uppercase, tracked +0.14em. Labels, depth and heading.

## Scene palette (day → night)

Fog `#0c5063 → #03101b`, surface `#7fe3ec → #1d4a6e`, sun `#dffcff → #9cc4ff`. At night, corals fluoresce, 18% of the marine snow becomes bioluminescent plankton, the sub's headlamps take over, and bloom strengthens.

## Rules

- Sentence case everywhere. Buttons say what they do ("Dive in", "Resume dive", "Buy · 30").
- No card-in-card nesting and no gradients on UI panels. Glow is reserved for phosphor and brass.
- Motion: toasts ease in, the coin counter bumps, and nothing else animates on its own. `prefers-reduced-motion` disables all CSS motion.
