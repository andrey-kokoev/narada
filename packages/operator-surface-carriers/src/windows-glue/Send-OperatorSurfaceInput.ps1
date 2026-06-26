param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$IdentityName,
    [Int64]$Hwnd = 0,
    [string]$Text,
    [string]$FromIdentity,
    [ValidateSet("short_command", "note")]
    [string]$MessagePosture = "short_command",
    [ValidateSet("type_only", "operator_confirmed_submit", "known_surface_submit")]
    [string]$SubmitStrategy = "type_only",
    [string]$AssertedBy = "operator",
    [int]$InputEscrowTimeoutMs = 10000,
    [ValidateSet("warn_countdown", "refuse")]
    [string]$CrossDesktopPolicy,
    [ValidateSet("queue_waiting_for_idle", "refuse", "allow_interrupt")]
    [string]$ActiveInputPolicy,
    [int]$RequiredIdleMs = -1,
    [int]$IdleWaitTimeoutMs = -1,
    [ValidateSet("sender_notification", "expire")]
    [string]$TimeoutOutcomePolicy,
    [int]$CrossDesktopWarningSeconds = 3,
    [string]$DeliveryPolicyPath,
    [int]$InputIdleFixtureMs = -1,
    [string]$DesktopAccessorDll,
    [string]$DesktopSnapshotFixturePath,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class NaradaOperatorSurfaceInputNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr SetActiveWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    [DllImport("kernel32.dll")]
    public static extern ulong GetTickCount64();

    public static long GetIdleMilliseconds() {
        LASTINPUTINFO info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (!GetLastInputInfo(ref info)) return -1;
        return (long)(GetTickCount64() - info.dwTime);
    }
}

public static class NaradaOperatorSurfaceInputEscrowNative {
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int WM_QUIT = 0x0012;
    private const int LLKHF_INJECTED = 0x00000010;
    private const int LLMHF_INJECTED = 0x00000001;
    private const int KEYEVENTF_KEYUP = 0x0002;

    private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public int ptX;
        public int ptY;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private struct BufferedKey {
        public byte Vk;
        public byte Scan;
        public bool KeyUp;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint idThread, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, int dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    private static readonly object Gate = new object();
    private static readonly ConcurrentQueue<BufferedKey> BufferedKeys = new ConcurrentQueue<BufferedKey>();
    private static LowLevelProc KeyboardProc = KeyboardHook;
    private static LowLevelProc MouseProc = MouseHook;
    private static IntPtr KeyboardHookHandle = IntPtr.Zero;
    private static IntPtr MouseHookHandle = IntPtr.Zero;
    private static Thread HookThread = null;
    private static uint HookThreadId = 0;
    private static Timer ReleaseTimer = null;
    private static bool Active = false;
    private static int KeyboardSuppressed = 0;
    private static int MouseSuppressed = 0;
    private static int KeyboardDiscardedInjected = 0;

    public static void Start(int timeoutMilliseconds) {
        lock (Gate) {
            if (Active) return;
            if (timeoutMilliseconds <= 0) throw new Exception("input_escrow_timeout_must_be_positive");
            BufferedKey discarded;
            while (BufferedKeys.TryDequeue(out discarded)) {}
            KeyboardSuppressed = 0;
            MouseSuppressed = 0;
            KeyboardDiscardedInjected = 0;
            Active = true;
            HookThread = new Thread(HookLoop);
            HookThread.IsBackground = true;
            HookThread.SetApartmentState(ApartmentState.STA);
            HookThread.Start();
            ReleaseTimer = new Timer(_ => {
                try {
                    Stop(false);
                } catch {
                }
            }, null, timeoutMilliseconds, Timeout.Infinite);
        }
        for (int i = 0; i < 50; i++) {
            if (HookThreadId != 0 && KeyboardHookHandle != IntPtr.Zero && MouseHookHandle != IntPtr.Zero) return;
            Thread.Sleep(20);
        }
        throw new Exception("input_escrow_hook_start_timeout");
    }

    public static EscrowSnapshot Stop(bool replayBufferedKeys) {
        lock (Gate) {
            if (!Active) return Snapshot("not_active", false, 0);
            Active = false;
            if (ReleaseTimer != null) {
                ReleaseTimer.Dispose();
                ReleaseTimer = null;
            }
            if (HookThreadId != 0) PostThreadMessage(HookThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        }
        if (HookThread != null && HookThread.IsAlive) HookThread.Join(1000);
        int replayed = 0;
        if (replayBufferedKeys) {
            BufferedKey key;
            while (BufferedKeys.TryDequeue(out key)) {
                keybd_event(key.Vk, key.Scan, key.KeyUp ? KEYEVENTF_KEYUP : 0, UIntPtr.Zero);
                replayed++;
                Thread.Sleep(5);
            }
        }
        return Snapshot(replayBufferedKeys ? "replayed" : "discarded", replayBufferedKeys, replayed);
    }

    private static EscrowSnapshot Snapshot(string status, bool replayed, int replayedEvents) {
        return new EscrowSnapshot {
            Status = status,
            KeyboardSuppressed = KeyboardSuppressed,
            MouseSuppressed = MouseSuppressed,
            KeyboardDiscardedInjected = KeyboardDiscardedInjected,
            BufferedKeyEventsRemaining = BufferedKeys.Count,
            Replayed = replayed,
            ReplayedKeyEvents = replayedEvents
        };
    }

    private static void HookLoop() {
        HookThreadId = GetCurrentThreadId();
        KeyboardHookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, IntPtr.Zero, 0);
        MouseHookHandle = SetWindowsHookEx(WH_MOUSE_LL, MouseProc, IntPtr.Zero, 0);
        MSG msg;
        while (Active && GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
        if (KeyboardHookHandle != IntPtr.Zero) {
            UnhookWindowsHookEx(KeyboardHookHandle);
            KeyboardHookHandle = IntPtr.Zero;
        }
        if (MouseHookHandle != IntPtr.Zero) {
            UnhookWindowsHookEx(MouseHookHandle);
            MouseHookHandle = IntPtr.Zero;
        }
        HookThreadId = 0;
    }

    private static IntPtr KeyboardHook(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && Active) {
            KBDLLHOOKSTRUCT info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            if ((info.flags & LLKHF_INJECTED) != 0) {
                KeyboardDiscardedInjected++;
                return CallNextHookEx(KeyboardHookHandle, nCode, wParam, lParam);
            }
            int message = wParam.ToInt32();
            if (message == WM_KEYDOWN || message == WM_KEYUP || message == WM_SYSKEYDOWN || message == WM_SYSKEYUP) {
                BufferedKeys.Enqueue(new BufferedKey {
                    Vk = (byte)info.vkCode,
                    Scan = (byte)info.scanCode,
                    KeyUp = (message == WM_KEYUP || message == WM_SYSKEYUP)
                });
                KeyboardSuppressed++;
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(KeyboardHookHandle, nCode, wParam, lParam);
    }

    private static IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && Active) {
            MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            if ((info.flags & LLMHF_INJECTED) == 0) {
                MouseSuppressed++;
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(MouseHookHandle, nCode, wParam, lParam);
    }
}

public class EscrowSnapshot {
    public string Status;
    public int KeyboardSuppressed;
    public int MouseSuppressed;
    public int KeyboardDiscardedInjected;
    public int BufferedKeyEventsRemaining;
    public bool Replayed;
    public int ReplayedKeyEvents;
}
"@

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = $Value | ConvertTo-Json -Depth 50
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-OperatorSurfaceInputDeliveryPolicy {
    param([string]$Path)

    $defaults = [ordered]@{
        active_input = [ordered]@{
            policy = "queue_waiting_for_idle"
            required_idle_ms = 750
            wait_timeout_ms = 5000
            on_timeout = "sender_notification"
        }
        cross_desktop = [ordered]@{
            default_policy = "refuse"
            warning_seconds = 3
        }
        minimized_or_offscreen = [ordered]@{
            policy = "reject_non_activating_delivery_v1"
            reason = "Windows Terminal text delivery currently uses clipboard paste plus SendKeys, which requires foreground focus."
        }
        foreground_last_resort = [ordered]@{
            enabled = $true
            requires_idle_gate = $true
            requires_same_desktop_or_explicit_cross_desktop_policy = $true
        }
        timeout_outcome = [ordered]@{
            default = "sender_notification"
            allowed = @("queued", "expired", "sender_notification")
        }
    }

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]$defaults
    }

    return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($Path))
}

