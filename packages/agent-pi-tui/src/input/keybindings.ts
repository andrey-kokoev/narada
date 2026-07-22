export const PI_TUI_KEYBINDINGS = Object.freeze({
  submit: 'enter',
  cancel: 'escape',
  interrupt: 'ctrl+c',
  historyPrevious: 'up',
  historyNext: 'down',
  help: 'ctrl+g',
  operations: 'ctrl+o',
  diagnostics: 'ctrl+d',
  latest: 'ctrl+l',
});

export type PiTuiKeyBinding = keyof typeof PI_TUI_KEYBINDINGS;

