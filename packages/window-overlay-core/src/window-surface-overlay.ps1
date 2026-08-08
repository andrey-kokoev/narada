param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [int]$RefreshSeconds = 2,
    [ValidateSet('always', 'terminal-group', 'hidden', 'windows-terminal')][string]$VisibilityPolicy = 'terminal-group',
    [switch]$HostProcess
)

$ErrorActionPreference = 'Stop'
if (-not $HostProcess) { throw 'window_surface_overlay_host_requires_host_process' }
if (-not (Test-Path $StateRoot)) { New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null }

function Get-OverlayPath([string]$name) { Join-Path $StateRoot $name }
$pidPath = Get-OverlayPath 'overlay.pid'
$documentPath = Get-OverlayPath 'document.json'
$preferencesPath = Get-OverlayPath 'preferences.json'
$refreshPath = Get-OverlayPath 'refresh.signal'
$focusPath = Get-OverlayPath 'focus.signal'
$restartCommandPath = Get-OverlayPath 'restart.command.json'
$actionStatePath = Get-OverlayPath 'action-state.json'
. (Join-Path $PSScriptRoot 'WindowSurfaceOverlayCoordinator.ps1')
$visibilityStatePath = Get-OverlayPath 'visibility.state.json'
$surfaceRoot = Split-Path -Parent -Path $StateRoot
$VisibilityPolicy = Normalize-OverlayVisibilityPolicy $VisibilityPolicy
$script:StartupVisibilityPolicy = $VisibilityPolicy
$script:PresencePolicy = $VisibilityPolicy
$script:PresencePolicySource = 'overlay'
$script:SurfaceDefaultPresencePolicy = Get-OverlaySurfaceDefaultPresencePolicy $surfaceRoot
$script:LifecycleState = 'starting'
$script:VisibilityState = 'unknown'
$script:DesiredVisibility = 'unknown'
$script:VisibilityReason = 'not_projected'
$script:ZOrderState = 'topmost'
$script:FocusState = 'inactive'
$script:SurfaceRevision = $null
$script:FocusLeaseUntil = [DateTime]::MinValue
$script:LaunchPreservedForeground = [IntPtr]::Zero
$script:LaunchForegroundRestoreAttempts = 0
$actionRunnerPath = Join-Path $PSScriptRoot 'Invoke-WindowSurfaceOverlayAction.ps1'
$hostStderrPath = Get-OverlayPath 'host.stderr.log'
$script:OverlayWindowTitlePrefix = 'Narada Overlay: '
trap {
    $script:LifecycleState = 'failed'
    ($_ | Out-String) | Set-Content -Path $hostStderrPath -Encoding UTF8
    try { Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle 'failed' -Visibility 'fault' -DesiredVisibility $script:DesiredVisibility -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -Detail $_.Exception.Message } catch {}
    exit 1
}

function Read-JsonFile([string]$path, [object]$fallback) {
    if (-not (Test-Path $path)) { return $fallback }
    try { return Get-Content -Raw -Path $path | ConvertFrom-Json } catch { return $fallback }
}
function Write-JsonFile([string]$path, [object]$value) {
    $value | ConvertTo-Json -Depth 12 | Set-Content -Path $path -Encoding UTF8
}

. (Join-Path $PSScriptRoot 'WindowSurfaceOverlayPosition.ps1')

function Get-Preferences {
    $value = Read-JsonFile $preferencesPath ([pscustomobject]@{ position = $null; opacity = 1.0; layer = 'topmost'; pinned = $true })
    $layer = if ($value.layer -in @('normal', 'topmost')) { [string]$value.layer } elseif ([bool]($value.pinned ?? $true)) { 'topmost' } else { 'normal' }
    [pscustomobject]@{
        position = Read-OverlayPositionPreference $value
        opacity = [double]($value.opacity ?? 1.0)
        layer = $layer
    }
}
function Save-Preferences([object]$currentWindow) {
    $position = $script:PositionPreference
    $monitor = Get-OverlayMonitor
    if ($null -ne $monitor) {
        $dimensions = Get-OverlayWindowDimensions $currentWindow
        $position = Get-NearestOverlayPositionPreference $currentWindow.Left $currentWindow.Top $dimensions.width $dimensions.height $monitor.work_area
    }
    if ($null -eq $position -or $position.kind -ne 'anchor') { $position = New-OverlayPositionPreference }
    $script:PositionPreference = $position
    Write-OverlaySurfaceJsonAtomic $preferencesPath ([ordered]@{
        schema = Get-OverlayPositionPreferencesSchema
        position = [ordered]@{
            anchor = $position.anchor
            inset_x = [double]$position.inset_x
            inset_y = [double]$position.inset_y
        }
        opacity = [double]$currentWindow.Opacity
        layer = if ($currentWindow.Topmost) { 'topmost' } else { 'normal' }
    })
}

function Drag-OverlayAndPersistPosition {
    try { [void]$window.DragMove() } catch {}
    try { Save-Preferences $window } catch {}
}

function Sync-OverlayPresencePolicy {
    $selection = Read-OverlayPresencePolicySelection -StateRoot $StateRoot -FallbackPolicy $script:StartupVisibilityPolicy
    $script:PresencePolicySource = [string]$selection.source
    $script:PresencePolicy = Normalize-OverlayVisibilityPolicy ([string]$selection.policy)
    $script:SurfaceDefaultPresencePolicy = Get-OverlaySurfaceDefaultPresencePolicy $surfaceRoot
    return $selection
}

function Get-OverlayPresencePolicyLabel([string]$Policy) {
    switch (Normalize-OverlayVisibilityPolicy $Policy) {
        'always' { return 'Always visible' }
        'terminal-group' { return 'With terminal group' }
        'hidden' { return 'Hidden' }
    }
}

function Get-OverlayPresenceButtonLabel {
    $actual = switch ($script:VisibilityState) {
        'visible' { 'visible' }
        'hidden' { 'hidden' }
        default { 'transitioning' }
    }
    $source = if ($script:PresencePolicySource -eq 'surface-default') { 'surface default' } else { 'this overlay' }
    return "Presence: $(Get-OverlayPresencePolicyLabel $script:PresencePolicy) ($source; $actual)"
}

