using Microsoft.Win32;
using System.Diagnostics;
using System.Text;
namespace Sara.DesktopHost;

internal sealed class DesktopHostContext : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly ToolStripMenuItem statusItem;
    private readonly System.Windows.Forms.Timer refreshTimer;
    private readonly Control dispatcher;
    private readonly HostCommandPipe commandPipe;
    private SaraWebViewForm? saraView;
    private DiagnosticsForm? diagnostics;
    private bool sessionLocked;
    private bool suspended;
    private int explorerPid;
    private string explorerState = "unknown";
    private bool disposed;
    private readonly WebView2RuntimeInfo webView2Runtime = WebView2RuntimeInfo.Detect();

    public DesktopHostContext(Uri? backendOrigin, string? selectedMonitor, bool backgroundMode = false)
    {
        dispatcher = new Control();
        _ = dispatcher.Handle;
        statusItem = new ToolStripMenuItem("Starting…") { Enabled = false };
        var menu = new ContextMenuStrip();
        menu.Items.Add(statusItem);
        if (backendOrigin is not null)
        {
            menu.Items.Add("Show SARA desktop view", null, (_, _) => saraView?.ShowCompanion());
            menu.Items.Add("Hide SARA desktop view", null, (_, _) => saraView?.HideCompanion());
            menu.Items.Add("Start SARA voice", null, (_, _) => saraView?.ActivateVoice());
            menu.Items.Add("Emergency stop all tasks", null, (_, _) => saraView?.EmergencyStop());
        }
        menu.Items.Add("Diagnostics…", null, (_, _) => ShowDiagnostics());
        menu.Items.Add("Quit SARA Desktop Host", null, (_, _) => ExitThread());
        tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "SARA Desktop Host (foundation)",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.DoubleClick += (_, _) => ShowDiagnostics();

        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        if (backendOrigin is not null)
        {
            saraView = new SaraWebViewForm(backendOrigin, selectedMonitor, value => HostLog.Write(value), backgroundMode);
            saraView.Show();
        }
        commandPipe = new HostCommandPipe(HandleHostCommand, () => new
        {
            ok = true,
            webView2RuntimeInstalled = webView2Runtime.Installed,
            webView2RuntimeVersion = webView2Runtime.Version,
            webView2Diagnostic = webView2Runtime.Diagnostic,
            wallpaperHost = false,
            shellActivation = "DISABLED",
            credentialProvider = "DISABLED",
            implementationReadiness = "isolated companion host only; Explorer remains the active shell",
            webViewReady = saraView?.WebViewReady ?? false,
            backendOnline = saraView?.BackendOnline ?? false,
            offlineBannerVisible = saraView?.OfflineBannerVisible ?? false,
            fillsSelectedWorkArea = saraView?.FillsSelectedWorkArea ?? false,
            sessionLocked,
            suspended,
            explorerPid,
            explorerState
        });
        refreshTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        refreshTimer.Tick += (_, _) => RefreshStatus();
        refreshTimer.Start();
        RefreshStatus();
        HostLog.Write("Native desktop host foundation started.");
        if (!webView2Runtime.Installed) HostLog.Write(webView2Runtime.Diagnostic);
    }

    private void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        HostLog.Write($"Session event: {e.Reason}.");
        Dispatch(() =>
        {
            if (e.Reason == SessionSwitchReason.SessionLock) sessionLocked = true;
            else if (e.Reason == SessionSwitchReason.SessionUnlock) sessionLocked = false;
            if (sessionLocked) saraView?.LockForWindowsSession();
            else if (!suspended) saraView?.UnlockWindowsSession();
            RefreshStatus();
        });
    }

    private void OnPowerModeChanged(object? sender, PowerModeChangedEventArgs e)
    {
        HostLog.Write($"Power event: {e.Mode}.");
        Dispatch(() =>
        {
            suspended = e.Mode == PowerModes.Suspend;
            if (suspended) saraView?.HideCompanion();
            else if (!sessionLocked) saraView?.ShowCompanion();
            RefreshStatus();
        });
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        HostLog.Write("Display topology changed.");
        Dispatch(() =>
        {
            RefreshStatus();
            diagnostics?.RefreshSnapshot();
            saraView?.NotifyMonitorsChanged();
        });
    }

    private void Dispatch(Action action)
    {
        if (disposed || dispatcher.IsDisposed) return;
        try
        {
            if (dispatcher.InvokeRequired) dispatcher.BeginInvoke(action);
            else action();
        }
        catch (InvalidOperationException) { }
    }

    private void RefreshStatus()
    {
        ObserveExplorer();
        var label = sessionLocked ? "Windows session locked" : suspended ? "Windows suspended" : "Host foundation ready";
        statusItem.Text = label;
        tray.Text = "SARA Desktop Host — " + label;
        diagnostics?.RefreshSnapshot();
    }

    private void ObserveExplorer()
    {
        int currentPid = 0;
        try { currentPid = Process.GetProcessesByName("explorer").Select(process => { var pid = process.Id; process.Dispose(); return pid; }).FirstOrDefault(); }
        catch { currentPid = 0; }
        if (currentPid == explorerPid) return;
        if (explorerPid != 0 && currentPid == 0)
        {
            explorerState = "not_running";
            HostLog.Write("Explorer lifecycle: Explorer is no longer running.");
        }
        else if (explorerPid != 0 && currentPid != explorerPid)
        {
            explorerState = "replaced";
            HostLog.Write($"Explorer lifecycle: Explorer PID changed from {explorerPid} to {currentPid}.");
        }
        else
        {
            explorerState = currentPid == 0 ? "not_running" : "running";
            if (explorerPid == 0 && currentPid != 0) HostLog.Write($"Explorer lifecycle: Explorer detected (PID {currentPid}).");
        }
        explorerPid = currentPid;
    }

    private void HandleHostCommand(string command)
    {
        Dispatch(() =>
        {
            switch (command)
            {
                case "show": if (!sessionLocked && !suspended) saraView?.ShowCompanion(); break;
                case "hide": saraView?.HideCompanion(); break;
                case "voice.activate": if (!sessionLocked && !suspended) saraView?.ActivateVoice(); break;
                case "emergency.stop": if (!sessionLocked && !suspended) saraView?.EmergencyStop(); break;
                case "shutdown": ExitThread(); break;
            }
        });
    }

    private void ShowDiagnostics()
    {
        if (sessionLocked || suspended) return;
        if (diagnostics is null || diagnostics.IsDisposed)
        {
            diagnostics = new DiagnosticsForm(() => sessionLocked || suspended);
            diagnostics.FormClosed += (_, _) => diagnostics = null;
        }
        if (!diagnostics.Visible) diagnostics.Show();
        if (diagnostics.WindowState == FormWindowState.Minimized) diagnostics.WindowState = FormWindowState.Normal;
        diagnostics.Activate();
        diagnostics.RefreshSnapshot();
    }

    protected override void ExitThreadCore()
    {
        if (disposed) return;
        disposed = true;
        refreshTimer.Stop();
        refreshTimer.Dispose();
        commandPipe.Dispose();
        tray.Visible = false;
        tray.Dispose();
        dispatcher.Dispose();
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        diagnostics?.Close();
        saraView?.ShutdownHost();
        HostLog.Write("Native desktop host foundation stopped cleanly.");
        base.ExitThreadCore();
    }
}

