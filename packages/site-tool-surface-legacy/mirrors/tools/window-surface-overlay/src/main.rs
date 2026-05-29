#![allow(unsafe_op_in_unsafe_fn)]

use std::{
    collections::{HashMap, HashSet},
    ffi::c_void,
    fs,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
    ptr::null_mut,
    process::Command as ProcessCommand,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use chrono::Local;
use clap::{Parser, Subcommand};
use image::{AnimationDecoder, Frame, ImageReader, RgbaImage, codecs::gif::GifDecoder};
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use windows::{
    Win32::{
        Foundation::{BOOL, COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM},
        Graphics::{
            Dwm::{
                DWM_BB_ENABLE, DWM_BLURBEHIND, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
                DwmEnableBlurBehindWindow, DwmGetWindowAttribute,
            },
            Gdi::{
                BeginPaint, CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, CreateFontW, CreateSolidBrush,
                DEFAULT_CHARSET, DEFAULT_PITCH, DRAW_TEXT_FORMAT, DT_LEFT, DT_RIGHT,
                DT_SINGLELINE, DT_VCENTER, DeleteObject, DrawTextW, EndPaint, FF_DONTCARE,
                FW_SEMIBOLD, FillRect, GetDC, GetMonitorInfoW, GetTextExtentPoint32W, HDC, HRGN,
                InvalidateRect, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow,
                OUT_DEFAULT_PRECIS, PAINTSTRUCT, ReleaseDC, SelectObject, SetBkMode, SetPixelV,
                SetTextColor, TRANSPARENT,
            },
        },
        System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess},
        UI::{
            HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext},
            WindowsAndMessaging::{
                CREATESTRUCTW, CS_HREDRAW, CS_VREDRAW, CallNextHookEx, CreateWindowExW,
                DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows, GA_ROOT,
                GWLP_USERDATA, GetAncestor, GetClassNameW, GetMessageW, HHOOK, HTCLIENT,
                HTTRANSPARENT,
                GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
                GetWindowThreadProcessId, HMENU, HWND_TOPMOST, IDC_ARROW, IsIconic,
                IsWindowVisible, LWA_ALPHA, LoadCursorW, MSG, MSLLHOOKSTRUCT, PostQuitMessage,
                RegisterClassW, SW_HIDE, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_SHOWWINDOW,
                SetLayeredWindowAttributes, SetTimer, SetWindowLongPtrW, SetWindowPos,
                SetWindowsHookExW, ShowWindow, TranslateMessage, UnhookWindowsHookEx, WM_CREATE,
                WM_DESTROY, WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_NCCREATE,
                WM_NCHITTEST, WM_PAINT, WM_RBUTTONDOWN, WH_MOUSE_LL, WH_KEYBOARD_LL, WM_KEYDOWN,
                KBDLLHOOKSTRUCT,
                WNDCLASSW, WindowFromPoint, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
                WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
            },
        },
    },
    core::w,
};

const APP_NAME: &str = "narada-window-surface-overlay";
const TIMER_ID: usize = 1;
const TIMER_MS: u32 = 200;
const PC_SITE_ROOT: &str = r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2";
const OSL_PANEL_PAYLOAD_PATH: &str =
    r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-panel-payload.json";
const OSL_PANEL_PID_FILE: &str =
    r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-webview2-panel-host.pid";

#[derive(Parser)]
#[command(name = APP_NAME)]
struct Cli {
    #[command(subcommand)]
    command: Command,

    #[arg(long)]
    config: Option<PathBuf>,

    #[arg(
        long,
        default_value = r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\window-surface-overlay"
    )]
    log_dir: PathBuf,

    #[arg(
        long,
        default_value = r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\window-surface-overlay.pid"
    )]
    pid_file: PathBuf,
}

#[derive(Subcommand)]
enum Command {
    Run,
    Inspect,
    Status,
    Stop,
    Bind,
}

#[derive(Debug, Clone, Deserialize)]
struct Config {
    #[serde(default)]
    layout: Layout,
    #[serde(default)]
    runtime_binding_path: Option<PathBuf>,
    bindings: Vec<Binding>,
}

