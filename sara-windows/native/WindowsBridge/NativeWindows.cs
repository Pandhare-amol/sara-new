using System.Diagnostics;
using System.IO;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;
using Microsoft.Win32;

namespace Sara.WindowsBridge;

public static class NativeWindows
{
    private const int MonitorInfoDeviceNameLength = 32;
    private const uint ShcoreDpiTypeEffective = 0;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfoEx
    {
        public int Size;
        public Rect Monitor;
        public Rect Work;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = MonitorInfoDeviceNameLength)] public string DeviceName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SystemPowerStatus
    {
        public byte AcLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte Reserved;
        public uint BatteryLifeTime;
        public uint BatteryFullLifeTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo { public uint Size; public uint TickCount; }

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime { public uint Low; public uint High; public ulong Value => ((ulong)High << 32) | Low; }

    private static readonly object CpuLock = new();
    private static (ulong Idle, ulong Kernel, ulong User)? PreviousCpuTimes;

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnum callback, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumWindows(WindowEnum callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassNameW(IntPtr hwnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetMonitorInfoW", SetLastError = true)] private static extern bool GetMonitorInfoEx(IntPtr monitor, ref MonitorInfoEx info);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetSystemPowerStatus(out SystemPowerStatus status);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetLastInputInfo(ref LastInputInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll")] private static extern uint GetTickCount();
    [DllImport("shcore.dll")] private static extern int GetDpiForMonitor(IntPtr monitor, uint dpiType, out uint dpiX, out uint dpiY);

    private delegate bool MonitorEnum(IntPtr monitor, IntPtr hdc, ref Rect rect, IntPtr data);
    private delegate bool WindowEnum(IntPtr hwnd, IntPtr data);

    public static void EnablePerMonitorDpiAwareness()
    {
        try { _ = SetProcessDpiAwarenessContext(new IntPtr(-4)); } // PER_MONITOR_AWARE_V2
        catch (EntryPointNotFoundException) { }
        catch (DllNotFoundException) { }
    }

    public static object ForegroundWindow()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return new { available = false };

        var title = new StringBuilder(1024);
        _ = GetWindowTextW(hwnd, title, title.Capacity);
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        var bounds = GetWindowRect(hwnd, out var rect)
            ? new { x = rect.Left, y = rect.Top, width = Math.Max(0, rect.Right - rect.Left), height = Math.Max(0, rect.Bottom - rect.Top) }
            : null;
        uint dpi;
        try { dpi = GetDpiForWindow(hwnd); }
        catch (EntryPointNotFoundException) { dpi = 0; }

        string? processName = null;
        try { processName = Process.GetProcessById((int)pid).ProcessName; }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
        catch (System.ComponentModel.Win32Exception) { }

        return new
        {
            available = true,
            handle = $"0x{hwnd.ToInt64():X}",
            title = title.ToString(),
            processId = pid,
            processName,
            dpi,
            bounds
        };
    }

    public static object[] Monitors()
    {
        var result = new List<object>();
        _ = EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr monitor, IntPtr _, ref Rect __, IntPtr ___) =>
        {
            var info = new MonitorInfoEx { Size = Marshal.SizeOf<MonitorInfoEx>(), DeviceName = string.Empty };
            if (GetMonitorInfoEx(monitor, ref info))
            {
                uint dpiX = 96, dpiY = 96;
                try { _ = GetDpiForMonitor(monitor, ShcoreDpiTypeEffective, out dpiX, out dpiY); }
                catch (DllNotFoundException) { }
                catch (EntryPointNotFoundException) { }
                result.Add(new
                {
                    deviceName = info.DeviceName,
                    x = info.Monitor.Left,
                    y = info.Monitor.Top,
                    width = info.Monitor.Right - info.Monitor.Left,
                    height = info.Monitor.Bottom - info.Monitor.Top,
                    workX = info.Work.Left,
                    workY = info.Work.Top,
                    workWidth = info.Work.Right - info.Work.Left,
                    workHeight = info.Work.Bottom - info.Work.Top,
                    dpiX,
                    dpiY,
                    primary = (info.Flags & 1) == 1
                });
            }
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static object SystemInfo()
    {
        var memory = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
        var memoryAvailable = GlobalMemoryStatusEx(ref memory);
        var drives = DriveInfo.GetDrives()
            .Where(drive => drive.IsReady)
            .Select(drive => new { name = drive.Name, format = drive.DriveFormat, totalBytes = drive.TotalSize, availableBytes = drive.AvailableFreeSpace })
            .ToArray();
        object? battery = null;
        try
        {
            if (GetSystemPowerStatus(out var power) && power.BatteryFlag != 128)
                battery = new { percent = power.BatteryLifePercent == 255 ? (byte?)null : power.BatteryLifePercent, onAC = power.AcLineStatus == 1, secondsRemaining = power.BatteryLifeTime == uint.MaxValue ? (uint?)null : power.BatteryLifeTime };
        }
        catch (EntryPointNotFoundException) { }

        var allProcesses = Process.GetProcesses();
        var processCount = allProcesses.Length;
        var processes = new List<object>();
        for (var index = 0; index < allProcesses.Length; index++)
        {
            var process = allProcesses[index];
            try
            {
                if (index < 40) processes.Add(new { pid = process.Id, name = process.ProcessName });
            }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
            finally { process.Dispose(); }
        }

        return new
        {
            machine = Environment.MachineName,
            os = Environment.OSVersion.VersionString,
            architecture = RuntimeInformation.OSArchitecture.ToString(),
            processorCount = Environment.ProcessorCount,
            processCount,
            processes,
            cpuPercent = CpuPercent(),
            userIdleSeconds = IdleSeconds(),
            memory = memoryAvailable ? new { totalBytes = memory.TotalPhysical, availableBytes = memory.AvailablePhysical, loadPercent = memory.MemoryLoad } : null,
            drives,
            battery,
            networkConnected = NetworkInterface.GetIsNetworkAvailable()
        };
    }

    public static object UiAutomation()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return new { available = false, reason = "No foreground window." };
        try
        {
            var root = AutomationElement.FromHandle(hwnd);
            var condition = new PropertyCondition(AutomationElement.IsControlElementProperty, true);
            var elements = root.FindAll(TreeScope.Descendants, condition);
            var controls = new List<object>();
            for (var i = 0; i < Math.Min(elements.Count, 250); i++)
            {
                var item = elements[i];
                string? name = null, automationId = null, controlType = null;
                try { name = item.Current.Name; automationId = item.Current.AutomationId; controlType = item.Current.ControlType?.ProgrammaticName; } catch { }
                if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(automationId)) continue;
                controls.Add(new { name = name?.Trim(), automationId, controlType });
            }
            return new { available = true, windowHandle = $"0x{hwnd.ToInt64():X}", count = controls.Count, controls };
        }
        catch (ElementNotAvailableException) { return new { available = false, reason = "Foreground UI is no longer available." }; }
        catch (Exception) { return new { available = false, reason = "UI Automation is unavailable for this window." }; }
    }

    public static object[] Windows()
    {
        var result = new List<object>();
        _ = EnumWindows((hwnd, callbackData) =>
        {
            if (!IsWindowVisible(hwnd)) return true;
            var title = new StringBuilder(512);
            _ = GetWindowTextW(hwnd, title, title.Capacity);
            if (string.IsNullOrWhiteSpace(title.ToString())) return true;
            _ = GetWindowThreadProcessId(hwnd, out var pid);
            string? processName = null;
            try { processName = Process.GetProcessById((int)pid).ProcessName; } catch { }
            var className = new StringBuilder(256);
            _ = GetClassNameW(hwnd, className, className.Capacity);
            var bounds = GetWindowRect(hwnd, out var rect)
                ? new { x = rect.Left, y = rect.Top, width = Math.Max(0, rect.Right - rect.Left), height = Math.Max(0, rect.Bottom - rect.Top) }
                : null;
            result.Add(new { handle = $"0x{hwnd.ToInt64():X}", title = title.ToString(), processId = pid, processName, className = className.ToString(), bounds });
            return result.Count < 300;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static object[] Applications()
    {
        var result = new List<object>();
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)
        };
        foreach (var root in roots.Where(Directory.Exists))
        {
            IEnumerable<string> shortcuts;
            try
            {
                shortcuts = Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories);
            }
            catch (UnauthorizedAccessException)
            {
                continue;
            }
            catch (IOException)
            {
                continue;
            }

            foreach (var shortcut in shortcuts)
            {
                string fullPath;
                try
                {
                    fullPath = Path.GetFullPath(shortcut);
                    if (!File.Exists(fullPath) || !seenPaths.Add(fullPath)) continue;
                    var name = Path.GetFileNameWithoutExtension(fullPath);
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    // Keep discovery aligned with the management endpoint: only
                    // regular .lnk files under an approved Start Menu root are
                    // exposed. Target resolution remains delegated to Explorer.
                    result.Add(new { name, shortcut = fullPath, source = "start-menu" });
                }
                catch (ArgumentException)
                {
                    // A concurrently removed or malformed shortcut is not a
                    // discoverable application; continue with the next entry.
                }
                catch (IOException)
                {
                    continue;
                }
            }
        }
        return result
            .OrderBy(item => item.GetType().GetProperty("name")?.GetValue(item)?.ToString(), StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.GetType().GetProperty("shortcut")?.GetValue(item)?.ToString(), StringComparer.OrdinalIgnoreCase)
            .Take(500)
            .ToArray();
    }

    private static double? IdleSeconds()
    {
        var info = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        return GetLastInputInfo(ref info) ? unchecked(GetTickCount() - info.TickCount) / 1000d : null;
    }

    private static double? CpuPercent()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return null;
        lock (CpuLock)
        {
            var current = (idle.Value, kernel.Value, user.Value);
            var previous = PreviousCpuTimes;
            PreviousCpuTimes = current;
            if (previous is null) return null;
            var idleDelta = current.Item1 - previous.Value.Idle;
            var totalDelta = (current.Item2 - previous.Value.Kernel) + (current.Item3 - previous.Value.User);
            if (totalDelta == 0) return null;
            return Math.Clamp((1d - (double)idleDelta / totalDelta) * 100d, 0d, 100d);
        }
    }
}
