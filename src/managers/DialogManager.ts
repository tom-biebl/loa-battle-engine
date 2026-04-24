interface ManagedDialog {
  render(force?: boolean): unknown;
  close(): unknown;
  readonly rendered: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DialogConstructor<T extends ManagedDialog> = new (...args: any[]) => T;

export class DialogFactory {
  static create<T extends ManagedDialog>(ctor: DialogConstructor<T>, ...args: unknown[]): T {
    return new ctor(...args);
  }
}

export class DialogManager {
  private dialogs: Map<string, ManagedDialog> = new Map();

  register<T extends ManagedDialog>(key: string, ctor: DialogConstructor<T>, ...args: unknown[]): T {
    const dialog = DialogFactory.create(ctor, ...args);
    this.dialogs.set(key, dialog);
    return dialog;
  }

  // Oeffnet den Dialog oder bringt ihn in den Vordergrund
  open(key: string): void {
    this.dialogs.get(key)?.render(true);
  }

  // Aktualisiert den Dialog nur wenn er bereits offen ist
  refresh(key: string): void {
    const dialog = this.dialogs.get(key);
    if (dialog?.rendered) dialog.render(false);
  }

  close(key: string): void {
    this.dialogs.get(key)?.close();
  }

  isOpen(key: string): boolean {
    return this.dialogs.get(key)?.rendered ?? false;
  }
}
