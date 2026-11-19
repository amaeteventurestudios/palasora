# Palasora build lab

A standalone prototype of the build tray: open `/build-lab/` (or serve this folder) to see it.

- One rule book (`canPlace`, `place`, `drawRoad`, `fillArea`, `setLights`, `remove` in `town.js`) handles every placement, whether a person taps the tray or an AI agent decides.
- Four agents (Amara roads, Kofi farms, Zainab homes, Tunde shops) read the town and call that rule book on their own.
- Vehicles keep to the right-hand lane, keep their distance, wait for a free junction and stop at red lights; each type drives at its own pace.
- Three.js r160 is vendored here (`three.module.min.js`, MIT, `LICENSE`).
- Test hooks: `window.__town` (`skipIntro`, `ff`, `setTime`, `render`, `overlaps`, `state`, `look`, `screenOf`, `select`). Add `?still` for screenshots and `?lite` for the phone tier.
