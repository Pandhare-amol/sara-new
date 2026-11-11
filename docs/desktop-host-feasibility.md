# Desktop host feasibility

Observed on the current machine:

```text
Progman -> SHELLDLL_DefView -> SysListView32 (FolderView)
```

## Options

| Option | Icons remain native | Taskbar safe | Explorer restart | Status |
|---|---:|---:|---:|---|
| WorkerW/Progman reparenting | Unverified | Risky | Must reattach | Experimental, undocumented dependency |
| Separate non-parented desktop surface | Requires hit-test coordination | Safer | Recreate surface | Recommended fallback |
| Static wallpaper API | Yes | Yes | Strong | Not interactive; documented wallpaper use |

The recommended implementation is a separate, non-elevated SARA surface with
strictly bounded interactive regions. Desktop icon input must remain owned by
Explorer. No global mouse hook, `SetParent`, undocumented attachment message,
shell replacement, or Credential Provider is required for this fallback.

WorkerW attachment remains disabled until it is tested in an isolated Windows
environment with Explorer recovery, icon dragging, context menus, DPI changes,
and multi-monitor topology changes.
