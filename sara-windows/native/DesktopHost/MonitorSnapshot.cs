using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Sara.DesktopHost;

internal sealed record MonitorSnapshot(string Device, int X, int Y, int Width, int Height, int WorkX, int WorkY, int WorkWidth, int WorkHeight, uint DpiX, uint DpiY, bool Primary)
{
    private const uint EffectiveDpi = 0;

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr monitor, uint dpiType, out uint dpiX, out uint dpiY);

    public static IReadOnlyList<MonitorSnapshot> ReadAll()
    {
        return Screen.AllScreens.Select(screen =>
        {
            uint dpiX = 96;
            uint dpiY = 96;
            try
            {
                var handle = MonitorFromPoint(new Point(screen.Bounds.Left + screen.Bounds.Width / 2, screen.Bounds.Top + screen.Bounds.Height / 2), 2);
                if (handle != IntPtr.Zero) _ = GetDpiForMonitor(handle, EffectiveDpi, out dpiX, out dpiY);
            }
            catch (DllNotFoundException) { }
            catch (EntryPointNotFoundException) { }

            return new MonitorSnapshot(
                screen.DeviceName,
                screen.Bounds.X, screen.Bounds.Y, screen.Bounds.Width, screen.Bounds.Height,
                screen.WorkingArea.X, screen.WorkingArea.Y, screen.WorkingArea.Width, screen.WorkingArea.Height,
                dpiX, dpiY, screen.Primary);
        }).ToArray();
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(Point point, uint flags);
}