function Update-OverlayPresenceButton {
    if ($null -eq $script:PresenceButton) { return }
    $script:PresenceButton.Content = if ($script:VisibilityState -eq 'hidden') { '◌' } else { '◉' }
    $script:PresenceButton.ToolTip = Get-OverlayPresenceButtonLabel
}

function Update-OverlayLayerButton {
    if ($null -eq $script:LayerButton) { return }
    $script:LayerButton.Content = if ($window.Topmost) { '⇧' } else { '↕' }
    $script:LayerButton.ToolTip = if ($window.Topmost) { 'Layer: Above other windows' } else { 'Layer: Normal z-order' }
}

function Set-OverlayPresenceSelection([string]$Selection) {
    if ($Selection -eq 'surface-default') {
        Write-OverlayPresencePolicy -StateRoot $StateRoot -Source 'surface-default'
    } else {
        Write-OverlayPresencePolicy -StateRoot $StateRoot -Source 'overlay' -Policy $Selection
    }
    Sync-OverlayPresencePolicy | Out-Null
    Set-OverlayVisibility
}

function Set-OverlaySurfaceDefault([string]$Policy) {
    Write-OverlaySurfaceDefaultPresencePolicy -SurfaceRoot $surfaceRoot -Policy $Policy | Out-Null
    Sync-OverlayPresencePolicy | Out-Null
    Set-OverlayVisibility
}

function Add-OverlayPresenceMenuChoice([object]$Menu, [string]$Header, [string]$Selection) {
    $item = New-Object Windows.Controls.MenuItem
    $item.Header = $Header
    $item.Add_Click({ Set-OverlayPresenceSelection $Selection }.GetNewClosure())
    [void]$Menu.Items.Add($item)
}

function Add-OverlaySurfaceDefaultMenuChoice([object]$Menu, [string]$Header, [string]$Policy) {
    $item = New-Object Windows.Controls.MenuItem
    $item.Header = $Header
    $item.Add_Click({ Set-OverlaySurfaceDefault $Policy }.GetNewClosure())
    [void]$Menu.Items.Add($item)
}

function New-OverlayPresenceMenu {
    $menu = New-Object Windows.Controls.ContextMenu
    $thisOverlay = New-Object Windows.Controls.MenuItem
    $thisOverlay.Header = 'Presence for this overlay'
    $thisOverlay.IsEnabled = $false
    [void]$menu.Items.Add($thisOverlay)
    Add-OverlayPresenceMenuChoice $menu 'Always visible' 'always'
    Add-OverlayPresenceMenuChoice $menu 'With terminal group' 'terminal-group'
    Add-OverlayPresenceMenuChoice $menu 'Hidden' 'hidden'
    [void]$menu.Items.Add((New-Object Windows.Controls.Separator))
    Add-OverlayPresenceMenuChoice $menu 'Use surface default' 'surface-default'
    $surfaceMenu = New-Object Windows.Controls.MenuItem
    $surfaceMenu.Header = 'Change surface default'
    Add-OverlaySurfaceDefaultMenuChoice $surfaceMenu 'Always visible' 'always'
    Add-OverlaySurfaceDefaultMenuChoice $surfaceMenu 'With terminal group' 'terminal-group'
    Add-OverlaySurfaceDefaultMenuChoice $surfaceMenu 'Hidden' 'hidden'
    [void]$menu.Items.Add($surfaceMenu)
    return $menu
}

