# Narada As A System

Narada is a deterministic state compiler and governed execution runtime.

It turns external deltas into durable facts, forms contexts and work, invokes policy/charter evaluation, creates durable intents, executes side effects through workers, confirms effects through observation, and exposes read-only operational views.

```mermaid
flowchart TD
  subgraph External["External Systems"]
    Graph["Microsoft Graph / Exchange"]
    Timer["Timers"]
    Webhook["Webhooks"]
    Filesystem["Filesystem"]
    ProcessEnv["Process Environment"]
  end

  subgraph Sources["Vertical Sources"]
    MailboxSource["Mailbox Source"]
    TimerSource["Timer Source"]
    WebhookSource["Webhook Source"]
    FilesystemSource["Filesystem Source"]
  end

  subgraph Compiler["Deterministic State Compiler"]
    Delta["Remote Delta"]
    Normalize["Normalize"]
    Facts["Durable Facts"]
    Projectors["Projectors / Read Models"]
    Contexts["Context Formation"]
  end

  subgraph Control["Control Plane"]
    Foreman["Foreman<br>opens/resolves work"]
    Scheduler["Scheduler<br>leases/runs work"]
    WorkItems["Work Items"]
    Attempts["Execution Attempts"]
    Policies["Runtime Policy"]
  end

  subgraph Charters["Charter Domain"]
    Envelopes["Invocation Envelopes"]
    Runners["Charter Runners"]
    Tools["Tool Catalog / Tool Runner"]
    Evaluations["Evaluation Outputs"]
  end

  subgraph Intent["Durable Intent And Execution"]
    Handoff["Intent / Outbound Handoff"]
    Commands["Outbound Commands"]
    Workers["Workers<br>mail/process/future"]
    Reconciler["Reconciler / Confirmation"]
  end

  subgraph Ops["Operator Surfaces"]
    CLI["CLI"]
    Daemon["Daemon"]
    OpsKit["Ops Kit"]
    Observation["Observation API / UI"]
    Config["Ops Repo Config"]
  end

  Graph --> MailboxSource
  Timer --> TimerSource
  Webhook --> WebhookSource
  Filesystem --> FilesystemSource

  MailboxSource --> Delta
  TimerSource --> Delta
  WebhookSource --> Delta
  FilesystemSource --> Delta

  Delta --> Normalize --> Facts --> Projectors
  Facts --> Contexts --> Foreman

  Config --> Policies
  Policies --> Foreman
  Foreman --> WorkItems
  WorkItems --> Scheduler --> Attempts
  Attempts --> Envelopes --> Runners
  Runners --> Tools
  Tools --> ProcessEnv
  Runners --> Evaluations --> Foreman

  Foreman --> Handoff --> Commands --> Workers
  Workers --> Graph
  Workers --> ProcessEnv
  Workers --> Reconciler
  Reconciler --> Facts

  CLI --> Config
  OpsKit --> Config
  Daemon --> Scheduler
  Daemon --> Workers
  Projectors --> Observation
  Observation --> CLI
```

## Authority Boundaries

```mermaid
flowchart LR
  Facts["Facts<br>canonical durable input"] --> Foreman["Foreman<br>work authority"]
  Foreman --> Scheduler["Scheduler<br>lease authority"]
  Scheduler --> Runtime["Charter Runtime<br>read-only evaluation"]
  Runtime --> Foreman
  Foreman --> Handoff["Handoff<br>intent creation authority"]
  Handoff --> Worker["Worker<br>effect authority"]
  Worker --> Reconciler["Reconciler<br>confirmation authority"]
  Reconciler --> Facts

  Observation["Observation<br>read-only"] -. no writes .-> Facts
  Observation -. no writes .-> Foreman
  Observation -. no writes .-> Handoff
```

## Runtime Interaction

```mermaid
sequenceDiagram
  autonumber
  participant Source as External Source
  participant Inbound as Source Adapter
  participant Compiler as State Compiler
  participant Store as Durable Store
  participant Foreman as Foreman
  participant Scheduler as Scheduler
  participant Charter as Charter Runtime
  participant Handoff as Intent Handoff
  participant Worker as Worker
  participant Reconciler as Reconciler
  participant Observer as Observation API / CLI

  Source->>Inbound: expose delta / event / webhook / timer tick
  Inbound->>Compiler: fetch and normalize delta
  Compiler->>Store: append facts and update projections
  Store-->>Compiler: commit accepted
  Compiler->>Foreman: admit formed contexts
  Foreman->>Store: open work_item rows
  Scheduler->>Store: claim runnable work lease
  Scheduler->>Charter: invoke with read-only envelope
  Charter-->>Scheduler: return evaluation
  Scheduler->>Store: persist execution attempt and evaluation
  Scheduler->>Foreman: submit evaluation for resolution
  Foreman->>Handoff: create durable intent / outbound command
  Handoff->>Store: persist command and version atomically
  Worker->>Store: claim executable command
  Worker->>Source: perform side effect
  Worker->>Store: mark submitted / retry / failed
  Reconciler->>Source: observe side-effect result
  Reconciler->>Store: confirm command or create retry/residual state
  Observer->>Store: read facts, work, intents, health, views
  Store-->>Observer: read-only operational view
```

## Operator Interaction

