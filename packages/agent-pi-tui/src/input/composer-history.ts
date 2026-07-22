export class ComposerHistory {
  private readonly values: string[] = [];
  private cursor = 0;

  add(value: string): void {
    const normalized = value.trim();
    if (!normalized) return;
    if (this.values.at(-1) !== normalized) this.values.push(normalized);
    this.cursor = this.values.length;
  }

  previous(): string {
    this.cursor = Math.max(0, this.cursor - 1);
    return this.values[this.cursor] ?? '';
  }

  next(): string {
    this.cursor = Math.min(this.values.length, this.cursor + 1);
    return this.values[this.cursor] ?? '';
  }

  snapshot(): string[] {
    return [...this.values];
  }
}

