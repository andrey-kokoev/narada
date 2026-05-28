import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  activeAdmittedDirectives,
  admitDirective,
  createDirective,
  directiveEvent,
  markDirectiveDelivered,
  refuseDirective,
  renderDirectivePromptContext,
  type Directive,
  type DirectiveDraft,
  type DirectiveEvent,
  type DirectiveTarget,
} from "./index.js";

export interface DirectiveStoreSnapshot {
  readonly schema: "narada.directive-store.snapshot.v1";
  readonly directives: Directive[];
}

export interface FileDirectiveStorePaths {
  readonly storePath: string;
  readonly eventLogPath: string;
}

export class FileDirectiveStore {
  readonly paths: FileDirectiveStorePaths;

  constructor(readonly siteRoot: string) {
    const root = resolve(siteRoot, ".narada", "directives");
    this.paths = {
      storePath: resolve(root, "directives.json"),
      eventLogPath: resolve(root, "events.jsonl"),
    };
  }

  list(): Directive[] {
    return this.readSnapshot().directives;
  }

  active(target: Partial<DirectiveTarget> = {}, nowIso = new Date().toISOString()): Directive[] {
    return activeAdmittedDirectives(this.list(), nowIso)
      .filter((directive) => !target.kind || directive.target.kind === target.kind)
      .filter((directive) => !target.id || directive.target.id === target.id);
  }

  renderPromptContext(target: Partial<DirectiveTarget> = {}, nowIso = new Date().toISOString()): string {
    return renderDirectivePromptContext(this.active(target, nowIso));
  }

  createAndAdmit(draft: DirectiveDraft, actor: string, reason = "directive_admitted_by_store"): Directive {
    const created = createDirective(draft);
    const admitted = admitDirective(created, {
      decided_at: new Date().toISOString(),
      decided_by: actor,
      reason,
    });
    this.upsert(admitted, [
      directiveEvent(created, {
        kind: "directive.created",
        occurred_at: created.created_at,
        actor,
      }),
      directiveEvent(admitted, {
        kind: "directive.admitted",
        occurred_at: admitted.admission.decided_at ?? new Date().toISOString(),
        actor,
        reason,
      }),
    ]);
    return admitted;
  }

  refuse(directiveId: string, actor: string, reason: string): Directive {
    const directive = this.requireDirective(directiveId);
    const refused = refuseDirective(directive, {
      decided_at: new Date().toISOString(),
      decided_by: actor,
      reason,
    });
    this.upsert(refused, [directiveEvent(refused, {
      kind: "directive.refused",
      occurred_at: refused.admission.decided_at ?? new Date().toISOString(),
      actor,
      reason,
    })]);
    return refused;
  }

  markDelivered(directiveId: string, actor: string, transport: string, artifactRef?: string): Directive {
    const deliveredAt = new Date().toISOString();
    const directive = markDirectiveDelivered(this.requireDirective(directiveId), {
      delivered_at: deliveredAt,
      transport,
      artifact_ref: artifactRef,
    });
    this.upsert(directive, [directiveEvent(directive, {
      kind: "directive.delivered",
      occurred_at: deliveredAt,
      actor,
      artifact_ref: artifactRef,
    })]);
    return directive;
  }

  private requireDirective(directiveId: string): Directive {
    const directive = this.list().find((entry) => entry.directive_id === directiveId);
    if (!directive) throw new Error(`directive_not_found:${directiveId}`);
    return directive;
  }

  private upsert(directive: Directive, events: DirectiveEvent[]): void {
    const snapshot = this.readSnapshot();
    const index = snapshot.directives.findIndex((entry) => entry.directive_id === directive.directive_id);
    const directives = [...snapshot.directives];
    if (index >= 0) directives[index] = directive;
    else directives.push(directive);
    this.writeSnapshot({ schema: "narada.directive-store.snapshot.v1", directives });
    this.appendEvents(events);
  }

  private readSnapshot(): DirectiveStoreSnapshot {
    if (!existsSync(this.paths.storePath)) {
      return { schema: "narada.directive-store.snapshot.v1", directives: [] };
    }
    const parsed = JSON.parse(readFileSync(this.paths.storePath, "utf8")) as Partial<DirectiveStoreSnapshot>;
    return {
      schema: "narada.directive-store.snapshot.v1",
      directives: Array.isArray(parsed.directives) ? parsed.directives : [],
    };
  }

  private writeSnapshot(snapshot: DirectiveStoreSnapshot): void {
    mkdirSync(dirname(this.paths.storePath), { recursive: true });
    writeFileSync(this.paths.storePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  private appendEvents(events: DirectiveEvent[]): void {
    mkdirSync(dirname(this.paths.eventLogPath), { recursive: true });
    for (const event of events) {
      appendFileSync(this.paths.eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
    }
  }
}
