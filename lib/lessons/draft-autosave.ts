export type DraftAutosaveStatus = "saving" | "saved" | "error";

type DraftAutosaveOptions<Snapshot> = {
  capture: () => Snapshot;
  save: (snapshot: Snapshot) => Promise<boolean>;
  onStatus: (status: DraftAutosaveStatus) => void;
  onSaved: (snapshot: Snapshot) => void;
  idleMs?: number;
  maxWaitMs?: number;
  retryMs?: number;
};

/** Keeps one draft write in flight and sends the newest edit after it settles. */
export class LessonDraftAutosave<Snapshot> {
  private readonly idleMs: number;
  private readonly maxWaitMs: number;
  private readonly retryMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private firstUnsavedEditAt: number | null = null;
  private revision = 0;
  private savedRevision = 0;
  private suspended = false;
  private disposed = false;

  constructor(private readonly options: DraftAutosaveOptions<Snapshot>) {
    this.idleMs = options.idleMs ?? 1_500;
    this.maxWaitMs = options.maxWaitMs ?? 5_000;
    this.retryMs = options.retryMs ?? 5_000;
  }

  edited() {
    if (this.suspended || this.disposed) return;
    this.revision += 1;
    this.firstUnsavedEditAt ??= Date.now();
    this.options.onStatus("saving");
    this.schedule();
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    const remaining = this.firstUnsavedEditAt === null
      ? this.idleMs
      : Math.min(this.idleMs, Math.max(0, this.firstUnsavedEditAt + this.maxWaitMs - Date.now()));
    this.timer = setTimeout(() => void this.flush(), remaining);
  }

  private flush(): Promise<void> {
    this.clearTimer();
    if (this.disposed || this.suspended || this.inFlight || this.revision === this.savedRevision) {
      return this.inFlight ?? Promise.resolve();
    }

    const revision = this.revision;
    const snapshot = this.options.capture();
    this.firstUnsavedEditAt = null;
    this.options.onStatus("saving");
    const request = (async () => {
      let saved = false;
      try {
        saved = await this.options.save(snapshot);
      } catch {
        saved = false;
      }

      if (saved) {
        this.savedRevision = revision;
        if (this.revision === revision) {
          this.options.onSaved(snapshot);
          if (!this.disposed) this.options.onStatus("saved");
        }
      } else if (this.revision === revision && !this.disposed && !this.suspended) {
        this.options.onStatus("error");
      }
    })();
    this.inFlight = request;
    void request.finally(() => {
      this.inFlight = null;
      if (this.disposed || this.suspended || this.revision === this.savedRevision) return;
      if (this.revision !== revision) {
        void this.flush();
      } else {
        this.timer = setTimeout(() => void this.flush(), this.retryMs);
      }
    });
    return request;
  }

  /** Waits for an older autosave before a form action sends the current draft. */
  async prepareForFormAction() {
    this.suspended = true;
    this.clearTimer();
    await this.inFlight;
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }
}
