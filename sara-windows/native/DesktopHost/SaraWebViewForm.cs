using System.Net;
using System.Net.Http;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Runtime.InteropServices;

namespace Sara.DesktopHost;

internal sealed class SaraWebViewForm : Form
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private const string BridgeScript = """
        (() => {
          const pending = [];
          const listeners = new Set();
          const replies = new Map();
          const deliver = (message) => {
            if (listeners.size === 0) pending.push(message);
            else for (const listener of listeners) listener(message);
          };
                    document.addEventListener('keydown', event => {
                        const target = event.target;
                        if (event.key === 'Escape' && !(target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) {
                            window.chrome.webview.postMessage({ type: 'host.hide' });
                        }
                    }, true);
          window.chrome.webview.addEventListener('message', event => deliver(event.data));
                    window.chrome.webview.addEventListener('message', event => {
                        const message = event.data;
                        if (message?.type !== 'file-picker.result' || typeof message.requestId !== 'string') return;
                        const resolve = replies.get(message.requestId);
                        if (resolve) { replies.delete(message.requestId); resolve(typeof message.path === 'string' ? message.path : null); }
                    });
                    const reportUiReady = () => {
                        const root = document.getElementById('root');
                        if (root?.childElementCount) {
                            window.chrome.webview.postMessage({ type: 'ui.ready', title: document.title, rootChildren: root.childElementCount });
                            return true;
                        }
                        return false;
                    };
                    const observer = new MutationObserver(() => { if (reportUiReady()) observer.disconnect(); });
                    observer.observe(document.documentElement, { childList: true, subtree: true });
                      const readinessTimer = setInterval(() => { if (reportUiReady()) clearInterval(readinessTimer); }, 250);
                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportUiReady, { once: true });
                    else reportUiReady();
          Object.defineProperty(window, 'saraDesktopHost', {
            configurable: false,
            enumerable: false,
            value: Object.freeze({
              onMessage(callback) {
                if (typeof callback !== 'function') return () => {};
                listeners.add(callback);
                for (const message of pending.splice(0)) callback(message);
                return () => listeners.delete(callback);
              },
              hide() { window.chrome.webview.postMessage({ type: 'host.hide' }); },
                            emergencyStop() { window.chrome.webview.postMessage({ type: 'host.emergency-stop' }); },
                            pickCharacterSource() {
                                const requestId = crypto.randomUUID();
                                return new Promise(resolve => {
                                    const timeout = setTimeout(() => { replies.delete(requestId); resolve(null); }, 120000);
                                    replies.set(requestId, value => { clearTimeout(timeout); resolve(value); });
                                    window.chrome.webview.postMessage({ type: 'host.pick-character', requestId });
                                });
                            }
            })
          });
        })();
        """;

    private readonly Uri origin;
    private readonly string? selectedMonitor;
    private readonly WebView2 webView;
    private readonly Label offlineMessage;
    private readonly System.Windows.Forms.Timer healthTimer;
    private readonly Action<string> statusChanged;
    private bool healthProbeInFlight;
    private bool backendOnline;
    private bool allowClose;
    private bool initialized;
    private bool reactUiRendered;
    private readonly bool backgroundMode;

    public SaraWebViewForm(Uri backendOrigin, string? monitor, Action<string> statusChanged, bool backgroundMode = false)
    {
        origin = backendOrigin;
        selectedMonitor = monitor;
        this.statusChanged = statusChanged;
        this.backgroundMode = backgroundMode;
        Text = "SARA Desktop Companion";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = false;
        KeyPreview = true;
        MinimizeBox = false;
    MaximizeBox = false;
        BackColor = Color.FromArgb(8, 10, 16);
        webView = new WebView2 { Dock = DockStyle.Fill };
        offlineMessage = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.White,
            BackColor = BackColor,
            Font = new Font("Segoe UI", 12),
            Text = "SARA is offline. The local SARA backend could not be reached."
        };
        Controls.Add(offlineMessage);
        Controls.Add(webView);
        offlineMessage.BringToFront();

        healthTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        healthTimer.Tick += async (_, _) => await CheckBackendAsync();
        Shown += async (_, _) => await InitializeWebViewAsync();
        FormClosing += OnFormClosing;
        DpiChanged += (_, _) => { PositionOnSelectedMonitor(); PostNativeMessage(new { type = "monitor.changed", monitors = MonitorSnapshot.ReadAll() }); };
        KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Escape) return;
            HideCompanion();
            e.Handled = true;
        };
        PositionOnSelectedMonitor();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            if (backgroundMode)
            {
                parameters.ExStyle |= 0x00000020 | 0x08000000 | 0x00000080; // transparent, no-activate, tool window
            }
            return parameters;
        }
    }

    protected override void WndProc(ref Message message)
    {
        if (backgroundMode && message.Msg == 0x0084) { message.Result = (IntPtr)(-1); return; } // HTTRANSPARENT
        base.WndProc(ref message);
    }

    public event EventHandler? HostReady;
    public bool WebViewReady { get; private set; }
    public bool BackendOnline => backendOnline;
    public bool OfflineBannerVisible => offlineMessage.Visible;
    public bool FillsSelectedWorkArea
    {
        get
        {
            var target = Screen.AllScreens.FirstOrDefault(item => string.Equals(item.DeviceName, selectedMonitor, StringComparison.OrdinalIgnoreCase))
                ?? Screen.AllScreens.FirstOrDefault(item => item.Primary)
                ?? Screen.PrimaryScreen;
            return target is not null && Bounds == target.WorkingArea;
        }
    }

    public string? PageTitle
    {
        get
        {
            try { return webView.CoreWebView2?.DocumentTitle; }
            catch (InvalidOperationException) { return null; }
        }
    }

    public async Task InitializeWebViewAsync()
    {
        if (initialized || IsDisposed) return;
        initialized = true;
        try
        {
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sara", "WebView2");
            Directory.CreateDirectory(profile);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await webView.EnsureCoreWebView2Async(environment);
            var core = webView.CoreWebView2;
            core.Settings.IsWebMessageEnabled = true;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.IsStatusBarEnabled = false;
            core.ContextMenuRequested += OnContextMenuRequested;
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.DownloadStarting += (_, args) => args.Cancel = true;
            core.NavigationStarting += OnNavigationStarting;
            core.NavigationCompleted += OnNavigationCompleted;
            core.DOMContentLoaded += (_, _) => HostLog.Write("WebView2 DOMContentLoaded event.");
            core.WebMessageReceived += OnWebMessageReceived;
            core.PermissionRequested += OnPermissionRequested;
            await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);
            webView.DefaultBackgroundColor = Color.Transparent;
            core.Navigate(origin.AbsoluteUri + "/?mode=native-host");
            healthTimer.Start();
            await CheckBackendAsync();
        }
        catch (Exception exception)
        {
            HostLog.Write($"WebView2 initialization failed: {exception.Message}");
            ShowOfflineMessage("SARA desktop view could not start. Install or update the Microsoft Edge WebView2 Runtime, then retry.");
            statusChanged("WebView2 unavailable");
        }
    }

    public void ShowCompanion()
    {
        if (IsDisposed) return;
        PositionOnSelectedMonitor();
        if (!Visible) Show();
        WindowState = FormWindowState.Normal;
        if (backgroundMode) SetWindowPos(Handle, new IntPtr(1), Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height, 0x0010 | 0x0040 | 0x0001); // HWND_BOTTOM, no activate, show
        else Activate();
        PostNativeMessage(new { type = "companion.visibility", visible = true });
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    public void HideCompanion()
    {
        if (IsDisposed) return;
        PostNativeMessage(new { type = "companion.visibility", visible = false });
        Hide();
    }

    public void ActivateVoice()
    {
        if (backendOnline && Visible) PostNativeMessage(new { type = "voice.activate" });
    }

    public void EmergencyStop()
    {
        if (backendOnline && Visible) PostNativeMessage(new { type = "emergency.stop" });
    }

    public void NotifyMonitorsChanged()
    {
        PositionOnSelectedMonitor();
        PostNativeMessage(new { type = "monitor.changed", monitors = MonitorSnapshot.ReadAll() });
    }

    public void LockForWindowsSession()
    {
        HideCompanion();
        _ = LockSaraAsync();
    }

    public void UnlockWindowsSession()
    {
        if (!IsDisposed) ShowCompanion();
    }

    public void ShutdownHost()
    {
        allowClose = true;
        healthTimer.Stop();
        PostNativeMessage(new { type = "shutdown" });
        Close();
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var target) || !SameOrigin(target, origin))
        {
            e.Cancel = true;
            HostLog.Write("Blocked navigation outside the configured local SARA origin.");
        }
    }

    private void OnContextMenuRequested(object? sender, CoreWebView2ContextMenuRequestedEventArgs e)
    {
        if (webView.CoreWebView2 is not { } core) return;
        var commands = new (string Label, Action Run)[]
        {
            ("Hide SARA and show desktop icons", HideCompanion),
            ("Start SARA voice", ActivateVoice),
            ("Emergency stop all tasks", EmergencyStop)
        };
        var index = 0;
        foreach (var (label, run) in commands)
        {
            var item = core.Environment.CreateContextMenuItem(label, null, CoreWebView2ContextMenuItemKind.Command);
            item.CustomItemSelected += (_, _) => run();
            e.MenuItems.Insert(index++, item);
        }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            HostLog.Write($"WebView2 navigation failed: {e.WebErrorStatus}.");
            ShowOfflineMessage($"SARA could not load ({e.WebErrorStatus}). Check that the local SARA backend is running.");
            statusChanged("SARA backend unavailable");
            return;
        }
        offlineMessage.Visible = false;
        WebViewReady = true;
        PostNativeMessage(new { type = "host.ready", origin = origin.AbsoluteUri, monitors = MonitorSnapshot.ReadAll() });
        HostReady?.Invoke(this, EventArgs.Empty);
        HostLog.Write("Existing SARA React UI loaded in WebView2.");
    }

    private void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        if (e.PermissionKind == CoreWebView2PermissionKind.Microphone && !SameOriginString(e.Uri, origin))
            e.State = CoreWebView2PermissionState.Deny;
        // SARA's same-origin microphone permission is left to WebView2's normal
        // per-origin user prompt; the host does not silently grant it.
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!SameOriginString(e.Source, origin))
        {
            HostLog.Write("Rejected WebView2 message from an unexpected origin.");
            return;
        }
        try
        {
            using var json = JsonDocument.Parse(e.WebMessageAsJson);
            if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("type", out var typeValue)) return;
            if (typeValue.GetString() == "ui.ready")
            {
                reactUiRendered = json.RootElement.TryGetProperty("rootChildren", out var children)
                    && children.TryGetInt32(out var count) && count > 0;
                if (reactUiRendered) HostLog.Write("SARA React component tree mounted in native WebView2.");
                return;
            }
            switch (typeValue.GetString())
            {
                case "host.hide": HideCompanion(); break;
                case "host.emergency-stop": _ = EmergencyStopAsync(); break;
                case "host.pick-character":
                    if (json.RootElement.TryGetProperty("requestId", out var requestIdValue)
                        && requestIdValue.ValueKind == JsonValueKind.String
                        && Guid.TryParse(requestIdValue.GetString(), out var requestId))
                        _ = PickCharacterSourceAsync(requestId);
                    break;
                default: HostLog.Write("Rejected unknown WebView2 host message."); break;
            }
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException)
        {
            HostLog.Write("Rejected malformed WebView2 host message.");
        }
    }

    private async Task CheckBackendAsync()
    {
        if (healthProbeInFlight || IsDisposed) return;
        healthProbeInFlight = true;
        try
        {
            using var response = await Http.GetAsync(new Uri(origin, "/api/health"));
            var available = response.IsSuccessStatusCode
                && response.Headers.TryGetValues("x-sara-runtime", out var runtimeHeaders)
                && runtimeHeaders.Contains("sara-desktop-v1");
            HostLog.Write($"Backend health probe: HTTP {(int)response.StatusCode}, SARA header={available}.");
            if (available != backendOnline)
            {
                backendOnline = available;
                statusChanged(available ? "SARA backend online" : "SARA backend offline");
                PostNativeMessage(new { type = "backend.status", available });
            }
            if (!available) ShowOfflineMessage("SARA is offline. The local SARA backend could not be reached.");
            else if (webView.CoreWebView2 is not null) offlineMessage.Visible = false;
        }
        catch
        {
            HostLog.Write("Backend health probe failed.");
            if (backendOnline)
            {
                backendOnline = false;
                statusChanged("SARA backend offline");
                PostNativeMessage(new { type = "backend.status", available = false });
            }
            ShowOfflineMessage("SARA is offline. The local SARA backend could not be reached.");
        }
        finally
        {
            healthProbeInFlight = false;
        }
    }

    private async Task EmergencyStopAsync()
    {
        try
        {
            using var content = new StringContent("{\"reason\":\"desktop_host\"}", System.Text.Encoding.UTF8, "application/json");
            using var response = await Http.PostAsync(new Uri(origin, "/api/autonomy/stop"), content);
            HostLog.Write(response.IsSuccessStatusCode ? "Emergency stop accepted by SARA backend." : $"Emergency stop rejected ({(int)response.StatusCode}).");
        }
        catch (Exception exception) { HostLog.Write($"Emergency stop request failed: {exception.Message}"); }
    }

    private Task PickCharacterSourceAsync(Guid requestId)
    {
        if (InvokeRequired)
        {
            try { BeginInvoke(() => _ = PickCharacterSourceAsync(requestId)); } catch (InvalidOperationException) { }
            return Task.CompletedTask;
        }
        string? selected = null;
        using (var picker = new OpenFileDialog
        {
            Title = "Import a SARA character model",
            Filter = "Character model (*.zip;*.pmx)|*.zip;*.pmx",
            CheckFileExists = true,
            Multiselect = false
        })
        {
            if (picker.ShowDialog(this) == DialogResult.OK) selected = picker.FileName;
        }
        PostNativeMessage(new { type = "file-picker.result", requestId = requestId.ToString(), path = selected });
        return Task.CompletedTask;
    }

    private async Task LockSaraAsync()
    {
        try { using var response = await Http.PostAsync(new Uri(origin, "/api/security/lock"), new StringContent("{}", System.Text.Encoding.UTF8, "application/json")); }
        catch (Exception exception) { HostLog.Write($"Could not notify SARA of Windows lock: {exception.Message}"); }
    }

    private void PostNativeMessage<T>(T message)
    {
        try { webView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message)); }
        catch (InvalidOperationException) { }
    }

    private void PositionOnSelectedMonitor()
    {
        var screens = Screen.AllScreens;
        if (screens.Length == 0) return;
        var screen = screens.FirstOrDefault(item => string.Equals(item.DeviceName, selectedMonitor, StringComparison.OrdinalIgnoreCase))
            ?? screens.FirstOrDefault(item => item.Primary)
            ?? screens[0];
        // Fill the selected monitor's usable desktop area without covering the
        // Windows taskbar. This is a normal SARA overlay, not a behind-icons
        // wallpaper; hiding it returns direct access to Explorer and its icons.
        Bounds = screen.WorkingArea;
    }

    private void ShowOfflineMessage(string text)
    {
        if (IsDisposed) return;
        HostLog.Write($"Showing offline panel: {text}");
        if (InvokeRequired)
        {
            try { BeginInvoke(() => ShowOfflineMessage(text)); } catch (InvalidOperationException) { }
            return;
        }
        offlineMessage.Text = text;
        offlineMessage.Visible = true;
        offlineMessage.BringToFront();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (allowClose) return;
        e.Cancel = true;
        HideCompanion();
    }

    private static bool SameOrigin(Uri left, Uri right) => left.Scheme == Uri.UriSchemeHttp
        && IPAddress.TryParse(left.Host, out var address)
        && IPAddress.IsLoopback(address)
        && left.Scheme == right.Scheme && left.Host == right.Host && left.Port == right.Port;

    private static bool SameOriginString(string value, Uri right) => Uri.TryCreate(value, UriKind.Absolute, out var left) && SameOrigin(left, right);
}
