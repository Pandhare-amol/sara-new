using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Text;

namespace Sara.WindowsBridge;

public static class WindowsEventManager
{
    private const uint EventSystemForeground = 0x0003;
    private const uint EventSystemMoveSizeStart = 0x000A;
    private const uint EventSystemMoveSizeEnd = 0x000B;
    private const uint EventSystemMinimizeStart = 0x0016;
    private const uint EventSystemMinimizeEnd = 0x0017;
    private const uint EventObjectCreate = 0x8000;
    private const uint EventObjectDestroy = 0x8001;
    private const uint EventObjectShow = 0x8002;
    private const uint EventObjectHide = 0x8003;
    private const uint EventObjectFocus = 0x8005;
    private const uint EventObjectLocationChange = 0x800B;
    private const uint EventObjectNameChange = 0x800C;
    private const uint ObjidWindow = 0;
    private const uint WinEventOutOfContext = 0;
    private const int WmQuit = 0x0012;
    private const uint PmNoRemove = 0;
    private const int QueueLimit = 512;

    private static readonly ConcurrentQueue<object> Queue = new();
    private static readonly AutoResetEvent Signal = new(false);
    private static readonly ManualResetEventSlim Started = new(false);
    private static readonly object Gate = new();
    private static readonly WinEventDelegate Callback = OnWinEvent;
    private static Thread? thread;
    private static uint eventThreadId;
    private static int stopRequested;
    private static int hookCount;
    private static int lastHookError;
    private static long sequence;
    private static int dropped;
    private static Timer? processTimer;
    private static readonly object ProcessGate = new();
    private static HashSet<int> knownProcesses = new();
    private static readonly object DedupGate = new();
    private static readonly Dictionary<string, long> RecentEvents = new(StringComparer.Ordinal);
    private const long DedupWindowTicks = TimeSpan.TicksPerMillisecond * 75;

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventDelegate callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
    [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint threadId, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr Hwnd; public uint Msg; public IntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; }
    private delegate void WinEventDelegate(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint eventThread, uint eventTime);

    public static void Start()
    {
        Thread worker;
        lock (Gate)
        {
            if (thread is not null) return;
            Started.Reset();
            Volatile.Write(ref stopRequested, 0);
            hookCount = 0;
            lastHookError = 0;
            worker = new Thread(Run) { IsBackground = true, Name = "SARA-WindowsEvents" };
            thread = worker;
            worker.Start();
        }
        // Do not return until hooks are installed and the event thread has
        // published its ID, so status checks and immediate Stop are reliable.
        _ = Started.Wait(TimeSpan.FromSeconds(3));
    }

    public static void Stop()
    {
        Thread? worker;
        uint workerThreadId;
        lock (Gate)
        {
            if (thread is null) return;
            worker = thread;
            Volatile.Write(ref stopRequested, 1);
            workerThreadId = eventThreadId;
        }

        // The WinEvent hooks and message loop belong to the event thread.
        // Ask that thread to quit and let its finally block unhook everything.
        if (workerThreadId != 0) _ = PostThreadMessage(workerThreadId, WmQuit, IntPtr.Zero, IntPtr.Zero);
        if (worker != Thread.CurrentThread && worker is not null) _ = worker.Join(TimeSpan.FromSeconds(3));
    }

    public static bool TryRead(out object? value, int timeoutMs = 0)
    {
        if (timeoutMs > 0 && Queue.IsEmpty) Signal.WaitOne(timeoutMs);
        return Queue.TryDequeue(out value);
    }

    public static object Status()
    {
        lock (Gate)
        {
            return new
            {
                running = thread?.IsAlive == true,
                hooksInstalled = hookCount > 0,
                hookCount,
                threadId = eventThreadId,
                stopping = Volatile.Read(ref stopRequested) != 0,
                lastHookError,
                queued = Queue.Count,
                dropped
            };
        }
    }

