"""
SARA & J.A.R.V.I.S. Specialized Department Sub-Agents (`sara_os/central_layer/departments/`):
- `tactical_diag`  (F.R.I.D.A.Y. — Live Bottleneck & Log Counter-Analysis)
- `edith_recon`    (E.D.I.T.H. — Real-Time Port/DNS/TLS Recon & 5-Bullet Dossier)
- `karen_replay`   (K.A.R.E.N. — 60s Rolling Incident Ring-Buffer & Workspace Mode Presets)
- `workshop_forge` (H.O.M.E.R. / Stark Workshop — Live Repo SVG/Mermaid Schematic & Ship Pipeline)
"""

from .edith_recon import build_instant_dossier, inspect_domain_and_tls, scan_local_ports_and_services
from .karen_replay import GLOBAL_RING_BUFFER, switch_workspace_mode
from .tactical_diag import analyze_live_log_pattern, remediate_bottleneck, scan_live_system_bottlenecks
from .workshop_forge import assemble_and_ship_pipeline, generate_live_project_diagram

__all__ = [
    "scan_live_system_bottlenecks",
    "remediate_bottleneck",
    "analyze_live_log_pattern",
    "scan_local_ports_and_services",
    "inspect_domain_and_tls",
    "build_instant_dossier",
    "GLOBAL_RING_BUFFER",
    "switch_workspace_mode",
    "generate_live_project_diagram",
    "assemble_and_ship_pipeline",
]
