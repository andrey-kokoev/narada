export type TaskHandoffActionability = {
  status: 'actionable' | 'underspecified' | 'not_applicable';
  reason: string | null;
  repair_command: string | null;
  required_work_excerpt: string | null;
};

const PLACEHOLDER_PATTERNS = [
  /^\s*$/,
  /^\s*(?:\d+[.)]\s*)?tbd\.?\s*$/i,
  /^\s*(?:[-*]\s*)?tbd\.?\s*$/i,
  /^\s*(?:\d+[.)]\s*)?(?:to be determined|todo|placeholder)\.?\s*$/i,
];

function stripComments(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, '').trim();
}

export function classifyTaskHandoffActionability(args: {
  taskNumber: number | null;
  status?: string | null;
  requiredWork?: string | null;
}): TaskHandoffActionability {
  const status = args.status ?? null;
  if (status === 'draft' || status === 'deferred') {
    return {
      status: 'not_applicable',
      reason: `${status} task is not executable handoff work`,
      repair_command: null,
      required_work_excerpt: excerpt(args.requiredWork),
    };
  }

  if (args.requiredWork === null || args.requiredWork === undefined) {
    return {
      status: 'actionable',
      reason: null,
      repair_command: null,
      required_work_excerpt: null,
    };
  }

  const material = stripComments(args.requiredWork);
  const underspecified = PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(material));
  if (!underspecified) {
    return {
      status: 'actionable',
      reason: null,
      repair_command: null,
      required_work_excerpt: excerpt(args.requiredWork),
    };
  }

  const taskRef = args.taskNumber ?? '<task>';
  return {
    status: 'underspecified',
    reason: 'Required Work is empty or placeholder text, so this is not an actionable Builder handoff.',
    repair_command: `narada task amend ${taskRef} --required-work <actionable-work-plan>`,
    required_work_excerpt: excerpt(args.requiredWork),
  };
}

function excerpt(value: string | null | undefined): string | null {
  const material = stripComments(value ?? '');
  if (!material) return null;
  const lines = material.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 3).join('\n');
}
