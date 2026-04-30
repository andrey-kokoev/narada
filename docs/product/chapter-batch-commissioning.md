# Chapter Batch Commissioning

`narada chapter commission` is the preferred path when an Architect needs to create a coherent chapter plus multiple ordered tasks.

It exists to avoid manual chapter file creation, repeated `task create` calls, comma-sensitive shell criteria, and high-volume lifecycle inspection during normal commissioning.

## Command

```bash
narada chapter commission --input chapter.json --format json
```

Input is a structured JSON file:

```json
{
  "slug": "operator-surface-maturity",
  "title": "Operator Surface Maturity",
  "depends_on": [],
  "tasks": [
    {
      "title": "Preserve criteria arrays",
      "goal": "Create the first task.",
      "acceptance_criteria": [
        "Comma-containing text such as Smith, Jane remains one criterion"
      ]
    }
  ]
}
```

## Posture

- Task numbers are allocated through the sanctioned task-number authority.
- Child tasks receive SQLite lifecycle and task spec rows.
- Criteria are arrays, not comma-sensitive CLI text.
- Output is bounded: chapter path, task numbers, task ids, lifecycle statuses, and the next lifecycle export command.
- Invalid input fails before allocation and file creation.

After successful commissioning, export portable lifecycle state:

```bash
narada task lifecycle export --output .ai/task-lifecycle-snapshot.json
```
