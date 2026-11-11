import { useEffect, useState } from "react";
import { Activity, Check, CircleAlert, LoaderCircle, Square } from "lucide-react";
import type { LiveToolTaskProgress } from "../lib/saraAudio";

const RECENT_MS = 8_000;

export function LiveToolTaskHud({ tasks, onCancel }: { tasks: LiveToolTaskProgress[]; onCancel: (taskId: string) => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = tasks.filter((task) =>
    task.state === "accepted" || task.state === "waiting" || task.state === "cancelling" || Date.now() - task.at < RECENT_MS,
  ).slice(-3).reverse();
  if (!visible.length) return null;

  return <div className="absolute bottom-28 right-6 z-40 flex w-72 flex-col gap-2 sm:right-10" aria-live="polite">
    {visible.map((task) => {
      const active = task.state === "accepted" || task.state === "waiting" || task.state === "cancelling";
      const Icon = active ? (task.state === "cancelling" ? LoaderCircle : task.state === "waiting" ? CircleAlert : Activity) : task.state === "completed" ? Check : CircleAlert;
      const tone = task.state === "completed" ? "text-emerald-200" : task.state === "failed" ? "text-rose-200" : task.state === "cancelled" ? "text-slate-400" : task.state === "waiting" ? "text-amber-200" : "text-cyan-200";
      return <div key={task.taskId} className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-left shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className={`flex min-w-0 items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${tone}`}>
            <Icon size={12} className={task.state === "cancelling" ? "animate-spin" : "shrink-0"} />
            <span className="truncate">{task.tool.replace(/([a-z])([A-Z])/g, "$1 $2")} · {task.state}</span>
          </div>
          {active && task.state !== "cancelling" && task.state !== "waiting" && <button type="button" onClick={() => onCancel(task.taskId)} title="Cancel this task only" aria-label="Cancel this task" className="shrink-0 rounded p-1 text-rose-300 hover:bg-rose-400/10"><Square size={11} /></button>}
        </div>
        {task.message && <div className="mt-1 text-[11px] text-slate-300">{task.message}</div>}
      </div>;
    })}
  </div>;
}