#[derive(Debug, Clone, Deserialize)]
struct Layout {
    #[serde(default = "default_anchor")]
    anchor: String,
    #[serde(default)]
    x_offset_px: i32,
    #[serde(default = "default_right_padding")]
    right_padding_px: i32,
    #[serde(default = "default_right_edge_exclusion")]
    right_edge_exclusion_px: i32,
    #[serde(default = "default_top_padding")]
    top_padding_px: i32,
    #[serde(default = "default_opacity")]
    opacity: f32,
    #[serde(default = "default_label_scale")]
    label_scale: f32,
    #[serde(default = "default_label_height")]
    label_height_px: i32,
    #[serde(default = "default_horizontal_padding")]
    horizontal_padding_px: i32,
    #[serde(default)]
    fonts: LabelFonts,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            anchor: default_anchor(),
            x_offset_px: 0,
            right_padding_px: default_right_padding(),
            right_edge_exclusion_px: default_right_edge_exclusion(),
            top_padding_px: default_top_padding(),
            opacity: default_opacity(),
            label_scale: default_label_scale(),
            label_height_px: default_label_height(),
            horizontal_padding_px: default_horizontal_padding(),
            fonts: LabelFonts::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct LabelFonts {
    #[serde(default = "default_font_family")]
    family: String,
    #[serde(default = "default_site_font")]
    site: LineFont,
    #[serde(default = "default_agent_font")]
    agent: LineFont,
    #[serde(default = "default_role_font")]
    role: LineFont,
}

impl Default for LabelFonts {
    fn default() -> Self {
        Self {
            family: default_font_family(),
            site: default_site_font(),
            agent: default_agent_font(),
            role: default_role_font(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct LineFont {
    family: Option<String>,
    size_px: i32,
    weight: i32,
}

fn default_font_family() -> String {
    "Segoe UI".to_string()
}

fn default_site_font() -> LineFont {
    LineFont {
        family: None,
        size_px: 8,
        weight: 400,
    }
}

fn default_agent_font() -> LineFont {
    LineFont {
        family: None,
        size_px: default_font_size(),
        weight: FW_SEMIBOLD.0 as i32,
    }
}

fn default_role_font() -> LineFont {
    LineFont {
        family: None,
        size_px: 10,
        weight: 400,
    }
}

fn default_anchor() -> String {
    "top-right".to_string()
}

fn default_right_padding() -> i32 {
    8
}

fn default_right_edge_exclusion() -> i32 {
    18
}

fn default_top_padding() -> i32 {
    7
}

fn default_opacity() -> f32 {
    0.84
}

fn default_label_scale() -> f32 {
    1.0
}

fn default_label_height() -> i32 {
    22
}

fn default_font_size() -> i32 {
    13
}

fn default_horizontal_padding() -> i32 {
    10
}

#[derive(Debug, Clone, Deserialize)]
struct Binding {
    surface_id: String,
    site_id: Option<String>,
    role_binding: Option<String>,
    agent_kind: Option<String>,
    label: String,
    label_parts: Option<LabelParts>,
    avatar: Option<AvatarProjection>,
    operator_activity: Option<OperatorActivity>,
    task_affinity: Option<TaskAffinity>,
    #[serde(default)]
    role_capabilities: Vec<String>,
    #[serde(default)]
    input_capabilities: Vec<String>,
    submit_strategy: Option<String>,
    execution_capability_policy: Option<ExecutionCapabilityPolicy>,
    #[serde(default)]
    authority_limits: Vec<String>,
    narada_site_relation: Option<NaradaSiteRelation>,
    #[serde(default)]
    style: Style,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct NaradaSiteRelation {
    site_id: Option<String>,
    site_kind: Option<String>,
    root: Option<String>,
    relation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct ExecutionCapabilityPolicy {
    mcp: Option<String>,
    shell: Option<String>,
    shell_like_actions: Option<String>,
    source: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct AvatarProjection {
    source: Option<String>,
    source_ref: Option<String>,
    still: Option<AvatarAsset>,
    animated: Option<AvatarAsset>,
    operator_surface_label: Option<AvatarOperatorSurfaceLabel>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct AvatarAsset {
    path: Option<String>,
    absolute_path: Option<PathBuf>,
    media_type: Option<String>,
    #[serde(default)]
    transparent_background: bool,
    alt: Option<String>,
    #[serde(default)]
    available: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Default)]
struct AvatarOperatorSurfaceLabel {
    placement: Option<String>,
    horizontal_alignment: Option<String>,
    gap_px: Option<i32>,
    size_px: Option<i32>,
    size_scale: Option<f32>,
    padding_top_px: Option<i32>,
    padding_bottom_px: Option<i32>,
    padding_left_px: Option<i32>,
    padding_right_px: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct OperatorActivity {
    state: String,
    label: Option<String>,
    #[serde(default)]
    renders_on_label: bool,
    task_number: Option<i32>,
    task_id: Option<String>,
    title: Option<String>,
    status: Option<String>,
    source: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct TaskAffinity {
    task_number: i32,
    task_id: String,
    title: String,
    status: String,
    source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelPayload {
    schema: String,
    generated_at: String,
    source_surface: PanelSourceSurface,
    identity: PanelIdentity,
    capabilities: PanelCapabilities,
    execution_policy: PanelExecutionPolicy,
    authority: PanelAuthority,
    activity: PanelActivity,
    presentation: PanelPresentation,
    future_controls: Vec<PanelControl>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelSourceSurface {
    surface_id: String,
    label: String,
    hwnd: Option<isize>,
    projection_source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelIdentity {
    identity_id: String,
    site_id: Option<String>,
    agent_name: Option<String>,
    role_name: Option<String>,
    role_label: Option<String>,
    agent_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelCapabilities {
    role_capabilities: Vec<String>,
    input_capabilities: Vec<String>,
    submit_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelExecutionPolicy {
    mcp: Option<String>,
    shell: Option<String>,
    shell_like_actions: Option<String>,
    source: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelAuthority {
    site_relation: Option<NaradaSiteRelation>,
    authority_limits: Vec<String>,
    projection_authority: String,
    compatibility_projection: bool,
    read_only: bool,
    read_only_note: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelActivity {
    operator_activity: Option<OperatorActivity>,
    task_affinity: Option<TaskAffinity>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelPresentation {
    title: String,
    preferred_width_px: i32,
    preferred_height_px: i32,
    dismiss_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct PanelControl {
    id: String,
    label: String,
    enabled: bool,
    authority: String,
}

impl PanelPayload {
    fn fallback_for_unbound(title: String) -> Self {
        Self {
            schema: "narada.operator_surface.osl_panel_payload.v0".to_string(),
            generated_at: Local::now().to_rfc3339(),
            source_surface: PanelSourceSurface {
                surface_id: "unbound".to_string(),
                label: title.clone(),
                hwnd: None,
                projection_source: "operator_surface_window_labels_projection".to_string(),
            },
            identity: PanelIdentity {
                identity_id: "unbound".to_string(),
                site_id: None,
                agent_name: None,
                role_name: None,
                role_label: None,
                agent_kind: None,
            },
            capabilities: PanelCapabilities {
                role_capabilities: Vec::new(),
                input_capabilities: Vec::new(),
                submit_strategy: None,
            },
            execution_policy: PanelExecutionPolicy {
                mcp: None,
                shell: None,
                shell_like_actions: None,
                source: None,
            },
            authority: PanelAuthority {
                site_relation: None,
                authority_limits: vec!["no_bound_identity".to_string()],
                projection_authority: "operator_surface_window_labels_projection".to_string(),
                compatibility_projection: true,
                read_only: true,
                read_only_note: "Panel payload is runtime UI data only; it grants no shell, lifecycle, SQLite, or binding mutation authority.".to_string(),
            },
            activity: PanelActivity {
                operator_activity: None,
                task_affinity: None,
            },
            presentation: PanelPresentation {
                title,
                preferred_width_px: 560,
                preferred_height_px: 420,
                dismiss_hints: vec![
                    "same_label_toggle".to_string(),
                    "right_click_label_or_panel".to_string(),
                    "host_close_signal".to_string(),
                ],
            },
            future_controls: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
struct LabelParts {
    site_name: String,
    agent_name: String,
    #[serde(default)]
    role_color_applies_to_agent: bool,
    role_name: Option<String>,
    role_label: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct RuntimeBindings {
    #[serde(default)]
    bindings: Vec<RuntimeBinding>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct RuntimeBinding {
    hwnd: isize,
    identity_name: String,
    #[serde(default)]
    asserted_by: Option<String>,
    #[serde(default)]
    assertion_method: Option<String>,
    #[serde(default)]
    observed_pid: Option<u32>,
    #[serde(default)]
    observed_process: Option<String>,
    #[serde(default)]
    observed_class: Option<String>,
    #[serde(default)]
    observed_title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Style {
    #[serde(default = "default_bg")]
    background_hex: String,
    #[serde(default = "default_fg")]
    text_hex: String,
    site_text_hex: Option<String>,
    agent_text_hex: Option<String>,
    role_text_hex: Option<String>,
}

impl Default for Style {
    fn default() -> Self {
        Self {
            background_hex: default_bg(),
            text_hex: default_fg(),
            site_text_hex: None,
            agent_text_hex: None,
            role_text_hex: None,
        }
    }
}

fn default_bg() -> String {
    "374151".to_string()
}

fn default_fg() -> String {
    "F9FAFB".to_string()
}

#[derive(Debug, Clone, Serialize)]
struct WindowInfo {
    hwnd: isize,
    title: String,
    class_name: String,
    process_name: String,
    pid: u32,
    visible: bool,
    minimized: bool,
    cloaked: bool,
    window_rect: RectInfo,
    frame_rect: Option<RectInfo>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
struct RectInfo {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl RectInfo {
    fn width(self) -> i32 {
        self.right - self.left
    }

    fn height(self) -> i32 {
        self.bottom - self.top
    }
}

#[derive(Debug, Clone, Serialize)]
struct InspectRecord {
    window: WindowInfo,
    matched: Option<MatchedInfo>,
    ignored_reason: Option<String>,
    stale: Option<bool>,
    stale_reason: Option<String>,
    renderable: Option<bool>,
    render_blocker: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct MatchedInfo {
    surface_id: String,
    site_id: Option<String>,
    role_binding: Option<String>,
    label: String,
    avatar: Option<AvatarProjection>,
    avatar_metrics: Option<AvatarInspectMetrics>,
    operator_activity: Option<OperatorActivity>,
    task_affinity: Option<TaskAffinity>,
    rule_kind: String,
    rule_pattern: String,
    asserted_by: Option<String>,
    assertion_method: Option<String>,
    stale_guard: Option<StaleGuardInfo>,
    geometry_source: String,
    label_rect: RectInfo,
}

#[derive(Debug, Clone, Serialize)]
struct AvatarInspectMetrics {
    placement: String,
    configured_size_px: i32,
    configured_size_scale: f32,
    effective_size_px: i32,
    block_height_px: i32,
    block_width_px: i32,
}

#[derive(Debug, Clone, Serialize)]
struct StaleGuardInfo {
    observed_pid: Option<u32>,
    observed_process: Option<String>,
    observed_class: Option<String>,
    observed_title: Option<String>,
}

struct OverlayState {
    config_path: PathBuf,
    log_dir: PathBuf,
    config: Config,
    runtime_bindings: RuntimeBindings,
    overlays: HashMap<isize, OverlayEntry>,
    last_config_load: Instant,
}

#[derive(Debug, Clone, Copy)]
struct OverlayEntry {
    hwnd: HWND,
    rect: RectInfo,
}

struct BindState {
    active: bool,
    hook: HHOOK,
    kb_hook: HHOOK,
    highlight_hwnd: HWND,
    tooltip_hwnd: Option<HWND>,
    candidate: Option<WindowInfo>,
    identities: Vec<String>,
    identity_index: usize,
    runtime_path: PathBuf,
    start_time: Instant,
    timeout_sec: u64,
}

static mut BIND_STATE: *mut BindState = null_mut();

#[derive(Debug, Clone, PartialEq)]
struct LabelRender {
    text: String,
    parts: Option<LabelParts>,
    avatar: Option<AvatarProjection>,
    bg: COLORREF,
    fg: COLORREF,
    site_fg: COLORREF,
    agent_fg: COLORREF,
    role_fg: COLORREF,
    task_fg: COLORREF,
    site_font: RenderFont,
    agent_font: RenderFont,
    role_font: RenderFont,
    task_font: RenderFont,
    scale: f32,
    text_horizontal_padding_px: i32,
    operator_activity: Option<OperatorActivity>,
    task_affinity: Option<TaskAffinity>,
    panel_lines: Vec<String>,
    panel_payload: PanelPayload,
    source_hwnd: isize,
    is_panel: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct RenderFont {
    family: String,
    size_px: i32,
    weight: i32,
}

impl LineFont {
    fn scaled(&self, scale: f32, fallback_family: &str) -> RenderFont {
        RenderFont {
            family: self
                .family
                .clone()
                .unwrap_or_else(|| fallback_family.to_string()),
            size_px: scaled_i32(self.size_px, scale),
            weight: self.weight,
        }
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Run => run(cli),
        Command::Inspect => inspect(cli),
        Command::Status => status(cli),
        Command::Stop => stop(cli),
        Command::Bind => bind(cli),
    }
}

fn resolve_config_path(config: &Option<PathBuf>) -> PathBuf {
    if let Some(path) = config {
        return path.clone();
    }

    let user_site_root = std::env::var_os("NARADA_USER_SITE_ROOT")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("Narada")))
        .unwrap_or_else(|| PathBuf::from(r"C:\Narada"));

    user_site_root.join(r"operator-surfaces\window-labels.json")
}

fn run(cli: Cli) -> Result<()> {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }

    fs::create_dir_all(&cli.log_dir)?;
    if let Some(parent) = cli.pid_file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&cli.pid_file, std::process::id().to_string())?;

    let config_path = resolve_config_path(&cli.config);
    let config = load_config(&config_path)?;
    let runtime_bindings = load_runtime_bindings(&config)?;
    log_line(
        &cli.log_dir,
        &format!("run start pid={}", std::process::id()),
    )?;
    log_line(&cli.log_dir, &format!("config={}", config_path.display()))?;

    unsafe {
        register_label_class()?;

        let mut state = Box::new(OverlayState {
            config_path,
            log_dir: cli.log_dir.clone(),
            config,
            runtime_bindings,
            overlays: HashMap::new(),
            last_config_load: Instant::now(),
        });

        update_overlays(&mut state)?;
        SetTimer(None, TIMER_ID, TIMER_MS, Some(timer_proc));
        STATE = Box::into_raw(state);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let state = Box::from_raw(STATE);
        for overlay in state.overlays.values() {
            let _ = DestroyWindow(overlay.hwnd);
        }
        STATE = null_mut();
    }

    let _ = fs::remove_file(&cli.pid_file);
    Ok(())
}

static mut STATE: *mut OverlayState = null_mut();
static mut ACTIVE_PANEL_HWND: *mut c_void = null_mut();
static mut ACTIVE_PANEL_OWNER: isize = 0;

unsafe extern "system" fn timer_proc(_: HWND, _: u32, _: usize, _: u32) {
    if STATE.is_null() {
        return;
    }
    let state = &mut *STATE;
    if let Err(err) = update_overlays(state) {
        let _ = log_line(&state.log_dir, &format!("update error: {err:?}"));
    }
}

fn inspect(cli: Cli) -> Result<()> {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let config_path = resolve_config_path(&cli.config);
    let config = load_config(&config_path)?;
    let runtime_bindings = load_runtime_bindings(&config)?;
    let records = inspect_records(&config, &runtime_bindings)?;
    println!("{}", serde_json::to_string_pretty(&records)?);
    Ok(())
}

fn status(cli: Cli) -> Result<()> {
    if !cli.pid_file.exists() {
        println!("not running");
        return Ok(());
    }
    let pid = fs::read_to_string(&cli.pid_file)?.trim().to_string();
    println!("pid {}", pid);
    Ok(())
}

fn stop(cli: Cli) -> Result<()> {
    if !cli.pid_file.exists() {
        println!("not running");
        return Ok(());
    }
    let pid: u32 = fs::read_to_string(&cli.pid_file)?.trim().parse()?;
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, false, pid)?;
        TerminateProcess(handle, 0)?;
    }
    let _ = fs::remove_file(&cli.pid_file);
    println!("stopped pid {}", pid);
    Ok(())
}

fn load_config(path: &PathBuf) -> Result<Config> {
    let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    Ok(serde_json::from_str(&raw)?)
}

fn load_runtime_bindings(config: &Config) -> Result<RuntimeBindings> {
    let Some(path) = &config.runtime_binding_path else {
        return Ok(RuntimeBindings::default());
    };
    if !path.exists() {
        return Ok(RuntimeBindings::default());
    }
    let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    Ok(serde_json::from_str(&raw)?)
}

fn inspect_records(
    config: &Config,
    runtime_bindings: &RuntimeBindings,
) -> Result<Vec<InspectRecord>> {
    let windows = enumerate_windows()?;
    Ok(windows
        .iter()
        .enumerate()
        .map(|(index, window)| {
            let window = window.clone();
            if let Some(reason) = ignored_reason(&window) {
                InspectRecord {
                    window,
                    matched: None,
                    ignored_reason: Some(reason.to_string()),
                    stale: None,
                    stale_reason: None,
                    renderable: None,
                    render_blocker: None,
                }
            } else if let Some(match_result) = match_binding(&window, config, runtime_bindings) {
                match match_result {
                    BindingMatch::Matched { binding, runtime } => {
                        let (geometry_source, frame) = preferred_frame(&window);
                        let label_rect = compute_label_rect(frame, binding, &config.layout);
                        let render_blocker = label_occlusion_reason(&label_rect, &windows[..index]);
                        InspectRecord {
                            window,
                            matched: Some(MatchedInfo {
                                surface_id: binding.surface_id.clone(),
                                site_id: binding.site_id.clone(),
                                role_binding: binding.role_binding.clone(),
                                label: binding.label.clone(),
                                avatar: binding.avatar.clone(),
                                avatar_metrics: avatar_inspect_metrics(binding, &config.layout),
                                operator_activity: binding.operator_activity.clone(),
                                task_affinity: binding.task_affinity.clone(),
                                rule_kind: "runtime_hwnd_binding".to_string(),
                                rule_pattern: runtime.hwnd.to_string(),
                                asserted_by: runtime.asserted_by.clone(),
                                assertion_method: runtime.assertion_method.clone(),
                                stale_guard: Some(runtime.stale_guard_info()),
                                geometry_source,
                                label_rect,
                            }),
                            ignored_reason: None,
                            stale: Some(false),
                            stale_reason: None,
                            renderable: Some(render_blocker.is_none()),
                            render_blocker,
                        }
                    }
                    BindingMatch::Unbound { reason } => {
                        let is_stale = reason.starts_with("stale_runtime_binding");
                        InspectRecord {
                            window,
                            matched: None,
                            ignored_reason: Some(reason.clone()),
                            stale: Some(is_stale),
                            stale_reason: if is_stale { Some(reason) } else { None },
                            renderable: Some(false),
                            render_blocker: Some("binding_not_renderable".to_string()),
                        }
                    }
                }
            } else {
                InspectRecord {
                    window,
                    matched: None,
                    ignored_reason: Some("no_binding_match".to_string()),
                    stale: None,
                    stale_reason: None,
                    renderable: Some(false),
                    render_blocker: Some("binding_not_renderable".to_string()),
                }
            }
        })
        .collect())
}

fn update_overlays(state: &mut OverlayState) -> Result<()> {
    if state.last_config_load.elapsed() > Duration::from_secs(2) {
        match load_config(&state.config_path) {
            Ok(config) => {
                match load_runtime_bindings(&config) {
                    Ok(runtime_bindings) => state.runtime_bindings = runtime_bindings,
                    Err(err) => log_line(
                        &state.log_dir,
                        &format!("runtime binding reload failed: {err:?}"),
                    )?,
                }
                state.config = config;
            }
            Err(err) => log_line(&state.log_dir, &format!("config reload failed: {err:?}"))?,
        }
        state.last_config_load = Instant::now();
    }

    let windows = enumerate_windows()?;
    let mut seen = HashSet::new();

    for (index, window) in windows.iter().enumerate() {
        if ignored_reason(&window).is_some() {
            continue;
        }
        let Some(BindingMatch::Matched { binding, .. }) =
            match_binding(&window, &state.config, &state.runtime_bindings)
        else {
            continue;
        };

        let (_, frame) = preferred_frame(&window);
        let rect = compute_label_rect(frame, binding, &state.config.layout);
        if label_occlusion_reason(&rect, &windows[..index]).is_some() {
            continue;
        }
        let fg = parse_colorref(&binding.style.text_hex).unwrap_or(COLORREF(0xFBFAF9));
        let bg = parse_colorref(&binding.style.background_hex).unwrap_or(COLORREF(0x000000));
        let _configured_opacity = opacity_byte(state.config.layout.opacity);
        let label = LabelRender {
            text: binding.label.clone(),
            parts: binding.label_parts.clone(),
            avatar: binding.avatar.clone().filter(avatar_is_renderable),
            bg,
            fg,
            site_fg: binding
                .style
                .site_text_hex
                .as_deref()
                .and_then(parse_colorref)
                .unwrap_or(fg),
            agent_fg: binding
                .style
                .agent_text_hex
                .as_deref()
                .and_then(parse_colorref)
                .unwrap_or(fg),
            role_fg: binding
                .style
                .role_text_hex
                .as_deref()
                .and_then(parse_colorref)
                .unwrap_or(fg),
            task_fg: parse_colorref("9CA3AF").unwrap_or(fg),
            site_font: state.config.layout.fonts.site.scaled(
                state.config.layout.label_scale,
                &state.config.layout.fonts.family,
            ),
            agent_font: state.config.layout.fonts.agent.scaled(
                state.config.layout.label_scale,
                &state.config.layout.fonts.family,
            ),
            role_font: state.config.layout.fonts.role.scaled(
                state.config.layout.label_scale,
                &state.config.layout.fonts.family,
            ),
            task_font: state.config.layout.fonts.role.scaled(
                state.config.layout.label_scale,
                &state.config.layout.fonts.family,
            ),
            scale: state.config.layout.label_scale,
            text_horizontal_padding_px: state.config.layout.horizontal_padding_px,
            operator_activity: binding.operator_activity.clone(),
            task_affinity: binding.task_affinity.clone(),
            panel_lines: capability_panel_lines(binding),
            panel_payload: capability_panel_payload(
                binding,
                Some(window.hwnd),
                Local::now().to_rfc3339(),
            ),
            source_hwnd: window.hwnd,
            is_panel: false,
        };
        let repaint_animated_avatar = label_has_animated_avatar(&label);

        unsafe {
            let overlay = if let Some(entry) = state.overlays.get_mut(&window.hwnd) {
                update_label_data(entry.hwnd, label);
                if entry.rect != rect {
                    SetWindowPos(
                        entry.hwnd,
                        HWND_TOPMOST,
                        rect.left,
                        rect.top,
                        rect.width(),
                        rect.height(),
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    )?;
                    entry.rect = rect;
                }
                entry.hwnd
            } else {
                let hwnd = create_label_window(label)?;
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    rect.left,
                    rect.top,
                    rect.width(),
                    rect.height(),
                    SWP_NOACTIVATE | SWP_SHOWWINDOW,
                )?;
                state
                    .overlays
                    .insert(window.hwnd, OverlayEntry { hwnd, rect });
                hwnd
            };
            if !IsWindowVisible(overlay).as_bool() {
                let _ = ShowWindow(overlay, SW_SHOWNOACTIVATE);
            }
            if repaint_animated_avatar {
                let _ = InvalidateRect(overlay, None, BOOL(0));
            }
            seen.insert(window.hwnd);
        }
    }

    let stale: Vec<isize> = state
        .overlays
        .keys()
        .copied()
        .filter(|hwnd| !seen.contains(hwnd))
        .collect();
    for hwnd in stale {
        if let Some(overlay) = state.overlays.remove(&hwnd) {
            unsafe {
                if ACTIVE_PANEL_OWNER == hwnd {
                    dismiss_active_panel();
                }
                let _ = DestroyWindow(overlay.hwnd);
            }
        }
    }

    Ok(())
}

fn ignored_reason(window: &WindowInfo) -> Option<&'static str> {
    if is_overlay_window(window) {
        Some("overlay_renderer_window")
    } else if window.title.is_empty() {
        Some("empty_title")
    } else if !window.visible {
        Some("not_visible")
    } else if window.minimized {
        Some("minimized")
    } else if window.cloaked {
        Some("cloaked")
    } else if window.window_rect.width() <= 1 || window.window_rect.height() <= 1 {
        Some("degenerate_rect")
    } else {
        None
    }
}

fn is_overlay_window(window: &WindowInfo) -> bool {
    matches!(
        window.class_name.as_str(),
        "NaradaSurfaceOverlayLabel" | "NaradaBindHighlight"
    ) || matches!(
        window.title.as_str(),
        "NaradaSurfaceLabel" | "NaradaBindHighlight"
    )
}

fn label_occlusion_reason(label_rect: &RectInfo, higher_windows: &[WindowInfo]) -> Option<String> {
    higher_windows.iter().find_map(|window| {
        if ignored_reason(window).is_some() {
            return None;
        }
        let (_, frame) = preferred_frame(window);
        if rects_intersect(label_rect, &frame) {
            Some(format!("occluded_by_hwnd:{}", window.hwnd))
        } else {
            None
        }
    })
}

fn rects_intersect(a: &RectInfo, b: &RectInfo) -> bool {
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

enum BindingMatch<'a> {
    Matched {
        binding: &'a Binding,
        runtime: &'a RuntimeBinding,
    },
    Unbound {
        reason: String,
    },
}

fn match_binding<'a>(
    window: &WindowInfo,
    config: &'a Config,
    runtime_bindings: &'a RuntimeBindings,
) -> Option<BindingMatch<'a>> {
    let runtime = runtime_bindings
        .bindings
        .iter()
        .find(|binding| binding.hwnd == window.hwnd);

    let Some(runtime) = runtime else {
        return Some(BindingMatch::Unbound {
            reason: "no_runtime_binding".to_string(),
        });
    };

    if let Some(reason) = stale_binding_reason(window, runtime) {
        return Some(BindingMatch::Unbound { reason });
    }

    for binding in &config.bindings {
        if binding.surface_id == runtime.identity_name {
            return Some(BindingMatch::Matched { binding, runtime });
        }
    }

    Some(BindingMatch::Unbound {
        reason: format!("runtime_identity_not_declared:{}", runtime.identity_name),
    })
}

impl RuntimeBinding {
    fn stale_guard_info(&self) -> StaleGuardInfo {
        StaleGuardInfo {
            observed_pid: self.observed_pid,
            observed_process: self.observed_process.clone(),
            observed_class: self.observed_class.clone(),
            observed_title: self.observed_title.clone(),
        }
    }
}

fn stale_binding_reason(window: &WindowInfo, runtime: &RuntimeBinding) -> Option<String> {
    if let Some(observed_class) = runtime.observed_class.as_ref().filter(|v| !v.is_empty()) {
        if observed_class != &window.class_name {
            return Some(format!(
                "stale_runtime_binding:class_mismatch:{}!={}",
                observed_class, window.class_name
            ));
        }
    }

    if runtime.observed_pid.is_none()
        && runtime
            .observed_process
            .as_ref()
            .map_or(true, |value| value.is_empty())
        && runtime
            .observed_title
            .as_ref()
            .map_or(true, |value| value.is_empty())
    {
        return Some(format!(
            "stale_runtime_binding:insufficient_evidence:{}",
            window.hwnd
        ));
    }

    None
}

fn process_stem(process_name: &str) -> String {
    process_name
        .strip_suffix(".exe")
        .unwrap_or(process_name)
        .to_string()
}

fn preferred_frame(window: &WindowInfo) -> (String, RectInfo) {
    if let Some(frame) = window.frame_rect {
        ("dwm_extended_frame_bounds".to_string(), frame)
    } else {
        ("get_window_rect".to_string(), window.window_rect)
    }
}

fn compute_label_rect(frame: RectInfo, binding: &Binding, layout: &Layout) -> RectInfo {
    let scale = layout.label_scale.clamp(0.5, 6.0);
    let right_padding = scaled_offset_i32(layout.right_padding_px, scale);
    let right_edge_exclusion = scaled_offset_i32(layout.right_edge_exclusion_px.max(0), scale);
    let top_padding = scaled_offset_i32(layout.top_padding_px, scale);
    let width = formatted_label_width(binding, layout).max(scaled_i32(72, scale));
    let height = formatted_label_height(binding, layout);
    let container_right = frame.right - right_edge_exclusion;
    let (left, top) = match layout.anchor.as_str() {
        "top-left" => (
            frame.left + right_padding + layout.x_offset_px,
            frame.top + top_padding,
        ),
        _ => (
            container_right - width - right_padding + layout.x_offset_px,
            frame.top + top_padding,
        ),
    };
    RectInfo {
        left,
        top,
        right: left + width,
        bottom: top + height,
    }
}

fn formatted_label_width(binding: &Binding, layout: &Layout) -> i32 {
    let scale = layout.label_scale.clamp(0.5, 6.0);
    let horizontal_padding = scaled_i32(layout.horizontal_padding_px, scale) * 2;
    let avatar_width = avatar_render_width(binding, layout);
    let text_width = if let Some(parts) = &binding.label_parts {
        let site_font = layout.fonts.site.scaled(scale, &layout.fonts.family);
        let agent_font = layout.fonts.agent.scaled(scale, &layout.fonts.family);
        let role_font = layout.fonts.role.scaled(scale, &layout.fonts.family);
        let mut widths = vec![
            measured_text_width(&parts.site_name, &site_font),
            measured_text_width(&parts.agent_name, &agent_font),
        ];
        if let Some(role) = visible_role(parts) {
            widths.push(measured_text_width(role, &role_font));
        }
        if let Some(activity) = activity_label(
            binding.operator_activity.as_ref(),
            binding.task_affinity.as_ref(),
        ) {
            widths.push(measured_text_width(&activity, &role_font));
        }
        widths.into_iter().max().unwrap_or(0)
    } else {
        let agent_font = layout.fonts.agent.scaled(scale, &layout.fonts.family);
        measured_text_width(&binding.label, &agent_font)
    };
    let text_block_width = text_width + horizontal_padding * 2 + avatar_width;
    text_block_width.max(avatar_below_label_width(binding, layout) + horizontal_padding * 2)
}

fn avatar_render_height(binding: &Binding, layout: &Layout) -> i32 {
    if binding.avatar.as_ref().is_some_and(|avatar| {
        avatar_is_renderable(avatar) && avatar_placement(avatar) == "below_label"
    }) {
        avatar_block_height_for_scale(
            layout.label_scale,
            binding
                .avatar
                .as_ref()
                .and_then(|avatar| avatar.operator_surface_label.as_ref()),
        )
    } else {
        0
    }
}

fn avatar_render_width(binding: &Binding, layout: &Layout) -> i32 {
    if binding.avatar.as_ref().is_some_and(|avatar| {
        avatar_is_renderable(avatar) && avatar_placement(avatar) == "inline_left"
    }) {
        avatar_size_px_for_scale(
            layout.label_scale,
            binding
                .avatar
                .as_ref()
                .and_then(|avatar| avatar.operator_surface_label.as_ref()),
        ) + scaled_i32(6, layout.label_scale)
    } else {
        0
    }
}

fn avatar_below_label_width(binding: &Binding, layout: &Layout) -> i32 {
    let Some(avatar) = binding.avatar.as_ref() else {
        return 0;
    };
    if !avatar_is_renderable(avatar) || avatar_placement(avatar) != "below_label" {
        return 0;
    }
    let avatar_layout = avatar.operator_surface_label.as_ref();
    avatar_padding_left_for_scale(layout.label_scale, avatar_layout)
        + avatar_size_px_for_scale(layout.label_scale, avatar_layout)
        + avatar_padding_right_for_scale(layout.label_scale, avatar_layout)
}

fn avatar_is_renderable(avatar: &AvatarProjection) -> bool {
    (avatar
        .animated
        .as_ref()
        .is_some_and(animated_avatar_asset_is_renderable)
        || avatar
            .still
            .as_ref()
            .is_some_and(avatar_asset_is_renderable))
        && avatar_placement(avatar) != "none"
}

fn avatar_placement(avatar: &AvatarProjection) -> String {
    avatar
        .operator_surface_label
        .as_ref()
        .and_then(|layout| layout.placement.as_deref())
        .filter(|placement| !placement.trim().is_empty())
        .unwrap_or("below_label")
        .to_string()
}

fn avatar_asset_is_renderable(asset: &AvatarAsset) -> bool {
    if !asset.available {
        return false;
    }
    let media_type = asset.media_type.as_deref().unwrap_or_default();
    media_type.eq_ignore_ascii_case("image/png") || avatar_asset_extension_is(asset, "png")
}

fn animated_avatar_asset_is_renderable(asset: &AvatarAsset) -> bool {
    if !asset.available {
        return false;
    }
    let media_type = asset.media_type.as_deref().unwrap_or_default();
    media_type.eq_ignore_ascii_case("image/gif") || avatar_asset_extension_is(asset, "gif")
}

fn avatar_asset_extension_is(asset: &AvatarAsset, expected: &str) -> bool {
    asset
        .absolute_path
        .as_deref()
        .or_else(|| asset.path.as_deref().map(Path::new))
        .and_then(|path| path.extension())
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(expected))
}

fn formatted_label_height(binding: &Binding, layout: &Layout) -> i32 {
    let scale = layout.label_scale.clamp(0.5, 6.0);
    let text_height = if let Some(parts) = &binding.label_parts {
        let mut height = layout
            .fonts
            .site
            .scaled(scale, &layout.fonts.family)
            .size_px
            + layout
                .fonts
                .agent
                .scaled(scale, &layout.fonts.family)
                .size_px;
        let has_visible_role = visible_role(parts).is_some();
        if has_visible_role {
            height += layout
                .fonts
                .role
                .scaled(scale, &layout.fonts.family)
                .size_px;
        }
        let has_activity = activity_label(
            binding.operator_activity.as_ref(),
            binding.task_affinity.as_ref(),
        )
        .is_some();
        if has_activity {
            height += layout
                .fonts
                .role
                .scaled(scale, &layout.fonts.family)
                .size_px;
        }
        let vertical_padding = if has_visible_role || has_activity {
            18
        } else {
            12
        };
        height + scaled_i32(vertical_padding, scale)
    } else {
        scaled_i32(layout.label_height_px, scale)
    };
    text_height + avatar_render_height(binding, layout)
}

fn measured_text_width(text: &str, font: &RenderFont) -> i32 {
    unsafe {
        let dc = GetDC(None);
        if dc.0.is_null() {
            return estimated_text_width(text, font.size_px);
        }
        let gdi_font = create_gdi_font(font);
        let old_font = SelectObject(dc, gdi_font);
        let wide = to_wide(text);
        let mut size = SIZE::default();
        let ok = GetTextExtentPoint32W(dc, &wide[..wide.len().saturating_sub(1)], &mut size);
        let _ = SelectObject(dc, old_font);
        let _ = DeleteObject(gdi_font);
        let _ = ReleaseDC(None, dc);
        if ok.as_bool() {
            size.cx
        } else {
            estimated_text_width(text, font.size_px)
        }
    }
}

fn estimated_text_width(text: &str, font_size: i32) -> i32 {
    (text.chars().count() as i32) * (font_size / 2 + 2)
}

fn visible_role(parts: &LabelParts) -> Option<&str> {
    parts
        .role_label
        .as_deref()
        .or(parts.role_name.as_deref())
        .filter(|role| !role.trim().is_empty() && *role != parts.agent_name)
}

fn activity_label(
    activity: Option<&OperatorActivity>,
    _task_affinity: Option<&TaskAffinity>,
) -> Option<String> {
    if let Some(activity) = activity {
        if activity.renders_on_label {
            if let Some(label) = activity.label.as_deref() {
                if !label.trim().is_empty() {
                    return Some(label.to_string());
                }
            }
        }
        return None;
    }
    None
}

fn capability_panel_lines(binding: &Binding) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push(format!("surface: {}", binding.surface_id));
    if let Some(relation) = binding.narada_site_relation.as_ref() {
        if let Some(summary) = relation.relation.as_deref().filter(|value| !value.trim().is_empty())
        {
            lines.push(format!("relation: {summary}"));
        }
    }
    if let Some(kind) = binding
        .agent_kind
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("carrier: {kind}"));
    }
    if binding.role_capabilities.is_empty() {
        lines.push("role caps: none projected".to_string());
    } else {
        lines.push(format!(
            "role caps: {}",
            binding.role_capabilities.join(", ")
        ));
    }
    if binding.input_capabilities.is_empty() {
        lines.push("input: none admitted".to_string());
    } else {
        lines.push(format!(
            "input: {}",
            binding.input_capabilities.join(", ")
        ));
    }
    if let Some(strategy) = binding
        .submit_strategy
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("submit: {strategy}"));
    }
    if let Some(policy) = binding.execution_capability_policy.as_ref() {
        if let Some(mcp) = policy.mcp.as_deref().filter(|value| !value.trim().is_empty()) {
            lines.push(format!("mcp: {mcp}"));
        }
        if let Some(shell) = policy.shell.as_deref().filter(|value| !value.trim().is_empty()) {
            lines.push(format!("shell: {shell}"));
        }
    }
    if binding.authority_limits.is_empty() {
        lines.push("authority: descriptive only".to_string());
    } else {
        lines.push(format!(
            "limits: {}",
            binding.authority_limits.join(", ")
        ));
    }
    lines
}

fn capability_panel_payload(
    binding: &Binding,
    source_hwnd: Option<isize>,
    generated_at: String,
) -> PanelPayload {
    let label_parts = binding.label_parts.as_ref();
    let execution = binding.execution_capability_policy.as_ref();
    PanelPayload {
        schema: "narada.operator_surface.osl_panel_payload.v0".to_string(),
        generated_at,
        source_surface: PanelSourceSurface {
            surface_id: binding.surface_id.clone(),
            label: binding.label.clone(),
            hwnd: source_hwnd,
            projection_source: "operator_surface_window_labels_projection".to_string(),
        },
        identity: PanelIdentity {
            identity_id: binding.surface_id.clone(),
            site_id: binding.site_id.clone(),
            agent_name: label_parts.map(|parts| parts.agent_name.clone()),
            role_name: label_parts.and_then(|parts| parts.role_name.clone()),
            role_label: label_parts.and_then(|parts| parts.role_label.clone()),
            agent_kind: binding.agent_kind.clone(),
        },
        capabilities: PanelCapabilities {
            role_capabilities: binding.role_capabilities.clone(),
            input_capabilities: binding.input_capabilities.clone(),
            submit_strategy: binding.submit_strategy.clone(),
        },
        execution_policy: PanelExecutionPolicy {
            mcp: execution.and_then(|policy| policy.mcp.clone()),
            shell: execution.and_then(|policy| policy.shell.clone()),
            shell_like_actions: execution.and_then(|policy| policy.shell_like_actions.clone()),
            source: execution.and_then(|policy| policy.source.clone()),
        },
        authority: PanelAuthority {
            site_relation: binding.narada_site_relation.clone(),
            authority_limits: binding.authority_limits.clone(),
            projection_authority: "operator_surface_window_labels_projection".to_string(),
            compatibility_projection: true,
            read_only: true,
            read_only_note: "Panel payload is runtime UI data only; it grants no shell, lifecycle, SQLite, or binding mutation authority.".to_string(),
        },
        activity: PanelActivity {
            operator_activity: binding.operator_activity.clone(),
            task_affinity: binding.task_affinity.clone(),
        },
        presentation: PanelPresentation {
            title: binding.label.clone(),
            preferred_width_px: 560,
            preferred_height_px: 420,
            dismiss_hints: vec![
                "same_label_toggle".to_string(),
                "right_click_label_or_panel".to_string(),
                "host_close_signal".to_string(),
            ],
        },
        future_controls: Vec::new(),
    }
}

fn scaled_i32(value: i32, scale: f32) -> i32 {
    ((value as f32) * scale.clamp(0.5, 6.0)).round().max(1.0) as i32
}

fn scaled_offset_i32(value: i32, scale: f32) -> i32 {
    ((value as f32) * scale.clamp(0.5, 6.0)).round() as i32
}

fn opacity_byte(opacity: f32) -> u8 {
    (opacity.clamp(0.05, 1.0) * 255.0).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task_affinity() -> TaskAffinity {
        TaskAffinity {
            task_number: 80,
            task_id: "task-80".to_string(),
            title: "Legacy task affinity".to_string(),
            status: "in_review".to_string(),
            source: "operator_activity_compat".to_string(),
        }
    }

    fn test_binding(avatar: Option<AvatarProjection>) -> Binding {
        Binding {
            surface_id: "narada-andrey.Robin".to_string(),
            site_id: Some("narada-andrey".to_string()),
            role_binding: None,
            agent_kind: Some("api-coding-agent".to_string()),
            label: "narada-andrey - Robin - Builder".to_string(),
            label_parts: Some(LabelParts {
                site_name: "narada-andrey".to_string(),
                agent_name: "Robin".to_string(),
                role_color_applies_to_agent: false,
                role_name: Some("builder".to_string()),
                role_label: Some("Builder".to_string()),
            }),
            avatar,
            operator_activity: None,
            task_affinity: None,
            role_capabilities: vec!["derive".to_string(), "execute".to_string(), "review".to_string()],
            input_capabilities: vec![
                "focus".to_string(),
                "type_text".to_string(),
                "submit".to_string(),
            ],
            submit_strategy: Some("known_surface_submit".to_string()),
            execution_capability_policy: Some(ExecutionCapabilityPolicy {
                mcp: Some("required_for_script_execution_and_lifecycle_mutations".to_string()),
                shell: Some("no_standing_native_shell_authority".to_string()),
                shell_like_actions: Some("policy_aware_narada_mcp_surface_only".to_string()),
                source: Some("AGENTS.md#Agent-Capability-Policy".to_string()),
            }),
            authority_limits: vec!["operator_surface_does_not_grant_effect_capability".to_string()],
            narada_site_relation: Some(NaradaSiteRelation {
                site_id: Some("narada-andrey".to_string()),
                site_kind: Some("user".to_string()),
                root: Some("C:/Users/Andrey/Narada".to_string()),
                relation: Some("User Site builder surface".to_string()),
            }),
            style: Style::default(),
        }
    }

    fn png_avatar() -> AvatarProjection {
        AvatarProjection {
            source: Some("identity".to_string()),
            source_ref: Some("narada-andrey.Robin".to_string()),
            still: Some(AvatarAsset {
                path: Some("operator-surfaces/assets/avatars/robin.png".to_string()),
                absolute_path: None,
                media_type: Some("image/png".to_string()),
                transparent_background: true,
                alt: Some("Robin builder avatar".to_string()),
                available: true,
            }),
            animated: None,
            operator_surface_label: Some(AvatarOperatorSurfaceLabel {
                placement: Some("below_label".to_string()),
                horizontal_alignment: Some("center".to_string()),
                gap_px: Some(1),
                size_px: Some(24),
                size_scale: None,
                padding_top_px: None,
                padding_bottom_px: None,
                padding_left_px: None,
                padding_right_px: None,
            }),
        }
    }

    fn inline_png_avatar() -> AvatarProjection {
        AvatarProjection {
            operator_surface_label: Some(AvatarOperatorSurfaceLabel {
                placement: Some("inline_left".to_string()),
                horizontal_alignment: None,
                gap_px: None,
                size_px: Some(24),
                size_scale: None,
                padding_top_px: None,
                padding_bottom_px: None,
                padding_left_px: None,
                padding_right_px: None,
            }),
            ..png_avatar()
        }
    }

    fn test_window(hwnd: isize, class_name: &str, title: &str, rect: RectInfo) -> WindowInfo {
        WindowInfo {
            hwnd,
            title: title.to_string(),
            class_name: class_name.to_string(),
            process_name: "WindowsTerminal.exe".to_string(),
            pid: 4242,
            visible: true,
            minimized: false,
            cloaked: false,
            window_rect: rect,
            frame_rect: None,
        }
    }

    fn test_runtime_binding(hwnd: isize) -> RuntimeBinding {
        RuntimeBinding {
            hwnd,
            identity_name: "narada-andrey.Robin".to_string(),
            asserted_by: Some("narada-andrey.Robin".to_string()),
            assertion_method: Some("direct_mcp_observed_foreground_hwnd".to_string()),
            observed_pid: Some(1111),
            observed_process: Some("pwsh".to_string()),
            observed_class: Some("CASCADIA_HOSTING_WINDOW_CLASS".to_string()),
            observed_title: Some("old title".to_string()),
        }
    }

    fn test_config() -> Config {
        Config {
            layout: Layout::default(),
            runtime_binding_path: None,
            bindings: vec![test_binding(None)],
        }
    }

    #[test]
    fn activity_label_uses_explicit_operator_activity_label() {
        let activity = OperatorActivity {
            state: "awaiting_review".to_string(),
            label: Some("awaiting review #80".to_string()),
            renders_on_label: true,
            task_number: Some(80),
            task_id: Some("task-80".to_string()),
            title: Some("Review task".to_string()),
            status: Some("in_review".to_string()),
            source: Some("narada_task_lifecycle_db".to_string()),
        };

        assert_eq!(
            activity_label(Some(&activity), Some(&task_affinity())),
            Some("awaiting review #80".to_string())
        );
    }

    #[test]
    fn activity_label_does_not_fallback_to_legacy_task_affinity() {
        assert_eq!(activity_label(None, Some(&task_affinity())), None);
    }

    #[test]
    fn png_avatar_is_renderable() {
        let avatar = png_avatar();
        assert!(avatar_asset_is_renderable(avatar.still.as_ref().unwrap()));
    }

    #[test]
    fn gif_avatar_is_renderable_as_animated_asset() {
        let mut avatar = png_avatar();
        avatar.animated = Some(AvatarAsset {
            path: Some("operator-surfaces/assets/avatars/robin.gif".to_string()),
            absolute_path: None,
            media_type: Some("image/gif".to_string()),
            transparent_background: true,
            alt: Some("Robin animated avatar".to_string()),
            available: true,
        });

        assert!(animated_avatar_asset_is_renderable(
            avatar.animated.as_ref().unwrap()
        ));
        assert!(avatar_is_renderable(&avatar));
    }

    #[test]
    fn avatar_adds_below_label_height_without_widening_text_label() {
        let layout = Layout::default();
        let plain = test_binding(None);
        let with_avatar = test_binding(Some(png_avatar()));

        assert_eq!(
            formatted_label_width(&with_avatar, &layout),
            formatted_label_width(&plain, &layout)
        );
        assert!(
            formatted_label_height(&with_avatar, &layout) > formatted_label_height(&plain, &layout)
        );
    }

    #[test]
    fn inline_avatar_increases_width_without_adding_height() {
        let layout = Layout::default();
        let plain = test_binding(None);
        let with_avatar = test_binding(Some(inline_png_avatar()));

        assert!(
            formatted_label_width(&with_avatar, &layout) > formatted_label_width(&plain, &layout)
        );
        assert_eq!(
            formatted_label_height(&with_avatar, &layout),
            formatted_label_height(&plain, &layout)
        );
    }

    #[test]
    fn avatar_draw_dimensions_preserve_wide_source_aspect_ratio() {
        assert_eq!(avatar_draw_dimensions(120, 240, 120), (120, 60));
    }

    #[test]
    fn avatar_draw_dimensions_preserve_tall_source_aspect_ratio() {
        assert_eq!(avatar_draw_dimensions(120, 80, 240), (40, 120));
    }

    #[test]
    fn avatar_alpha_bounds_ignore_transparent_canvas_margins() {
        let mut image = RgbaImage::new(8, 8);
        image.put_pixel(3, 2, image::Rgba([255, 255, 255, 255]));
        image.put_pixel(6, 5, image::Rgba([255, 255, 255, 255]));

        assert_eq!(
            avatar_alpha_bounds(&image),
            Some(AvatarAlphaBounds {
                left: 3,
                top: 2,
                right: 6,
                bottom: 5,
            })
        );
    }

    #[test]
    fn avatar_transparent_hole_detection_ignores_exterior_transparency() {
        let mut image = RgbaImage::new(7, 7);
        let opaque = image::Rgba([255, 255, 255, 255]);
        for x in 2..=4 {
            image.put_pixel(x, 2, opaque);
            image.put_pixel(x, 4, opaque);
        }
        image.put_pixel(2, 3, opaque);
        image.put_pixel(4, 3, opaque);
        let bounds = avatar_alpha_bounds(&image).unwrap();

        assert!(avatar_transparent_pixel_is_enclosed(&image, 3, 3, bounds));
        assert!(!avatar_transparent_pixel_is_enclosed(&image, 1, 3, bounds));
    }

    #[test]
    fn avatar_size_scale_multiplies_configured_avatar_size() {
        let mut avatar = png_avatar();
        avatar.operator_surface_label.as_mut().unwrap().size_scale = Some(2.5);
        let layout = avatar.operator_surface_label.as_ref();

        assert_eq!(avatar_size_px_for_scale(1.0, layout), 60);
    }

    #[test]
    fn avatar_size_scale_is_not_capped_by_combined_label_scale() {
        let mut avatar = png_avatar();
        avatar.operator_surface_label.as_mut().unwrap().size_scale = Some(3.5);
        let layout = avatar.operator_surface_label.as_ref();

        assert_eq!(avatar_size_px_for_scale(3.0, layout), 252);
    }

    #[test]
    fn below_label_avatar_width_expands_label_window_when_needed() {
        let mut layout = Layout::default();
        layout.label_scale = 3.0;
        let mut avatar = png_avatar();
        avatar.operator_surface_label.as_mut().unwrap().size_scale = Some(3.5);
        let binding = test_binding(Some(avatar));

        assert!(formatted_label_width(&binding, &layout) >= 252 + scaled_i32(layout.horizontal_padding_px, layout.label_scale) * 2);
    }

    #[test]
    fn avatar_inspect_metrics_expose_effective_draw_size() {
        let mut layout = Layout::default();
        layout.label_scale = 3.0;
        let mut avatar = png_avatar();
        avatar.operator_surface_label.as_mut().unwrap().size_scale = Some(3.5);
        let binding = test_binding(Some(avatar));
        let metrics = avatar_inspect_metrics(&binding, &layout).unwrap();

        assert_eq!(metrics.effective_size_px, 252);
        assert_eq!(metrics.block_height_px, avatar_gap_for_scale(3.0, binding.avatar.as_ref().unwrap().operator_surface_label.as_ref()) + 252);
    }

    #[test]
    fn avatar_padding_adds_to_below_label_block_height() {
        let mut avatar = png_avatar();
        let label = avatar.operator_surface_label.as_mut().unwrap();
        label.padding_top_px = Some(3);
        label.padding_bottom_px = Some(5);
        let layout = avatar.operator_surface_label.as_ref();

        assert_eq!(
            avatar_block_height_for_scale(1.0, layout),
            avatar_gap_for_scale(1.0, layout) + avatar_size_px_for_scale(1.0, layout) + 8
        );
    }

    #[test]
    fn avatar_horizontal_alignment_accepts_only_left_center_right() {
        let mut avatar = png_avatar();
        avatar
            .operator_surface_label
            .as_mut()
            .unwrap()
            .horizontal_alignment = Some("left".to_string());
        assert_eq!(avatar_horizontal_alignment(&avatar), "left");

        avatar
            .operator_surface_label
            .as_mut()
            .unwrap()
            .horizontal_alignment = Some("center".to_string());
        assert_eq!(avatar_horizontal_alignment(&avatar), "center");

        avatar
            .operator_surface_label
            .as_mut()
            .unwrap()
            .horizontal_alignment = Some("bogus".to_string());
        assert_eq!(avatar_horizontal_alignment(&avatar), "right");
    }

    #[test]
    fn capability_panel_lines_describe_bound_identity_capabilities() {
        let binding = test_binding(None);
        let lines = capability_panel_lines(&binding);

        assert!(lines.contains(&"surface: narada-andrey.Robin".to_string()));
        assert!(lines.contains(&"relation: User Site builder surface".to_string()));
        assert!(lines.contains(&"carrier: api-coding-agent".to_string()));
        assert!(lines.contains(&"role caps: derive, execute, review".to_string()));
        assert!(lines.contains(&"input: focus, type_text, submit".to_string()));
        assert!(lines.contains(&"submit: known_surface_submit".to_string()));
        assert!(lines.contains(&"mcp: required_for_script_execution_and_lifecycle_mutations".to_string()));
        assert!(lines.contains(&"shell: no_standing_native_shell_authority".to_string()));
    }

    #[test]
    fn capability_panel_payload_serializes_structured_contract() {
        let binding = test_binding(None);
        let payload = capability_panel_payload(
            &binding,
            Some(3411338),
            "2026-05-12T03:56:00Z".to_string(),
        );
        let serialized = serde_json::to_value(&payload).expect("payload serializes");

        assert_eq!(serialized["schema"], "narada.operator_surface.osl_panel_payload.v0");
        assert_eq!(serialized["generated_at"], "2026-05-12T03:56:00Z");
        assert_eq!(serialized["source_surface"]["surface_id"], "narada-andrey.Robin");
        assert_eq!(serialized["source_surface"]["hwnd"], 3411338);
        assert_eq!(
            serialized["source_surface"]["projection_source"],
            "operator_surface_window_labels_projection"
        );
        assert_eq!(serialized["identity"]["identity_id"], "narada-andrey.Robin");
        assert_eq!(serialized["identity"]["site_id"], "narada-andrey");
        assert_eq!(serialized["identity"]["agent_name"], "Robin");
        assert_eq!(serialized["identity"]["role_name"], "builder");
        assert_eq!(serialized["identity"]["role_label"], "Builder");
        assert_eq!(serialized["identity"]["agent_kind"], "api-coding-agent");
        assert_eq!(
            serialized["capabilities"]["role_capabilities"],
            serde_json::json!(["derive", "execute", "review"])
        );
        assert_eq!(
            serialized["capabilities"]["input_capabilities"],
            serde_json::json!(["focus", "type_text", "submit"])
        );
        assert_eq!(
            serialized["capabilities"]["submit_strategy"],
            "known_surface_submit"
        );
        assert_eq!(
            serialized["execution_policy"]["mcp"],
            "required_for_script_execution_and_lifecycle_mutations"
        );
        assert_eq!(
            serialized["execution_policy"]["shell"],
            "no_standing_native_shell_authority"
        );
        assert_eq!(
            serialized["execution_policy"]["shell_like_actions"],
            "policy_aware_narada_mcp_surface_only"
        );
        assert_eq!(
            serialized["execution_policy"]["source"],
            "AGENTS.md#Agent-Capability-Policy"
        );
        assert_eq!(
            serialized["authority"]["site_relation"]["relation"],
            "User Site builder surface"
        );
        assert_eq!(
            serialized["authority"]["authority_limits"],
            serde_json::json!(["operator_surface_does_not_grant_effect_capability"])
        );
        assert_eq!(
            serialized["authority"]["projection_authority"],
            "operator_surface_window_labels_projection"
        );
        assert_eq!(serialized["authority"]["compatibility_projection"], true);
        assert_eq!(serialized["authority"]["read_only"], true);
        assert!(serialized["authority"]["read_only_note"]
            .as_str()
            .unwrap()
            .contains("grants no shell"));
        assert_eq!(serialized["presentation"]["preferred_width_px"], 560);
        assert_eq!(serialized["presentation"]["preferred_height_px"], 420);
        assert_eq!(
            serialized["presentation"]["dismiss_hints"],
            serde_json::json!(["same_label_toggle", "right_click_label_or_panel", "host_close_signal"])
        );
        assert_eq!(serialized["future_controls"], serde_json::json!([]));
    }

    #[test]
    fn capability_panel_payload_carries_activity_without_using_it_as_authority() {
        let mut binding = test_binding(None);
        binding.operator_activity = Some(OperatorActivity {
            state: "active".to_string(),
            label: Some("editing task".to_string()),
            renders_on_label: true,
            task_number: Some(607),
            task_id: Some("20260511-607".to_string()),
            title: Some("Define panel payload".to_string()),
            status: Some("claimed".to_string()),
            source: Some("operator_activity".to_string()),
        });
        binding.task_affinity = Some(task_affinity());

        let serialized = serde_json::to_value(capability_panel_payload(
            &binding,
            None,
            "2026-05-12T03:57:00Z".to_string(),
        ))
        .expect("payload serializes");

        assert_eq!(serialized["source_surface"]["hwnd"], serde_json::Value::Null);
        assert_eq!(serialized["activity"]["operator_activity"]["label"], "editing task");
        assert_eq!(serialized["activity"]["task_affinity"]["task_number"], 80);
        assert_eq!(serialized["authority"]["read_only"], true);
        assert_eq!(serialized["authority"]["compatibility_projection"], true);
    }

    #[test]
    fn webview_panel_bridge_writes_structured_payload_file() {
        let binding = test_binding(None);
        let payload = capability_panel_payload(
            &binding,
            Some(3411338),
            "2026-05-12T04:15:00Z".to_string(),
        );
        let path = std::env::temp_dir().join(format!(
            "narada-osl-panel-payload-{}.json",
            std::process::id()
        ));

        write_panel_payload_file(&payload, &path).expect("payload file writes");
        let serialized: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).expect("payload file readable"))
                .expect("payload file is json");
        let _ = fs::remove_file(&path);

        assert_eq!(
            serialized["schema"],
            "narada.operator_surface.osl_panel_payload.v0"
        );
        assert_eq!(serialized["source_surface"]["hwnd"], 3411338);
        assert_eq!(serialized["identity"]["agent_name"], "Robin");
        assert_eq!(serialized["authority"]["read_only"], true);
    }

    #[test]
    fn webview_panel_bridge_uses_installed_host_carrier_args() {
        let script = PathBuf::from(r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\tools\osl-webview2-panel-host\Start-OslPanelHost.ps1");
        let payload = PathBuf::from(r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-panel-payload.json");
        let pid = PathBuf::from(r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-webview2-panel-host.pid");

        let args = webview_panel_host_command_args(&script, &payload, &pid);

        assert_eq!(args[0], "-NoProfile");
        assert_eq!(args[3], "-File");
        assert_eq!(args[4], script.display().to_string());
        assert!(args.contains(&"-PayloadPath".to_string()));
        assert!(args.contains(&payload.display().to_string()));
        assert!(args.contains(&"-PidFile".to_string()));
        assert!(args.contains(&pid.display().to_string()));
    }

    #[test]
    fn right_edge_exclusion_moves_top_right_label_inside_scroll_strip() {
        let binding = test_binding(None);
        let mut layout = Layout::default();
        layout.right_padding_px = 8;
        layout.right_edge_exclusion_px = 24;
        let frame = RectInfo {
            left: 0,
            top: 0,
            right: 1000,
            bottom: 800,
        };
        let rect = compute_label_rect(frame, &binding, &layout);

        assert_eq!(rect.right, 1000 - 24 - 8);
    }

    #[test]
    fn right_edge_exclusion_does_not_move_top_left_label() {
        let binding = test_binding(None);
        let mut layout = Layout::default();
        layout.anchor = "top-left".to_string();
        layout.right_padding_px = 8;
        layout.right_edge_exclusion_px = 24;
        let frame = RectInfo {
            left: 20,
            top: 0,
            right: 1000,
            bottom: 800,
        };
        let rect = compute_label_rect(frame, &binding, &layout);

        assert_eq!(rect.left, 28);
    }

    #[test]
    fn exact_hwnd_binding_survives_pid_process_and_title_drift() {
        let window = test_window(
            5244394,
            "CASCADIA_HOSTING_WINDOW_CLASS",
            "current title",
            RectInfo {
                left: 0,
                top: 0,
                right: 1200,
                bottom: 800,
            },
        );
        let config = test_config();
        let runtime_bindings = RuntimeBindings {
            bindings: vec![test_runtime_binding(5244394)],
        };

        assert!(matches!(
            match_binding(&window, &config, &runtime_bindings),
            Some(BindingMatch::Matched { .. })
        ));
    }

    #[test]
    fn exact_hwnd_binding_blocks_class_mismatch() {
        let window = test_window(
            5244394,
            "DifferentWindowClass",
            "current title",
            RectInfo {
                left: 0,
                top: 0,
                right: 1200,
                bottom: 800,
            },
        );
        let config = test_config();
        let runtime_bindings = RuntimeBindings {
            bindings: vec![test_runtime_binding(5244394)],
        };

        assert!(matches!(
            match_binding(&window, &config, &runtime_bindings),
            Some(BindingMatch::Unbound { reason })
                if reason.starts_with("stale_runtime_binding:class_mismatch")
        ));
    }

    #[test]
    fn overlay_windows_do_not_occlude_operator_labels() {
        let label_rect = RectInfo {
            left: 900,
            top: 10,
            right: 1100,
            bottom: 80,
        };
        let existing_overlay = test_window(
            100,
            "NaradaSurfaceOverlayLabel",
            "NaradaSurfaceLabel",
            label_rect,
        );

        assert_eq!(ignored_reason(&existing_overlay), Some("overlay_renderer_window"));
        assert_eq!(label_occlusion_reason(&label_rect, &[existing_overlay]), None);
    }
}

fn parse_colorref(hex: &str) -> Option<COLORREF> {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() != 6 {
        return None;
    }
    let rgb = u32::from_str_radix(clean, 16).ok()?;
    let r = (rgb >> 16) & 0xff;
    let g = (rgb >> 8) & 0xff;
    let b = rgb & 0xff;
    Some(COLORREF(r | (g << 8) | (b << 16)))
}

fn enumerate_windows() -> Result<Vec<WindowInfo>> {
    let mut hwnds: Vec<HWND> = Vec::new();
    unsafe {
        EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut hwnds as *mut _ as isize),
        )?;
    }

    let mut sys = System::new_all();
    sys.refresh_all();

    let mut out = Vec::new();
    for hwnd in hwnds {
        let visible = unsafe { IsWindowVisible(hwnd).as_bool() };
        let minimized = unsafe { IsIconic(hwnd).as_bool() };
        let cloaked = is_cloaked(hwnd);
        let title = window_text(hwnd);
        let class_name = class_name(hwnd);
        let pid = window_pid(hwnd);
        let process_name = sys
            .process(Pid::from_u32(pid))
            .map(|p| p.name().to_string_lossy().to_string())
            .unwrap_or_default();
        let Some(window_rect) = get_window_rect(hwnd) else {
            continue;
        };
        let frame_rect = get_extended_frame(hwnd);

        if class_name == "Shell_TrayWnd" || class_name == "Progman" || class_name == "WorkerW" {
            continue;
        }
        if process_name.eq_ignore_ascii_case(APP_NAME)
            || title.starts_with("NaradaSurfaceLabel:")
            || class_name == "NaradaSurfaceOverlayLabel"
        {
            continue;
        }

        out.push(WindowInfo {
            hwnd: hwnd.0 as isize,
            title,
            class_name,
            process_name,
            pid,
            visible,
            minimized,
            cloaked,
            window_rect,
            frame_rect,
        });
    }
    Ok(out)
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let hwnds = &mut *(lparam.0 as *mut Vec<HWND>);
    hwnds.push(hwnd);
    true.into()
}

fn window_text(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len == 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..copied as usize])
    }
}

fn class_name(hwnd: HWND) -> String {
    unsafe {
        let mut buf = vec![0u16; 256];
        let copied = GetClassNameW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..copied as usize])
    }
}

fn window_pid(hwnd: HWND) -> u32 {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    pid
}

fn is_cloaked(hwnd: HWND) -> bool {
    unsafe {
        let mut cloaked = 0u32;
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
    }
}

fn get_window_rect(hwnd: HWND) -> Option<RectInfo> {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_ok() {
            Some(rect.into())
        } else {
            None
        }
    }
}

fn get_extended_frame(hwnd: HWND) -> Option<RectInfo> {
    unsafe {
        let mut rect = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok()
        {
            let info: RectInfo = rect.into();
            if info.width() > 0 && info.height() > 0 {
                return Some(info);
            }
        }
    }
    None
}

impl From<RECT> for RectInfo {
    fn from(value: RECT) -> Self {
        Self {
            left: value.left,
            top: value.top,
            right: value.right,
            bottom: value.bottom,
        }
    }
}

unsafe fn register_label_class() -> Result<()> {
    let wc = WNDCLASSW {
        hCursor: LoadCursorW(None, IDC_ARROW)?,
        lpszClassName: w!("NaradaSurfaceOverlayLabel"),
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(label_wnd_proc),
        ..Default::default()
    };
    let atom = RegisterClassW(&wc);
    if atom == 0 {
        // Class may already exist for the process after reload; continue.
    }
    Ok(())
}

unsafe fn create_label_window(label: LabelRender) -> Result<HWND> {
    let is_panel = label.is_panel;
    let boxed = Box::new(label);
    let ptr = Box::into_raw(boxed);
    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        w!("NaradaSurfaceOverlayLabel"),
        w!("NaradaSurfaceLabel"),
        WS_POPUP,
        0,
        0,
        10,
        10,
        None,
        HMENU::default(),
        None,
        Some(ptr as *const c_void),
    )?;
    make_layered_window_visible(hwnd);
    if !is_panel {
        enable_label_blur(hwnd);
    }
    let _ = ShowWindow(hwnd, SW_HIDE);
    Ok(hwnd)
}

unsafe fn update_label_data(hwnd: HWND, label: LabelRender) {
    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LabelRender;
    if !ptr.is_null() {
        if *ptr != label {
            let repaint = label_render_requires_repaint(&*ptr, &label);
            let is_panel = label.is_panel;
            *ptr = label;
            if !is_panel {
                enable_label_blur(hwnd);
            }
            if repaint {
                let _ = InvalidateRect(hwnd, None, BOOL(0));
            }
        }
    }
}

fn label_render_requires_repaint(current: &LabelRender, next: &LabelRender) -> bool {
    current.text != next.text
        || current.parts != next.parts
        || current.avatar != next.avatar
        || current.bg != next.bg
        || current.fg != next.fg
        || current.site_fg != next.site_fg
        || current.agent_fg != next.agent_fg
        || current.role_fg != next.role_fg
        || current.task_fg != next.task_fg
        || current.site_font != next.site_font
        || current.agent_font != next.agent_font
        || current.role_font != next.role_font
        || current.task_font != next.task_font
        || current.scale != next.scale
        || current.text_horizontal_padding_px != next.text_horizontal_padding_px
        || current.operator_activity != next.operator_activity
        || current.task_affinity != next.task_affinity
        || current.is_panel != next.is_panel
        || (current.is_panel && current.panel_lines != next.panel_lines)
}

unsafe fn enable_label_blur(hwnd: HWND) {
    let blur = DWM_BLURBEHIND {
        dwFlags: DWM_BB_ENABLE,
        fEnable: BOOL(1),
        hRgnBlur: HRGN::default(),
        fTransitionOnMaximized: BOOL(0),
    };
    let _ = DwmEnableBlurBehindWindow(hwnd, &blur);
}

unsafe fn make_layered_window_visible(hwnd: HWND) {
    let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
}

unsafe fn modal_panel_rect(source_hwnd: isize, requested_width: i32, requested_height: i32) -> RectInfo {
    let source = HWND(source_hwnd as *mut c_void);
    let monitor = MonitorFromWindow(source, MONITOR_DEFAULTTONEAREST);
    let mut work = RECT::default();
    if !monitor.is_invalid() {
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            work = info.rcWork;
        }
    }
    if work.right <= work.left || work.bottom <= work.top {
        let mut source_rect = RECT::default();
        let _ = GetWindowRect(source, &mut source_rect);
        work = source_rect;
    }
    let margin = 24;
    let available_width = (work.right - work.left - (margin * 2)).max(360);
    let available_height = (work.bottom - work.top - (margin * 2)).max(240);
    let width = requested_width.min(available_width).max(360);
    let height = requested_height.min(available_height).max(240);
    let left = work.left + ((work.right - work.left - width) / 2).max(margin);
    let top = work.top + ((work.bottom - work.top - height) / 3).max(margin);
    RectInfo {
        left,
        top,
        right: left + width,
        bottom: top + height,
    }
}

fn osl_panel_payload_path() -> PathBuf {
    PathBuf::from(OSL_PANEL_PAYLOAD_PATH)
}

fn osl_panel_pid_file() -> PathBuf {
    PathBuf::from(OSL_PANEL_PID_FILE)
}

fn osl_panel_host_script(name: &str) -> PathBuf {
    PathBuf::from(PC_SITE_ROOT)
        .join("tools")
        .join("osl-webview2-panel-host")
        .join(name)
}

fn webview_panel_host_command_args(
    script: &Path,
    payload_path: &Path,
    pid_file: &Path,
) -> Vec<String> {
    vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-File".to_string(),
        script.display().to_string(),
        "-PayloadPath".to_string(),
        payload_path.display().to_string(),
        "-PidFile".to_string(),
        pid_file.display().to_string(),
    ]
}

fn write_panel_payload_file(payload: &PanelPayload, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(payload)?)?;
    Ok(())
}

fn start_webview_panel_host(payload: &PanelPayload) -> Result<()> {
    let payload_path = osl_panel_payload_path();
    let pid_file = osl_panel_pid_file();
    let script = osl_panel_host_script("Start-OslPanelHost.ps1");
    write_panel_payload_file(payload, &payload_path)?;
    if !script.exists() {
        anyhow::bail!("OSL WebView2 panel host start script missing: {}", script.display());
    }
    let args = webview_panel_host_command_args(&script, &payload_path, &pid_file);
    ProcessCommand::new("powershell.exe")
        .args(args)
        .spawn()
        .with_context(|| format!("start OSL WebView2 panel host via {}", script.display()))?;
    Ok(())
}

fn stop_webview_panel_host() {
    let script = osl_panel_host_script("Stop-OslPanelHost.ps1");
    if script.exists() {
        let args = vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            script.display().to_string(),
            "-PidFile".to_string(),
            OSL_PANEL_PID_FILE.to_string(),
        ];
        let _ = ProcessCommand::new("powershell.exe")
            .args(args)
            .spawn();
    }
}

unsafe fn log_panel_bridge(message: &str) {
    if !STATE.is_null() {
        let state = &*STATE;
        let _ = log_line(&state.log_dir, message);
    }
}

unsafe fn dismiss_active_panel() {
    let active_panel = ACTIVE_PANEL_HWND;
    let had_webview_owner = ACTIVE_PANEL_OWNER != 0 && active_panel.is_null();
    ACTIVE_PANEL_HWND = null_mut();
    ACTIVE_PANEL_OWNER = 0;
    if !active_panel.is_null() {
        let _ = DestroyWindow(HWND(active_panel));
    }
    if had_webview_owner {
        stop_webview_panel_host();
    }
}

unsafe fn toggle_label_panel(label: &LabelRender) {
    let source_hwnd = label.source_hwnd;
    let active_panel = ACTIVE_PANEL_HWND;
    if !active_panel.is_null() || ACTIVE_PANEL_OWNER != 0 {
        let same_owner = ACTIVE_PANEL_OWNER == source_hwnd;
        dismiss_active_panel();
        if same_owner {
            return;
        }
    }

    match start_webview_panel_host(&label.panel_payload) {
        Ok(()) => {
            ACTIVE_PANEL_OWNER = source_hwnd;
            log_panel_bridge(&format!("panel host launched owner={source_hwnd}"));
            return;
        }
        Err(err) => {
            log_panel_bridge(&format!(
                "panel host start failed owner={source_hwnd}: {err:?}; falling back to GDI panel"
            ));
        }
    }

    let requested_width = 760;
    let requested_height = 420;
    let panel_rect = modal_panel_rect(source_hwnd, requested_width, requested_height);
    let panel = LabelRender {
        text: label.text.clone(),
        parts: label.parts.clone(),
        avatar: None,
        bg: parse_colorref("111827").unwrap_or(COLORREF(0x27211F)),
        fg: parse_colorref("F9FAFB").unwrap_or(COLORREF(0xFBFAF9)),
        site_fg: parse_colorref("9CA3AF").unwrap_or(COLORREF(0xAFA39C)),
        agent_fg: label.agent_fg,
        role_fg: label.role_fg,
        task_fg: label.task_fg,
        site_font: label.site_font.clone(),
        agent_font: label.agent_font.clone(),
        role_font: label.role_font.clone(),
        task_font: label.task_font.clone(),
        scale: label.scale,
        text_horizontal_padding_px: label.text_horizontal_padding_px,
        operator_activity: label.operator_activity.clone(),
        task_affinity: label.task_affinity.clone(),
        panel_lines: label.panel_lines.clone(),
        panel_payload: label.panel_payload.clone(),
        source_hwnd,
        is_panel: true,
    };

    if let Ok(hwnd) = create_label_window(panel) {
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            panel_rect.left,
            panel_rect.top,
            panel_rect.width(),
            panel_rect.height(),
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        ACTIVE_PANEL_HWND = hwnd.0;
        ACTIVE_PANEL_OWNER = source_hwnd;
    }
}

unsafe fn draw_label_text(hdc: HDC, rect: RECT, data: &LabelRender) {
    if data.is_panel {
        draw_panel_text(hdc, rect, data);
        return;
    }
    let text_rect = label_text_rect(rect, data);
    let inline_avatar_slot = avatar_inline_slot(data);
    if let Some(parts) = &data.parts {
        let horizontal_padding = scaled_i32(data.text_horizontal_padding_px, data.scale);
        let text_left = text_rect.left + horizontal_padding + inline_avatar_slot;
        let top_padding = scaled_i32(6, data.scale);
        let mut top = text_rect.top + top_padding;
        draw_label_line(
            hdc,
            &parts.site_name,
            &data.site_font,
            data.site_fg,
            RECT {
                left: text_left,
                top,
                right: text_rect.right - horizontal_padding,
                bottom: top + data.site_font.size_px + scaled_i32(1, data.scale),
            },
        );
        top += data.site_font.size_px + scaled_i32(1, data.scale);
        draw_label_line(
            hdc,
            &parts.agent_name,
            &data.agent_font,
            if parts.role_color_applies_to_agent {
                data.role_fg
            } else {
                data.agent_fg
            },
            RECT {
                left: text_left,
                top,
                right: text_rect.right - horizontal_padding,
                bottom: top + data.agent_font.size_px + scaled_i32(1, data.scale),
            },
        );
        if let Some(role) = visible_role(parts) {
            top += data.agent_font.size_px + scaled_i32(1, data.scale);
            draw_label_line(
                hdc,
                role,
                &data.role_font,
                data.role_fg,
                RECT {
                    left: text_left,
                    top,
                    right: text_rect.right - horizontal_padding,
                    bottom: top + data.role_font.size_px + scaled_i32(1, data.scale),
                },
            );
        }
        if let Some(activity_line) =
            activity_label(data.operator_activity.as_ref(), data.task_affinity.as_ref())
        {
            top += if visible_role(parts).is_some() {
                data.role_font.size_px + scaled_i32(1, data.scale)
            } else {
                data.agent_font.size_px + scaled_i32(1, data.scale)
            };
            draw_label_line(
                hdc,
                &activity_line,
                &data.task_font,
                data.task_fg,
                RECT {
                    left: text_left,
                    top,
                    right: text_rect.right - horizontal_padding,
                    bottom: top + data.task_font.size_px + scaled_i32(1, data.scale),
                },
            );
        }
    } else {
        let mut inline_text_rect = text_rect;
        inline_text_rect.left += inline_avatar_slot;
        draw_label_line(hdc, &data.text, &data.agent_font, data.fg, inline_text_rect);
    }
    draw_avatar_if_available(hdc, rect, text_rect, data);
}

unsafe fn draw_panel_text(hdc: HDC, rect: RECT, data: &LabelRender) {
    let horizontal_padding = scaled_i32(data.text_horizontal_padding_px.max(6), data.scale);
    let mut top = rect.top + scaled_i32(8, data.scale);
    draw_panel_line(
        hdc,
        "bound intelligence",
        &data.site_font,
        data.site_fg,
        RECT {
            left: rect.left + horizontal_padding,
            top,
            right: rect.right - horizontal_padding,
            bottom: top + data.site_font.size_px + scaled_i32(2, data.scale),
        },
    );
    top += data.site_font.size_px + scaled_i32(4, data.scale);
    draw_panel_line(
        hdc,
        &data.text,
        &data.agent_font,
        data.agent_fg,
        RECT {
            left: rect.left + horizontal_padding,
            top,
            right: rect.right - horizontal_padding,
            bottom: top + data.agent_font.size_px + scaled_i32(2, data.scale),
        },
    );
    top += data.agent_font.size_px + scaled_i32(6, data.scale);
    for line in data.panel_lines.iter().take(10) {
        draw_panel_line(
            hdc,
            line,
            &data.role_font,
            data.fg,
            RECT {
                left: rect.left + horizontal_padding,
                top,
                right: rect.right - horizontal_padding,
                bottom: top + data.role_font.size_px + scaled_i32(2, data.scale),
            },
        );
        top += data.role_font.size_px + scaled_i32(3, data.scale);
    }
}

fn avatar_asset_path(asset: &AvatarAsset) -> Option<PathBuf> {
    asset
        .absolute_path
        .clone()
        .or_else(|| asset.path.as_ref().map(PathBuf::from))
}

fn label_text_rect(rect: RECT, data: &LabelRender) -> RECT {
    let mut text_rect = rect;
    if data
        .avatar
        .as_ref()
        .is_some_and(|avatar| avatar_placement(avatar) == "below_label")
    {
        text_rect.bottom = text_rect
            .bottom
            .saturating_sub(avatar_block_height_for_scale(
                data.scale,
                data.avatar
                    .as_ref()
                    .and_then(|avatar| avatar.operator_surface_label.as_ref()),
            ));
    }
    text_rect
}

fn avatar_inline_slot(data: &LabelRender) -> i32 {
    let Some(avatar) = data.avatar.as_ref() else {
        return 0;
    };
    if avatar_placement(avatar) != "inline_left" {
        return 0;
    }
    let layout = avatar.operator_surface_label.as_ref();
    avatar_padding_left_for_scale(data.scale, layout)
        + avatar_size_px_for_scale(data.scale, layout)
        + avatar_padding_right_for_scale(data.scale, layout)
        + scaled_i32(6, data.scale)
}

unsafe fn draw_avatar_if_available(hdc: HDC, rect: RECT, text_rect: RECT, data: &LabelRender) {
    let Some(avatar) = data.avatar.as_ref() else {
        return;
    };
    let Some(image) = avatar_current_image(avatar) else {
        return;
    };
    let source_width = image.width().max(1);
    let source_height = image.height().max(1);
    let alpha_bounds = avatar_alpha_bounds(&image).unwrap_or(AvatarAlphaBounds {
        left: 0,
        top: 0,
        right: source_width - 1,
        bottom: source_height - 1,
    });
    let bounded_width = alpha_bounds.width().max(1);
    let bounded_height = alpha_bounds.height().max(1);
    let placement = avatar_placement(avatar);
    let layout = avatar.operator_surface_label.as_ref();
    let size = avatar_size_for_rect(rect, text_rect, data.scale, layout);
    if size <= 0 {
        return;
    }
    let horizontal_padding = scaled_i32(data.text_horizontal_padding_px, data.scale);
    let (draw_width, draw_height) = avatar_draw_dimensions(size, bounded_width, bounded_height);
    let (slot_left, slot_top) = if placement == "inline_left" {
        (
            rect.left + horizontal_padding + avatar_padding_left_for_scale(data.scale, layout),
            text_rect.top
                + ((text_rect.bottom - text_rect.top - size) / 2).max(0)
                + avatar_padding_top_for_scale(data.scale, layout)
                - avatar_padding_bottom_for_scale(data.scale, layout),
        )
    } else {
        let gap = avatar_gap_for_scale(data.scale, layout);
        let padding_left = avatar_padding_left_for_scale(data.scale, layout);
        let padding_right = avatar_padding_right_for_scale(data.scale, layout);
        let left = match avatar_horizontal_alignment(avatar).as_str() {
            "left" => rect.left + horizontal_padding + padding_left,
            "center" => {
                let padded_width = size + padding_left + padding_right;
                rect.left + ((rect.right - rect.left - padded_width) / 2).max(0) + padding_left
            }
            "right" => rect.right - horizontal_padding - padding_right - size,
            _ => rect.right - horizontal_padding - padding_right - size,
        };
        (
            left,
            (text_rect.bottom + gap + avatar_padding_top_for_scale(data.scale, layout))
                .min(rect.bottom - size)
                .max(text_rect.top),
        )
    };
    let left = match avatar_horizontal_alignment(avatar).as_str() {
        "left" => slot_left,
        "center" => slot_left + ((size - draw_width) / 2).max(0),
        "right" => slot_left + (size - draw_width).max(0),
        _ => slot_left + (size - draw_width).max(0),
    };
    let top = slot_top + ((size - draw_height) / 2).max(0);
    let bg = colorref_to_rgb(data.bg);

    for y in 0..draw_height {
        let sy = alpha_bounds.top + ((y as u32) * bounded_height / (draw_height as u32)).min(bounded_height - 1);
        for x in 0..draw_width {
            let sx = alpha_bounds.left + ((x as u32) * bounded_width / (draw_width as u32)).min(bounded_width - 1);
            let pixel = image.get_pixel(sx, sy);
            let alpha = pixel[3] as u32;
            if alpha == 0 {
                if avatar_transparent_pixel_is_enclosed(&image, sx, sy, alpha_bounds) {
                    let _ = SetPixelV(hdc, left + x, top + y, rgb_to_colorref(bg.0, bg.1, bg.2));
                }
                continue;
            }
            let r = blend_channel(pixel[0] as u32, bg.0, alpha);
            let g = blend_channel(pixel[1] as u32, bg.1, alpha);
            let b = blend_channel(pixel[2] as u32, bg.2, alpha);
            let _ = SetPixelV(hdc, left + x, top + y, rgb_to_colorref(r, g, b));
        }
    }
}

fn avatar_draw_dimensions(slot_size: i32, source_width: u32, source_height: u32) -> (i32, i32) {
    let slot_size = slot_size.max(1);
    let source_width = source_width.max(1) as f32;
    let source_height = source_height.max(1) as f32;
    if source_width >= source_height {
        let height = ((slot_size as f32) * source_height / source_width)
            .round()
            .max(1.0) as i32;
        (slot_size, height.min(slot_size))
    } else {
        let width = ((slot_size as f32) * source_width / source_height)
            .round()
            .max(1.0) as i32;
        (width.min(slot_size), slot_size)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AvatarAlphaBounds {
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

impl AvatarAlphaBounds {
    fn width(self) -> u32 {
        self.right.saturating_sub(self.left) + 1
    }

    fn height(self) -> u32 {
        self.bottom.saturating_sub(self.top) + 1
    }
}

fn avatar_alpha_bounds(image: &RgbaImage) -> Option<AvatarAlphaBounds> {
    let mut bounds: Option<AvatarAlphaBounds> = None;
    for y in 0..image.height() {
        for x in 0..image.width() {
            if image.get_pixel(x, y)[3] == 0 {
                continue;
            }
            bounds = Some(match bounds {
                Some(existing) => AvatarAlphaBounds {
                    left: existing.left.min(x),
                    top: existing.top.min(y),
                    right: existing.right.max(x),
                    bottom: existing.bottom.max(y),
                },
                None => AvatarAlphaBounds {
                    left: x,
                    top: y,
                    right: x,
                    bottom: y,
                },
            });
        }
    }
    bounds
}

fn avatar_transparent_pixel_is_enclosed(
    image: &RgbaImage,
    x: u32,
    y: u32,
    bounds: AvatarAlphaBounds,
) -> bool {
    if image.get_pixel(x, y)[3] != 0 {
        return false;
    }
    let has_left = (bounds.left..x).any(|px| image.get_pixel(px, y)[3] != 0);
    let has_right = ((x + 1)..=bounds.right).any(|px| image.get_pixel(px, y)[3] != 0);
    let has_top = (bounds.top..y).any(|py| image.get_pixel(x, py)[3] != 0);
    let has_bottom = ((y + 1)..=bounds.bottom).any(|py| image.get_pixel(x, py)[3] != 0);
    has_left && has_right && has_top && has_bottom
}

fn avatar_current_image(avatar: &AvatarProjection) -> Option<RgbaImage> {
    avatar
        .animated
        .as_ref()
        .filter(|asset| animated_avatar_asset_is_renderable(asset))
        .and_then(decode_gif_avatar_frame)
        .or_else(|| {
            avatar
                .still
                .as_ref()
                .filter(|asset| avatar_asset_is_renderable(asset))
                .and_then(decode_still_avatar_image)
        })
}

fn label_has_animated_avatar(data: &LabelRender) -> bool {
    data.avatar.as_ref().is_some_and(|avatar| {
        avatar_placement(avatar) != "none"
            && avatar
                .animated
                .as_ref()
                .is_some_and(animated_avatar_asset_is_renderable)
    })
}

fn decode_still_avatar_image(asset: &AvatarAsset) -> Option<RgbaImage> {
    let path = avatar_asset_path(asset)?;
    let reader = ImageReader::open(path).ok()?;
    let decoded = reader.decode().ok()?;
    Some(decoded.to_rgba8())
}

fn decode_gif_avatar_frame(asset: &AvatarAsset) -> Option<RgbaImage> {
    let path = avatar_asset_path(asset)?;
    let file = File::open(path).ok()?;
    let decoder = GifDecoder::new(BufReader::new(file)).ok()?;
    let frames = decoder.into_frames().collect_frames().ok()?;
    if frames.is_empty() {
        return None;
    }
    let index = animated_frame_index(&frames);
    frames.into_iter().nth(index).map(Frame::into_buffer)
}

fn animated_frame_index(frames: &[Frame]) -> usize {
    if frames.len() <= 1 {
        return 0;
    }
    let delays: Vec<u64> = frames.iter().map(frame_delay_ms).collect();
    let total_ms: u64 = delays.iter().sum();
    if total_ms == 0 {
        return 0;
    }
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut cursor = now_ms % total_ms;
    for (index, delay) in delays.iter().enumerate() {
        if cursor < *delay {
            return index;
        }
        cursor = cursor.saturating_sub(*delay);
    }
    frames.len() - 1
}

fn frame_delay_ms(frame: &Frame) -> u64 {
    let (numerator, denominator) = frame.delay().numer_denom_ms();
    if denominator == 0 {
        return 100;
    }
    ((numerator as u64 + denominator as u64 - 1) / denominator as u64).clamp(20, 10_000)
}

fn avatar_horizontal_alignment(avatar: &AvatarProjection) -> String {
    match avatar
        .operator_surface_label
        .as_ref()
        .and_then(|layout| layout.horizontal_alignment.as_deref())
        .map(|alignment| alignment.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("left") => "left".to_string(),
        Some("center") => "center".to_string(),
        Some("right") => "right".to_string(),
        _ => "right".to_string(),
    }
}

fn avatar_size_for_rect(
    rect: RECT,
    text_rect: RECT,
    scale: f32,
    layout: Option<&AvatarOperatorSurfaceLabel>,
) -> i32 {
    let available_height = (rect.bottom
        - text_rect.bottom
        - avatar_gap_for_scale(scale, layout)
        - avatar_padding_top_for_scale(scale, layout)
        - avatar_padding_bottom_for_scale(scale, layout))
        .max(text_rect.bottom - text_rect.top)
        .max(1);
    avatar_size_px_for_scale(scale, layout).min(available_height)
}

fn avatar_block_height_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    avatar_gap_for_scale(scale, layout)
        + avatar_padding_top_for_scale(scale, layout)
        + avatar_size_px_for_scale(scale, layout)
        + avatar_padding_bottom_for_scale(scale, layout)
}

fn avatar_gap_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    layout
        .and_then(|layout| layout.gap_px)
        .map(|gap| scaled_offset_i32(gap, scale).max(0))
        .unwrap_or_else(|| scaled_i32(4, scale))
}

fn avatar_size_px_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    let size_px = layout.and_then(|layout| layout.size_px).unwrap_or(24);
    let avatar_scale = avatar_size_scale(layout);
    ((size_px as f32) * scale.clamp(0.5, 6.0) * avatar_scale)
        .round()
        .max(1.0) as i32
}

fn avatar_size_scale(layout: Option<&AvatarOperatorSurfaceLabel>) -> f32 {
    layout
        .and_then(|layout| layout.size_scale)
        .unwrap_or(1.0)
        .clamp(0.25, 6.0)
}

fn avatar_configured_size_px(layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    layout.and_then(|layout| layout.size_px).unwrap_or(24)
}

fn avatar_inspect_metrics(binding: &Binding, layout: &Layout) -> Option<AvatarInspectMetrics> {
    let avatar = binding.avatar.as_ref()?;
    if !avatar_is_renderable(avatar) {
        return None;
    }
    let avatar_layout = avatar.operator_surface_label.as_ref();
    let effective_size = avatar_size_px_for_scale(layout.label_scale, avatar_layout);
    Some(AvatarInspectMetrics {
        placement: avatar_placement(avatar),
        configured_size_px: avatar_configured_size_px(avatar_layout),
        configured_size_scale: avatar_size_scale(avatar_layout),
        effective_size_px: effective_size,
        block_height_px: avatar_block_height_for_scale(layout.label_scale, avatar_layout),
        block_width_px: avatar_padding_left_for_scale(layout.label_scale, avatar_layout)
            + effective_size
            + avatar_padding_right_for_scale(layout.label_scale, avatar_layout),
    })
}

fn avatar_padding_top_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    avatar_padding_for_scale(scale, layout.and_then(|layout| layout.padding_top_px))
}

