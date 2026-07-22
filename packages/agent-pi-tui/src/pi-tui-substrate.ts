import type { PiTuiApp } from './app.js';
import { createSlashAutocompleteProvider } from './input/slash-command.js';

export interface PiTuiComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput?(data: string): void;
}

export interface PiTuiHost {
  addChild(component: PiTuiComponent): void;
  setFocus?(component: PiTuiComponent): void;
  addInputListener?(listener: (data: string) => void): void;
  requestRender(): void;
  start(): void;
  stop(): void;
}

export interface PiTuiSubstrate {
  TUI: new (terminal: unknown) => PiTuiHost;
  ProcessTerminal: new () => unknown;
  Editor?: new (tui: PiTuiHost, theme: unknown, options?: unknown) => PiTuiComponent & {
    onSubmit?: (value: string) => void;
    onChange?: (value: string) => void;
    setAutocompleteProvider?: (provider: unknown) => void;
    addToHistory?: (value: string) => void;
    setText?: (value: string) => void;
    setValue?: (value: string) => void;
  };
}

const PI_TUI_MODULE_NAME = '@earendil-works/pi-tui';

export async function loadPiTuiSubstrate(): Promise<PiTuiSubstrate> {
  // Keep this as a presentation-only dynamic import. In particular, do not
  // import a Pi coding-agent runtime or any other Pi runtime package here.
  const moduleName: string = PI_TUI_MODULE_NAME;
  try {
    return await import(moduleName) as unknown as PiTuiSubstrate;
  } catch (error) {
    throw new Error(`pi_tui_substrate_unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function editorTheme(): Record<string, unknown> {
  const passthrough = (text: string) => text;
  return {
    borderColor: passthrough,
    selectList: {
      selectedPrefix: passthrough,
      selectedText: passthrough,
      description: passthrough,
      scrollInfo: passthrough,
      noMatch: passthrough,
    },
  };
}

function projectionComponent(app: PiTuiApp, getViewportRows: () => number | undefined): PiTuiComponent {
  return {
    render: (width) => {
      const rows = getViewportRows();
      if (rows !== undefined) app.setViewportRows(rows);
      return app.renderLines(width, false);
    },
    invalidate: () => undefined,
    handleInput: (data) => app.handleInput(data),
  };
}

export async function runPiTuiApp(app: PiTuiApp): Promise<void> {
  const substrate = await loadPiTuiSubstrate();
  const terminal = new substrate.ProcessTerminal();
  const tui = new substrate.TUI(terminal);
  const root = projectionComponent(app, () => {
    const candidate = (tui as unknown as { terminal?: { rows?: number } }).terminal?.rows;
    return typeof candidate === 'number' ? candidate : undefined;
  });
  tui.addChild(root);
  tui.addInputListener?.((data) => {
    if (data.includes('\u0003')) void app.detach();
  });
  const unsubscribeRender = app.onRender(() => tui.requestRender());
  let editor: (PiTuiComponent & { onSubmit?: (value: string) => void; onChange?: (value: string) => void; setAutocompleteProvider?: (provider: unknown) => void; addToHistory?: (value: string) => void; setText?: (value: string) => void; setValue?: (value: string) => void }) | null = null;
  if (substrate.Editor) {
    editor = new substrate.Editor(tui, editorTheme(), { paddingX: 1 });
    editor.setAutocompleteProvider?.(createSlashAutocompleteProvider());
    editor.onSubmit = (value) => { void app.submit(value); editor?.addToHistory?.(value); editor?.setText?.(''); editor?.setValue?.(''); };
    editor.onChange = (value) => app.state.setDraft(value);
    tui.addChild(editor);
    tui.setFocus?.(editor);
  } else {
    tui.addInputListener?.((data) => app.handleInput(data));
  }
  tui.start();
  try {
    await app.waitForExit();
  } finally {
    unsubscribeRender();
    tui.stop();
    app.dispose();
  }
}
