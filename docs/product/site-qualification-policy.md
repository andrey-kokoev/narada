# Site Qualification Policy

Site qualification is the governed record that a principal is allowed to perform specified work classes at a Site under current law, capability, runtime, and evidence posture.

It is not injected prompt text, chat reminder, session memory, roster presence, or operator-surface binding. Those surfaces may carry or display qualification state, but they do not create it.

Qualification answers:

```text
principal + role + Site + work_class + law_version + capability_class
  -> qualified | requalification_required | suspended | expired
```

## Authority Object

A qualification record is Site-level governance state. It should be portable as mutation evidence and inspectable before admitting governed work.

Minimal record shape:

```json
{
  "qualification_id": "qual_builder_narada_task_construction_20260501",
  "site_id": "narada",
  "principal_id": "builder",
  "role_id": "builder",
  "work_classes": ["task_construction", "test_execution_request", "repo_publication_request"],
  "law_sources": ["AGENTS.md", "SEMANTICS.md", ".ai/task-contracts/agent-task-execution.md"],
  "law_version_ref": "commit-or-law-change-id",
  "capability_classes": ["filesystem_edit", "tiz_request", "git_commit_push"],
  "competence_record_refs": ["task:1182", "verification_run:run_1777610660860_jbr3im"],
  "training_matrix_ref": "site-training-matrix:narada:builder",
  "effectiveness_check": {
    "method": "post-task evidence and defect review",
    "last_checked_at": "2026-05-01T00:00:00.000Z",
    "result": "effective"
  },
  "status": "qualified",
  "issued_by": "operator-or-site-governance",
  "issued_at": "2026-05-01T00:00:00.000Z",
  "expires_at": null,
  "requalification_triggers": ["law_change", "new_capability_class", "repeated_defect"]
}
```

The record is intentionally about admitted work classes, not the whole person or agent. A principal can remain qualified to inspect and report while being blocked from publication, effect execution, review admission, or sensitive task construction.

## State Machine

| State | Meaning | Admission effect |
| --- | --- | --- |
| `qualified` | Current evidence supports this principal performing this work class. | Admit if other gates pass. |
| `requalification_required` | A trigger invalidated some part of the old qualification. | Block only affected governed work classes. |
| `suspended` | Defect, incident, or Operator decision pauses the qualification. | Block affected governed work classes until restored. |
| `expired` | Time or inactivity expired the qualification. | Block affected governed work classes until renewed. |
| `retired` | The role/work class is no longer used at the Site. | Do not admit new work through this qualification. |

Qualification is not a universal activity gate. If Builder qualification for `repo_publication_request` expires, Builder may still inspect tasks, run read-only status checks, or submit an observation if those work classes remain qualified.

## Competence Record

A competence record is evidence that the principal has successfully performed or practiced a work class under the current regime.

Allowed evidence:

- completed task evidence with accepted criteria;
- TIZ/CEIZ verification runs tied to task or capability class;
- review-admitted work result reports;
- law receipt absorption records for relevant law changes;
- incident recovery or nonconforming-work closure records;
- Operator-issued training/admission records.

Prompt statements such as "you are builder" are not competence records.

## Training Matrix

A Site training matrix maps roles to required work classes, law sources, capability classes, and evidence.

Example:

| Role | Work class | Required law | Required evidence | Requalification trigger |
| --- | --- | --- | --- | --- |
| Builder | `task_construction` | Agent task execution contract | one recent closed task with complete evidence | law change, repeated defect, inactivity |
| Builder | `test_execution_request` | TIZ doctrine | one successful TIZ-linked verification | TIZ command change, repeated timeout misuse |
| Architect | `task_specification` | Site governance coordinates | accepted task/chapter spec | law change, role change |
| Observer | `coherence_observation` | Observer role doctrine | accepted observation without mutation | role change, boundary violation |

The matrix is not a training course. It is a local admission map from work class to required proof.

## Requalification Triggers

Requalification must be considered when any of these occurs:

- law change affecting the role, Site, work class, crossing, or evidence regime;
- role change, rename, expansion, or contraction;
- inactivity beyond Site policy;
- repeated defect, evidence rejection, rollback, or nonconforming work;
- new capability class such as secrets, external effect execution, publication, MCP execution, or daemon control;
- sensitive work classification such as credential access, external send, authority migration, or Site lifecycle transformation;
- every N completed tasks, where N is Site policy and may vary by role/work class;
- change impact assessment identifies affected work classes after a doctrine, command, schema, or runtime change;
- Operator suspension or incident response.

Law receipt and qualification are related but distinct. `LawPropagationReceipt` proves the principal saw or absorbed a law change. Qualification decides whether that receipt plus other competence evidence is sufficient to admit a governed work class.