function Get-Document {
    Read-JsonFile $documentPath ([pscustomobject]@{ id = $Id; title = $Id; subtitle = $null; rows = @(); actions = @() })
}
function New-Brush([byte]$alpha, [byte]$red, [byte]$green, [byte]$blue) {
    return [Windows.Media.SolidColorBrush]::new([Windows.Media.Color]::FromArgb($alpha, $red, $green, $blue))
}
function New-Text([string]$text, [double]$size = 13, $foreground = $null) {
    $textBlock = [Windows.Controls.TextBlock]::new()
    $textBlock.Text = $text
    $textBlock.FontFamily = [Windows.Media.FontFamily]::new('Consolas')
    $textBlock.FontSize = $size
    $textBlock.Foreground = if ($null -eq $foreground) { New-Brush 255 255 255 255 } else { $foreground }
    $textBlock.VerticalAlignment = [Windows.VerticalAlignment]::Center
    return $textBlock
}
function Get-ToneBrush([string]$tone) {
    switch ($tone) {
        'muted' { return (New-Brush 255 165 168 180) }
        'success' { return (New-Brush 255 145 220 150) }
        'warning' { return (New-Brush 255 255 190 100) }
        'danger' { return (New-Brush 255 255 110 120) }
        'accent' { return (New-Brush 255 244 196 48) }
        default { return (New-Brush 255 255 255 255) }
    }
}
function New-OverlayButton([string]$label, [string]$tip, [string]$tone = 'default', [switch]$icon) {
    $accent = $tone -eq 'accent'
    $button = [Windows.Controls.Button]::new()
    $button.Content = $label
    $button.Width = if ($icon) { 22 } else { [Double]::NaN }
    $button.Height = if ($icon) { 22 } else { [Double]::NaN }
    $button.MinWidth = if ($icon) { 22 } else { 0 }
    $button.Margin = [Windows.Thickness]::new(2, 0, 0, 0)
    $button.Padding = if ($accent) { New-Object Windows.Thickness(8, 3, 8, 3) } else { New-Object Windows.Thickness(0) }
    $button.FontFamily = [Windows.Media.FontFamily]::new('Segoe UI')
    $button.FontSize = if ($icon) { 15 } else { 11 }
    $button.FontWeight = if ($accent) { 'SemiBold' } else { 'Normal' }
    $button.Foreground = if ($accent) { Get-ToneBrush 'accent' } else { New-Brush 190 215 215 225 }
    $button.Background = [Windows.Media.Brushes]::Transparent
    $button.BorderBrush = if ($accent) { Get-ToneBrush 'accent' } else { [Windows.Media.Brushes]::Transparent }
    $button.BorderThickness = if ($accent) { New-Object Windows.Thickness(1) } else { New-Object Windows.Thickness(0) }
    $button.FocusVisualStyle = $null
    $button.ToolTip = $tip
    $button.Cursor = [Windows.Input.Cursors]::Hand

    $template = [Windows.Controls.ControlTemplate]::new([Windows.Controls.Button])
    $templateBorder = [Windows.FrameworkElementFactory]::new([Windows.Controls.Border])
    $templateBorder.SetValue([Windows.Controls.Border]::BackgroundProperty, [Windows.TemplateBindingExtension]::new([Windows.Controls.Button]::BackgroundProperty))
    $templateBorder.SetValue([Windows.Controls.Border]::BorderBrushProperty, [Windows.TemplateBindingExtension]::new([Windows.Controls.Button]::BorderBrushProperty))
    $templateBorder.SetValue([Windows.Controls.Border]::BorderThicknessProperty, [Windows.TemplateBindingExtension]::new([Windows.Controls.Button]::BorderThicknessProperty))
    $templateBorder.SetValue([Windows.Controls.Border]::CornerRadiusProperty, [Windows.CornerRadius]::new(4))
    $content = [Windows.FrameworkElementFactory]::new([Windows.Controls.ContentPresenter])
    $content.SetValue([Windows.Controls.ContentPresenter]::ContentProperty, [Windows.TemplateBindingExtension]::new([Windows.Controls.Button]::ContentProperty))
    $content.SetValue([Windows.Controls.ContentPresenter]::ContentTemplateProperty, [Windows.TemplateBindingExtension]::new([Windows.Controls.Button]::ContentTemplateProperty))
    $content.SetValue([Windows.Controls.ContentPresenter]::HorizontalAlignmentProperty, [Windows.HorizontalAlignment]::Center)
    $content.SetValue([Windows.Controls.ContentPresenter]::VerticalAlignmentProperty, [Windows.VerticalAlignment]::Center)
    $templateBorder.AppendChild($content)
    $template.VisualTree = $templateBorder
    $button.Template = $template
    $button.Add_MouseEnter({
        param($sender, $eventArgs)
        if ($accent) {
            $sender.Background = New-Brush 48 244 196 48
            $sender.Foreground = New-Brush 255 24 24 20
        } else {
            $sender.Background = New-Brush 32 255 255 255
            $sender.Foreground = New-Brush 255 255 255 255
        }
    }.GetNewClosure())
    $button.Add_MouseLeave({
        param($sender, $eventArgs)
        $sender.Background = [Windows.Media.Brushes]::Transparent
        $sender.Foreground = if ($accent) { Get-ToneBrush 'accent' } else { New-Brush 190 215 215 225 }
    }.GetNewClosure())
    return $button
}
function Add-Button([object]$parent, [string]$label, [string]$tip, [scriptblock]$handler, [string]$tone = 'default', [switch]$icon) {
    $button = New-OverlayButton $label $tip -tone $tone -icon:$icon
    $button.Add_Click($handler)
    $parent.Children.Add($button) | Out-Null
    return $button
}
function Set-OverlayOpacity([double]$delta) {
    $opacity = [Math]::Round([double]$window.Opacity + $delta, 1)
    $window.Opacity = [Math]::Max(0.55, [Math]::Min(1.0, $opacity))
    Save-Preferences $window
}
function New-OpacityButton([string]$label, [string]$tip) {
    return New-OverlayButton $label $tip -icon
}
function Get-ActionLabel([object]$action) {
    if ($action.icon) { return [string]$action.icon }
    return [string]$action.label
}
function Start-RestartCommand {
    $spec = Read-JsonFile $restartCommandPath $null
    if ($null -eq $spec -or $null -eq $spec.command) { throw 'window_surface_overlay_restart_command_unavailable' }
    $existing = Read-JsonFile $actionStatePath $null
    if ($existing -and $existing.status -eq 'running') {
        $runnerAlive = $false
        if ($existing.pid) { $runnerAlive = $null -ne (Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue) }
        if ($runnerAlive) { throw 'window_surface_overlay_restart_already_running' }
        $existing.status = 'interrupted'
        $existing.finished_at = [DateTime]::UtcNow.ToString('o')
        $existing.detail = 'The prior restart runner is no longer active.'
        Write-JsonFile $actionStatePath $existing
    }
    if (-not (Test-Path $actionRunnerPath)) { throw 'window_surface_overlay_action_runner_missing' }
    $requestId = [Guid]::NewGuid().ToString('N')
    $shell = Get-Command pwsh, powershell -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $shell) { throw 'powershell_runtime_not_found' }
    $runnerArguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $actionRunnerPath, '-ActionId', 'restart', '-RequestId', $requestId, '-SpecPath', $restartCommandPath, '-StatePath', $actionStatePath)
    Write-JsonFile $actionStatePath ([ordered]@{ schema = 'narada.window_surface_overlay.action_state.v1'; action_id = 'restart'; request_id = $requestId; status = 'running'; started_at = [DateTime]::UtcNow.ToString('o'); pid = $null })
    try {
        Start-Process -WindowStyle Hidden -FilePath $shell.Source -ArgumentList $runnerArguments | Out-Null
    } catch {
        Write-JsonFile $actionStatePath ([ordered]@{ schema = 'narada.window_surface_overlay.action_state.v1'; action_id = 'restart'; request_id = $requestId; status = 'failed'; started_at = [DateTime]::UtcNow.ToString('o'); finished_at = [DateTime]::UtcNow.ToString('o'); pid = $null; detail = $_.Exception.Message })
        throw
    }
}

