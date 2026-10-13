# Mosswing

Reference: concept.png, 1536 × 1024, generated with built-in Image Gen.

Full-screen game. Peach sky, pine text, sage jade stone, apricot seed creature. Orthographic view with a slight elevation. Georgia title with tight tracking; Arial controls. Top-left leaf and tracked wordmark, top-right best and audio. Centered title in upper fifth, action in lower fifth. No page scroll or cards.

Visible ready copy: MOSSWING; BEST 00; Mosswing; Small wings. Endless wonder.; Take flight; Tap anywhere or press space; ONE TAP. ONE MORE TRY.

Gameplay: one-tap impulse, fixed-step gravity, fixed-size gaps, body-based collision, one point per completely cleared gap, instant failure. Score replaces intro. Defeat and pause use the same typography over softened live scenery. Mobile preserves fixed vertical playfield and moves player left to retain lookahead.

Intentional deviations: real procedural 3D geometry replaces the raster concept and sprite asset pass, as the user requires a 3D single-file game without external assets. The scene uses reusable mesh geometry, material-colored facets, real lighting, and animated leaf wings. Gap geometry is simplified and unambiguous for fair collision. The ready interface follows the reference; exact image pixels are not reproduced.

## Final verification

Browser/IAB used for interaction and screenshots. Checked 390×844 portrait, 844×390 landscape and the default 908×932 desktop pane. Also checked DOM layout at 1536×1024; the IAB screenshot at that override rendered into a partial backing surface, so native-size screenshot fidelity is not claimed. Compared concept.png against mobile-final.png and desktop-final.png with view_image.

- Copy: ready-state copy matches the inventory; no added promotional copy. Landscape hides only the optional footer to preserve play area.
- Typography: Georgia heading, tracked Arial metadata, serif pill action retained; mobile title fits without wrapping.
- Palette: peach sky, pine text and jade pillars retained. Corrected over-yellow lighting and strengthened apricot body color.
- Character: original seed silhouette, ivory face, sprout antennae and separately animated leaf wings retained in 3D.
- Composition: moved ready-state pillars toward the right on portrait so they do not cross the title; fixed scaled island geometry that incorrectly protruded above moss caps.
- Controls: touch-sized sound, pause and primary action; no overflow in portrait or landscape.
- Gameplay: observed first gap scoring through real keyboard input. Checked death, retry, pause/resume, best-score persistence and mute persistence. No runtime errors.
- Physics: tested impulse, gravity, fatal collision, safe pass, single scoring, recycling, 30/60/120 Hz update paths and 240 seconds on a seeded random course.
- Standalone: no external resource tags; Three.js and its MIT license, all geometry, UI, and synthesized audio are embedded. Artifact bytes match the committed source.

The implementation is verified against the selected visual direction, with the explicitly documented real-3D and responsive-layout deviations; it does not claim pixel identity to a raster concept.

Final correction: flight ceiling/floor now track the visible orthographic viewport, including portrait. Added collision for the visible floating island bases. Targeted portrait-boundary and island-hit regression checks passed.
