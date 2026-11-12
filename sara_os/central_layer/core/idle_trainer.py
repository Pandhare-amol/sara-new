#!/usr/bin/env python3
"""
Background Idle Study Loop (`core/idle_trainer.py`)
Silently researches and practices new Python skills when Windows 10 Pro CPU load is < 20%.
"""

import asyncio

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore
from core.autonomous_trainer import propose_next_learning_topic, study_and_practice


async def autonomous_idle_study_loop(max_skills_per_day: int = 3) -> None:
    """Silently self-trains when PC CPU is idle (<20%), preserving 8 GB RAM headroom."""
    learned_today = 0
    while True:
        ram_ok = psutil.virtual_memory().percent < 80.0 if psutil else True
        cpu_ok = psutil.cpu_percent(interval=2.0) < 20.0 if psutil else True
        if learned_today < max_skills_per_day and ram_ok and cpu_ok:
            topic = await asyncio.to_thread(propose_next_learning_topic)
            report = await asyncio.to_thread(study_and_practice, topic)
            print(f"[SARA Idle Self-Trainer] {report}")
            learned_today += 1
            await asyncio.sleep(1800)
        else:
            await asyncio.sleep(300)


if __name__ == "__main__":
    asyncio.run(autonomous_idle_study_loop())