function Apply-ActionState {
    $state = Read-JsonFile $actionStatePath $null
    if (-not $state) { return }
    $running = $state.status -eq 'running'
    if ($script:RestartButton) { $script:RestartButton.IsEnabled = -not $running }
    if ($running) {
        $subtitleText.Text = 'Restarting console…'
        $subtitleText.Visibility = 'Visible'
        return
    }
    if ($state.status -eq 'failed' -or $state.status -eq 'interrupted') {
        $subtitleText.Text = 'Restart failed: ' + [string]$state.detail
        $subtitleText.Visibility = 'Visible'
        return
    }
    if ($state.status -eq 'succeeded') {
        $finished = [DateTimeOffset]::MinValue
        $parsed = [DateTimeOffset]::TryParse([string]$state.finished_at, [ref]$finished)
        $ageSeconds = if ($parsed) { ([DateTimeOffset]::UtcNow - $finished.ToUniversalTime()).TotalSeconds } else { [double]::PositiveInfinity }
        if ($ageSeconds -ge 0 -and $ageSeconds -le 5) {
            $subtitleText.Text = 'Console restarted'
            $subtitleText.Visibility = 'Visible'
            return
        }
    }
    $subtitleText.Text = [string]$script:DocumentSubtitle
    $subtitleText.Visibility = if ([string]::IsNullOrWhiteSpace($subtitleText.Text)) { 'Collapsed' } else { 'Visible' }
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class NaradaWindowSurfaceOverlayNative {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct MONITORINFOEX {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    public sealed class MonitorSnapshot {
        public string Device;
        public int WorkLeft;
        public int WorkTop;
        public int WorkRight;
        public int WorkBottom;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public static IntPtr FindTopLevelWindowForProcess(uint targetProcessId) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            if (processId == targetProcessId && IsWindowVisible(hWnd)) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static bool ForceForegroundWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        uint ignoredProcessId;
        var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignoredProcessId);
        var targetThread = GetWindowThreadProcessId(hWnd, out ignoredProcessId);
        var currentThread = GetCurrentThreadId();
        var attachedForeground = foregroundThread != 0 && foregroundThread != currentThread
            && AttachThreadInput(foregroundThread, currentThread, true);
        var attachedTarget = targetThread != 0 && targetThread != currentThread
            && AttachThreadInput(targetThread, currentThread, true);
        try {
            ShowWindow(hWnd, 9);
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
            return GetForegroundWindow() == hWnd;
        } finally {
            if (attachedTarget) AttachThreadInput(targetThread, currentThread, false);
            if (attachedForeground) AttachThreadInput(foregroundThread, currentThread, false);
        }
    }

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromPoint(POINT point, uint flags);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT point);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX monitorInfo);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hMonitor, int dpiType, out uint dpiX, out uint dpiY);

    public static MonitorSnapshot ReadMonitor(IntPtr hMonitor) {
        if (hMonitor == IntPtr.Zero) return null;
        var native = new MONITORINFOEX();
        native.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
        if (!GetMonitorInfo(hMonitor, ref native)) return null;
        return new MonitorSnapshot {
            Device = native.szDevice,
            WorkLeft = native.rcWork.Left,
            WorkTop = native.rcWork.Top,
            WorkRight = native.rcWork.Right,
            WorkBottom = native.rcWork.Bottom,
        };
    }

    public static uint GetEffectiveDpi(IntPtr hMonitor, IntPtr hWnd) {
        try {
            uint dpiX;
            uint dpiY;
            if (GetDpiForMonitor(hMonitor, 0, out dpiX, out dpiY) == 0 && dpiX > 0) return dpiX;
        } catch {
        }
        try {
            var dpi = GetDpiForWindow(hWnd);
            if (dpi > 0) return dpi;
        } catch {
        }
        return 96;
    }
}
'@

function Get-OverlayWindowHandle {
    if ($null -eq $window) { return [IntPtr]::Zero }
    try { return [System.Windows.Interop.WindowInteropHelper]::new($window).Handle } catch { return [IntPtr]::Zero }
}

function Restore-LaunchForegroundIfNeeded {
    if ($script:LaunchPreservedForeground -eq [IntPtr]::Zero) { return }
    if (Test-Path -LiteralPath $focusPath) {
        $script:LaunchPreservedForeground = [IntPtr]::Zero
        return
    }
    $windowHandle = Get-OverlayWindowHandle
    $currentForeground = [NaradaWindowSurfaceOverlayNative]::GetForegroundWindow()
    if ($windowHandle -eq [IntPtr]::Zero -or $currentForeground -ne $windowHandle) {
        # The operator has another foreground surface, or WPF has not created
        # the HWND yet. Do not steal focus from that surface.
        if ($windowHandle -eq [IntPtr]::Zero -or $currentForeground -ne [IntPtr]::Zero) {
            $script:LaunchPreservedForeground = [IntPtr]::Zero
        }
        return
    }
    [void][NaradaWindowSurfaceOverlayNative]::ForceForegroundWindow($script:LaunchPreservedForeground)
    $script:LaunchForegroundRestoreAttempts++
    if ([NaradaWindowSurfaceOverlayNative]::GetForegroundWindow() -eq $script:LaunchPreservedForeground -or $script:LaunchForegroundRestoreAttempts -ge 8) {
        $script:LaunchPreservedForeground = [IntPtr]::Zero
    }
}

function Focus-Overlay {
    if ($null -eq $window) { return }
    $windowHandle = Get-OverlayWindowHandle
    if ($windowHandle -eq [IntPtr]::Zero) { return }
    Set-OverlayFocusState 'requested'
    Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle $script:LifecycleState -Visibility $script:VisibilityState -DesiredVisibility $script:DesiredVisibility -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision
    $window.Visibility = [Windows.Visibility]::Visible
    [void][NaradaWindowSurfaceOverlayNative]::ShowWindow($windowHandle, 9)
    [void][NaradaWindowSurfaceOverlayNative]::BringWindowToTop($windowHandle)
    [void]$window.Activate()
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        [void][NaradaWindowSurfaceOverlayNative]::ForceForegroundWindow($windowHandle)
        if ([NaradaWindowSurfaceOverlayNative]::GetForegroundWindow() -eq $windowHandle) { break }
        Start-Sleep -Milliseconds 50
    }
    $focusResult = if ([NaradaWindowSurfaceOverlayNative]::GetForegroundWindow() -eq $windowHandle) { 'focused' } else { 'failed' }
    Set-OverlayFocusState $focusResult
    if ($script:FocusState -eq 'focused') {
        Set-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id -ProcessId $PID
        # Windows can return focus to the launching terminal after a background
        # process changes the foreground queue. Keep the explicit request
        # stable for one bounded transition window; a later request replaces it.
        $script:FocusLeaseUntil = [DateTime]::UtcNow.AddSeconds(5)
    } else {
        Clear-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id
    }
    Set-OverlayVisibility
}

