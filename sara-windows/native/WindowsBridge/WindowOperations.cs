using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace Sara.WindowsBridge;

public static class WindowOperations
{
    private const int SwMinimize = 6, SwMaximize = 3, SwRestore = 9, SwShow = 5;
    private const uint SwpNoZOrder = 0x0004, SwpNoActivate = 0x0010;
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }

    public static object Execute(string operation, string handleText, int? expectedProcessId = null, int? x = null, int? y = null, int? width = null, int? height = null)
    {
        if (!handleText.StartsWith("0x", StringComparison.OrdinalIgnoreCase) || !long.TryParse(handleText[2..], System.Globalization.NumberStyles.HexNumber, null, out var raw)) return new { status = "FAILED", verified = false, message = "Invalid window handle." };
        var hwnd = new IntPtr(raw);
        if (!IsWindow(hwnd)) return new { status = "UNAVAILABLE", verified = false, message = "Window no longer exists." };
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        if (expectedProcessId.HasValue && expectedProcessId.Value != (int)pid) return new { status = "FAILED", verified = false, processId = pid, message = "Window owner does not match the requested process." };
        try { using var process = Process.GetProcessById((int)pid); if (process.HasExited) return new { status = "UNAVAILABLE", verified = false, message = "Owning process has exited." }; } catch { return new { status = "UNAVAILABLE", verified = false, message = "Owning process is unavailable." }; }
        var attempted = operation switch
        {
            "focus" => SetForegroundWindow(hwnd),
            "minimize" => ShowWindow(hwnd, SwMinimize),
            "maximize" => ShowWindow(hwnd, SwMaximize),
            "restore" => ShowWindow(hwnd, SwRestore),
            "close" => SendClose(hwnd),
            "move_resize" when x.HasValue && y.HasValue && width.HasValue && height.HasValue && width > 0 && height > 0 => SetWindowPos(hwnd, IntPtr.Zero, x.Value, y.Value, width.Value, height.Value, SwpNoZOrder | SwpNoActivate),
            _ => false
        };
        if (!attempted) return new { status = "FAILED", verified = false, processId = pid, message = "Operation was rejected or Windows refused it." };
        var verified = operation switch
        {
            "focus" => IsWindow(hwnd) && GetForegroundWindow() == hwnd,
            "minimize" => IsWindow(hwnd) && IsIconic(hwnd),
            "maximize" => IsWindow(hwnd) && IsZoomed(hwnd),
            "restore" => IsWindow(hwnd) && !IsIconic(hwnd) && !IsZoomed(hwnd),
            "close" => WaitForClosed(hwnd),
            "move_resize" => IsWindow(hwnd) && GetWindowRect(hwnd, out var rect) && rect.Left == x && rect.Top == y && rect.Right - rect.Left == width && rect.Bottom - rect.Top == height,
            _ => false
        };
        return new { status = verified ? "SUCCESS" : "UNCERTAIN", verified, processId = pid, windowHandle = handleText, operation, message = verified ? "Window operation verified." : "Windows accepted the request but state verification was inconclusive." };
    }

    public static object LaunchApplication(string shortcutPath)
    {
        try
        {
            var fullPath = Path.GetFullPath(shortcutPath);
            var allowedRoots = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)
            }.Where(path => !string.IsNullOrWhiteSpace(path)).Select(Path.GetFullPath).ToArray();
            if (!fullPath.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) || !allowedRoots.Any(root => fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                return new { status = "FAILED", verified = false, message = "Only Start Menu shortcuts may be launched." };
            if (!File.Exists(fullPath)) return new { status = "UNAVAILABLE", verified = false, message = "Application shortcut no longer exists." };
            using var process = Process.Start(new ProcessStartInfo { FileName = fullPath, UseShellExecute = true });
            if (process is null) return new { status = "FAILED", verified = false, message = "Windows did not start the application." };
            return new { status = "SUCCESS", verified = true, processId = process.Id, shortcutPath = fullPath, message = "Application launch request verified." };
        }
        catch (Exception exception) { return new { status = "FAILED", verified = false, message = $"Application launch failed: {exception.Message}" }; }
    }

    private static bool SendClose(IntPtr hwnd) { return PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero); }
    private static bool WaitForClosed(IntPtr hwnd)
    {
        for (var attempt = 0; attempt < 10 && IsWindow(hwnd); attempt++) Thread.Sleep(50);
        return !IsWindow(hwnd);
    }
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
}