fn avatar_padding_bottom_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    avatar_padding_for_scale(scale, layout.and_then(|layout| layout.padding_bottom_px))
}

fn avatar_padding_left_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    avatar_padding_for_scale(scale, layout.and_then(|layout| layout.padding_left_px))
}

fn avatar_padding_right_for_scale(scale: f32, layout: Option<&AvatarOperatorSurfaceLabel>) -> i32 {
    avatar_padding_for_scale(scale, layout.and_then(|layout| layout.padding_right_px))
}

fn avatar_padding_for_scale(scale: f32, padding_px: Option<i32>) -> i32 {
    padding_px
        .map(|padding| scaled_offset_i32(padding, scale).max(0))
        .unwrap_or(0)
}

fn colorref_to_rgb(color: COLORREF) -> (u32, u32, u32) {
    (
        color.0 & 0xff,
        (color.0 >> 8) & 0xff,
        (color.0 >> 16) & 0xff,
    )
}

fn rgb_to_colorref(r: u32, g: u32, b: u32) -> COLORREF {
    COLORREF(r | (g << 8) | (b << 16))
}

fn blend_channel(fg: u32, bg: u32, alpha: u32) -> u32 {
    ((fg * alpha) + (bg * (255 - alpha))) / 255
}

unsafe fn draw_label_line(
    hdc: HDC,
    text: &str,
    font: &RenderFont,
    color: COLORREF,
    mut rect: RECT,
) {
    let gdi_font = create_gdi_font(font);
    let old_font = SelectObject(hdc, gdi_font);
    let _ = SetTextColor(hdc, color);
    let mut wide = to_wide(text);
    let _ = DrawTextW(
        hdc,
        &mut wide,
        &mut rect,
        DRAW_TEXT_FORMAT(DT_RIGHT.0 | DT_VCENTER.0 | DT_SINGLELINE.0),
    );
    let _ = SelectObject(hdc, old_font);
    let _ = DeleteObject(gdi_font);
}