function Get-OverlayWindowDimensions([object]$currentWindow) {
    $width = [double]$currentWindow.ActualWidth
    $height = [double]$currentWindow.ActualHeight
    if ($width -le 0) { $width = [double]$currentWindow.Width }
    if ($height -le 0) { $height = [double]$currentWindow.Height }
    [pscustomobject]@{
        width = [Math]::Max(1, $width)
        height = [Math]::Max(1, $height)
    }
}

function Get-OverlayMonitor([switch]$UseCursor) {
    $windowHandle = Get-OverlayWindowHandle
    $monitorHandle = [IntPtr]::Zero
    $point = New-Object NaradaWindowSurfaceOverlayNative+POINT
    if ($UseCursor -and [NaradaWindowSurfaceOverlayNative]::GetCursorPos([ref]$point)) {
        $monitorHandle = [NaradaWindowSurfaceOverlayNative]::MonitorFromPoint($point, 2)
    }
    if ($monitorHandle -eq [IntPtr]::Zero -and $windowHandle -ne [IntPtr]::Zero) {
        $monitorHandle = [NaradaWindowSurfaceOverlayNative]::MonitorFromWindow($windowHandle, 2)
    }
    if ($monitorHandle -eq [IntPtr]::Zero -and [NaradaWindowSurfaceOverlayNative]::GetCursorPos([ref]$point)) {
        $monitorHandle = [NaradaWindowSurfaceOverlayNative]::MonitorFromPoint($point, 2)
    }
    if ($monitorHandle -eq [IntPtr]::Zero) { return $null }
    $native = [NaradaWindowSurfaceOverlayNative]::ReadMonitor($monitorHandle)
    if ($null -eq $native) { return $null }
    $dpi = [NaradaWindowSurfaceOverlayNative]::GetEffectiveDpi($monitorHandle, $windowHandle)
    $scale = [Math]::Max(1, ([double]$dpi / 96.0))
    [pscustomobject]@{
        device = [string]$native.Device
        scale = $scale
        work_area = [pscustomobject]@{
            left = [double]$native.WorkLeft / $scale
            top = [double]$native.WorkTop / $scale
            right = [double]$native.WorkRight / $scale
            bottom = [double]$native.WorkBottom / $scale
        }
    }
}

function Set-OverlayVisibility {
    if ($null -eq $window) { return }
    try {
        Sync-OverlayPresencePolicy | Out-Null
        $snapshot = Update-OverlaySurfaceProjection -SurfaceRoot $surfaceRoot -CurrentId $Id -CurrentPid $PID -CurrentPolicy $script:PresencePolicy -CurrentLifecycle $script:LifecycleState -CurrentVisibility $script:VisibilityState -CurrentZOrder $script:ZOrderState -CurrentFocus $script:FocusState
        $decision = Get-OverlaySurfaceDecision -Snapshot $snapshot -Id $Id -Policy $script:PresencePolicy
        $script:SurfaceRevision = [int]$snapshot.revision
        $script:DesiredVisibility = [string]$decision.desired_visibility
        $script:VisibilityReason = [string]$decision.reason
        $focusOwner = Read-OverlayFocusOwner $surfaceRoot
        if ($focusOwner -and $focusOwner.id -ne $Id -and $script:FocusState -eq 'focused') { Set-OverlayFocusState 'inactive' }
        if ($focusOwner -and $focusOwner.id -eq $Id -and [DateTime]::UtcNow -lt $script:FocusLeaseUntil) {
            $windowHandle = Get-OverlayWindowHandle
            if ($windowHandle -ne [IntPtr]::Zero -and [NaradaWindowSurfaceOverlayNative]::GetForegroundWindow() -ne $windowHandle) {
                [void][NaradaWindowSurfaceOverlayNative]::ForceForegroundWindow($windowHandle)
            }
        }
        $desired = if ($script:DesiredVisibility -eq 'visible') { [Windows.Visibility]::Visible } else { [Windows.Visibility]::Hidden }
        if ($script:VisibilityState -eq 'unknown') {
            $initialVisibilityTransition = if ($desired -eq [Windows.Visibility]::Visible) { 'showing' } else { 'hiding' }
            Set-OverlayVisibilityState $initialVisibilityTransition
        }
        if ($window.Visibility -ne $desired) {
            $visibilityTransition = if ($desired -eq [Windows.Visibility]::Visible) { 'showing' } else { 'hiding' }
            Set-OverlayVisibilityState $visibilityTransition
            Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle $script:LifecycleState -Visibility $script:VisibilityState -DesiredVisibility $script:DesiredVisibility -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision
            $window.Visibility = $desired
        }
        $appliedVisibility = if ($window.Visibility -eq [Windows.Visibility]::Visible) { 'visible' } else { 'hidden' }
        Set-OverlayVisibilityState $appliedVisibility
        Update-OverlayPresenceButton
        Restore-LaunchForegroundIfNeeded
        Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle $script:LifecycleState -Visibility $script:VisibilityState -DesiredVisibility $script:DesiredVisibility -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision
    } catch {
        $script:VisibilityState = 'fault'
        $script:VisibilityReason = 'visibility_fault'
        try { Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle $script:LifecycleState -Visibility 'fault' -DesiredVisibility $script:DesiredVisibility -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision -Detail $_.Exception.Message } catch {}
    }
}

