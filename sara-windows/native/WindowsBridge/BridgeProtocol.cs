using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Sara.WindowsBridge;

public sealed record BridgeRequest(string Operation, string RequestId, JsonElement Arguments);

public static class BridgeProtocol
{
    public const string ContractId = "sara.windows.bridge.v1";
    public static readonly TimeSpan MaximumClockSkew = TimeSpan.FromSeconds(30);
    private static readonly HashSet<string> Operations = new(StringComparer.Ordinal)
    {
        "health", "system_info", "foreground_window", "monitors", "ui_automation", "windows", "applications", "event_status"
    };
    private static readonly HashSet<string> RequestProperties = new(StringComparer.Ordinal)
    {
        "id", "operation", "requestId", "timestamp", "arguments"
    };
    private static readonly HashSet<string> ManageOperations = new(StringComparer.Ordinal) { "focus", "minimize", "maximize", "restore", "close", "move_resize", "launch_application" };
    private static readonly HashSet<string> ManageArgumentProperties = new(StringComparer.Ordinal) { "windowHandle", "processId", "x", "y", "width", "height", "shortcutPath" };

    public static bool TryValidate(
        JsonElement root,
        string? authorization,
        string token,
        DateTimeOffset now,
        out BridgeRequest? request,
        out string error)
    {
        request = null;
        error = "Invalid request.";
        if (root.ValueKind != JsonValueKind.Object) return false;

        foreach (var property in root.EnumerateObject())
        {
            if (!RequestProperties.Contains(property.Name))
            {
                error = "Unknown request field.";
                return false;
            }
        }
        if (root.EnumerateObject().Count() != RequestProperties.Count)
        {
            error = "Required request fields are missing.";
            return false;
        }

        if (!TryString(root, "id", out var id) || id != ContractId ||
            !TryString(root, "operation", out var operation) || !Operations.Contains(operation) ||
            !TryString(root, "requestId", out var requestId) || !Guid.TryParseExact(requestId, "D", out _) ||
            !TryString(root, "timestamp", out var timestampText) ||
            !DateTimeOffset.TryParse(timestampText, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var timestamp))
        {
            error = "Invalid request envelope.";
            return false;
        }

        if (Math.Abs((now - timestamp).TotalSeconds) > MaximumClockSkew.TotalSeconds)
        {
            error = "Request timestamp is outside the allowed window.";
            return false;
        }

        if (root.GetProperty("arguments").ValueKind != JsonValueKind.Object || root.GetProperty("arguments").EnumerateObject().Any())
        {
            error = "This read-only operation accepts no arguments.";
            return false;
        }

        var expected = Encoding.UTF8.GetBytes($"Bearer {token}");
        var supplied = Encoding.UTF8.GetBytes(authorization ?? string.Empty);
        if (expected.Length != supplied.Length || !CryptographicOperations.FixedTimeEquals(expected, supplied))
        {
            error = "Authentication required.";
            return false;
        }

        request = new BridgeRequest(operation, requestId, root.GetProperty("arguments").Clone());
        error = string.Empty;
        return true;
    }

    public static bool TryValidateManage(JsonElement root, string? authorization, string token, DateTimeOffset now, out BridgeRequest? request, out string error)
    {
        request = null; error = "Invalid request.";
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String || id.GetString() != ContractId || !root.TryGetProperty("operation", out var op) || op.ValueKind != JsonValueKind.String || !ManageOperations.Contains(op.GetString() ?? "") || !root.TryGetProperty("requestId", out var rid) || rid.ValueKind != JsonValueKind.String || !Guid.TryParseExact(rid.GetString(), "D", out _) || !root.TryGetProperty("timestamp", out var ts) || ts.ValueKind != JsonValueKind.String || !DateTimeOffset.TryParse(ts.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed) || Math.Abs((now - parsed).TotalSeconds) > MaximumClockSkew.TotalSeconds || !root.TryGetProperty("arguments", out var args) || args.ValueKind != JsonValueKind.Object)
        { error = "Invalid management request."; return false; }
        if (args.EnumerateObject().Any(property => !ManageArgumentProperties.Contains(property.Name))) { error = "Unknown management argument."; return false; }
        var operation = op.GetString()!;
        if (operation == "launch_application")
        {
            if (!args.TryGetProperty("shortcutPath", out var shortcut) || shortcut.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(shortcut.GetString())) { error = "Application shortcut path is required."; return false; }
        }
        else if (!args.TryGetProperty("windowHandle", out var handle) || handle.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(handle.GetString())) { error = "Window handle is required."; return false; }
        if (args.TryGetProperty("processId", out var processId) && (processId.ValueKind != JsonValueKind.Number || !processId.TryGetInt32(out var pid) || pid <= 0)) { error = "Invalid process ID."; return false; }
        foreach (var name in new[] { "x", "y" }) if (args.TryGetProperty(name, out var coordinate) && (coordinate.ValueKind != JsonValueKind.Number || !coordinate.TryGetInt32(out var value) || value is < -100000 or > 100000)) { error = "Invalid window coordinate."; return false; }
        foreach (var name in new[] { "width", "height" }) if (args.TryGetProperty(name, out var dimension) && (dimension.ValueKind != JsonValueKind.Number || !dimension.TryGetInt32(out var value) || value is < 1 or > 10000)) { error = "Invalid window size."; return false; }
        var geometry = new[] { "x", "y", "width", "height" };
        if (operation == "move_resize" && geometry.Any(name => !args.TryGetProperty(name, out _))) { error = "Move/resize requires x, y, width and height."; return false; }
        if (operation != "move_resize" && geometry.Any(name => args.TryGetProperty(name, out _))) { error = "Geometry is only valid for move_resize."; return false; }
        if (operation != "launch_application" && args.TryGetProperty("shortcutPath", out _)) { error = "Shortcut path is only valid for launch_application."; return false; }
        var expected = Encoding.UTF8.GetBytes($"Bearer {token}"); var supplied = Encoding.UTF8.GetBytes(authorization ?? string.Empty);
        if (expected.Length != supplied.Length || !CryptographicOperations.FixedTimeEquals(expected, supplied)) { error = "Authentication required."; return false; }
        request = new BridgeRequest(op.GetString()!, rid.GetString()!, args.Clone()); error = string.Empty; return true;
    }

    private static bool TryString(JsonElement root, string name, out string value)
    {
        value = string.Empty;
        return root.TryGetProperty(name, out var element) &&
               element.ValueKind == JsonValueKind.String &&
               (value = element.GetString() ?? string.Empty).Length is > 0 and <= 200;
    }
}