function Get-OperatorIdleMilliseconds {
    if ($InputIdleFixtureMs -ge 0) { return $InputIdleFixtureMs }
    return [NaradaOperatorSurfaceInputNative]::GetIdleMilliseconds()
}

function Get-LiveWindowInfo {
    param([IntPtr]$WindowHandle)

    if (-not [NaradaOperatorSurfaceInputNative]::IsWindow($WindowHandle)) {
        throw "target_window_not_live"
    }
    $isVisible = [NaradaOperatorSurfaceInputNative]::IsWindowVisible($WindowHandle)

    $titleBuffer = [System.Text.StringBuilder]::new(1024)
    [void][NaradaOperatorSurfaceInputNative]::GetWindowText($WindowHandle, $titleBuffer, $titleBuffer.Capacity)
    $classBuffer = [System.Text.StringBuilder]::new(256)
    [void][NaradaOperatorSurfaceInputNative]::GetClassName($WindowHandle, $classBuffer, $classBuffer.Capacity)
    $processId = [uint32]0
    [void][NaradaOperatorSurfaceInputNative]::GetWindowThreadProcessId($WindowHandle, [ref]$processId)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

    [ordered]@{
        hwnd    = $WindowHandle.ToInt64()
        pid     = [int]$processId
        process = if ($process) { $process.ProcessName } else { "" }
        title   = $titleBuffer.ToString()
        class   = $classBuffer.ToString()
        visible = [bool]$isVisible
    }
}

function Get-AutoHotkeyPath {
    $autoHotkey = Get-Command AutoHotkey64.exe -ErrorAction SilentlyContinue
    if (-not $autoHotkey) { $autoHotkey = Get-Command autohotkey.exe -ErrorAction SilentlyContinue }
    if ($autoHotkey) { return $autoHotkey.Source }

    $candidate = Join-Path $env:USERPROFILE "scoop\apps\autohotkey\current\v2\AutoHotkey64.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw "AutoHotkey v2 is not available for Windows desktop membership inspection."
}

function Resolve-DesktopAccessorDll {
    param([string]$PcRoot)

    if ($DesktopAccessorDll) {
        if (Test-Path -LiteralPath $DesktopAccessorDll) { return (Resolve-Path -LiteralPath $DesktopAccessorDll).Path }
        throw "VirtualDesktopAccessor.dll not found: $DesktopAccessorDll"
    }

    $candidate = Join-Path $PcRoot "tools\autohotkey\windows-desktops\VirtualDesktopAccessor.dll"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw "VirtualDesktopAccessor.dll not found: $candidate"
}

function Invoke-DesktopBridge {
    param(
        [string]$PcRoot,
        [ValidateSet("inspect", "switch")]
        [string]$Mode,
        [int64[]]$Hwnds = @(),
        [int]$TargetDesktop = -1
    )

    if ($DesktopSnapshotFixturePath) {
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($DesktopSnapshotFixturePath))
    }

    $autoHotkeyPath = Get-AutoHotkeyPath
    $dllPath = Resolve-DesktopAccessorDll -PcRoot $PcRoot
    $token = [Guid]::NewGuid().ToString("N")
    $scriptPath = Join-Path $env:TEMP "narada-operator-surface-desktop-$token.ahk"
    $outputPath = Join-Path $env:TEMP "narada-operator-surface-desktop-$token.json"
    $script = @'
#Requires AutoHotkey v2.0
#SingleInstance Force

dllPath := A_Args[1]
mode := A_Args[2]
targetDesktop := Integer(A_Args[3])
outputPath := A_Args[4]