$preferences = Get-Preferences
$script:PositionPreference = $preferences.position
$script:PositionHydrated = $false
$window = New-Object Windows.Window
$window.Title = $script:OverlayWindowTitlePrefix + [string]$Id
$window.Width = 360
$window.MinWidth = 280
$window.SizeToContent = 'Height'
$window.WindowStartupLocation = 'Manual'
$window.WindowStyle = 'None'
$window.ResizeMode = 'NoResize'
$window.AllowsTransparency = $true
$window.Background = [Windows.Media.Brushes]::Transparent
$window.ShowInTaskbar = $false
$window.Topmost = $preferences.layer -eq 'topmost'
$script:ZOrderState = if ($window.Topmost) { 'topmost' } else { 'normal' }
$window.Opacity = [Math]::Min([Math]::Max($preferences.opacity, 0.55), 1.0)
$window.ShowActivated = $false
$window.Padding = New-Object Windows.Thickness(0)

$border = New-Object Windows.Controls.Border
$border.CornerRadius = New-Object Windows.CornerRadius(10)
$border.Background = New-Brush 255 18 18 25
$border.BorderBrush = New-Brush 150 120 125 145
$border.BorderThickness = New-Object Windows.Thickness(1)
$root = New-Object Windows.Controls.Grid
$root.Margin = New-Object Windows.Thickness(12, 10, 12, 8)
$border.Child = $root
$window.Content = $border
0..2 | ForEach-Object { $root.RowDefinitions.Add((New-Object Windows.Controls.RowDefinition)) | Out-Null }

$header = New-Object Windows.Controls.Grid
$header.Height = 36
$header.Cursor = [Windows.Input.Cursors]::SizeAll
[void]$header.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition))
$header.ColumnDefinitions[0].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Star)
[void]$header.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition))
$header.ColumnDefinitions[1].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Auto)
[Windows.Controls.Grid]::SetRow($header, 0)
$root.Children.Add($header) | Out-Null
$titlePanel = New-Object Windows.Controls.StackPanel
$titlePanel.Orientation = 'Vertical'
$titlePanel.HorizontalAlignment = 'Left'
$titlePanel.Cursor = [Windows.Input.Cursors]::SizeAll
[Windows.Controls.Grid]::SetColumn($titlePanel, 0)
$header.Children.Add($titlePanel) | Out-Null
$titleText = New-Text '' 14
$titleText.FontFamily = [Windows.Media.FontFamily]::new('Segoe UI')
$titleText.FontWeight = 'SemiBold'
$titleText.Margin = New-Object Windows.Thickness(0, 0, 28, 0)
$titleText.Cursor = [Windows.Input.Cursors]::SizeAll
$titlePanel.Children.Add($titleText) | Out-Null
$subtitleText = New-Text '' 10 (New-Brush 255 165 168 180)
$subtitleText.Cursor = [Windows.Input.Cursors]::SizeAll
$titlePanel.Children.Add($subtitleText) | Out-Null
$headerActions = New-Object Windows.Controls.StackPanel
$headerActions.Orientation = 'Horizontal'
$headerActions.HorizontalAlignment = 'Right'
$headerActions.VerticalAlignment = 'Top'
[Windows.Controls.Grid]::SetColumn($headerActions, 1)
$header.Children.Add($headerActions) | Out-Null
$script:PresenceButton = Add-Button $headerActions '◉' 'Presence' { $script:PresenceButton.ContextMenu.IsOpen = $true } -icon
$script:PresenceButton.ContextMenu = New-OverlayPresenceMenu
$script:PresenceButton.FontFamily = [Windows.Media.FontFamily]::new('Segoe UI Symbol')
$script:PresenceButton.FontSize = 12
$script:PresenceButton.Width = 20
$script:PresenceButton.Height = 20
$script:PresenceButton.MinWidth = 20
$script:LayerButton = Add-Button $headerActions '⇧' 'Layer: Above other windows' { $window.Topmost = -not $window.Topmost; $script:ZOrderState = if ($window.Topmost) { 'topmost' } else { 'normal' }; Update-OverlayLayerButton; Set-OverlayVisibility; Save-Preferences $window } -icon
$script:LayerButton.FontFamily = [Windows.Media.FontFamily]::new('Segoe UI Symbol')
$script:LayerButton.FontSize = 12
$script:LayerButton.Width = 20
$script:LayerButton.Height = 20
$script:LayerButton.MinWidth = 20
$script:PresenceButton.ToolTip = Get-OverlayPresenceButtonLabel
$script:LayerButton.ToolTip = if ($window.Topmost) { 'Layer: Above other windows' } else { 'Layer: Normal z-order' }
$closeButton = Add-Button $headerActions '×' 'Close overlay' { $window.Close() } -icon
$closeButton.Foreground = New-Brush 170 215 215 225
$closeButton.Opacity = 0.7
$titlePanel.Add_MouseLeftButtonDown({
    if ($_.ChangedButton -eq [Windows.Input.MouseButton]::Left) {
        Drag-OverlayAndPersistPosition
        $_.Handled = $true
    }
})

$body = New-Object Windows.Controls.StackPanel
$body.Margin = New-Object Windows.Thickness(0, 12, 0, 8)
[Windows.Controls.Grid]::SetRow($body, 1)
$root.Children.Add($body) | Out-Null
$footer = New-Object Windows.Controls.WrapPanel
$footer.HorizontalAlignment = 'Right'
[Windows.Controls.Grid]::SetRow($footer, 2)
$root.Children.Add($footer) | Out-Null
$footerGrid = New-Object Windows.Controls.Grid
$footerGrid.HorizontalAlignment = 'Stretch'
$footerGrid.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
$footerGrid.ColumnDefinitions[0].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Star)
$footerGrid.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
$footerGrid.ColumnDefinitions[1].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Auto)
[Windows.Controls.Grid]::SetRow($footerGrid, 2)
$root.Children.Remove($footer) | Out-Null
$root.Children.Add($footerGrid) | Out-Null
$updatedText = New-Text '' 10 (New-Brush 255 175 175 185)
$footerGrid.Children.Add($updatedText) | Out-Null
$footer = New-Object Windows.Controls.WrapPanel
$footer.HorizontalAlignment = 'Right'
[Windows.Controls.Grid]::SetColumn($footer, 1)
$footerGrid.Children.Add($footer) | Out-Null
Add-Button $footer '−' 'Decrease opacity' { Set-OverlayOpacity -0.1 } -icon | Out-Null
Add-Button $footer '+' 'Increase opacity' { Set-OverlayOpacity 0.1 } -icon | Out-Null
$documentActions = New-Object Windows.Controls.WrapPanel
$documentActions.Orientation = 'Horizontal'
$documentActions.HorizontalAlignment = 'Right'
$footer.Children.Add($documentActions) | Out-Null
$border.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq [Windows.Input.MouseButtonState]::Pressed) { Drag-OverlayAndPersistPosition } })

