using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Sara.WindowsBridge;

const int maximumBodyBytes = 16 * 1024;
var configuredPort = Environment.GetEnvironmentVariable("SARA_WINDOWS_BRIDGE_PORT");
var port = int.TryParse(configuredPort, out var parsedPort) ? parsedPort : 8767;
if (port is < 1024 or > 65535)
{
    Console.Error.WriteLine("SARA_WINDOWS_BRIDGE_PORT must be between 1024 and 65535.");
    return 2;
}
var token = Environment.GetEnvironmentVariable("SARA_WINDOWS_BRIDGE_TOKEN");
if (string.IsNullOrWhiteSpace(token) || token.Length < 32)
{
    Console.Error.WriteLine("A per-launch SARA_WINDOWS_BRIDGE_TOKEN of at least 32 characters is required; refusing to start.");
    return 2;
}
if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("The Sara Windows Bridge only runs on Windows.");
    return 2;
}

NativeWindows.EnablePerMonitorDpiAwareness();
WindowsEventManager.Start();
using var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{port}/");
try { listener.Start(); }
catch (HttpListenerException error)
{
    Console.Error.WriteLine($"Could not bind the loopback bridge: {error.ErrorCode}");
    return 3;
}

Console.WriteLine($"Sara Windows Bridge v1 listening on loopback port {port}.");
using var concurrency = new SemaphoreSlim(8, 8);
var recentRequestIds = new ConcurrentDictionary<string, DateTimeOffset>(StringComparer.Ordinal);
using var shutdown = new CancellationTokenSource();
shutdown.Token.Register(WindowsEventManager.Stop);
Console.CancelKeyPress += (_, eventArgs) => { eventArgs.Cancel = true; shutdown.Cancel(); listener.Close(); };

try
{
    while (!shutdown.IsCancellationRequested)
    {
        HttpListenerContext context;
        try { context = await listener.GetContextAsync(); }
        catch (HttpListenerException) when (shutdown.IsCancellationRequested) { break; }
        catch (ObjectDisposedException) when (shutdown.IsCancellationRequested) { break; }

        if (!await concurrency.WaitAsync(0, shutdown.Token))
        {
            await Reply(context, HttpStatusCode.ServiceUnavailable, new { ok = false, error = "Bridge is busy." });
            continue;
        }
        _ = Handle(context, token, recentRequestIds, concurrency);
    }
}
catch (OperationCanceledException) { }
return 0;