internal sealed class DiagnosticsForm : Form
{
    private readonly TextBox output;
    private readonly Func<bool> blocked;

    public DiagnosticsForm(Func<bool> blocked)
    {
        this.blocked = blocked;
        Text = "SARA Desktop Host — Native foundation";
        Width = 700;
        Height = 480;
        StartPosition = FormStartPosition.CenterScreen;
        MinimizeBox = true;
        MaximizeBox = false;
        output = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Font = new Font(FontFamily.GenericMonospace, 10),
            BackColor = Color.FromArgb(18, 22, 32),
            ForeColor = Color.Gainsboro,
            BorderStyle = BorderStyle.None,
            Padding = new Padding(12)
        };
        var refresh = new Button { Text = "Refresh monitor and host status", Dock = DockStyle.Bottom, Height = 42 };
        refresh.Click += (_, _) => RefreshSnapshot();
        Controls.Add(output);
        Controls.Add(refresh);
        RefreshSnapshot();
    }

    public void RefreshSnapshot()
    {
        if (IsDisposed || !IsHandleCreated) return;
        if (InvokeRequired)
        {
            BeginInvoke(RefreshSnapshot);
            return;
        }

        var monitors = MonitorSnapshot.ReadAll();
        var text = new StringBuilder()
            .AppendLine("SARA WINDOWS DESKTOP HOST — FOUNDATION")
            .AppendLine()
            .AppendLine($"OS: {Environment.OSVersion.VersionString}")
            .AppendLine($"Process DPI mode: PerMonitorV2")
            .AppendLine($"Windows interaction: {(blocked() ? "suspended/locked" : "available")}")
            .AppendLine($"Explorer: {GetExplorerStatus()}")
            .AppendLine($"Monitors: {monitors.Count}")
            .AppendLine()
            .AppendLine("Monitor layout uses physical desktop coordinates reported by Windows:");
        foreach (var monitor in monitors)
        {
            text.AppendLine()
                .AppendLine($"{monitor.Device}{(monitor.Primary ? " (primary)" : string.Empty)}")
                .AppendLine($"  Bounds: {monitor.X},{monitor.Y} {monitor.Width}x{monitor.Height}")
                .AppendLine($"  Work area: {monitor.WorkX},{monitor.WorkY} {monitor.WorkWidth}x{monitor.WorkHeight}")
                .AppendLine($"  Effective DPI: {monitor.DpiX}x{monitor.DpiY}");
        }
        text.AppendLine()
            .AppendLine("Current milestone: independent native process, tray lifecycle, Windows session/power events, DPI-aware monitor inventory, bounded local log.")
            .AppendLine("Not implemented: true WorkerW/Progman wallpaper hosting, Explorer desktop parenting, and behind-icon interaction. The existing React/WebView2 surface and local backend health integration are active in the companion mode.");
        output.Text = text.ToString();
    }

    private static string GetExplorerStatus()
    {
        try
        {
            var process = Process.GetProcessesByName("explorer").FirstOrDefault();
            if (process is null) return "not running";
            var pid = process.Id;
            process.Dispose();
            return $"running (PID {pid})";
        }
        catch { return "unavailable"; }
    }
}
