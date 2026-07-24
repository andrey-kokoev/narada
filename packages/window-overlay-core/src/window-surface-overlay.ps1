param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [int]$RefreshSeconds = 2,
    [ValidateSet('always', 'windows-terminal')][string]$VisibilityPolicy = 'windows-terminal',
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
$restartCommandPath = Get-OverlayPath 'restart.command.json'

function Read-JsonFile([string]$path, [object]$fallback) {
    if (-not (Test-Path $path)) { return $fallback }
    try { return Get-Content -Raw -Path $path | ConvertFrom-Json } catch { return $fallback }
}
function Write-JsonFile([string]$path, [object]$value) {
    $value | ConvertTo-Json -Depth 12 | Set-Content -Path $path -Encoding UTF8
}
function Get-Preferences {
    $value = Read-JsonFile $preferencesPath ([pscustomobject]@{ left = $null; top = $null; opacity = 1.0; pinned = $true })
    [pscustomobject]@{
        left = $value.left
        top = $value.top
        opacity = [double]($value.opacity ?? 1.0)
        pinned = [bool]($value.pinned ?? $true)
    }
}
function Save-Preferences([object]$currentWindow) {
    Write-JsonFile $preferencesPath ([pscustomobject]@{
        left = [double]$currentWindow.Left
        top = [double]$currentWindow.Top
        opacity = [double]$currentWindow.Opacity
        pinned = [bool]$currentWindow.Topmost
    })
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
function Update-PinButton {
    if ($null -eq $script:PinButton) { return }
    $script:PinButton.Content = if ($window.Topmost) { '◎' } else { '📌' }
    $script:PinButton.ToolTip = if ($window.Topmost) { 'Unpin overlay (show everywhere)' } else { 'Pin overlay to Windows Terminal' }
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
    $command = @($spec.command) | ForEach-Object { [string]$_ }
    if ($command.Count -lt 1 -or [string]::IsNullOrWhiteSpace($command[0])) {
        throw 'window_surface_overlay_restart_command_invalid'
    }
    $arguments = @()
    if ($command.Count -gt 1) { $arguments = @($command | Select-Object -Skip 1) }
    $startParameters = @{
        FilePath = $command[0]
        WindowStyle = 'Hidden'
    }
    if ($arguments.Count -gt 0) { $startParameters.ArgumentList = $arguments }
    if ($spec.working_directory) { $startParameters.WorkingDirectory = [string]$spec.working_directory }
    Start-Process @startParameters | Out-Null
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class NaradaWindowSurfaceOverlayNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

function Test-WindowsTerminalActive {
    $foregroundWindow = [NaradaWindowSurfaceOverlayNative]::GetForegroundWindow()
    if ($foregroundWindow -eq [IntPtr]::Zero) { return $false }

    [uint32]$processId = 0
    [void][NaradaWindowSurfaceOverlayNative]::GetWindowThreadProcessId($foregroundWindow, [ref]$processId)
    if ($processId -eq 0) { return $false }

    try {
        $process = Get-Process -Id ([int]$processId) -ErrorAction Stop
        return $process.ProcessName -in @('WindowsTerminal', 'WindowsTerminalPreview')
    } catch {
        return $false
    }
}

function Set-OverlayVisibility {
    if ($null -eq $window) { return }
    # Keep the overlay visible while it owns focus. Without this clause, clicking or
    # dragging a pinned overlay makes the overlay itself the foreground window,
    # which fails the Windows Terminal-only policy and hides the window mid-action.
    $visible = $VisibilityPolicy -eq 'always' -or [bool]$window.IsActive -or -not [bool]$window.Topmost -or (Test-WindowsTerminalActive)
    $desired = if ($visible) { [Windows.Visibility]::Visible } else { [Windows.Visibility]::Hidden }
    if ($window.Visibility -ne $desired) { $window.Visibility = $desired }
}

$preferences = Get-Preferences
$window = New-Object Windows.Window
$window.Title = [string]$Id
$window.Width = 360
$window.MinWidth = 280
$window.SizeToContent = 'Height'
$window.WindowStartupLocation = 'Manual'
$window.WindowStyle = 'None'
$window.ResizeMode = 'NoResize'
$window.AllowsTransparency = $true
$window.Background = [Windows.Media.Brushes]::Transparent
$window.ShowInTaskbar = $false
$window.Topmost = $preferences.pinned
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
[Windows.Controls.Grid]::SetColumn($headerActions, 1)
$header.Children.Add($headerActions) | Out-Null
$script:PinButton = Add-Button $headerActions '📌' 'Pin overlay to Windows Terminal' { $window.Topmost = -not $window.Topmost; Update-PinButton; Set-OverlayVisibility; Save-Preferences $window } -icon
$script:PinButton.FontFamily = [Windows.Media.FontFamily]::new('Segoe UI Symbol')
$script:PinButton.FontSize = 12
$script:PinButton.Width = 20
$script:PinButton.Height = 20
$script:PinButton.MinWidth = 20
$closeButton = Add-Button $headerActions '×' 'Close overlay' { $window.Close() } -icon
$closeButton.Foreground = New-Brush 170 215 215 225
$closeButton.Opacity = 0.7
$titlePanel.Add_MouseLeftButtonDown({
    if ($_.ChangedButton -eq [Windows.Input.MouseButton]::Left) {
        try { [void]$window.DragMove() } catch {}
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
$border.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq [Windows.Input.MouseButtonState]::Pressed) { $window.DragMove() } })

function Render-Document([object]$document) {
    $titleText.Text = [string]($document.title ?? $Id)
    $titleText.Foreground = Get-ToneBrush ([string]($document.title_tone ?? 'default'))
    $subtitleText.Text = [string]($document.subtitle ?? '')
    $subtitleText.Visibility = if ([string]::IsNullOrWhiteSpace($subtitleText.Text)) { 'Collapsed' } else { 'Visible' }
    $body.Children.Clear()
    foreach ($row in @($document.rows)) {
        $line = New-Object Windows.Controls.Grid
        $line.Margin = New-Object Windows.Thickness(0, 2, 0, 2)
        $line.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
        $line.ColumnDefinitions[0].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Star)
        $line.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition)) | Out-Null
        $line.ColumnDefinitions[1].Width = New-Object Windows.GridLength(1, [Windows.GridUnitType]::Auto)
        $label = New-Text ([string]$row.label) 11 (New-Brush 255 165 168 180)
        $label.Margin = New-Object Windows.Thickness(0, 2, 12, 2)
        $value = New-Text ([string]$row.value) 13 (Get-ToneBrush ([string]$row.tone))
        $value.TextWrapping = 'Wrap'
        $value.TextAlignment = 'Right'
        $value.FontWeight = 'SemiBold'
        $value.Margin = New-Object Windows.Thickness(0, 2, 0, 2)
        $rowKind = [string]($row.kind ?? '')
        $rowTarget = [string]($row.target ?? '')
        if ($rowKind -eq 'open_url' -and $rowTarget -match '^https?://') {
            $value.Foreground = Get-ToneBrush ([string]($row.tone ?? 'default'))
            $value.Cursor = [Windows.Input.Cursors]::Hand
            $value.ToolTip = 'Open ' + $rowTarget
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
                    $subtitleText.Text = 'Restart requested…'
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
    }
}

