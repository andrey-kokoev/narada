export type AgentMenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function isAgentMenuNavigationKey(key: string): key is AgentMenuNavigationKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

/**
 * Roving focus math for the agent context menu. Disabled items are filtered
 * out by the caller before computing indices, so navigation only ever lands on
 * an enabled menuitem; Arrow keys wrap, Home/End jump to the edges.
 */
export function nextAgentMenuItemIndex(itemCount: number, activeIndex: number, key: AgentMenuNavigationKey): number {
  if (itemCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (activeIndex < 0) return key === 'ArrowUp' ? itemCount - 1 : 0;
  if (key === 'ArrowDown') return (activeIndex + 1) % itemCount;
  return (activeIndex - 1 + itemCount) % itemCount;
}

export function isAgentMenuKeyboardOpen(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
}
