using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace Sara.DesktopHost;

internal sealed class HostCommandPipe : IDisposable
{
    public const string PipeName = "Sara.DesktopHost.v1";
    private readonly CancellationTokenSource cancellation = new();
    private readonly Action<string> handle;
    private readonly Func<object> status;
    private readonly Task serverTask;

    public HostCommandPipe(Action<string> handle, Func<object> status)
    {
        this.handle = handle;
        this.status = status;
        serverTask = RunAsync(cancellation.Token);
    }

    private async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeServerStream(
                    PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(token);
                using var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, leaveOpen: true);
                await using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, leaveOpen: true) { AutoFlush = true };
                var line = await reader.ReadLineAsync(token);
                if (line is null || line.Length > 1024) continue;
                var command = ParseCommand(line);
                if (command is null)
                {
                    await writer.WriteLineAsync("{\"ok\":false}");
                    continue;
                }
                if (command == "status")
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(status()));
                    continue;
                }
                handle(command);
                await writer.WriteLineAsync("{\"ok\":true}");
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
            catch (IOException) when (!token.IsCancellationRequested) { }
            catch (Exception exception) when (exception is not OutOfMemoryException)
            {
                HostLog.Write($"Native command pipe request failed: {exception.Message}");
            }
        }
    }

    private static string? ParseCommand(string line)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            if (document.RootElement.ValueKind != JsonValueKind.Object
                || !document.RootElement.TryGetProperty("command", out var commandValue)
                || commandValue.ValueKind != JsonValueKind.String) return null;
            return commandValue.GetString() switch
            {
                "status" or "show" or "hide" or "voice.activate" or "emergency.stop" or "shutdown" => commandValue.GetString(),
                _ => null
            };
        }
        catch (JsonException) { return null; }
    }

    public void Dispose()
    {
        cancellation.Cancel();
        try { serverTask.Wait(TimeSpan.FromSeconds(1)); } catch (AggregateException) { }
        cancellation.Dispose();
    }
}
