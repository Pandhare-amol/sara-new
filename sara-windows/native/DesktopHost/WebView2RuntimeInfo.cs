using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using System.Runtime.InteropServices;

namespace Sara.DesktopHost;

internal sealed record WebView2RuntimeInfo(bool Installed, string? Version, string Diagnostic)
{
    public static WebView2RuntimeInfo Detect()
    {
        try
        {
            var version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            if (!string.IsNullOrWhiteSpace(version))
                return new(true, version, "Microsoft Edge WebView2 Runtime is available.");
        }
        catch (Exception exception) when (exception is COMException or InvalidOperationException)
        {
            return new(false, null, "WebView2 Runtime is not installed or could not be loaded: " + exception.Message);
        }

        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var key = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view)
                    .OpenSubKey(@"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F1A2A2A8-4FCE-4A2A-9E7B-8A2B1E0E4D6A}")
                    ?? RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view)
                        .OpenSubKey(@"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1A2A2A8-4FCE-4A2A-9E7B-8A2B1E0E4D6A}");
                var version = key?.GetValue("pv")?.ToString();
                if (!string.IsNullOrWhiteSpace(version)) return new(true, version, "WebView2 Runtime registry entry found.");
            }
            catch (UnauthorizedAccessException) { }
        }

        return new(false, null, "Microsoft Edge WebView2 Runtime is missing. Install the Evergreen Runtime from Microsoft, then restart SARA.");
    }
}
