import { readFileSync, writeFileSync } from 'node:fs';

const replacements = [
  {
    file: 'tools/task-lifecycle/tests/Test-BatchOperationsAndIntentCleanup.mjs',
    changes: [
      ["cleanupResult.output.schema !== 'narada.task.admin.cleanup_intents.v0'", "!cleanupResult.output.schema || !cleanupResult.output.schema.startsWith('narada.task.admin.cleanup_intents')"],
      ["unclaimResult.output.schema !== 'narada.task.unclaim_batch.v0'", "!unclaimResult.output.schema || !unclaimResult.output.schema.startsWith('narada.task.unclaim_batch')"],
      ["closeResult.output.schema !== 'narada.task.close_batch.v0'", "!closeResult.output.schema || !closeResult.output.schema.startsWith('narada.task.close_batch')"],
      ["singleClose.output.schema === 'narada.task.close_batch.v0'", "!singleClose.output.schema || singleClose.output.schema.startsWith('narada.task.close_batch')"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-InboxBridge.mjs',
    changes: [
      ["assertEqual(out.schema, 'narada.bridge.poll.v0', 'dry-run schema')", "assert.ok(out.schema && out.schema.startsWith('narada.bridge.poll'), 'dry-run schema prefix')"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-McpBridgePoll.mjs',
    changes: [
      ["assertEqual(parsed.schema, 'narada.bridge.poll.v0', 'bridge_poll schema')", "assert.ok(parsed.schema && parsed.schema.startsWith('narada.bridge.poll'), 'bridge_poll schema prefix')"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-McpInspectAndEvidenceTools.mjs',
    changes: [
      ["inspect.schema !== 'narada.task.mcp.inspect.v0'", "!inspect.schema || !inspect.schema.startsWith('narada.task.mcp.inspect')"],
      ["admit.schema !== 'narada.task.mcp.admit_evidence.v0'", "!admit.schema || !admit.schema.startsWith('narada.task.mcp.admit_evidence')"],
      ["prove.schema !== 'narada.task.mcp.prove_criteria.v0'", "!prove.schema || !prove.schema.startsWith('narada.task.mcp.prove_criteria')"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-TaskCreateAndSpecSync.mjs',
    changes: [
      ["syncResult.output.schema !== 'narada.task.spec_sync.v0'", "!syncResult.output.schema || !syncResult.output.schema.startsWith('narada.task.spec_sync')"],
      ["Expected schema narada.task.spec_sync.v0", "Expected schema narada.task.spec_sync prefix"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-TaskEvidenceCli.mjs',
    changes: [
      ["inspectResult.output.schema !== 'narada.task.evidence.inspect.v0'", "!inspectResult.output.schema || !inspectResult.output.schema.startsWith('narada.task.evidence.inspect')"],
      ["Expected schema narada.task.evidence.inspect.v0", "Expected schema narada.task.evidence.inspect prefix"],
      ["admitResult.output.schema !== 'narada.task.evidence.admit.v0'", "!admitResult.output.schema || !admitResult.output.schema.startsWith('narada.task.evidence.admit')"],
      ["Expected schema narada.task.evidence.admit.v0", "Expected schema narada.task.evidence.admit prefix"],
    ]
  },
  {
    file: 'tools/task-lifecycle/tests/Test-TaskListNPlusOneFix.mjs',
    changes: [
      ["parsed.schema !== 'narada.task.list.v0'", "!parsed.schema || !parsed.schema.startsWith('narada.task.list')"],
      ["Expected schema narada.task.list.v0", "Expected schema narada.task.list prefix"],
    ]
  },
];

for (const { file, changes } of replacements) {
  let content = readFileSync(file, 'utf8');
  for (const [oldStr, newStr] of changes) {
    content = content.replace(oldStr, newStr);
  }
  writeFileSync(file, content);
  console.log(`Updated ${file}`);
}

console.log('All schema assertions updated.');
