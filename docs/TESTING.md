# SARA Windows testing

## Safe local checks

```powershell
npm run lint
npm run build:desktop-host:experimental
npm run inspect:desktop-hierarchy
npm run observe:explorer -- -Seconds 15 -IntervalMs 500
npm run test:windows-phase2:e2e
```

These checks do not terminate Explorer or modify shell configuration.

## Experimental surface

```powershell
npm run run:desktop-surface
```

This requires explicit opt-in, runs a separate non-parented native window, and
must be closed manually. It is not a wallpaper-host test and does not prove
desktop icon coexistence.

## Not proven by local tests

- WorkerW/Progman attachment.
- Native icon dragging and context-menu preservation.
- Explorer crash recovery.
- Physical monitor disconnect/reconnect.
- Mixed-DPI multi-monitor behavior.
- Primary-shell activation.

Those require an isolated Windows test account or VM and real interactive
testing. Explorer remains the active shell during development.
