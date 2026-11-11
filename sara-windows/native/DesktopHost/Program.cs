using System.Text.Json;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Sara.DesktopHost;

internal static class Program
{
    private const string MutexName = "Local\\Sara.DesktopHost.v1";
    private const uint AttachToParentConsole = uint.MaxValue;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint processId);

    [STAThread]
    private static int Main(string[] args)
    {
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("Sara Desktop Host requires Windows.");
            return 2;
        }

        var dpiModeConfigured = Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
            return RunSelfTest(dpiModeConfigured);
        if (args.Contains("--install-startup", StringComparer.OrdinalIgnoreCase))
            return InstallStartupEntry();
        if (args.Contains("--remove-startup", StringComparer.OrdinalIgnoreCase))
            return RemoveStartupEntry();

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var originArgument = args.FirstOrDefault(value => value.StartsWith("--origin=", StringComparison.OrdinalIgnoreCase));
        var monitorArgument = args.FirstOrDefault(value => value.StartsWith("--monitor=", StringComparison.OrdinalIgnoreCase));
        var backgroundMode = args.Contains("--background", StringComparer.OrdinalIgnoreCase)
            || string.Equals(Environment.GetEnvironmentVariable("SARA_DESKTOP_BACKGROUND"), "1", StringComparison.Ordinal);
        Uri? origin = null;
        if (originArgument is not null)
        {
            var value = originArgument["--origin=".Length..];
            if (!Uri.TryCreate(value, UriKind.Absolute, out origin)
                || origin.Scheme != Uri.UriSchemeHttp
                || !System.Net.IPAddress.TryParse(origin.Host, out var address)
                || !System.Net.IPAddress.IsLoopback(address))
            {
                HostLog.Write("Rejected non-loopback or invalid backend origin.");
                return 2;
            }
        }

        using var mutex = new Mutex(true, MutexName, out var createdNew);
        if (!createdNew)
        {
            HostLog.Write("A second host instance was refused.");
            return 0;
        }

        try
        {
            Application.Run(new DesktopHostContext(origin, monitorArgument is null ? null : monitorArgument["--monitor=".Length..], backgroundMode));
            return 0;
        }
        catch (Exception exception)
        {
            HostLog.Write($"Fatal host error: {exception}");
            return 1;
        }
    }

    private static int InstallStartupEntry()
    {
        try
        {
            var exePath = Environment.ProcessPath ?? Environment.GetCommandLineArgs().FirstOrDefault() ?? "Sara.DesktopHost.exe";
            using var runKey = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            runKey?.SetValue("Sara.DesktopHost", $"\"{exePath}\" --startup");
            Console.WriteLine($"Startup entry installed for: {exePath}");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Failed to install startup entry: {exception.Message}");
            return 1;
        }
    }

    private static int RemoveStartupEntry()
    {
        try
        {
            using var runKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
            runKey?.DeleteValue("Sara.DesktopHost", false);
            Console.WriteLine("Startup entry removed.");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Failed to remove startup entry: {exception.Message}");
            return 1;
        }
    }

    private static int RunSelfTest(bool dpiModeConfigured)
    {
        var standardOutput = Console.OpenStandardOutput();
        var standardError = Console.OpenStandardError();
        if (AttachConsole(AttachToParentConsole))
        {
            Console.SetOut(new StreamWriter(standardOutput) { AutoFlush = true });
            Console.SetError(new StreamWriter(standardError) { AutoFlush = true });
        }
        try
        {
            var monitors = MonitorSnapshot.ReadAll();
            var build = Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                "CurrentBuildNumber",
                null)?.ToString();
            var explorerPid = 0;
            try
            {
                using var explorer = Process.GetProcessesByName("explorer").FirstOrDefault();
                explorerPid = explorer?.Id ?? 0;
            }
            catch { /* Explorer may be unavailable in a service or recovery session. */ }
            var result = new
            {
                ok = monitors.Count > 0,
                os = Environment.OSVersion.VersionString,
                windowsBuild = build,
                dpiMode = dpiModeConfigured ? "PerMonitorV2" : "configuration-failed",
                monitorCount = monitors.Count,
                monitors,
                explorerRunning = explorerPid > 0,
                explorerPid,
                webView2Runtime = WebView2RuntimeInfo.Detect(),
                wallpaperHost = false,
                note = "Native lifecycle/monitor foundation only; no Explorer desktop parenting or wallpaper rendering is enabled."
            };
            Console.WriteLine(JsonSerializer.Serialize(result));
            return monitors.Count > 0 && dpiModeConfigured ? 0 : 1;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { ok = false, error = exception.Message }));
            return 1;
        }
    }
}