```mermaid
sequenceDiagram
  autonumber
  participant User as Operator
  participant CLI as narada CLI / ops-kit
  participant Repo as Ops Repo
  participant Daemon as Daemon
  participant Runtime as Control Plane Runtime
  participant View as Observation / Health

  User->>CLI: narada init-repo <path>
  CLI->>Repo: create config, scripts, directories
  User->>CLI: want-mailbox / want-workflow
  CLI->>Repo: write operation declaration
  User->>CLI: want-posture <operation> <preset>
  CLI->>Repo: write runtime policy
  User->>CLI: setup + preflight
  CLI->>Repo: verify directories, credentials, policy
  User->>CLI: activate <operation>
  CLI->>Repo: mark operation live
  User->>Daemon: pnpm daemon
  Daemon->>Repo: load config and policies
  Daemon->>Runtime: run sync, scheduler, workers, reconciler
  Runtime->>View: publish health and read models
  User->>CLI: status / inspect / explain
  CLI->>View: read observation state
  View-->>User: current operational picture
```

## Concept Map

```mermaid
flowchart TD
  Operation["Operation<br>user-facing thing to run"] --> Scope["Scope<br>internal compiled boundary"]
  Scope --> Source["Source<br>external delta producer"]
  Source --> Fact["Fact<br>canonical durable input"]
  Fact --> Context["Context<br>formed work-relevant situation"]
  Context --> WorkItem["work_item<br>schedulable control unit"]

  WorkItem --> Lease["Lease<br>scheduler authority"]
  Lease --> Attempt["execution_attempt<br>bounded charter invocation"]
  Attempt --> Envelope["CharterInvocationEnvelope<br>read-only runtime input"]
  Envelope --> Evaluation["Evaluation<br>charter output"]
  Evaluation --> ForemanDecision["Foreman Decision<br>resolve / hand off / residual"]

  ForemanDecision --> Intent["Intent / outbound handoff<br>durable effect boundary"]
  Intent --> Command["Command<br>worker-mutable effect record"]
  Command --> Worker["Worker<br>only effect executor"]
  Worker --> Confirmation["Confirmation<br>observed side-effect result"]
  Confirmation --> Fact

  Fact --> Projection["Projection / View"]
  WorkItem --> Projection
  Command --> Projection
  Projection --> Observation["Observation<br>read-only operator surface"]

  Charter["Charter<br>policy/evaluation role"] --> Envelope
  RuntimePolicy["Runtime Policy<br>routing, posture, tools"] --> WorkItem
  RuntimePolicy --> Intent
```

## Work And Outbound Lifecycles

```mermaid
stateDiagram-v2
  [*] --> opened
  opened --> leased: scheduler claims
  leased --> executing: runtime starts
  executing --> resolved: foreman accepts evaluation
  executing --> failed_retryable: retryable failure
  failed_retryable --> opened: retry due
  executing --> failed_terminal: terminal failure
  leased --> opened: stale lease recovered
  resolved --> [*]
  failed_terminal --> [*]
```

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> draft_creating: worker claims send intent
  draft_creating --> draft_ready: Graph draft created
  draft_ready --> sending: policy allows send
  sending --> submitted: Graph accepts send
  submitted --> confirmed: reconciler observes result

  pending --> failed_terminal: invalid command / policy hard fail
  draft_creating --> failed_terminal: managed draft conflict
  draft_ready --> failed_terminal: external draft mutation
  sending --> retry_wait: ambiguous or retryable failure
  retry_wait --> pending: retry due

  confirmed --> [*]
  failed_terminal --> [*]
```

## Narada And narada.usc Boundary

```mermaid
flowchart LR
  subgraph Theory["Theory"]
    Thoughts["thoughts<br>USC / PDA / CIS concepts"]
  end

  subgraph Constructor["narada.usc"]
    UscCli["USC CLI"]
    UscCore["Core schemas / model"]
    UscCompiler["Compiler / templates"]
    UscPolicies["Policies, including CIS"]
  end

  subgraph Constructed["Constructed Systems"]
    AppRepo["narada.usc.<system><br>USC-governed repo"]
    UscArtifacts["usc/<br>construction-state<br>task graph<br>cycles<br>reviews<br>residuals"]
    ProductCode["product / operation code"]
  end

  subgraph Runtime["Narada"]
    OpsRepo["ops repo<br>config and operations"]
    ControlPlane["control plane"]
    Daemon["daemon"]
    Workers["workers"]
    Observation2["observation"]
  end

  Thoughts --> UscCore
  UscCli --> UscCompiler
  UscCompiler --> AppRepo
  UscCore --> UscArtifacts
  UscPolicies --> UscArtifacts
  AppRepo --> UscArtifacts
  AppRepo --> ProductCode

  UscArtifacts -. future compile .-> OpsRepo
  ProductCode -. may target .-> OpsRepo
  OpsRepo --> Daemon --> ControlPlane --> Workers
  ControlPlane --> Observation2
```

## Package View

```mermaid
flowchart TD
  CLI["@narada2/cli"] --> Control["@narada2/control-plane"]
  Daemon["@narada2/daemon"] --> Control
  OpsKit["@narada2/ops-kit"] --> CLI
  Charters["@narada2/charters"] --> Control
  Mailbox["@narada2/mailbox"] --> Control
  Search["@narada2/search"] --> Control

  Control --> KernelDocs["Kernel lawbook and schemas"]
  Daemon --> UI["Operator UI / Observation routes"]
  OpsKit --> OpsRepo["Ops repo scaffolding"]
```