hVirtualDesktopAccessor := DllCall("LoadLibrary", "Str", dllPath, "Ptr")
GetCurrentDesktopNumberProc := DllCall("GetProcAddress", "Ptr", hVirtualDesktopAccessor, "AStr", "GetCurrentDesktopNumber", "Ptr")
GetDesktopCountProc := DllCall("GetProcAddress", "Ptr", hVirtualDesktopAccessor, "AStr", "GetDesktopCount", "Ptr")
GetWindowDesktopNumberProc := DllCall("GetProcAddress", "Ptr", hVirtualDesktopAccessor, "AStr", "GetWindowDesktopNumber", "Ptr")
GoToDesktopNumberProc := DllCall("GetProcAddress", "Ptr", hVirtualDesktopAccessor, "AStr", "GoToDesktopNumber", "Ptr")

if (!hVirtualDesktopAccessor || !GetCurrentDesktopNumberProc || !GetDesktopCountProc || !GetWindowDesktopNumberProc || !GoToDesktopNumberProc) {
    FileAppend('{"ok":false,"error":"missing_virtual_desktop_exports"}', outputPath, "UTF-8")
    ExitApp(2)
}

before := DllCall(GetCurrentDesktopNumberProc, "Int")
switchResult := 0
if (mode = "switch") {
    switchResult := DllCall(GoToDesktopNumberProc, "Int", targetDesktop, "Int")
    Sleep(250)
}
after := DllCall(GetCurrentDesktopNumberProc, "Int")
count := DllCall(GetDesktopCountProc, "Int")
text := '{"ok":true,"mode":"' mode '","current_desktop":' after ',"previous_desktop":' before ',"desktop_count":' count ',"target_desktop":' targetDesktop ',"switch_result":' switchResult ',"windows":['
Loop A_Args.Length - 4 {
    argIndex := A_Index + 4
    hwnd := Integer(A_Args[argIndex])
    desktopNumber := DllCall(GetWindowDesktopNumberProc, "Ptr", hwnd, "Int")
    if (A_Index > 1) {
        text .= ","
    }
    text .= '{"hwnd":' hwnd ',"desktop":' desktopNumber '}'
}
text .= ']}'
FileAppend(text, outputPath, "UTF-8")
'@

    try {
        Set-Content -LiteralPath $scriptPath -Value $script -Encoding ASCII
        $arguments = @($scriptPath, $dllPath, $Mode, [string]$TargetDesktop, $outputPath)
        $arguments += @($Hwnds | ForEach-Object { [string]$_ })
        $process = Start-Process -FilePath $autoHotkeyPath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
        if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
            throw "Windows desktop bridge failed with exit code $($process.ExitCode)."
        }
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($outputPath))
    } finally {
        Remove-Item -LiteralPath $scriptPath, $outputPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-DesktopForHwnd {
    param($Snapshot, [int64]$Hwnd)

    $match = @($Snapshot.windows | Where-Object { [int64]$_.hwnd -eq $Hwnd }) | Select-Object -First 1
    if (-not $match) { return -1 }
    return [int]$match.desktop
}

$desktopModelPath = Join-Path $UserSiteRoot "tools\operator-surface-carriers\OperatorSurfaceDesktopDelivery.Model.ps1"
if (Test-Path -LiteralPath $desktopModelPath) {
    . $desktopModelPath
} else {
    throw "Operator surface desktop delivery model not found: $desktopModelPath"
}
$envelopeModelPath = Join-Path $UserSiteRoot "tools\operator-surface-carriers\OperatorSurfaceMessageEnvelope.Model.ps1"
if (Test-Path -LiteralPath $envelopeModelPath) {
    . $envelopeModelPath
} else {
    throw "Operator surface message envelope model not found: $envelopeModelPath"
}

if ([string]::IsNullOrWhiteSpace($DeliveryPolicyPath)) {
    $DeliveryPolicyPath = Join-Path $UserSiteRoot "operator-surfaces\input-delivery-policy.json"
}
$deliveryPolicy = Read-OperatorSurfaceInputDeliveryPolicy -Path $DeliveryPolicyPath
if ([string]::IsNullOrWhiteSpace($CrossDesktopPolicy)) {
    $CrossDesktopPolicy = if ($deliveryPolicy.cross_desktop.default_policy) { [string]$deliveryPolicy.cross_desktop.default_policy } else { "refuse" }
}
if ([string]::IsNullOrWhiteSpace($ActiveInputPolicy)) {
    $ActiveInputPolicy = if ($deliveryPolicy.active_input.policy) { [string]$deliveryPolicy.active_input.policy } else { "queue_waiting_for_idle" }
}
if ($RequiredIdleMs -lt 0) {
    $RequiredIdleMs = if ($deliveryPolicy.active_input.required_idle_ms -ne $null) { [int]$deliveryPolicy.active_input.required_idle_ms } else { 750 }
}
if ($IdleWaitTimeoutMs -lt 0) {
    $IdleWaitTimeoutMs = if ($deliveryPolicy.active_input.wait_timeout_ms -ne $null) { [int]$deliveryPolicy.active_input.wait_timeout_ms } else { 5000 }
}
if ([string]::IsNullOrWhiteSpace($TimeoutOutcomePolicy)) {
    $TimeoutOutcomePolicy = if ($deliveryPolicy.active_input.on_timeout) { [string]$deliveryPolicy.active_input.on_timeout } elseif ($deliveryPolicy.timeout_outcome.default) { [string]$deliveryPolicy.timeout_outcome.default } else { "sender_notification" }
}

if ([string]::IsNullOrWhiteSpace($IdentityName)) {
    throw "IdentityName is required."
}
if ([string]::IsNullOrEmpty($Text)) {
    throw "Text is required."
}
if ($Text.Length -gt 2000) {
    throw "Text is too long for operator-surface input bridge: $($Text.Length) characters."
}
if (Test-OperatorSurfaceSecretLikeText -Value $Text) {
    throw "operator_surface_secret_like_text_refused: send secrets through an admitted secret/capability path, not this bridge."
}

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
$labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "Identity registry not found: $identityPath"
}
if (-not (Test-Path -LiteralPath $labelPath)) {
    throw "Window label projection not found: $labelPath"
}