$window.Add_Closed({
    try { Save-Preferences $window } catch {}
    try { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } catch {}
})
$window.Add_ContentRendered({
    if ($preferences.left -ne $null -and $preferences.top -ne $null) {
        $window.Left = [double]$preferences.left
        $window.Top = [double]$preferences.top
    }
    Set-OverlayVisibility
    Render-Document (Get-Document)
})
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds([Math]::Max(1, $RefreshSeconds))
$lastDocumentStamp = 0L
$lastRefreshStamp = 0L
$timer.Add_Tick({
    $documentItem = Get-Item $documentPath -ErrorAction SilentlyContinue
    $refreshItem = Get-Item $refreshPath -ErrorAction SilentlyContinue
    $documentStamp = if ($documentItem) { $documentItem.LastWriteTimeUtc.Ticks } else { 0L }
    $refreshStamp = if ($refreshItem) { $refreshItem.LastWriteTimeUtc.Ticks } else { 0L }
    if ($documentStamp -ne $lastDocumentStamp -or $refreshStamp -ne $lastRefreshStamp) {
        $lastDocumentStamp = $documentStamp
        $lastRefreshStamp = $refreshStamp
        Render-Document (Get-Document)
    }
})
$timer.Start()
$visibilityTimer = New-Object Windows.Threading.DispatcherTimer
$visibilityTimer.Interval = [TimeSpan]::FromMilliseconds(250)
$visibilityTimer.Add_Tick({ Set-OverlayVisibility })
$visibilityTimer.Start()

Set-Content -Path $pidPath -Value ([string]$PID)
$application = New-Object Windows.Application
try { [void]$application.Run($window) } finally {
    $timer.Stop()
    $visibilityTimer.Stop()
    try { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } catch {}
}