## Change Impact Assessment

Every law, command, capability, runtime, or task-contract change should answer:

| Question | Output |
| --- | --- |
| Which Sites are affected? | Site IDs or locus classes. |
| Which roles are affected? | Role IDs/classes. |
| Which work classes are affected? | `task_construction`, `repo_publication_request`, etc. |
| Is a law receipt enough? | yes/no plus reason. |
| Is requalification required? | affected qualification IDs or classes. |
| Is a release gate required? | release gate ID or "none". |

If the answer is unknown, the safe state is `requalification_required` for the affected governed work class, not global agent paralysis.

## Nonconforming Work

Nonconforming work is work performed without the required qualification, with stale qualification, outside role boundary, or against superseded law.

It must be recorded as evidence, not hidden as chat correction. A nonconforming-work record should include:

- principal, role, Site, and work class;
- violated qualification or missing record;
- affected artifact or command;
- immediate containment;
- corrective action;
- whether prior outputs need review, rollback, or re-admission;
- whether qualification becomes `suspended` or `requalification_required`.

Nonconforming work does not imply the principal is globally unusable. It scopes remediation to the affected Site/work class.

## Effectiveness Check

Qualification is not complete at issuance. Site governance should periodically check effectiveness:

- did the principal complete admitted work without recurrence of the defect that caused training;
- did TIZ/CEIZ evidence show correct command discipline;
- did reviews find repeated doctrine or authority-boundary errors;
- did Operator corrections decrease after qualification;
- did release gates catch the intended class of failure.

Effectiveness checks can be sampled. They should become mandatory after repeated defects, sensitive-work expansion, or incident recovery.

## Release Gate

A release gate is a qualification-aware admission gate before a governed mutation or publication.

Examples:

- require current `repo_publication_request` qualification before `git push` on Narada proper;
- require `secret_capability_operation` qualification before any command that touches credential references;
- require `site_lifecycle_transformation` qualification before clone, absorb, migrate, or archive commands;
- require `review_admission` qualification before accepting another principal's evidence.

Release gates should block only the affected work class and should return the exact missing qualification, requalification trigger, and repair path.

## Commands

Current read-only inspection commands:

```bash
narada qualification status --agent builder --role builder --work-class task_construction --format json
narada qualification effectiveness-check --agent builder --role builder --work-class task_construction --format json
```

Git-visible record mutation commands:

```bash
narada qualification record-add --agent builder --role builder --site narada --work-class task_construction --law-sources AGENTS.md,SEMANTICS.md --evidence task:1184 --issuer operator --admitted-by operator --effectiveness-interval 10
narada qualification effectiveness-record --agent builder --role builder --work-class task_construction --result pass --checked-by architect --evidence verification_run:<run-id>
narada qualification effectiveness-record --agent builder --role builder --work-class task_construction --result fail --checked-by architect --evidence review:<review-id> --escalation-command "narada inbox submit --kind task_candidate --topic 'CAPA for builder qualification'"
```

These commands write `.ai/site-qualification.json`, a Git-visible mutation artifact. They do not treat prompt text, chat history, or roster membership as authority.

Law receipt and absorption commands remain under the law surface:

```bash
narada law ack <change-id> --agent builder --role builder --status acknowledged
narada law ack <change-id> --agent builder --role builder --status absorbed
```

Duty-loop and work-next output should return one of these exact commands when qualification blocks a governed work class.

## Relationship To Existing Narada Surfaces

| Surface | Relationship |
| --- | --- |
| [`LawPropagationReceipt`](../concepts/law-change-propagation.md) | Receipt is input evidence. It does not grant qualification by itself. |
| [`AgentWorkDutyLoop`](../concepts/situated-work-discovery-advancement-intent.md#agent-work-duty-loop-state) | Duty-loop state should surface qualification blockers before suggesting new governed work. |
| [`Site Governance Coordinates`](site-governance-coordinates.md) | Coordinates should declare where qualification records live and which work classes are governed. |
| Operator Surface binding | Binding can display qualification state, but focus/window identity is not qualification. |
| Roster/task claim | A claim can require qualification, but a claim does not create competence. |
| TIZ/CEIZ | Verification runs and command execution results can be competence evidence. |

## Operational Rule

When an agent enters a fresh Site, "you are Architect/Builder and we are governed by Narada law" should resolve to:

1. role identity and Site governance coordinates;
2. applicable law receipts;
3. qualification records for the requested work class;
4. duty-loop admission result.

If any part is missing, the agent may inspect and report the missing qualification path. It must not infer qualification from prompt confidence, session warmth, or prior chat memory.