unsafe fn draw_panel_line(
    hdc: HDC,
    text: &str,
    font: &RenderFont,
    color: COLORREF,
    mut rect: RECT,
) {
    let gdi_font = create_gdi_font(font);
    let old_font = SelectObject(hdc, gdi_font);
    let _ = SetTextColor(hdc, color);
    let mut wide = to_wide(text);
    let _ = DrawTextW(
        hdc,
        &mut wide,
        &mut rect,
        DRAW_TEXT_FORMAT(DT_LEFT.0 | DT_VCENTER.0 | DT_SINGLELINE.0),
    );
    let _ = SelectObject(hdc, old_font);
    let _ = DeleteObject(gdi_font);
}

unsafe fn create_gdi_font(font: &RenderFont) -> windows::Win32::Graphics::Gdi::HFONT {
    let family = to_wide(&font.family);
    CreateFontW(
        -font.size_px,
        0,
        0,
        0,
        font.weight,
        0,
        0,
        0,
        DEFAULT_CHARSET.0 as u32,
        OUT_DEFAULT_PRECIS.0 as u32,
        CLIP_DEFAULT_PRECIS.0 as u32,
        CLEARTYPE_QUALITY.0 as u32,
        (DEFAULT_PITCH.0 | FF_DONTCARE.0) as u32,
        windows::core::PCWSTR(family.as_ptr()),
    )
}

