import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Camera, Home, Mic, MoreHorizontal, Send, Settings, Smartphone, Square, Volume2, Wifi } from "lucide-react";
import "./style.css";

type Task = { id: string; text: string; state: "queued" | "running" | "done" | "failed" };
type Capability = { label: string; available: boolean; permission?: string };
const backend = String(import.meta.env.VITE_SARA_BACKEND_URL || "").replace(/\/$/, "");
const capabilities: Capability[] = [
  { label: "Open installed apps", available: true },
  { label: "Media controls", available: true },
  { label: "Share text and files", available: true },
  { label: "Screen understanding", available: false, permission: "screen-capture consent" },
  { label: "UI automation", available: false, permission: "AccessibilityService" },
  { label: "Notification reading", available: false, permission: "notification access" }
];
async function shareSara(): Promise<void> {
  if (navigator.share) await navigator.share({ title: "SARA AI", text: "SARA AI mobile assistant" }).catch(() => undefined);
}
function haptic(): void { navigator.vibrate?.(12); }

function MobileApp() {
  const [message, setMessage] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState(backend ? "Connected backend configured" : "Backend URL required");
  const [showCapabilities, setShowCapabilities] = useState(false);

  async function send(text = message) {
    const clean = text.trim();
    if (!clean) return;
    const task: Task = { id: crypto.randomUUID(), text: clean, state: "queued" };
    setTasks((items) => [task, ...items]); setMessage("");
    haptic();
    if (!backend) { setStatus("Set VITE_SARA_BACKEND_URL before using remote tasks."); setTasks((items) => items.map((item) => item.id === task.id ? { ...item, state: "failed" } : item)); return; }
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, state: "running" } : item));
    try {
      const response = await fetch(`${backend}/api/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: clean, origin: "mobile" }) });
      if (!response.ok) throw new Error(`Backend rejected task (${response.status})`);
      setStatus("Task sent to SARA"); setTasks((items) => items.map((item) => item.id === task.id ? { ...item, state: "done" } : item));
    } catch (error) { setStatus(error instanceof Error ? error.message : "Task failed"); setTasks((items) => items.map((item) => item.id === task.id ? { ...item, state: "failed" } : item)); }
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="avatar">✦</div><div><strong>SARA</strong><small>Mobile companion</small></div></div><button className="icon" onClick={() => setShowCapabilities((value) => !value)} aria-label="Capabilities"><Settings size={20} /></button></header>
    <section className="hero"><div className="orb"><div className="orb-core">S</div></div><h1>How can I help?</h1><p>{status}</p><div className="quick"><button onClick={() => void send("What is happening on my screen?")}><Camera size={17} />Screen</button><button onClick={() => void send("Play my music")}><Volume2 size={17} />Media</button><button onClick={() => void shareSara()}><Send size={17} />Share</button></div></section>
    <section className="composer"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask SARA to help…" rows={2} /><button className="send" onClick={() => void send()} aria-label="Send"><Send size={20} /></button></section>
    <section className="section-head"><h2>Recent tasks</h2><span><Activity size={15} /> {tasks.length}</span></section>
    <section className="tasks">{tasks.length === 0 ? <div className="empty">Your mobile tasks will appear here.</div> : tasks.map((task) => <article className="task" key={task.id}><div><strong>{task.text}</strong><small>{task.state}</small></div>{task.state === "running" ? <Square size={17} /> : task.state === "done" ? <span className="ok">✓</span> : task.state === "failed" ? <span className="bad">!</span> : <Wifi size={17} />}</article>)}</section>
    {showCapabilities && <section className="capabilities"><h2>Phone capabilities</h2>{capabilities.map((capability) => <div className="capability" key={capability.label}><Smartphone size={17} /><div><strong>{capability.label}</strong><small>{capability.available ? "Available" : `Needs permission: ${capability.permission}`}</small></div><span className={capability.available ? "ok" : "pending"}>{capability.available ? "ON" : "OFF"}</span></div>)}</section>}
    <nav className="bottom"><button><Home size={19} />Home</button><button><Mic size={19} />Voice</button><button onClick={() => setShowCapabilities(true)}><MoreHorizontal size={19} />More</button></nav>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><MobileApp /></StrictMode>);
