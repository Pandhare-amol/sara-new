using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Sara.DesktopHost.Experimental;

internal static class Program
{
    private static readonly string[] Classes = ["Progman", "WorkerW", "SHELLDLL_DefView", "SysListView32"];
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetWindowLongPtrW(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassNameW(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorProc callback, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    private delegate bool EnumProc(IntPtr hwnd, IntPtr data);
    private delegate bool MonitorProc(IntPtr monitor, IntPtr hdc, ref Rect rect, IntPtr data);
    private const uint GwOwner = 4;
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;

    [STAThread]
    private static int Main(string[] args)
    {
        if (!OperatingSystem.IsWindows()) return Fail("Windows only.");
        if (args.Contains("--surface", StringComparer.OrdinalIgnoreCase))
        {
            if (!string.Equals(Environment.GetEnvironmentVariable("SARA_EXPERIMENTAL_SURFACE"), "1", StringComparison.Ordinal)) return Fail("Surface disabled. Set SARA_EXPERIMENTAL_SURFACE=1 for explicit opt-in.");
            ApplicationConfiguration.Initialize();
            Application.Run(new ExperimentalSurface());
            return 0;
        }
        var hierarchy = InspectHierarchy();
        var monitors = InspectMonitors();
        var result = new { enabled = args.Contains("--enable-experimental-host", StringComparer.OrdinalIgnoreCase), attached = false, hierarchy, monitors, note = "Experimental attachment is disabled by default. This build only inspects the desktop and never reparents Explorer windows." };
        Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
        return 0;
    }

    private static object InspectHierarchy()
    {
        var windows = new List<object>();
        var seen = new HashSet<IntPtr>();
        EnumWindows((hwnd, _) => { var name = Class(hwnd); if (name == "Progman" || name == "WorkerW") AddTree(hwnd, windows, seen); return true; }, IntPtr.Zero);
        return new { expected = Classes, windows };
    }

    private static void AddTree(IntPtr hwnd, List<object> output, HashSet<IntPtr> seen)
    {
        AddWindow(hwnd, output, seen);
        // EnumChildWindows already enumerates all descendants. Recursing from
        // inside its callback duplicates grandchildren and made the hierarchy
        // report several identical SysListView32 handles.
        EnumChildWindows(hwnd, (child, _) => { AddWindow(child, output, seen); return true; }, IntPtr.Zero);
    }

    private static void AddWindow(IntPtr hwnd, List<object> output, HashSet<IntPtr> seen)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || !seen.Add(hwnd)) return;
        var name = Class(hwnd);
        var title = Text(hwnd);
        var rect = GetWindowRect(hwnd, out var r) ? new { x = r.Left, y = r.Top, width = r.Right - r.Left, height = r.Bottom - r.Top } : null;
        _ = GetWindowThreadProcessId(hwnd, out var processId);
        string? processName = null;
        try { using var process = Process.GetProcessById((int)processId); processName = process.ProcessName; } catch { }
        output.Add(new
        {
            handle = $"0x{hwnd.ToInt64():X}",
            parent = FormatHandle(GetParent(hwnd)),
            owner = FormatHandle(GetWindow(hwnd, GwOwner)),
            className = name,
            title,
            processId,
            processName,
            visible = IsWindowVisible(hwnd),
            style = GetWindowLongPtrW(hwnd, GwlStyle).ToInt64(),
            extendedStyle = GetWindowLongPtrW(hwnd, GwlExStyle).ToInt64(),
            bounds = rect
        });
    }

    private static string? FormatHandle(IntPtr hwnd) => hwnd == IntPtr.Zero ? null : $"0x{hwnd.ToInt64():X}";

    private static object[] InspectMonitors()
    {
        var result = new List<object>(); EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr monitor, IntPtr hdc, ref Rect rect, IntPtr data) => { result.Add(new { x=rect.Left, y=rect.Top, width=rect.Right-rect.Left, height=rect.Bottom-rect.Top }); return true; }, IntPtr.Zero); return result.ToArray();
    }
    private static string Class(IntPtr hwnd) { var b=new StringBuilder(256); _=GetClassNameW(hwnd,b,b.Capacity); return b.ToString(); }
    private static string Text(IntPtr hwnd) { var b=new StringBuilder(256); _=GetWindowTextW(hwnd,b,b.Capacity); return b.ToString(); }
    private static int Fail(string message) { Console.Error.WriteLine(message); return 2; }
}

internal sealed class ExperimentalSurface : Form
{
    public ExperimentalSurface()
    {
        Text = "SARA Experimental Desktop Surface";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = false;
        StartPosition = FormStartPosition.Manual;
        var work = Screen.PrimaryScreen?.WorkingArea ?? new System.Drawing.Rectangle(0, 0, 800, 600);
        Size = new System.Drawing.Size(320, 180);
        Location = new System.Drawing.Point(work.Right - Width - 24, work.Bottom - Height - 24);
        BackColor = System.Drawing.Color.FromArgb(12, 24, 48);
        Opacity = 0.92;
        var label = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = System.Drawing.Color.Cyan, Text = "SARA experimental surface\nNo Explorer attachment\nClose this window to stop" };
        Controls.Add(label);
        FormClosed += (_, _) => Console.WriteLine("SARA experimental surface stopped cleanly.");
        Console.WriteLine($"SARA experimental surface started: hwnd=0x{Handle.ToInt64():X}, topMost={TopMost}, parent=none");
    }
}