function Render-Document([object]$document) {
    $titleText.Text = [string]($document.title ?? $Id)
    $titleText.Foreground = Get-ToneBrush ([string]($document.title_tone ?? 'default'))
    $script:DocumentSubtitle = [string]($document.subtitle ?? '')
    $subtitleText.Text = $script:DocumentSubtitle
    $subtitleText.Visibility = if ([string]::IsNullOrWhiteSpace($subtitleText.Text)) { 'Collapsed' } else { 'Visible' }
    $body.Children.Clear()
    foreach ($row in @($document.rows)) {
        $line = New-Object Windows.Controls.Grid
        $line.Margin = New-Object Windows.Thickness(0, 2, 0, 2)
        $line.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
        $line.ColumnDefinitions[0].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Auto)
        $line.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
        $line.ColumnDefinitions[1].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Star)
        $label = New-Text ([string]$row.label) 11 (New-Brush 255 165 168 180)
        $label.Margin = New-Object Windows.Thickness(0, 2, 12, 2)
        $label.HorizontalAlignment = 'Left'
        $value = New-Text ([string]$row.value) 13 (Get-ToneBrush ([string]$row.tone))
        $value.TextWrapping = 'Wrap'
        $value.TextTrimming = 'None'
        $value.HorizontalAlignment = 'Stretch'
        $value.TextAlignment = 'Right'
        $value.FontWeight = 'SemiBold'
        $value.Margin = New-Object Windows.Thickness(0, 2, 0, 2)
        $rowTooltip = if ($row.tooltip) { [string]$row.tooltip } else { $null }
        if ($rowTooltip) { $value.ToolTip = $rowTooltip }
        $rowKind = [string]($row.kind ?? '')
        $rowTarget = [string]($row.target ?? '')
        if ($rowKind -eq 'open_url' -and $rowTarget -match '^https?://') {
            $value.Foreground = Get-ToneBrush ([string]($row.tone ?? 'default'))
            $value.Cursor = [Windows.Input.Cursors]::Hand
            $value.ToolTip = if ($rowTooltip) { $rowTooltip } else { 'Open ' + $rowTarget }
            $value.Add_MouseLeftButtonDown({
                param($sender, $eventArgs)
                $eventArgs.Handled = $true
                Start-Process -FilePath $rowTarget
            }.GetNewClosure())
        }
        $line.Children.Add($label) | Out-Null
        [Windows.Controls.Grid]::SetColumn($value, 1)
        $line.Children.Add($value) | Out-Null
        $body.Children.Add($line) | Out-Null
    }
    $updated = try { ([DateTime]::Parse([string]$document.updated_at)).ToLocalTime().ToString('HH:mm:ss') } catch { (Get-Date).ToString('HH:mm:ss') }
    $updatedText.Text = "updated $updated"
    $documentActions.Children.Clear()
    foreach ($action in @($document.actions)) {
        $actionKind = [string]$action.kind
        $actionTarget = [string]$action.target
        $handler = {
            if ($actionKind -eq 'open_url' -and $actionTarget -match '^https?://') { Start-Process -FilePath $actionTarget }
            elseif ($actionKind -eq 'refresh') { Set-Content -Path $refreshPath -Value ([DateTime]::UtcNow.ToString('o')) }
            elseif ($actionKind -eq 'restart') {
                try {
                    Start-RestartCommand
                    $subtitleText.Text = 'Restarting console…'
                } catch {
                    $subtitleText.Text = 'Restart unavailable: ' + $_.Exception.Message
                }
            }
            elseif ($actionKind -eq 'close') { $window.Close() }
        }.GetNewClosure()
        $actionLabel = Get-ActionLabel $action
        $actionTip = if ($action.tooltip) { [string]$action.tooltip } else { [string]$action.label }
        $actionTone = if ($action.tone) { [string]$action.tone } else { 'default' }
        $actionButton = if ($action.icon) {
            Add-Button $documentActions $actionLabel $actionTip $handler -tone $actionTone -icon
        } else {
            Add-Button $documentActions $actionLabel $actionTip $handler -tone $actionTone
        }
        if (-not $action.icon -and $actionTone -ne 'accent') { $actionButton.Padding = New-Object Windows.Thickness(6, 0, 6, 0) }
        if ($actionKind -eq 'restart') { $script:RestartButton = $actionButton }
    }
    Apply-ActionState
}

function Restore-OverlayPosition([switch]$UseCursor) {
    $monitor = Get-OverlayMonitor -UseCursor:$UseCursor
    if ($null -eq $monitor) { return }
    $dimensions = Get-OverlayWindowDimensions $window
    $position = $script:PositionPreference
    if ($null -eq $position) { $position = New-OverlayPositionPreference }
    if ($position.kind -eq 'absolute') {
        $position = Get-NearestOverlayPositionPreference $position.left $position.top $dimensions.width $dimensions.height $monitor.work_area
    }
    if ($position.kind -ne 'anchor') { $position = New-OverlayPositionPreference }
    $resolved = Resolve-OverlayPosition $position $dimensions.width $dimensions.height $monitor.work_area
    $window.Left = $resolved.left
    $window.Top = $resolved.top
    $script:PositionPreference = $position
}

