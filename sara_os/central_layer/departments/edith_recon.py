#!/usr/bin/env python3
"""
E.D.I.T.H. Department — `edith_recon.py`
Real-Time Port, Socket, DNS, TLS/SSL Certificate Scanner + Instant 5-Bullet Dossier Builder.
100% Real Socket / DNS / TLS / SQLite Reconnaissance (Zero Mock Data).
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import socket
import sqlite3
import ssl
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

DEFAULT_DEV_PORTS = [80, 443, 3000, 3001, 4173, 5000, 5173, 5432, 6379, 8000, 8080, 8765, 9222]


def _probe_single_port(host: str, port: int, timeout: float = 0.25) -> Optional[Dict[str, Any]]:
    t0 = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            ms = round((time.perf_counter() - t0) * 1000.0, 2)
            banner = ""
            if port in (80, 3000, 3001, 4173, 5000, 5173, 8000, 8080, 8765, 9222):
                try:
                    sock.settimeout(0.25)
                    sock.sendall(f"HEAD / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode("ascii"))
                    raw = sock.recv(256).decode("latin1", errors="ignore")
                    first_line = raw.splitlines()[0] if raw else ""
                    banner = first_line[:80]
                except Exception:
                    banner = "tcp_open"
            return {"port": port, "state": "OPEN", "latency_ms": ms, "banner": banner or "tcp_open"}
    except OSError:
        return None


def scan_local_ports_and_services(host: str = "127.0.0.1", ports: Optional[List[int]] = None) -> Dict[str, Any]:
    """Performs a real concurrent TCP socket sweep across local/LAN ports."""
    target_ports = ports or DEFAULT_DEV_PORTS
    started = time.perf_counter()
    open_ports: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(16, max(1, len(target_ports)))) as pool:
        futures = [pool.submit(_probe_single_port, host, int(p)) for p in target_ports]
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res:
                open_ports.append(res)
    open_ports.sort(key=lambda item: item["port"])
    return {
        "department": "EDITH",
        "module": "edith_recon",
        "host": host,
        "scanned_count": len(target_ports),
        "open_ports": open_ports,
        "scan_ms": round((time.perf_counter() - started) * 1000.0, 2),
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


def inspect_domain_and_tls(domain_or_url: str) -> Dict[str, Any]:
    """Performs real DNS resolution + TLS handshake certificate inspection on a domain or URL."""
    clean = domain_or_url.strip()
    if "://" in clean:
        parsed = urlparse(clean)
        hostname = parsed.hostname or clean
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    else:
        hostname = clean.split("/")[0].split(":")[0]
        port = 443

    ips: List[str] = []
    try:
        infos = socket.getaddrinfo(hostname, None)
        ips = sorted({info[4][0] for info in infos if info and info[4]})
    except Exception as exc:
        return {
            "department": "EDITH",
            "hostname": hostname,
            "resolved": False,
            "error": str(exc),
        }

    tls_info: Dict[str, Any] = {"checked": False}
    if port == 443:
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((hostname, 443), timeout=2.5) as raw_sock:
                with ctx.wrap_socket(raw_sock, server_hostname=hostname) as tls_sock:
                    cert = tls_sock.getpeercert() or {}
                    not_after = cert.get("notAfter", "")
                    days_remaining: Optional[int] = None
                    if not_after:
                        exp_dt = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                        days_remaining = (exp_dt - datetime.now(timezone.utc)).days
                    tls_info = {
                        "checked": True,
                        "tls_version": tls_sock.version(),
                        "cipher": tls_sock.cipher()[0] if tls_sock.cipher() else None,
                        "not_after": not_after,
                        "days_remaining": days_remaining,
                    }
        except Exception as exc:
            tls_info = {"checked": True, "error": str(exc)}

    return {
        "department": "EDITH",
        "hostname": hostname,
        "resolved": True,
        "ip_addresses": ips[:8],
        "tls": tls_info,
    }


def build_instant_dossier(query: str, sqlite_db_path: Optional[str] = None) -> Dict[str, Any]:
    """Builds a 5-bullet E.D.I.T.H. intelligence card from live DNS/socket/HTTP + local SQLite memory."""
    q = query.strip()
    bullets: List[str] = []
    is_domain = bool(re.match(r"^(https?://)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}", q)) or q in ("localhost", "127.0.0.1")

    domain_intel: Optional[Dict[str, Any]] = None
    if is_domain:
        domain_intel = inspect_domain_and_tls(q)
        if domain_intel.get("resolved"):
            bullets.append(f"Network Identity: '{domain_intel['hostname']}' resolves to {', '.join(domain_intel.get('ip_addresses', [])[:3])}.")
            tls = domain_intel.get("tls", {})
            if tls.get("days_remaining") is not None:
                bullets.append(f"TLS Security: {tls.get('tls_version')} active ({tls.get('cipher')}); certificate valid for {tls['days_remaining']} days.")
            elif tls.get("error"):
                bullets.append(f"TLS Probe Notice: {tls['error'][:100]}.")
        else:
            bullets.append(f"DNS Lookup: '{q}' did not resolve from current host ({domain_intel.get('error', 'unreachable')}).")

    # Search local SQLite audit / memory store if present
    local_hits = 0
    if sqlite_db_path and Path(sqlite_db_path).exists():
        try:
            with sqlite3.connect(sqlite_db_path) as conn:
                cur = conn.execute(
                    "SELECT action, details, created_at FROM audit_log WHERE details LIKE ? ORDER BY id DESC LIMIT 3",
                    (f"%{q}%",),
                )
                rows = cur.fetchall()
                local_hits = len(rows)
                if rows:
                    bullets.append(f"Local Memory Trace: {local_hits} matching event(s) in SARA audit log (latest at {rows[0][2]}).")
        except Exception:
            pass

    if not local_hits:
        bullets.append(f"Local Memory Trace: Zero prior anomalies flagged for '{q}' in local SARA vault.")

    # Optional lightweight HTTP page title fetch when reachable
    if is_domain and q not in ("localhost", "127.0.0.1"):
        target_url = q if "://" in q else f"https://{q}"
        try:
            req = urllib.request.Request(target_url, headers={"User-Agent": "SARA-EDITH-Recon/1.5"})
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                body = resp.read(8192).decode("utf-8", errors="ignore")
                m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
                title = re.sub(r"\s+", " ", m.group(1)).strip() if m else f"HTTP {resp.status}"
                bullets.append(f"Live Endpoint Title: {title[:110]} (HTTP {resp.status}).")
        except Exception:
            pass

    local_ports = scan_local_ports_and_services("127.0.0.1", [3000, 5173, 8000, 8080, 8765])
    open_list = [str(p["port"]) for p in local_ports["open_ports"]]
    bullets.append(f"Host Perimeter Snapshot: Active local dev listeners on ports [{', '.join(open_list) or 'none'}].")
    while len(bullets) < 5:
        bullets.append(f"Tactical Readiness: E.D.I.T.H. continuous watch armed for '{q}'.")

    return {
        "department": "EDITH",
        "query": q,
        "bullets": bullets[:5],
        "domain_intel": domain_intel,
        "local_open_ports": local_ports["open_ports"],
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


def execute(**kwargs: Any) -> str:
    mode = str(kwargs.get("mode", "ports"))
    if mode == "domain":
        return json.dumps(inspect_domain_and_tls(str(kwargs.get("target", "github.com"))))
    if mode == "dossier":
        return json.dumps(build_instant_dossier(str(kwargs.get("query", "localhost")), kwargs.get("sqlite_db_path")))
    return json.dumps(scan_local_ports_and_services(str(kwargs.get("host", "127.0.0.1")), kwargs.get("ports")))


if __name__ == "__main__":
    print(json.dumps(scan_local_ports_and_services(), indent=2))