unsafe extern "system" fn label_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCCREATE => {
            let createstruct = lparam.0 as *const CREATESTRUCTW;
            if !createstruct.is_null() {
                let ptr = (*createstruct).lpCreateParams as *mut LabelRender;
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, ptr as isize);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_CREATE => LRESULT(0),
        WM_NCHITTEST => LRESULT(HTCLIENT as isize),
        WM_LBUTTONDOWN => {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LabelRender;
            if !ptr.is_null() {
                let data = &*ptr;
                if data.is_panel {
                    let active_panel = ACTIVE_PANEL_HWND;
                    if active_panel == hwnd.0 {
                        ACTIVE_PANEL_HWND = null_mut();
                        ACTIVE_PANEL_OWNER = 0;
                    }
                    let _ = DestroyWindow(hwnd);
                } else {
                    toggle_label_panel(data);
                }
            }
            LRESULT(0)
        }
        WM_RBUTTONDOWN => {
            if !ACTIVE_PANEL_HWND.is_null() || ACTIVE_PANEL_OWNER != 0 {
                dismiss_active_panel();
            }
            LRESULT(0)
        }
        WM_PAINT => {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LabelRender;
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            if !ptr.is_null() {
                let data = &*ptr;
                let mut rect = RECT::default();
                let _ = GetWindowRect(hwnd, &mut rect);
                rect.right -= rect.left;
                rect.bottom -= rect.top;
                rect.left = 0;
                rect.top = 0;
                let brush = CreateSolidBrush(data.bg);
                let _ = FillRect(hdc, &rect, brush);
                let _ = DeleteObject(brush);
                let _ = SetBkMode(hdc, TRANSPARENT);
                let _ = SetTextColor(hdc, data.fg);
                draw_label_text(hdc, rect, data);
            }
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_DESTROY => {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LabelRender;
            if !ptr.is_null() {
                let _ = Box::from_raw(ptr);
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            }
            let active_panel = ACTIVE_PANEL_HWND;
            if active_panel == hwnd.0 {
                ACTIVE_PANEL_HWND = null_mut();
                ACTIVE_PANEL_OWNER = 0;
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn register_highlight_class() -> Result<()> {
    let wc = WNDCLASSW {
        hCursor: LoadCursorW(None, IDC_ARROW)?,
        lpszClassName: w!("NaradaBindHighlight"),
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(highlight_wnd_proc),
        ..Default::default()
    };
    let _ = RegisterClassW(&wc);
    Ok(())
}

unsafe fn create_highlight_window(rect: RectInfo) -> Result<HWND> {
    let hwnd = CreateWindowExW(
        WS_EX_LAYERED
            | WS_EX_TRANSPARENT
            | WS_EX_TOPMOST
            | WS_EX_TOOLWINDOW
            | WS_EX_NOACTIVATE,
        w!("NaradaBindHighlight"),
        w!("NaradaBindHighlight"),
        WS_POPUP,
        rect.left,
        rect.top,
        rect.width(),
        rect.height(),
        None,
        HMENU::default(),
        None,
        None,
    )?;
    make_layered_window_visible(hwnd);
    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    Ok(hwnd)
}

unsafe fn create_tooltip_window(label: &str, x: i32, y: i32) -> Result<HWND> {
    let render = LabelRender {
        text: label.to_string(),
        parts: None,
        avatar: None,
        bg: COLORREF(0x00A5FF),
        fg: COLORREF(0xFFFFFF),
        site_fg: COLORREF(0xFFFFFF),
        agent_fg: COLORREF(0xFFFFFF),
        role_fg: COLORREF(0xFFFFFF),
        task_fg: COLORREF(0xFFFFFF),
        site_font: RenderFont {
            family: "Segoe UI".to_string(),
            size_px: 10,
            weight: 400,
        },
        agent_font: RenderFont {
            family: "Segoe UI".to_string(),
            size_px: 12,
            weight: 600,
        },
        role_font: RenderFont {
            family: "Segoe UI".to_string(),
            size_px: 10,
            weight: 400,
        },
        task_font: RenderFont {
            family: "Segoe UI".to_string(),
            size_px: 10,
            weight: 400,
        },
        scale: 1.0,
        text_horizontal_padding_px: 8,
        operator_activity: None,
        task_affinity: None,
        panel_lines: Vec::new(),
        panel_payload: PanelPayload::fallback_for_unbound("highlight".to_string()),
        source_hwnd: 0,
        is_panel: false,
    };
    let hwnd = create_label_window(render)?;
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        x,
        y,
        280,
        44,
        SWP_NOACTIVATE | SWP_SHOWWINDOW,
    )?;
    Ok(hwnd)
}

unsafe extern "system" fn highlight_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);
            rect.right -= rect.left;
            rect.bottom -= rect.top;
            rect.left = 0;
            rect.top = 0;
            let color = COLORREF(0x00A5FF);
            let brush = CreateSolidBrush(color);
            let thickness = 3i32;
            let _ = FillRect(
                hdc,
                &RECT {
                    left: 0,
                    top: 0,
                    right: rect.right,
                    bottom: thickness,
                },
                brush,
            );
            let _ = FillRect(
                hdc,
                &RECT {
                    left: 0,
                    top: rect.bottom - thickness,
                    right: rect.right,
                    bottom: rect.bottom,
                },
                brush,
            );
            let _ = FillRect(
                hdc,
                &RECT {
                    left: 0,
                    top: 0,
                    right: thickness,
                    bottom: rect.bottom,
                },
                brush,
            );
            let _ = FillRect(
                hdc,
                &RECT {
                    left: rect.right - thickness,
                    top: 0,
                    right: rect.right,
                    bottom: rect.bottom,
                },
                brush,
            );
            let _ = DeleteObject(brush);
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
        WM_DESTROY => LRESULT(0),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe extern "system" fn mouse_hook_proc(
    n_code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if n_code < 0 {
        return CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam);
    }
    if BIND_STATE.is_null() {
        return CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam);
    }
    let state = &mut *BIND_STATE;
    if !state.active {
        return CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam);
    }
    let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
    let pt = info.pt;
    match wparam.0 as u32 {
        WM_MOUSEMOVE => {
            let cursor_pos = POINT { x: pt.x, y: pt.y };
            let hwnd_under = WindowFromPoint(cursor_pos);
            if !hwnd_under.0.is_null() {
                let root = GetAncestor(hwnd_under, GA_ROOT);
                if !root.0.is_null() {
                    let title = window_text(root);
                    let class_name = class_name(root);
                    let pid = window_pid(root);
                    let visible = IsWindowVisible(root).as_bool();
                    let minimized = IsIconic(root).as_bool();
                    let cloaked = is_cloaked(root);
                    let window_rect = get_window_rect(root).unwrap_or(RectInfo {
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                    });
                    let frame_rect = get_extended_frame(root);
                    let is_invalid = title.is_empty()
                        || !visible
                        || minimized
                        || cloaked
                        || window_rect.width() <= 1
                        || window_rect.height() <= 1
                        || class_name == "Shell_TrayWnd"
                        || class_name == "Progman"
                        || class_name == "WorkerW"
                        || class_name == "NaradaSurfaceOverlayLabel"
                        || title.starts_with("NaradaSurfaceLabel:")
                        || class_name == "NaradaBindHighlight";
                    if !is_invalid {
                        let info = WindowInfo {
                            hwnd: root.0 as isize,
                            title: title.clone(),
                            class_name,
                            process_name: String::new(),
                            pid,
                            visible,
                            minimized,
                            cloaked,
                            window_rect,
                            frame_rect,
                        };
                        state.candidate = Some(info);
                        if !state.highlight_hwnd.0.is_null() {
                            let _ = DestroyWindow(state.highlight_hwnd);
                        }
                        let rect = frame_rect.unwrap_or(window_rect);
                        if let Ok(hwnd) = create_highlight_window(rect) {
                            state.highlight_hwnd = hwnd;
                        }
                        let identity = state
                            .identities
                            .get(state.identity_index)
                            .cloned()
                            .unwrap_or_default();
                        let tooltip_text = format!(
                            "{} | Bind as: {}",
                            if title.len() > 30 {
                                format!("{}...", &title[..30])
                            } else {
                                title
                            },
                            identity
                        );
                        if let Some(old) = state.tooltip_hwnd {
                            let _ = DestroyWindow(old);
                        }
                        state.tooltip_hwnd =
                            create_tooltip_window(&tooltip_text, pt.x + 15, pt.y + 15).ok();
                    } else {
                        state.candidate = None;
                        if !state.highlight_hwnd.0.is_null() {
                            let _ = DestroyWindow(state.highlight_hwnd);
                            state.highlight_hwnd = HWND(null_mut());
                        }
                        if let Some(old) = state.tooltip_hwnd {
                            let _ = DestroyWindow(old);
                            state.tooltip_hwnd = None;
                        }
                    }
                }
            }
        }
        WM_LBUTTONDOWN => {
            if let Some(ref candidate) = state.candidate {
                let identity = state.identities[state.identity_index].clone();
                let mut runtime = if state.runtime_path.exists() {
                    let raw = fs::read_to_string(&state.runtime_path).unwrap_or_default();
                    serde_json::from_str::<RuntimeBindings>(&raw).unwrap_or_default()
                } else {
                    RuntimeBindings::default()
                };
                runtime.bindings.retain(|b| b.hwnd != candidate.hwnd);
                let mut sys = System::new_all();
                sys.refresh_all();
                let process_name = sys
                    .process(Pid::from_u32(candidate.pid))
                    .map(|p| p.name().to_string_lossy().to_string())
                    .unwrap_or_default();
                runtime.bindings.push(RuntimeBinding {
                    hwnd: candidate.hwnd,
                    identity_name: identity.clone(),
                    asserted_by: Some("window-surface-overlay-bind".to_string()),
                    assertion_method: Some("interactive_click".to_string()),
                    observed_pid: Some(candidate.pid),
                    observed_process: Some(process_stem(&process_name)),
                    observed_class: Some(candidate.class_name.clone()),
                    observed_title: Some(candidate.title.clone()),
                });
                let tmp = state.runtime_path.with_extension("tmp");
                if let Ok(json) = serde_json::to_string_pretty(&runtime) {
                    let _ = fs::write(&tmp, json);
                    let _ = fs::rename(&tmp, &state.runtime_path);
                }
                println!("Bound HWND {} to {}", candidate.hwnd, identity);
                println!("Runtime binding: {}", state.runtime_path.display());
                state.active = false;
                let _ = PostQuitMessage(0);
            }
        }
        WM_RBUTTONDOWN => {
            println!("Bind cancelled by operator (right-click)");
            state.active = false;
            let _ = PostQuitMessage(0);
        }
        WM_MOUSEWHEEL => {
            let delta = ((info.mouseData as i32) >> 16) as i16;
            if delta > 0 {
                state.identity_index =
                    (state.identity_index + 1) % state.identities.len().max(1);
            } else {
                state.identity_index = if state.identity_index == 0 {
                    state.identities.len().saturating_sub(1)
                } else {
                    state.identity_index - 1
                };
            }
            if let Some(ref candidate) = state.candidate {
                let identity = state
                    .identities
                    .get(state.identity_index)
                    .cloned()
                    .unwrap_or_default();
                let title = if candidate.title.len() > 30 {
                    format!("{}...", &candidate.title[..30])
                } else {
                    candidate.title.clone()
                };
                let tooltip_text = format!("{} | Bind as: {}", title, identity);
                if let Some(old) = state.tooltip_hwnd {
                    let _ = DestroyWindow(old);
                }
                let rect = candidate.frame_rect.unwrap_or(candidate.window_rect);
                state.tooltip_hwnd =
                    create_tooltip_window(&tooltip_text, rect.left + 10, rect.top + 10).ok();
            }
        }
        _ => {}
    }
    // Pass through mouse movement and wheel so the operator can navigate normally.
    // Only swallow left-clicks that result in a binding.
    match wparam.0 as u32 {
        WM_LBUTTONDOWN => {
            if state.candidate.is_some() {
                LRESULT(1)
            } else {
                CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam)
            }
        }
        _ => CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam),
    }
}