$window.Add_Closed({
    Set-OverlayLifecycleState 'stopping'
    try { Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle 'stopping' -Visibility 'hiding' -DesiredVisibility 'hidden' -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision } catch {}
    try { Save-Preferences $window } catch {}
    Set-OverlayLifecycleState 'stopped'
    $script:VisibilityState = 'hidden'
    Clear-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id
    try { Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle 'stopped' -Visibility 'hidden' -DesiredVisibility 'hidden' -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus 'inactive' -ProcessId $null -SurfaceRevision $script:SurfaceRevision } catch {}
    try { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } catch {}
})
$window.Add_LocationChanged({
    if ($script:PositionHydrated) {
        try {
            $monitor = Get-OverlayMonitor
            if ($null -ne $monitor) {
                $dimensions = Get-OverlayWindowDimensions $window
                $script:PositionPreference = Get-NearestOverlayPositionPreference $window.Left $window.Top $dimensions.width $dimensions.height $monitor.work_area
            }
        } catch {}
    }
})
$window.Add_ContentRendered({
    Render-Document (Get-Document)
    $window.UpdateLayout()
    Restore-OverlayPosition -UseCursor
    Save-Preferences $window
    $script:PositionHydrated = $true
    Set-OverlayLifecycleState 'running'
    Set-OverlayVisibility
})
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds([Math]::Max(1, $RefreshSeconds))
$script:lastDocumentStamp = 0L
$script:lastRefreshStamp = 0L
$focusItem = Get-Item $focusPath -ErrorAction SilentlyContinue
$script:lastFocusStamp = if ($focusItem) { $focusItem.LastWriteTimeUtc.Ticks } else { 0L }
$timer.Add_Tick({
    $documentItem = Get-Item $documentPath -ErrorAction SilentlyContinue
    $refreshItem = Get-Item $refreshPath -ErrorAction SilentlyContinue
    $focusItem = Get-Item $focusPath -ErrorAction SilentlyContinue
    $documentStamp = if ($documentItem) { $documentItem.LastWriteTimeUtc.Ticks } else { 0L }
    $refreshStamp = if ($refreshItem) { $refreshItem.LastWriteTimeUtc.Ticks } else { 0L }
    $focusStamp = if ($focusItem) { $focusItem.LastWriteTimeUtc.Ticks } else { 0L }
    if ($focusItem -and $focusStamp -ne $script:lastFocusStamp) {
        try {
            Remove-Item -LiteralPath $focusPath -Force -ErrorAction Stop
            $script:lastFocusStamp = 0L
            Focus-Overlay
        } catch {
            $script:lastFocusStamp = $focusStamp
        }
    }
    if ($documentStamp -ne $script:lastDocumentStamp -or $refreshStamp -ne $script:lastRefreshStamp) {
        $script:lastDocumentStamp = $documentStamp
        $script:lastRefreshStamp = $refreshStamp
        Render-Document (Get-Document)
        $window.UpdateLayout()
        if ($script:PositionHydrated) { Restore-OverlayPosition }
    }
})
$timer.Start()
$visibilityTimer = New-Object Windows.Threading.DispatcherTimer
$visibilityTimer.Interval = [TimeSpan]::FromMilliseconds(250)
$visibilityTimer.Add_Tick({ Set-OverlayVisibility })
$visibilityTimer.Start()
$actionTimer = New-Object Windows.Threading.DispatcherTimer
$actionTimer.Interval = [TimeSpan]::FromMilliseconds(250)
$actionTimer.Add_Tick({ Apply-ActionState })
$actionTimer.Start()

Set-Content -Path $pidPath -Value ([string]$PID)
Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle 'starting' -Visibility 'unknown' -DesiredVisibility 'unknown' -VisibilityReason 'not_projected' -ZOrder $script:ZOrderState -Focus $script:FocusState -ProcessId $PID -SurfaceRevision $script:SurfaceRevision
$application = New-Object Windows.Application
try {
    # Explicitly show the borderless, non-taskbar window before entering the
    # dispatcher loop. Application.Run(Window) is not reliable for this
    # configuration when the host is launched as a hidden PowerShell process.
    $surfaceSnapshot = Read-OverlaySurfaceJson (Join-Path $surfaceRoot 'surface.snapshot.json') $null
    $focusOwner = Read-OverlayFocusOwner $surfaceRoot
    # The actual foreground window is authoritative. A persisted focus owner is
    # only a fallback for the short interval in which Windows reports no HWND.
    $previousForegroundWindow = [NaradaWindowSurfaceOverlayNative]::GetForegroundWindow()
    if ($previousForegroundWindow -eq [IntPtr]::Zero -and $surfaceSnapshot) {
        $focusedMember = @($surfaceSnapshot.members | Where-Object { $_.id -ne $Id -and $_.focus -eq 'focused' -and $_.pid }) | Select-Object -First 1
        if ($focusedMember) {
            $focusedPid = 0
            if ([int]::TryParse([string]$focusedMember.pid, [ref]$focusedPid) -and $focusedPid -gt 0) {
                $previousForegroundWindow = [NaradaWindowSurfaceOverlayNative]::FindTopLevelWindowForProcess([uint32]$focusedPid)
            }
        }
    }
    if ($focusOwner) {
        $focusOwnerPid = 0
        if ($previousForegroundWindow -eq [IntPtr]::Zero -and [int]::TryParse([string]$focusOwner.pid, [ref]$focusOwnerPid) -and $focusOwnerPid -gt 0) {
            $previousForegroundWindow = [NaradaWindowSurfaceOverlayNative]::FindTopLevelWindowForProcess([uint32]$focusOwnerPid)
        }
    }
    $script:LaunchPreservedForeground = $previousForegroundWindow
    $window.Show()
    [void]$application.Run()
} finally {
    $timer.Stop()
    $visibilityTimer.Stop()
    $actionTimer.Stop()
    if ($script:LifecycleState -in @('starting', 'running')) { Set-OverlayLifecycleState 'stopping' }
    if ($script:LifecycleState -eq 'stopping') { Set-OverlayLifecycleState 'stopped' }
    try { Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $script:PresencePolicy -Lifecycle 'stopped' -Visibility 'hidden' -DesiredVisibility 'hidden' -VisibilityReason $script:VisibilityReason -ZOrder $script:ZOrderState -Focus 'inactive' -ProcessId $null -SurfaceRevision $script:SurfaceRevision } catch {}
    try { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } catch {}
}
