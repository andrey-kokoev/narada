/**
 * Custom Help formatter for Commander.js that renders commands
 * with semantic group headers.
 *
 * This addresses the flat-list limitation of Commander's default help output
 * by injecting category headers between command groups.
 */

import { Help } from 'commander';

export interface CommandGroup {
  label: string;
  commands: string[];
}

export const DEFAULT_COMMAND_GROUPS: CommandGroup[] = [
  {
    label: 'Runtime',
    commands: ['sync', 'cycle', 'integrity', 'status'],
  },
  {
    label: 'Task Governance',
    commands: ['task', 'chapter'],
  },
  {
    label: 'Posture & Loop',
    commands: ['posture', 'construction-loop', 'verify'],
  },
  {
    label: 'Site & Console',
    commands: ['sites', 'console', 'workbench'],
  },
  {
    label: 'Operator',
    commands: ['ops', 'doctor', 'audit', 'principal'],
  },
  {
    label: 'Setup & Bootstrap',
    commands: [
      'init',
      'init-repo',
      'demo',
      'setup',
      'preflight',
      'inspect',
      'explain',
      'activate',
      'want-mailbox',
      'want-workflow',
      'want-posture',
    ],
  },
  {
    label: 'Maintenance & Recovery',
    commands: [
      'rebuild-projections',
      'backup',
      'restore',
      'backup-verify',
      'backup-ls',
      'cleanup',
      'derive-work',
      'preview-work',
      'confirm-replay',
      'recover',
      'retry-auth-failed',
      'acknowledge-alert',
    ],
  },
  {
    label: 'Draft & Outbound',
    commands: [
      'drafts',
      'show-draft',
      'approve-draft-for-send',
      'reject-draft',
      'mark-reviewed',
      'handled-externally',
    ],
  },
  {
    label: 'Inspection',
    commands: ['show', 'select', 'crossing'],
  },
  {
    label: 'Deprecated',
    commands: ['rebuild-views'],
  },
];

/**
 * Build a lookup map from command name to group label.
 */
function buildGroupMap(groups: CommandGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const cmd of group.commands) {
      map.set(cmd, group.label);
    }
  }
  return map;
}

export class GroupedHelp extends Help {
  private groups: CommandGroup[];

  constructor(groups: CommandGroup[] = DEFAULT_COMMAND_GROUPS) {
    super();
    this.groups = groups;
  }

  formatHelp(cmd: InstanceType<typeof import('commander').Command>, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth || 80;
    const itemIndentWidth = 2;
    const itemSeparatorWidth = 2;

    function formatItem(term: string, description: string): string {
      if (description) {
        const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
        return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
      }
      return term;
    }

    function formatList(textArray: string[]): string {
      return textArray.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
    }

    // Usage
    let output: string[] = [`Usage: ${helper.commandUsage(cmd)}`, ''];

    // Description
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([helper.wrap(commandDescription, helpWidth, 0), '']);
    }

    // Arguments
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
    });
    if (argumentList.length > 0) {
      output = output.concat(['Arguments:', formatList(argumentList), '']);
    }

    // Options
    const optionList = helper.visibleOptions(cmd).map((option) => {
      return formatItem(helper.optionTerm(option), helper.optionDescription(option));
    });
    if (optionList.length > 0) {
      output = output.concat(['Options:', formatList(optionList), '']);
    }

    if (this.showGlobalOptions) {
      const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (globalOptionList.length > 0) {
        output = output.concat(['Global Options:', formatList(globalOptionList), '']);
      }
    }

    // Commands — grouped
    const groupMap = buildGroupMap(this.groups);
    const visibleCommands = helper.visibleCommands(cmd);

    // Group visible commands
    const grouped = new Map<string, string[]>();
    const ungrouped: string[] = [];

    for (const sub of visibleCommands) {
      const name = sub.name();
      const groupLabel = groupMap.get(name);
      if (groupLabel) {
        const list = grouped.get(groupLabel) ?? [];
        list.push(formatItem(helper.subcommandTerm(sub), helper.subcommandDescription(sub)));
        grouped.set(groupLabel, list);
      } else {
        ungrouped.push(formatItem(helper.subcommandTerm(sub), helper.subcommandDescription(sub)));
      }
    }

    // Emit grouped commands in defined group order
    for (const group of this.groups) {
      const list = grouped.get(group.label);
      if (list && list.length > 0) {
        output = output.concat([`${group.label}:`, formatList(list), '']);
      }
    }

    // Emit any ungrouped commands at the end
    if (ungrouped.length > 0) {
      output = output.concat(['Other:', formatList(ungrouped), '']);
    }

    return output.join('\n');
  }
}