$registry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$labelProjection = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
$lookupOwnerSiteId = if ($labelProjection.owner_site_id) { [string]$labelProjection.owner_site_id } elseif ($registry.owner_site_id) { [string]$registry.owner_site_id } else { $null }
$targetIdentityOwner = if ($IdentityName -match "^(.+)\.[^.]+$") { $Matches[1] } else { $null }
$crossSiteLookup = -not [string]::IsNullOrWhiteSpace($targetIdentityOwner) -and
    -not [string]::IsNullOrWhiteSpace($lookupOwnerSiteId) -and
    -not [string]::Equals($targetIdentityOwner, $lookupOwnerSiteId, [System.StringComparison]::OrdinalIgnoreCase)
$identity = @($registry.identities | Where-Object {
    $_.identity_id -eq $IdentityName -or $_.identity_name -eq $IdentityName
}) | Select-Object -First 1
if (-not $identity) {
    if ($crossSiteLookup) {
        throw "cross_site_operator_surface_binding_lookup: target_identity=$IdentityName target_identity_owner=$targetIdentityOwner lookup_owner_site_id=$lookupOwnerSiteId user_site_root=$UserSiteRoot. Use the receiving Site operator-surface bus/projection for this identity."
    }
    $admitted = @($registry.identities | ForEach-Object {
        if ($_.identity_id) { $_.identity_id } else { $_.identity_name }
    }) -join ", "
    throw "Identity not found in registry: $IdentityName. Admitted identities: $admitted"
}

$runtimePath = [string]$labelProjection.runtime_binding_path
if ([string]::IsNullOrWhiteSpace($runtimePath)) {
    throw "runtime_binding_path is missing from $labelPath"
}
if (-not (Test-Path -LiteralPath $runtimePath)) {
    throw "Runtime binding file not found: $runtimePath"
}

$runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimePath))
$matches = @($runtime.bindings | Where-Object { $_.identity_name -eq $IdentityName })
if ($Hwnd -ne 0) {
    $matches = @($matches | Where-Object { [int64]$_.hwnd -eq $Hwnd })
}
if ($matches.Count -eq 0) {
    if ($crossSiteLookup) {
        throw "cross_site_operator_surface_binding_lookup: target_identity=$IdentityName target_identity_owner=$targetIdentityOwner lookup_owner_site_id=$lookupOwnerSiteId user_site_root=$UserSiteRoot. Local binding may exist in the receiving Site; this projection is not binding authority for that identity."
    }
    throw "no_live_binding_for_identity: $IdentityName"
}

$viableMatches = New-Object System.Collections.Generic.List[object]
$rejectedMatches = New-Object System.Collections.Generic.List[string]
$staleHwnds = New-Object System.Collections.Generic.List[int64]
foreach ($candidateBinding in $matches) {
    $candidateHwnd = [IntPtr]([int64]$candidateBinding.hwnd)
    try {
        $candidateLive = Get-LiveWindowInfo -WindowHandle $candidateHwnd
        $rejectReasons = @()
        $processMatches = $candidateBinding.observed_process -and [string]$candidateBinding.observed_process -eq [string]$candidateLive.process
        $classMatches = $candidateBinding.observed_class -and [string]$candidateBinding.observed_class -eq [string]$candidateLive.class
        $observedTitle = ([string]$candidateBinding.observed_title).Trim()
        $liveTitle = ([string]$candidateLive.title).Trim()
        $titleMatches = $candidateBinding.observed_title -and $observedTitle -eq $liveTitle
        $stableTerminalMatch = $classMatches -and $titleMatches
        if ($candidateBinding.observed_process -and -not $processMatches -and -not $stableTerminalMatch) {
            $rejectReasons += "process"
        }
        if ($candidateBinding.observed_class -and -not $classMatches) {
            $rejectReasons += "class"
        }
        if ($candidateBinding.observed_pid -ne $null -and [int]$candidateBinding.observed_pid -ne [int]$candidateLive.pid -and -not (($processMatches -and $classMatches) -or $stableTerminalMatch)) {
            $rejectReasons += "pid"
        }
        if (-not $candidateBinding.observed_pid -or -not $candidateBinding.observed_process -or -not $candidateBinding.observed_class) {
            $rejectReasons += "missing_guards"
        }
        if ($rejectReasons.Count -eq 0) {
            $viableMatches.Add([pscustomobject][ordered]@{
                binding = $candidateBinding
                live = $candidateLive
            })
        } else {
            $rejectedMatches.Add(("{0}:{1}" -f $candidateBinding.hwnd, ($rejectReasons -join "+")))
            if ($rejectReasons -contains "pid" -or $rejectReasons -contains "process" -or $rejectReasons -contains "class" -or $rejectReasons -contains "missing_guards") {
                $staleHwnds.Add([int64]$candidateBinding.hwnd)
            }
        }
    } catch {
        $rejectedMatches.Add(("{0}:{1}" -f $candidateBinding.hwnd, $_.Exception.Message))
    }
}