    private static void Run()
    {
        var hooks = new List<IntPtr>();
        try
        {
            // Ensure the thread has a message queue before another thread posts WM_QUIT.
            _ = PeekMessage(out _, IntPtr.Zero, 0, 0, PmNoRemove);
            lock (Gate) eventThreadId = GetCurrentThreadId();

            foreach (var range in new[]
            {
                (EventSystemForeground, EventSystemForeground),
                (EventSystemMoveSizeStart, EventSystemMoveSizeEnd),
                (EventSystemMinimizeStart, EventSystemMinimizeEnd),
                (EventObjectCreate, EventObjectNameChange)
            })
            {
                var hook = SetWinEventHook(range.Item1, range.Item2, IntPtr.Zero, Callback, 0, 0, WinEventOutOfContext);
                if (hook != IntPtr.Zero) hooks.Add(hook);
                else lastHookError = Marshal.GetLastWin32Error();
            }
            Volatile.Write(ref hookCount, hooks.Count);
            SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
            SystemEvents.SessionSwitch += OnSessionSwitch;
            lock (ProcessGate) knownProcesses = SnapshotProcessIds();
            processTimer = new Timer(_ => PollProcesses(), null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
            Started.Set();

            while (Volatile.Read(ref stopRequested) == 0)
            {
                var result = GetMessage(out var message, IntPtr.Zero, 0, 0);
                if (result <= 0) break;
                _ = TranslateMessage(ref message);
                _ = DispatchMessage(ref message);
            }
        }
        finally
        {
            Started.Set();
            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
            SystemEvents.SessionSwitch -= OnSessionSwitch;
            processTimer?.Dispose();
            processTimer = null;
            foreach (var hook in hooks) _ = UnhookWinEvent(hook);
            lock (Gate)
            {
                eventThreadId = 0;
                hookCount = 0;
                if (thread == Thread.CurrentThread) thread = null;
            }
        }
    }

    private static void OnWinEvent(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint eventThread, uint eventTime)
    {
        if (hwnd == IntPtr.Zero || (idObject != 0 && idObject != ObjidWindow)) return;
        var dedupKey = $"{eventType:X4}:{hwnd.ToInt64():X}:{idObject}:{idChild}";
        var nowTicks = DateTime.UtcNow.Ticks;
        lock (DedupGate)
        {
            if (RecentEvents.TryGetValue(dedupKey, out var previous) && nowTicks - previous < DedupWindowTicks) return;
            RecentEvents[dedupKey] = nowTicks;
            if (RecentEvents.Count > 2048)
            {
                foreach (var stale in RecentEvents.Where(item => nowTicks - item.Value >= DedupWindowTicks).Take(512).Select(item => item.Key).ToArray())
                    RecentEvents.Remove(stale);
            }
        }
        var title = new StringBuilder(512);
        _ = GetWindowText(hwnd, title, title.Capacity);
        var processId = 0u;
        _ = GetWindowThreadProcessId(hwnd, out processId);
        string? processName = null;
        try { processName = Process.GetProcessById((int)processId).ProcessName; } catch { }
        var eventId = Guid.NewGuid().ToString("D");
        var item = new
        {
            eventId,
            correlationId = eventId,
            eventType = Name(eventType),
            timestamp = DateTimeOffset.UtcNow,
            processId,
            windowHandle = $"0x{hwnd.ToInt64():X}",
            objectId = idObject,
            childId = idChild,
            applicationName = processName,
            windowTitle = title.ToString(),
            source = "windows_native",
            sequence = Interlocked.Increment(ref sequence)
        };
        while (Queue.Count >= QueueLimit && Queue.TryDequeue(out _)) Interlocked.Increment(ref dropped);
        Queue.Enqueue(item);
        Signal.Set();
    }

    private static void OnDisplaySettingsChanged(object? sender, EventArgs args)
    {
        EnqueueSystemEvent("display_topology_changed");
    }

    private static void OnSessionSwitch(object? sender, SessionSwitchEventArgs args)
    {
        var eventType = args.Reason switch
        {
            SessionSwitchReason.SessionLock => "windows_session_locked",
            SessionSwitchReason.SessionUnlock => "windows_session_unlocked",
            SessionSwitchReason.ConsoleConnect => "windows_console_connected",
            SessionSwitchReason.ConsoleDisconnect => "windows_console_disconnected",
            SessionSwitchReason.RemoteConnect => "windows_remote_connected",
            SessionSwitchReason.RemoteDisconnect => "windows_remote_disconnected",
            _ => $"windows_session_{args.Reason.ToString().ToLowerInvariant()}"
        };
        EnqueueSystemEvent(eventType);
    }

    private static void EnqueueSystemEvent(string eventType)
    {
        var eventId = Guid.NewGuid().ToString("D");
        var item = new
        {
            eventId,
            correlationId = eventId,
            eventType,
            timestamp = DateTimeOffset.UtcNow,
            processId = 0u,
            windowHandle = (string?)null,
            objectId = 0,
            childId = 0,
            applicationName = (string?)null,
            windowTitle = (string?)null,
            source = "windows_system_events",
            sequence = Interlocked.Increment(ref sequence)
        };
        while (Queue.Count >= QueueLimit && Queue.TryDequeue(out _)) Interlocked.Increment(ref dropped);
        Queue.Enqueue(item);
        Signal.Set();
    }

    private static HashSet<int> SnapshotProcessIds()
    {
        var ids = new HashSet<int>();
        try
        {
            foreach (var process in Process.GetProcesses())
            {
                try { ids.Add(process.Id); }
                finally { process.Dispose(); }
            }
        }
        catch { /* process enumeration can race with exits or access restrictions */ }
        return ids;
    }

    private static void PollProcesses()
    {
        var current = SnapshotProcessIds();
        HashSet<int> started;
        HashSet<int> exited;
        lock (ProcessGate)
        {
            started = new HashSet<int>(current);
            started.ExceptWith(knownProcesses);
            exited = new HashSet<int>(knownProcesses);
            exited.ExceptWith(current);
            knownProcesses = current;
        }
        foreach (var processId in started) EnqueueProcessEvent("process_started", processId);
        foreach (var processId in exited) EnqueueProcessEvent("process_exited", processId);
    }

    private static void EnqueueProcessEvent(string eventType, int processId)
    {
        string? processName = null;
        try { using var process = Process.GetProcessById(processId); processName = process.ProcessName; } catch { }
        var eventId = Guid.NewGuid().ToString("D");
        var item = new
        {
            eventId,
            correlationId = eventId,
            eventType,
            timestamp = DateTimeOffset.UtcNow,
            processId = (uint)Math.Max(0, processId),
            windowHandle = (string?)null,
            objectId = 0,
            childId = 0,
            applicationName = processName,
            windowTitle = (string?)null,
            source = "windows_process_observer",
            sequence = Interlocked.Increment(ref sequence)
        };
        while (Queue.Count >= QueueLimit && Queue.TryDequeue(out _)) Interlocked.Increment(ref dropped);
        Queue.Enqueue(item);
        Signal.Set();
    }

    private static string Name(uint value) => value switch { EventSystemForeground => "foreground_window_changed", EventSystemMoveSizeStart => "window_move_size_started", EventSystemMoveSizeEnd => "window_move_size_ended", EventSystemMinimizeStart => "window_minimize_started", EventSystemMinimizeEnd => "window_minimize_ended", EventObjectCreate => "window_created", EventObjectDestroy => "window_destroyed", EventObjectShow => "window_shown", EventObjectHide => "window_hidden", EventObjectFocus => "window_focus_changed", EventObjectLocationChange => "window_location_changed", EventObjectNameChange => "window_title_changed", _ => $"windows_event_{value:X4}" };

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
