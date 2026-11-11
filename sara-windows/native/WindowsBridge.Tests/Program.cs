using System.Text.Json;
using System.Security.Cryptography;
using Sara.WindowsBridge;

var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
var now = DateTimeOffset.UtcNow;
var passed = 0;

Check("accept valid authenticated read-only request", MakeRequest("foreground_window", now), $"Bearer {token}", token, now, true);
Check("reject wrong bearer token", MakeRequest("health", now), "Bearer wrong", token, now, false);
Check("reject unknown operation", MakeRequest("launch_process", now), $"Bearer {token}", token, now, false);
Check("reject stale timestamp", MakeRequest("health", now.AddMinutes(-2)), $"Bearer {token}", token, now, false);
Check("reject arguments on observation", MakeRequest("monitors", now, "{\"unexpected\":true}"), $"Bearer {token}", token, now, false);
Check("reject additional envelope properties", MakeRequest("health", now, "{}", "\"authorization\":\"Bearer secret\""), $"Bearer {token}", token, now, false);
CheckManage("accept valid focus management request", MakeManageRequest("focus", now, "{\"windowHandle\":\"0x1234\",\"processId\":123}"), $"Bearer {token}", token, now, true);
CheckManage("reject unknown management argument", MakeManageRequest("focus", now, "{\"windowHandle\":\"0x1234\",\"shell\":true}"), $"Bearer {token}", token, now, false);
CheckManage("reject incomplete move resize", MakeManageRequest("move_resize", now, "{\"windowHandle\":\"0x1234\",\"x\":0}"), $"Bearer {token}", token, now, false);
CheckManage("reject geometry on focus", MakeManageRequest("focus", now, "{\"windowHandle\":\"0x1234\",\"x\":0,\"y\":0,\"width\":100,\"height\":100}"), $"Bearer {token}", token, now, false);
CheckManage("accept application launch envelope", MakeManageRequest("launch_application", now, "{\"shortcutPath\":\"C:\\\\Users\\\\Test\\\\App.lnk\"}"), $"Bearer {token}", token, now, true);
CheckManage("reject application launch without shortcut", MakeManageRequest("launch_application", now, "{}"), $"Bearer {token}", token, now, false);
Console.WriteLine($"Windows Bridge protocol checks passed: {passed}/12");
return passed == 12 ? 0 : 1;

void Check(string name, string json, string authorization, string expectedToken, DateTimeOffset clock, bool expected)
{
    using var document = JsonDocument.Parse(json);
    var actual = BridgeProtocol.TryValidate(document.RootElement, authorization, expectedToken, clock, out _, out _);
    if (actual != expected) throw new InvalidOperationException($"FAIL: {name}");
    Console.WriteLine($"PASS: {name}");
    passed++;
}

void CheckManage(string name, string json, string authorization, string expectedToken, DateTimeOffset clock, bool expected)
{
    using var document = JsonDocument.Parse(json);
    var actual = BridgeProtocol.TryValidateManage(document.RootElement, authorization, expectedToken, clock, out _, out _);
    if (actual != expected) throw new InvalidOperationException($"FAIL: {name}");
    Console.WriteLine($"PASS: {name}");
    passed++;
}

static string MakeRequest(string operation, DateTimeOffset timestamp, string arguments = "{}", string extra = "") =>
    $"{{\"id\":\"{BridgeProtocol.ContractId}\",\"operation\":\"{operation}\",\"requestId\":\"{Guid.NewGuid():D}\",\"timestamp\":\"{timestamp:O}\",\"arguments\":{arguments}{(extra.Length == 0 ? "" : "," + extra)}}}";

static string MakeManageRequest(string operation, DateTimeOffset timestamp, string arguments) =>
    $"{{\"id\":\"{BridgeProtocol.ContractId}\",\"operation\":\"{operation}\",\"requestId\":\"{Guid.NewGuid():D}\",\"timestamp\":\"{timestamp:O}\",\"arguments\":{arguments}}}";
