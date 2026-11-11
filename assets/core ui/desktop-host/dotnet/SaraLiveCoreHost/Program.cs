using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;

namespace Sara.LiveCore.DesktopHost;

internal static class Program
{
    private const string SingleInstanceMutexName = @"Global\SARA_LIVE_CORE_DESKTOP_HOST_V1";

    [STAThread]
    private static void Main(string[] args)
    {
        using var instanceMutex = new Mutex(true, SingleInstanceMutexName, out bool createdNew);
        if (!createdNew)
        {
            // Avoid duplicate desktop host instances
            return;
        }

        ApplicationConfiguration.Initialize();

        string coreUrl = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
            ? args[0]
            : "http://localhost:5173";

        bool clickThrough = Array.Exists(args, a => a.Equals("--click-through", StringComparison.OrdinalIgnoreCase));

        var hostForms = new List<LiveCoreDesktopForm>();
        var screens = Screen.AllScreens;

        for (int i = 0; i < screens.Length; i++)
        {
            var form = new LiveCoreDesktopForm(screens[i], i, coreUrl, clickThrough);
            hostForms.Add(form);
            form.Show();
        }

        Application.Run();
    }
}