static async Task Handle(HttpListenerContext context, string token, ConcurrentDictionary<string, DateTimeOffset> recentIds, SemaphoreSlim concurrency)
{
    try
    {
        if (!IPAddress.IsLoopback(context.Request.RemoteEndPoint?.Address ?? IPAddress.None))
        {
            await Reply(context, HttpStatusCode.Forbidden, new { ok = false, error = "Loopback clients only." });
            return;
        }
        if (string.Equals(context.Request.HttpMethod, "GET", StringComparison.Ordinal) && context.Request.Url?.AbsolutePath == "/v1/events")
        {
            if (!string.Equals(context.Request.Headers["Authorization"], $"Bearer {token}", StringComparison.Ordinal)) { await Reply(context, HttpStatusCode.Unauthorized, new { ok = false, error = "Authentication required." }); return; }
            context.Response.StatusCode = 200; context.Response.ContentType = "application/x-ndjson; charset=utf-8"; context.Response.SendChunked = true; context.Response.Headers["Cache-Control"] = "no-store";
            while (context.Response.OutputStream.CanWrite)
            {
                if (WindowsEventManager.TryRead(out var item, 1000)) { await JsonSerializer.SerializeAsync(context.Response.OutputStream, item); await context.Response.OutputStream.WriteAsync(new byte[] { 10 }); await context.Response.OutputStream.FlushAsync(); }
            }
            return;
        }
        if (string.Equals(context.Request.HttpMethod, "POST", StringComparison.Ordinal) && context.Request.Url?.AbsolutePath == "/v1/manage")
        {
            var manageBody = await ReadLimited(context.Request.InputStream, maximumBodyBytes);
            using var manageDocument = JsonDocument.Parse(manageBody, new JsonDocumentOptions { MaxDepth = 8 });
            if (!BridgeProtocol.TryValidateManage(manageDocument.RootElement, context.Request.Headers["Authorization"], token, DateTimeOffset.UtcNow, out var manage, out var manageError))
            { await Reply(context, manageError == "Authentication required." ? HttpStatusCode.Unauthorized : HttpStatusCode.BadRequest, new { ok = false, error = manageError }); return; }
            var args = manage!.Arguments;
            if (manage.Operation == "launch_application")
            {
                var shortcutPath = args.GetProperty("shortcutPath").GetString()!;
                var launchResult = WindowOperations.LaunchApplication(shortcutPath);
                await Reply(context, HttpStatusCode.OK, new { id = BridgeProtocol.ContractId, requestId = manage.RequestId, timestamp = DateTimeOffset.UtcNow, ok = true, operation = manage.Operation, data = launchResult });
                return;
            }
            var handle = args.GetProperty("windowHandle").GetString()!;
            int? expectedProcessId = args.TryGetProperty("processId", out var processElement) && processElement.ValueKind == JsonValueKind.Number && processElement.TryGetInt32(out var suppliedProcessId) ? suppliedProcessId : null;
            int? ReadInt(string name) => args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : null;
            var result = WindowOperations.Execute(manage.Operation, handle, expectedProcessId, ReadInt("x"), ReadInt("y"), ReadInt("width"), ReadInt("height"));
            await Reply(context, HttpStatusCode.OK, new { id = BridgeProtocol.ContractId, requestId = manage.RequestId, timestamp = DateTimeOffset.UtcNow, ok = true, operation = manage.Operation, data = result });
            return;
        }
        if (!string.Equals(context.Request.HttpMethod, "POST", StringComparison.Ordinal) || context.Request.Url?.AbsolutePath != "/v1/observe")
        {
            await Reply(context, HttpStatusCode.NotFound, new { ok = false, error = "Not found." });
            return;
        }
        if (context.Request.ContentLength64 > maximumBodyBytes)
        {
            await Reply(context, HttpStatusCode.RequestEntityTooLarge, new { ok = false, error = "Request too large." });
            return;
        }

        var body = await ReadLimited(context.Request.InputStream, maximumBodyBytes);
        using var document = JsonDocument.Parse(body, new JsonDocumentOptions { MaxDepth = 8 });
        if (!BridgeProtocol.TryValidate(document.RootElement, context.Request.Headers["Authorization"], token, DateTimeOffset.UtcNow, out var request, out var error))
        {
            await Reply(context, error == "Authentication required." ? HttpStatusCode.Unauthorized : HttpStatusCode.BadRequest, new { ok = false, error });
            return;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var old in recentIds.Where(item => now - item.Value > TimeSpan.FromMinutes(2)).Select(item => item.Key).ToArray())
            recentIds.TryRemove(old, out _);
        if (!recentIds.TryAdd(request!.RequestId, now))
        {
            await Reply(context, HttpStatusCode.Conflict, new { ok = false, error = "Duplicate request ID." });
            return;
        }

        var data = request.Operation switch
        {
            "health" => (object)new { component = "sara-windows-bridge", protocol = BridgeProtocol.ContractId, readOnly = true },
            "system_info" => NativeWindows.SystemInfo(),
            "foreground_window" => NativeWindows.ForegroundWindow(),
            "monitors" => NativeWindows.Monitors(),
            "ui_automation" => NativeWindows.UiAutomation(),
            "windows" => NativeWindows.Windows(),
            "applications" => NativeWindows.Applications(),
            "event_status" => WindowsEventManager.Status(),
            _ => throw new InvalidOperationException("Operation was not permitted."),
        };
        await Reply(context, HttpStatusCode.OK, new { id = BridgeProtocol.ContractId, requestId = request.RequestId, timestamp = now, ok = true, operation = request.Operation, data });
    }
    catch (BodyTooLargeException)
    {
        await Reply(context, HttpStatusCode.RequestEntityTooLarge, new { ok = false, error = "Request too large." });
    }
    catch (JsonException)
    {
        await Reply(context, HttpStatusCode.BadRequest, new { ok = false, error = "Malformed JSON." });
    }
    catch (Exception error)
    {
        // Never echo exception text: Windows paths, titles, and environment details can be sensitive.
        Console.Error.WriteLine($"Bridge request failed ({error.GetType().Name}).");
        await Reply(context, HttpStatusCode.InternalServerError, new { ok = false, error = "Windows observation failed." });
    }
    finally
    {
        try { context.Response.Close(); } catch { }
        concurrency.Release();
    }
}

static async Task<byte[]> ReadLimited(Stream stream, int maximumBytes)
{
    using var output = new MemoryStream();
    var buffer = new byte[4096];
    int read;
    while ((read = await stream.ReadAsync(buffer)) > 0)
    {
        if (output.Length + read > maximumBytes) throw new BodyTooLargeException();
        output.Write(buffer, 0, read);
    }
    return output.ToArray();
}

static async Task Reply(HttpListenerContext context, HttpStatusCode status, object payload)
{
    context.Response.StatusCode = (int)status;
    context.Response.ContentType = "application/json; charset=utf-8";
    context.Response.Headers["Cache-Control"] = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    await JsonSerializer.SerializeAsync(context.Response.OutputStream, payload);
}

sealed class BodyTooLargeException : Exception { }