unsafe extern "system" fn keyboard_hook_proc(
    n_code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if n_code < 0 {
        return CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam);
    }
    if wparam.0 as u32 == WM_KEYDOWN {
        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if info.vkCode == 0x1B { // VK_ESCAPE
            if !BIND_STATE.is_null() {
                let state = &mut *BIND_STATE;
                if state.active {
                    println!("Bind cancelled by operator (Escape key)");
                    state.active = false;
                    let _ = PostQuitMessage(0);
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(HHOOK(null_mut()), n_code, wparam, lparam)
}

fn bind(cli: Cli) -> Result<()> {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    fs::create_dir_all(&cli.log_dir)?;
    let config_path = resolve_config_path(&cli.config);
    let config = load_config(&config_path)?;
    let runtime_path = config.runtime_binding_path.clone().unwrap_or_else(|| {
        PathBuf::from(
            r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-window-bindings.json",
        )
    });
    let identities: Vec<String> = config.bindings.iter().map(|b| b.surface_id.clone()).collect();
    if identities.is_empty() {
        println!("No identities declared in config");
        return Ok(());
    }
    unsafe {
        register_highlight_class()?;
        let timeout_sec = 30;
        let mut state = Box::new(BindState {
            active: true,
            hook: HHOOK(null_mut()),
            kb_hook: HHOOK(null_mut()),
            highlight_hwnd: HWND(null_mut()),
            tooltip_hwnd: None,
            candidate: None,
            identities,
            identity_index: 0,
            runtime_path,
            start_time: Instant::now(),
            timeout_sec,
        });
        state.hook = SetWindowsHookExW(
            WH_MOUSE_LL,
            Some(mouse_hook_proc),
            HINSTANCE(null_mut()),
            0,
        )?;
        state.kb_hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            HINSTANCE(null_mut()),
            0,
        )?;
        BIND_STATE = Box::into_raw(state);
        println!("WARNING: Bind mode captures mouse input. Press Escape or right-click to cancel.");
        println!("Bind mode active (timeout: {}s). Hover a window, scroll to cycle identity, left-click to bind, right-click to cancel.", timeout_sec);
        println!("Available identities:");
        for (i, id) in (&*BIND_STATE).identities.iter().enumerate() {
            println!("  [{}] {}", i, id);
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
            // Timeout check
            if !BIND_STATE.is_null() {
                let s = &*BIND_STATE;
                if s.active && s.start_time.elapsed().as_secs() >= s.timeout_sec {
                    println!("Bind mode timed out after {}s", s.timeout_sec);
                    let state_mut = &mut *BIND_STATE;
                    state_mut.active = false;
                    let _ = PostQuitMessage(0);
                }
            }
        }
        let state = Box::from_raw(BIND_STATE);
        BIND_STATE = null_mut();
        if !state.hook.0.is_null() {
            let _ = UnhookWindowsHookEx(state.hook);
        }
        if !state.kb_hook.0.is_null() {
            let _ = UnhookWindowsHookEx(state.kb_hook);
        }
        if !state.highlight_hwnd.0.is_null() {
            let _ = DestroyWindow(state.highlight_hwnd);
        }
        if let Some(tooltip) = state.tooltip_hwnd {
            let _ = DestroyWindow(tooltip);
        }
    }
    Ok(())
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn log_line(log_dir: &PathBuf, line: &str) -> Result<()> {
    fs::create_dir_all(log_dir)?;
    let path = log_dir.join("overlay.log");
    let stamp = Local::now().format("%Y-%m-%d %H:%M:%S");
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?
        .write_all(format!("{stamp} {line}\n").as_bytes())?;
    Ok(())
}

use std::io::Write;