if ($viableMatches.Count -eq 0) {
    $prunedEvidence = $null
    if ($staleHwnds.Count -gt 0) {
        try {
            . (Join-Path $PSScriptRoot "..\RuntimeWindowBindingStore.ps1")
            $prunedEvidence = Invoke-OperatorSurfaceRuntimeBindingPruning `
                -PcSiteRoot $pcRoot `
                -UserIdentityRegistry $identityPath `
                -IdentityName $IdentityName
        } catch {
            $prunedEvidence = @{ error = $_.Exception.Message }
        }
    }
    $prunedSummary = if ($prunedEvidence) { " Pruned: $($prunedEvidence.pruned.Count) stale bindings." } else { "" }
    if ($staleHwnds.Count -gt 0) {
        throw "stale_runtime_binding: all bindings for $IdentityName are stale. Rejected bindings: $($rejectedMatches.ToArray() -join ', ')$prunedSummary"
    }
    throw "no_live_binding_for_identity: $IdentityName. Rejected bindings: $($rejectedMatches.ToArray() -join ', ')$prunedSummary"
}
if ($viableMatches.Count -gt 1) {
    $hwnds = @($viableMatches | ForEach-Object { $_.binding.hwnd }) -join ", "
    throw "ambiguous_identity_binding: $IdentityName has $($viableMatches.Count) live matching bindings. Re-run with -Hwnd. Bindings: $hwnds"
}

$binding = $viableMatches[0].binding
$targetHwnd = [IntPtr]([int64]$binding.hwnd)
$live = $viableMatches[0].live

$pcRoot = [string]$runtime.owner_pc_site_root
if ([string]::IsNullOrWhiteSpace($pcRoot)) {
    $pcRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"
}
$eventDir = Join-Path $pcRoot "runtime\operator-surface-input-events"
$eventId = "input_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$messageId = "osm_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$eventPath = Join-Path $eventDir ($eventId + ".json")
$previousForeground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
$previousForegroundLive = $null
if ($previousForeground -ne [IntPtr]::Zero -and [NaradaOperatorSurfaceInputNative]::IsWindow($previousForeground)) {
    try {
        $previousForegroundLive = Get-LiveWindowInfo -WindowHandle $previousForeground
    } catch {
        $previousForegroundLive = [ordered]@{
            hwnd = $previousForeground.ToInt64()
            error = $_.Exception.Message
        }
    }
}
$sender = Resolve-OperatorSurfaceSender `
    -IdentityRegistry $registry `
    -AssertedBy $AssertedBy `
    -FromIdentity $FromIdentity `
    -RuntimeBindings $runtime `
    -PreviousForegroundHwnd $(if ($previousForeground -ne [IntPtr]::Zero) { $previousForeground.ToInt64() } else { 0 }) `
    -PreviousForegroundLive $previousForegroundLive
$sentAt = Get-Date -Format "o"
$deliveredEnvelope = New-OperatorSurfaceMessageEnvelope `
    -MessageId $messageId `
    -EventId $eventId `
    -Sender $sender `
    -ToIdentity $IdentityName `
    -AssertedBy $AssertedBy `
    -Posture $MessagePosture `
    -SentAt $sentAt `
    -DeliveryChannel "windows_terminal_clipboard_sendkeys" `
    -EvidencePath $eventPath `
    -BodyText $Text
$deliveredPayload = Format-OperatorSurfaceDeliveredMessage -BodyText $Text -Envelope $deliveredEnvelope
$submitGesture = $null
$desktopSnapshot = Invoke-DesktopBridge -PcRoot $pcRoot -Mode "inspect" -Hwnds @([int64]$binding.hwnd, $(if ($previousForeground -ne [IntPtr]::Zero) { $previousForeground.ToInt64() } else { 0 }))
$currentDesktop = [int]$desktopSnapshot.current_desktop
$targetDesktop = Get-DesktopForHwnd -Snapshot $desktopSnapshot -Hwnd ([int64]$binding.hwnd)
$previousForegroundDesktop = if ($previousForeground -ne [IntPtr]::Zero) {
    Get-DesktopForHwnd -Snapshot $desktopSnapshot -Hwnd ($previousForeground.ToInt64())
} else {
    -1
}
$desktopPlan = Resolve-OperatorSurfaceDesktopDeliveryPlan -CurrentDesktop $currentDesktop -TargetDesktop $targetDesktop -PreviousForegroundDesktop $previousForegroundDesktop -CrossDesktopPolicy $CrossDesktopPolicy

$evidence = [ordered]@{
    schema             = "narada.operator_surfaces.input_event.v0"
    event_id           = $eventId
    message_id         = $messageId
    occurred_at        = (Get-Date -Format "o")
    sender_operator_surface = $deliveredEnvelope.sender_operator_surface
    authorized_by      = $deliveredEnvelope.authorized_by
    target_operator_surface = $deliveredEnvelope.target_operator_surface
    asserted_by        = $AssertedBy
    authority_principal = $AssertedBy
    sender             = $sender
    sender_resolution  = $sender.resolution_evidence
    user_site_root     = $UserSiteRoot
    runtime_binding    = $runtimePath
    identity_name      = $IdentityName
    requested_hwnd     = if ($Hwnd -ne 0) { $Hwnd } else { $null }
    resolved_hwnd      = [int64]$binding.hwnd
    live_window_before = $live
    text_length        = $Text.Length
    delivered_payload_text_length = $deliveredPayload.Length
    delivered_envelope = $deliveredEnvelope
    submit_strategy    = $SubmitStrategy
    submit_gesture     = $submitGesture
    dry_run            = [bool]$DryRun
    delivered_text     = $false
    submitted          = $false
    status             = "planned"
    failure_reason     = $null
    previous_foreground_hwnd = if ($previousForeground -ne [IntPtr]::Zero) { $previousForeground.ToInt64() } else { $null }
    previous_foreground_live = $previousForegroundLive
    restored_previous_foreground = $null
    restored_foreground_hwnd = $null
    windows_desktop = [ordered]@{
        current_desktop = $currentDesktop
        target_desktop = if ($targetDesktop -ge 0) { $targetDesktop } else { $null }
        previous_foreground_desktop = if ($previousForegroundDesktop -ge 0) { $previousForegroundDesktop } else { $null }
        desktop_count = if ($desktopSnapshot.desktop_count) { [int]$desktopSnapshot.desktop_count } else { $null }
        delivery_case = $desktopPlan.case
        delivery_action = $desktopPlan.action
        switch_policy = $CrossDesktopPolicy
        target_desktop_known = [bool]$desktopPlan.target_desktop_known
        desktop_switch_planned = [bool]$desktopPlan.desktop_switch_planned
        desktop_switch_performed = $false
        desktop_switch_result = $null
        warning_countdown_seconds = if ($desktopPlan.desktop_switch_planned) { $CrossDesktopWarningSeconds } else { 0 }
        restore_desktop_planned = [bool]$desktopPlan.restore_desktop_planned
        restore_desktop_performed = $false
        restore_desktop_result = $null
        restored_desktop = $null
        message = $desktopPlan.message
    }
    input_escrow = [ordered]@{
        enabled = -not [bool]$DryRun
        status = "not_started"
        keyboard_suppressed_count = 0
        mouse_suppressed_count = 0
        injected_keyboard_ignored_count = 0
        buffered_key_events_remaining = 0
        replayed = $false
        replayed_key_event_count = 0
        discarded_key_event_count = 0
        duration_ms = 0
        timeout_ms = $InputEscrowTimeoutMs
        timed_out = $false
        original_foreground_hwnd = if ($previousForeground -ne [IntPtr]::Zero) { $previousForeground.ToInt64() } else { $null }
        restored_original_foreground = $null
        buffered_text_logged = $false
    }
    delivery_policy = [ordered]@{
        path = $DeliveryPolicyPath
        active_input_policy = $ActiveInputPolicy
        required_idle_ms = $RequiredIdleMs
        idle_wait_timeout_ms = $IdleWaitTimeoutMs
        timeout_outcome_policy = $TimeoutOutcomePolicy
        cross_desktop_policy = $CrossDesktopPolicy
        foreground_last_resort_enabled = [bool]$deliveryPolicy.foreground_last_resort.enabled
        minimized_or_offscreen_policy = if ($deliveryPolicy.minimized_or_offscreen.policy) { [string]$deliveryPolicy.minimized_or_offscreen.policy } else { "not_declared" }
    }
    operator_input = [ordered]@{
        idle_ms_before = $null
        required_idle_ms = $RequiredIdleMs
        policy = $ActiveInputPolicy
        action = "not_evaluated"
        waited_ms = 0
        timed_out = $false
        timeout_outcome_policy = $TimeoutOutcomePolicy
    }
    low_churn_delivery = [ordered]@{
        current_text_path = "clipboard_paste_plus_sendkeys"
        requires_foreground_focus = $true
        non_activating_delivery_admitted = $false
        minimized_or_offscreen_result = if ($deliveryPolicy.minimized_or_offscreen.current_result) { [string]$deliveryPolicy.minimized_or_offscreen.current_result } else { "not_admitted" }
        reason = if ($deliveryPolicy.minimized_or_offscreen.reason) { [string]$deliveryPolicy.minimized_or_offscreen.reason } else { "No admitted non-activating carrier path for Windows Terminal." }
    }
}

if ($SubmitStrategy -eq "known_surface_submit") {
    $strategyPath = Join-Path $UserSiteRoot "operator-surfaces\input-submit-strategies.json"
    if (-not (Test-Path -LiteralPath $strategyPath)) {
        $evidence.status = "refused"
        $evidence.failure_reason = "submit_strategy_unavailable: no admitted strategy file at $strategyPath"
        Write-JsonFile -Path $eventPath -Value $evidence
        throw $evidence.failure_reason
    }
    $strategies = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($strategyPath))
    $strategy = @($strategies.strategies | Where-Object { $_.identity_name -eq $IdentityName -and $_.enabled -eq $true }) | Select-Object -First 1
    if (-not $strategy) {
        $evidence.status = "refused"
        $evidence.failure_reason = "submit_strategy_unavailable: no enabled known_surface_submit strategy for $IdentityName"
        Write-JsonFile -Path $eventPath -Value $evidence
        throw $evidence.failure_reason
    }
    $submitGesture = [string]$strategy.gesture
    $submitDelayMs = 0
    if ($strategy.PSObject.Properties.Name -contains "stabilization_delay_ms") {
        $submitDelayMs = [int]$strategy.stabilization_delay_ms
    }
    if ([string]::IsNullOrWhiteSpace($submitGesture)) {
        $evidence.status = "refused"
        $evidence.failure_reason = "submit_strategy_invalid: admitted strategy for $IdentityName has no gesture"
        Write-JsonFile -Path $eventPath -Value $evidence
        throw $evidence.failure_reason
    }
    if ($submitGesture -ne "vk_return") {
        $evidence.status = "refused"
        $evidence.failure_reason = "submit_strategy_unsupported: $submitGesture"
        Write-JsonFile -Path $eventPath -Value $evidence
        throw $evidence.failure_reason
    }
    $evidence.submit_gesture = $submitGesture
    $evidence.submit_stabilization_delay_ms = $submitDelayMs
}

if ($desktopPlan.action -eq "refuse" -or $desktopPlan.action -eq "refuse_cross_desktop") {
    $evidence.status = "refused"
    $evidence.failure_reason = $desktopPlan.message
    Write-JsonFile -Path $eventPath -Value $evidence
    if ($PassThru) { $evidence | ConvertTo-Json -Depth 50 }
    throw $evidence.failure_reason
}

$idleBefore = [int64](Get-OperatorIdleMilliseconds)
$evidence.operator_input.idle_ms_before = $idleBefore
if ($RequiredIdleMs -gt 0 -and $idleBefore -ge 0 -and $idleBefore -lt $RequiredIdleMs) {
    if ($ActiveInputPolicy -eq "refuse") {
        $evidence.operator_input.action = "refuse_active_input"
        $evidence.status = "refused"
        $evidence.failure_reason = "operator_active_input_refused: idle ${idleBefore}ms is below required ${RequiredIdleMs}ms"
        Write-JsonFile -Path $eventPath -Value $evidence
        if ($PassThru) { $evidence | ConvertTo-Json -Depth 50 }
        throw $evidence.failure_reason
    } elseif ($ActiveInputPolicy -eq "queue_waiting_for_idle") {
        $evidence.operator_input.action = "queue_waiting_for_idle"
        if (-not $DryRun) {
            $waitStarted = Get-Date
            do {
                Start-Sleep -Milliseconds 100
                $currentIdle = [int64](Get-OperatorIdleMilliseconds)
                $waitedMs = [Math]::Round(((Get-Date) - $waitStarted).TotalMilliseconds)
            } while ($currentIdle -ge 0 -and $currentIdle -lt $RequiredIdleMs -and $waitedMs -lt $IdleWaitTimeoutMs)
            $evidence.operator_input.waited_ms = $waitedMs
            $evidence.operator_input.idle_ms_after_wait = $currentIdle
            if ($currentIdle -ge 0 -and $currentIdle -lt $RequiredIdleMs) {
                $evidence.operator_input.timed_out = $true
                $evidence.status = "queued_waiting_for_idle_expired"
                $evidence.failure_reason = "operator_active_input_timeout: idle ${currentIdle}ms stayed below required ${RequiredIdleMs}ms after ${waitedMs}ms; timeout_outcome=$TimeoutOutcomePolicy"
                Write-JsonFile -Path $eventPath -Value $evidence
                if ($PassThru) { $evidence | ConvertTo-Json -Depth 50 }
                throw $evidence.failure_reason
            }
        }
    } else {
        $evidence.operator_input.action = "interrupt_authorized"
    }
} else {
    $evidence.operator_input.action = "idle_gate_passed"
}

if ($DryRun) {
    $evidence.status = "dry_run"
    Write-JsonFile -Path $eventPath -Value $evidence
    if ($PassThru) { $evidence | ConvertTo-Json -Depth 50 } else { Write-Host "Dry run ok. Evidence: $eventPath" }
    exit 0
}

$escrowStartedAt = Get-Date
$escrowActive = $false
$deliveryException = $null
$escrowTimedOut = $false
[NaradaOperatorSurfaceInputEscrowNative]::Start($InputEscrowTimeoutMs)
$escrowActive = $true
try {
if ($desktopPlan.desktop_switch_planned) {
    if ($CrossDesktopWarningSeconds -gt 0) {
        Write-Warning ("Operator-surface delivery will switch Windows desktop {0} -> {1} in {2}s for {3}." -f $currentDesktop, $targetDesktop, $CrossDesktopWarningSeconds, $IdentityName)
        Start-Sleep -Seconds $CrossDesktopWarningSeconds
    }
    $switchResult = Invoke-DesktopBridge -PcRoot $pcRoot -Mode "switch" -TargetDesktop $targetDesktop -Hwnds @([int64]$binding.hwnd)
    $evidence.windows_desktop.desktop_switch_performed = $true
    $evidence.windows_desktop.desktop_switch_result = $switchResult
    if (-not $switchResult.ok -or [int]$switchResult.current_desktop -ne $targetDesktop) {
        $evidence.status = "desktop_switch_failed"
        $evidence.failure_reason = "desktop_switch_failed: target desktop $targetDesktop, current desktop $($switchResult.current_desktop)"
        Write-JsonFile -Path $eventPath -Value $evidence
        throw $evidence.failure_reason
    }
}
[void][NaradaOperatorSurfaceInputNative]::ShowWindow($targetHwnd, 9)
Start-Sleep -Milliseconds 150
$activated = [NaradaOperatorSurfaceInputNative]::SetForegroundWindow($targetHwnd)
Start-Sleep -Milliseconds 250
$foreground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
if ($foreground -ne $targetHwnd) {
    [NaradaOperatorSurfaceInputNative]::SwitchToThisWindow($targetHwnd, $true)
    Start-Sleep -Milliseconds 250
    $foreground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
}
if ($foreground -ne $targetHwnd) {
    $targetPidForThread = [uint32]0
    $foregroundPidForThread = [uint32]0
    $targetThread = [NaradaOperatorSurfaceInputNative]::GetWindowThreadProcessId($targetHwnd, [ref]$targetPidForThread)
    $foregroundThread = [NaradaOperatorSurfaceInputNative]::GetWindowThreadProcessId($foreground, [ref]$foregroundPidForThread)
    $currentThread = [NaradaOperatorSurfaceInputNative]::GetCurrentThreadId()
    [void][NaradaOperatorSurfaceInputNative]::AttachThreadInput($currentThread, $foregroundThread, $true)
    [void][NaradaOperatorSurfaceInputNative]::AttachThreadInput($currentThread, $targetThread, $true)
    try {
        [void][NaradaOperatorSurfaceInputNative]::BringWindowToTop($targetHwnd)
        [void][NaradaOperatorSurfaceInputNative]::SetActiveWindow($targetHwnd)
        [void][NaradaOperatorSurfaceInputNative]::SetForegroundWindow($targetHwnd)
    } finally {
        [void][NaradaOperatorSurfaceInputNative]::AttachThreadInput($currentThread, $targetThread, $false)
        [void][NaradaOperatorSurfaceInputNative]::AttachThreadInput($currentThread, $foregroundThread, $false)
    }
    Start-Sleep -Milliseconds 250
    $foreground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
}
if ($foreground -ne $targetHwnd) {
    $evidence.status = "activation_failed"
    $foregroundInfo = $null
    try {
        $foregroundInfo = Get-LiveWindowInfo -WindowHandle $foreground
    } catch {
        $foregroundInfo = [ordered]@{
            hwnd  = $foreground.ToInt64()
            error = $_.Exception.Message
        }
    }
    $evidence.foreground_window_after_activation = $foregroundInfo
    if ($foregroundInfo.process -eq "LockApp") {
        $evidence.failure_reason = "activation_blocked_by_lock_screen: foreground is LockApp ($($foregroundInfo.title))"
    } else {
        $evidence.failure_reason = "activation_failed: SetForegroundWindow returned $activated and foreground HWND is $($foreground.ToInt64())"
    }
    Write-JsonFile -Path $eventPath -Value $evidence
    throw $evidence.failure_reason
}

$oldClipboardText = $null
$hadClipboardText = $false
try {
    if ([System.Windows.Forms.Clipboard]::ContainsText()) {
        $oldClipboardText = [System.Windows.Forms.Clipboard]::GetText()
        $hadClipboardText = $true
    }
    [System.Windows.Forms.Clipboard]::SetText($deliveredPayload)
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    $evidence.delivered_text = $true

    if ($SubmitStrategy -eq "operator_confirmed_submit") {
        $evidence.status = "operator_confirmation_required"
    } elseif ($SubmitStrategy -eq "known_surface_submit") {
        if ($submitDelayMs -gt 0) {
            Start-Sleep -Milliseconds $submitDelayMs
        }
        if ($submitGesture -eq "vk_return") {
            [NaradaOperatorSurfaceInputNative]::keybd_event(0x0D, 0x1C, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 50
            [NaradaOperatorSurfaceInputNative]::keybd_event(0x0D, 0x1C, 2, [UIntPtr]::Zero)
        } else {
            throw "submit_strategy_unsupported: $submitGesture"
        }
        $evidence.submitted = $true
        $evidence.status = "submitted_with_known_strategy"
    } else {
        $evidence.status = "typed_only"
    }
} finally {
    if ($hadClipboardText) {
        [System.Windows.Forms.Clipboard]::SetText($oldClipboardText)
    } else {
        [System.Windows.Forms.Clipboard]::Clear()
    }
    if ($previousForeground -ne [IntPtr]::Zero -and $previousForeground -ne $targetHwnd -and [NaradaOperatorSurfaceInputNative]::IsWindow($previousForeground)) {
        [void][NaradaOperatorSurfaceInputNative]::ShowWindow($previousForeground, 9)
        Start-Sleep -Milliseconds 100
        [void][NaradaOperatorSurfaceInputNative]::SetForegroundWindow($previousForeground)
        Start-Sleep -Milliseconds 100
        $restoredForeground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
        $evidence.restored_foreground_hwnd = $restoredForeground.ToInt64()
        $evidence.restored_previous_foreground = ($restoredForeground -eq $previousForeground)
    }
}
} catch {
    $deliveryException = $_.Exception
    if ($evidence.status -eq "planned") {
        $evidence.status = "failed"
        $evidence.failure_reason = $_.Exception.Message
    }
} finally {
    if ($evidence.windows_desktop.desktop_switch_performed -eq $true -and $evidence.windows_desktop.restore_desktop_planned -eq $true -and $evidence.windows_desktop.restore_desktop_performed -ne $true) {
        try {
            $restoreResult = Invoke-DesktopBridge -PcRoot $pcRoot -Mode "switch" -TargetDesktop $currentDesktop -Hwnds @()
            $evidence.windows_desktop.restore_desktop_performed = $true
            $evidence.windows_desktop.restore_desktop_result = $restoreResult
            $evidence.windows_desktop.restored_desktop = if ($restoreResult.current_desktop -ne $null) { [int]$restoreResult.current_desktop } else { $null }
            if ($previousForeground -ne [IntPtr]::Zero -and $previousForeground -ne $targetHwnd -and [NaradaOperatorSurfaceInputNative]::IsWindow($previousForeground)) {
                [void][NaradaOperatorSurfaceInputNative]::ShowWindow($previousForeground, 9)
                Start-Sleep -Milliseconds 100
                [void][NaradaOperatorSurfaceInputNative]::SetForegroundWindow($previousForeground)
                Start-Sleep -Milliseconds 100
                $restoredForeground = [NaradaOperatorSurfaceInputNative]::GetForegroundWindow()
                $evidence.restored_foreground_hwnd = $restoredForeground.ToInt64()
                $evidence.restored_previous_foreground = ($restoredForeground -eq $previousForeground)
            }
        } catch {
            $evidence.windows_desktop.restore_desktop_performed = $false
            $evidence.windows_desktop.restore_desktop_result = [ordered]@{ ok = $false; error = $_.Exception.Message }
        }
    }
    if ($escrowActive) {
        $durationMs = [Math]::Round(((Get-Date) - $escrowStartedAt).TotalMilliseconds)
        $escrowTimedOut = $durationMs -gt $InputEscrowTimeoutMs
        $restoreConfirmed = $false
        if ($previousForeground -ne [IntPtr]::Zero) {
            if ($previousForeground -eq $targetHwnd) {
                $restoreConfirmed = $true
            } elseif ($evidence.restored_previous_foreground -eq $true) {
                $restoreConfirmed = $true
            }
        }
        $replayAllowed = $restoreConfirmed -and (-not $escrowTimedOut)
        $escrowSnapshot = [NaradaOperatorSurfaceInputEscrowNative]::Stop($replayAllowed)
        $discarded = [int]$escrowSnapshot.BufferedKeyEventsRemaining
        if (-not $escrowSnapshot.Replayed) {
            $discarded = [int]$escrowSnapshot.KeyboardSuppressed
        }
        $evidence.input_escrow = [ordered]@{
            enabled = $true
            status = [string]$escrowSnapshot.Status
            keyboard_suppressed_count = [int]$escrowSnapshot.KeyboardSuppressed
            mouse_suppressed_count = [int]$escrowSnapshot.MouseSuppressed
            injected_keyboard_ignored_count = [int]$escrowSnapshot.KeyboardDiscardedInjected
            buffered_key_events_remaining = [int]$escrowSnapshot.BufferedKeyEventsRemaining
            replayed = [bool]$escrowSnapshot.Replayed
            replayed_key_event_count = [int]$escrowSnapshot.ReplayedKeyEvents
            discarded_key_event_count = $discarded
            duration_ms = $durationMs
            timeout_ms = $InputEscrowTimeoutMs
            timed_out = $escrowTimedOut
            original_foreground_hwnd = if ($previousForeground -ne [IntPtr]::Zero) { $previousForeground.ToInt64() } else { $null }
            restored_original_foreground = $restoreConfirmed
            buffered_text_logged = $false
        }
    }
}

Write-JsonFile -Path $eventPath -Value $evidence
if ($deliveryException) {
    throw $deliveryException
}
if ($PassThru) {
    $evidence | ConvertTo-Json -Depth 50
} else {
    Write-Host ("{0}: {1} -> HWND {2}. Evidence: {3}" -f $evidence.status, $IdentityName, $binding.hwnd, $eventPath)
}
