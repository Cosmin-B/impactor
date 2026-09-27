# Impactor design

Primary screen concept: `qa/impactor-concept.png`. Generated in the built-in image tool; the complete prompt specifies a warm, playful 2D delivery world with one dominant scene and a restrained world/memory inspector. Production robot sprite: `public/robot.png`, generated from that concept with a transparent background.

Tokens: warm white `#f7f7f3`, ink `#252c2a`, coral `#f37961`, mint/grass `#c6dcaa`, water `#80d3e4`. Manrope headings, DM Sans controls; pill-free hierarchy, rounded scene frame, quiet inspector. Buttons share one component family. The screen carries a large two-line “Small robot. Big lessons.” headline and no sponsor/company names.

The SVG terrain is an intentional implementation deviation from raster concept scenery: bridge planks, route geometry, labels, and river must remain independently reactive to real backend outcomes. The robot is a generated production asset; all controls and UI text remain native. Server owns outcome, rule and check state. Frontend owns only draft slider values, animation playback, and transient presentation. Geometry and keyframes are fixed outside React updates; Framer Motion handles animation rather than per-frame React state. Range bounds are 1–12 kg.

At desktop, world is dominant with one right inspector. At tablet, controls and memory form two columns below the world; phone places them in one flow. Reduced-motion users receive short outcome transitions.


## Browser verification

IAB was unavailable; Chrome via CUA was used. Initial desktop and real failure captures are `qa/desktop.png` and `qa/fall.png`, viewed directly with `view_image` alongside the generated concept. Checked scene dominance, robot rendering/alpha, bridge and detour geometry, header hierarchy, control styling, and actual collapse/teach state. Short desktop at 1498×716 keeps both routes, primary controls, and outcome in view; only decorative terrain margins crop. Phone layout was tested at 390×844 and viewport override restored. A cropped mobile delivery edge found in that review was corrected by using the full scene width. `qa/mobile.png` is the pre-fix review capture and should be refreshed before final presentation.

Actual baseline delivery and heavier-parcel failure were exercised via UI. Inspector turns prior evidence neutral when draft inputs change, and marks current mismatched evidence stale. Bridge-color buttons are disabled during requests/playback. Synchronous request ownership plus draft/request versions prevent conflicting UI updates. World playback consumes backend route/outcome only; stopped runs stop before the bridge. Root owns full teaching, transfer, and final QA.

## Asset prompts

Both assets used the built-in image-generation tool. Concept brief: a complete 1536×1024 desktop screen for Impactor; warm white layout with large “Small robot. Big lessons.” heading; dominant simple paper-cutout robot world; coral bridge over a blue river, delivery cottage, lower safe stone detour; right rail with 1–12 kg parcel/capacity controls, coral/teal/gold bridge colors, actual checks and memory; native Run/Fresh agent/Reset/Export controls; no sponsor/private company names or fake metrics.

Robot production prompt: use the primary-screen concept solely as style and identity reference; one isolated full-body coral delivery robot carrying a kraft parcel, rounded helmet, dark navy face with white eyes and smile, antenna, articulated coral limbs with dark joints and feet, walking three-quarter right; subtle sculpted paper/toy shading, crisp silhouette, 80% height with padding; no scene, text, frame, floor or cast shadow; true transparent background. Saved in `public/robot.png`; concept retained outside the shipped public bundle.

## Final verification

The complete Chrome flow passed: baseline delivery, heavier-parcel failure, empty-note teaching with real GBrain write/recall, unchanged retry with the historical ghost, fresh-agent transfer at a new weight, and color-only evidence reuse. The returned Memorable procedure was inspected in the graph. `qa/learned-graph.png` captures the real successful replay. The final 390×844 layout was recaptured in `qa/mobile-final.png` and inspected; both routes and the delivery endpoint are visible, and the viewport override was reset. The export endpoint returned HTTP 200 with attachment headers and valid JSON. Chrome automation did not report the browser download event, so export contents were also verified directly through the API.

The final live smoke test passed seven scenarios through the hosted memory integrations, including admission and recall, unseen fractional inputs, a weaker bridge, JSON export, validation, and same-origin enforcement. Observations are saved locally under `qa/live-smoke.json`. The engine suite covers 24 cases.
