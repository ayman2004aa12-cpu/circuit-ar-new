# Vendored runtime dependencies

Retrieved 2026-11-12 from the official npm registry. Files are unmodified copies.

| Dependency | Exact version | Included | License |
| --- | --- | --- | --- |
| `@8thwall/engine-binary` | `1.0.0` | Complete original `dist/` | [XR Engine License](8thwall/LICENSE), limited-use binary; **not MIT** |
| `three` | `0.183.2` | `build/three.module.js`, its dependency `three.core.js` | [MIT](three/LICENSE) |

See [manifest.json](manifest.json) for source URLs, byte sizes and SHA-256 hashes.
The version and layout must be preserved when updating GitHub Pages. In particular,
`xr.js`, `xr-slam.js` and `resources/` must remain siblings as distributed.
The whole original engine distribution is retained so no binary files are modified.
Only the `slam` chunk is preloaded for this application; face/sky resources are not
requested by the CircuitAR application.

The XR Engine software is developed by Niantic Spatial, Inc. Copyright © 2026
Niantic Spatial, Inc. All rights reserved. It is licensed under the linked XR Engine
License Agreement and supplied AS IS without warranties; see its disclaimers.
CircuitAR is a free educational application that incorporates the engine as a runtime;
it does not sell the engine or provide a competing AR engine service.

Official references reviewed:

- https://8thwall.org/docs/engine/overview — local engine loading and `slam` chunk.
- https://8thwall.org/docs/api/engine/xrcontroller/hittest — normalized 0..1 coordinates,
  returned hit types/position/rotation/distance.
- https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule — tracking state
  (`NORMAL`/`LIMITED`), `processCpuResult.reality`, pipeline event listeners.
- https://8thwall.org/docs/api/engine/xrcontroller/configure — SLAM and absolute scale.
- https://8thwall.org/docs/api/engine/xr8/run — rear camera, WebGL2, supported mobile device mode.
- https://github.com/8thwall/threejs-world-effects-example — official sample uses
  Three.js `^0.183.2`; reviewed commit `2e18f3abefc4db2d190b66c2ffcdc9c852ebf2e5`.
- https://github.com/8thwall/engine — reviewed repository commit
  `e1421ae742a9c5d654871367c64c1de3ad044caf`.
- https://8thwall.org/docs/migration/faq — retired hosted platform does not prevent
  new applications using the freely distributed binary and self-hosting.
