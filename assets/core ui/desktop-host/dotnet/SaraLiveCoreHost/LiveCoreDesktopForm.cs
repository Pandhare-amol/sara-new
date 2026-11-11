using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Sara.LiveCore.DesktopHost;

/// <summary>
/// Supported Windows 10 Pro desktop surface host for SARA Live Core.
///
/// Architectural Note on Windows Desktop Layering:
/// Undocumented Progman / WorkerW child-window parenting breaks across Windows 10/11
/// desktop slideshow updates, DWM composition changes, and virtual desktop switches.
/// Instead, this host uses supported Win32 window styles:
///   1) WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE: excludes from Alt+Tab/taskbar and never steals focus.
///   2) HWND_BOTTOM Z-order anchoring via SetWindowPos + WM_WINDOWPOSCHANGING: keeps the surface
///      behind normal application windows while preserving taskbar and desktop context menus.
///   3) Optional WS_EX_TRANSPARENT click-through overlay mode: allows clicking desktop icons
///      directly through the live visual surface when layered above desktop icons.
/// </summary>
public sealed class LiveCoreDesktopForm : Form
{
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WM_WINDOWPOSCHANGING = 0x0046;
    private const int WM_DISPLAYCHANGE = 0x007E;

    private static readonly IntPtr HWND_BOTTOM = new(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessage(string lpString);

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPOS
    {
        public IntPtr hwnd;
        public IntPtr hwndInsertAfter;
        public int x;
        public int y;
        public int cx;
        public int cy;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private sealed class MEMORYSTATUSEX
    {
        public uint dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);

    private readonly Screen _targetScreen;
    private readonly int _displayIndex;
    private readonly string _coreUrl;
    private readonly bool _clickThrough;
    private readonly uint _taskbarCreatedMessage;

    private WebView2? _webView;
    private System.Windows.Forms.Timer? _telemetryTimer;

    public LiveCoreDesktopForm(Screen screen, int displayIndex, string coreUrl, bool clickThrough)
    {
        _targetScreen = screen;
        _displayIndex = displayIndex;
        _coreUrl = coreUrl;
        _clickThrough = clickThrough;
        _taskbarCreatedMessage = RegisterWindowMessage("TaskbarCreated");

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(3, 5, 10);
        // Keep the Windows taskbar and notification area outside this overlay.
        Bounds = _targetScreen.WorkingArea;

        Load += OnFormLoad;
        FormClosed += OnFormClosed;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
            if (_clickThrough)
            {
                cp.ExStyle |= WS_EX_TRANSPARENT;
            }
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => true;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_WINDOWPOSCHANGING)
        {
            var pos = Marshal.PtrToStructure<WINDOWPOS>(m.LParam);
            pos.hwndInsertAfter = HWND_BOTTOM;
            Marshal.StructureToPtr(pos, m.LParam, true);
        }
        else if (m.Msg == _taskbarCreatedMessage && _taskbarCreatedMessage != 0)
        {
            // Explorer restarted: re-apply bounds and bottom Z-order cleanly
            Bounds = _targetScreen.WorkingArea;
            SendToDesktopBottom();
        }
        else if (m.Msg == WM_DISPLAYCHANGE)
        {
            Bounds = _targetScreen.WorkingArea;
            SendToDesktopBottom();
        }

        base.WndProc(ref m);
    }

    private void SendToDesktopBottom()
    {
        if (!IsDisposed && IsHandleCreated)
        {
            SetWindowPos(Handle, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }

    private async void OnFormLoad(object? sender, EventArgs e)
    {
        SendToDesktopBottom();
        await InitializeWebViewAsync();

        _telemetryTimer = new System.Windows.Forms.Timer { Interval = 2000 };
        _telemetryTimer.Tick += (_, _) => PublishNativeMemoryTelemetry();
        _telemetryTimer.Start();
    }

    private async System.Threading.Tasks.Task InitializeWebViewAsync()
    {
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(3, 5, 10),
        };
        Controls.Add(_webView);

        await _webView.EnsureCoreWebView2Async();

        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

        // Recover automatically if the WebView2 renderer process crashes
        _webView.CoreWebView2.ProcessFailed += (_, args) =>
        {
            if (args.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
            {
                BeginInvoke(async () =>
                {
                    Controls.Remove(_webView);
                    _webView.Dispose();
                    await InitializeWebViewAsync();
                });
            }
            else
            {
                _webView.Reload();
            }
        };

        _webView.Source = new Uri(_coreUrl);
    }

    public void SendSaraEvent(object payload)
    {
        if (_webView?.CoreWebView2 == null) return;
        string json = JsonSerializer.Serialize(payload);
        _webView.CoreWebView2.PostWebMessageAsJson(json);
    }

    private void PublishNativeMemoryTelemetry()
    {
        var mem = new MEMORYSTATUSEX();
        if (!GlobalMemoryStatusEx(mem)) return;

        double totalGb = mem.ullTotalPhys / (1024.0 * 1024.0 * 1024.0);
        double usedGb = (mem.ullTotalPhys - mem.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0);

        SendSaraEvent(new
        {
            type = "telemetry",
            ramUsedGb = Math.Round(usedGb, 2),
            ramTotalGb = Math.Round(totalGb, 2),
            ramUsagePercent = (int)mem.dwMemoryLoad,
            operationalStatus = $"Desktop Host Display #{_displayIndex + 1} Active",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        });
    }

    private void OnFormClosed(object? sender, FormClosedEventArgs e)
    {
        _telemetryTimer?.Stop();
        _telemetryTimer?.Dispose();
        _webView?.Dispose();
    }
}
