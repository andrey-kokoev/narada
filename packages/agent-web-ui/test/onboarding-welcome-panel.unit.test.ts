import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingWelcomePanel from '../src/app/components/OnboardingWelcomePanel.vue';
import type { AgentActivityState } from '../src/app/composables/useAgentActivity';
import type { HealthIntelligenceSummary } from '../src/app/composables/useHealthStatus';
import type { SessionIdentitySummary } from '../src/app/composables/useNarsEvents';
import type { ProjectedEventRow } from '../src/app/lib/eventProjection';

function makeIdentity(overrides: Partial<SessionIdentitySummary> = {}): SessionIdentitySummary {
  return {
    siteId: 'narada.ux',
    agentId: 'ux.agent',
    role: 'resident',
    sessionId: 'session-1',
    title: 'ux.agent',
    subtitle: 'resident',
    ...overrides,
  };
}

function makeIntelligence(overrides: Partial<HealthIntelligenceSummary> = {}): HealthIntelligenceSummary {
  return { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', ...overrides };
}

function makeActivity(overrides: Partial<AgentActivityState> = {}): AgentActivityState {
  return {
    active: false,
    state: 'idle',
    label: 'Idle',
    detail: null,
    elapsedSeconds: 0,
    startedAtMs: null,
    ...overrides,
  };
}

function makeRow(kind: string): ProjectedEventRow {
  return {
    key: `${kind}-1`,
    kind,
    label: kind,
    tone: 'neutral',
    summary: kind,
    event: { event: kind },
  };
}

function mountPanel(overrides: Partial<{
  enabled: boolean;
  rows: ProjectedEventRow[];
  agentActivity: AgentActivityState;
  sessionIdentity: SessionIdentitySummary;
  intelligence: HealthIntelligenceSummary;
}> = {}) {
  return mount(OnboardingWelcomePanel, {
    props: {
      enabled: true,
      rows: [],
      agentActivity: makeActivity(),
      sessionIdentity: makeIdentity(),
      intelligence: makeIntelligence(),
      ...overrides,
    },
  });
}

describe('OnboardingWelcomePanel', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is opt-in and renders ready defaults with both starter intents', async () => {
    const disabled = mountPanel({ enabled: false });
    expect(disabled.find('.onboarding-panel').exists()).toBe(false);
    disabled.unmount();

    const wrapper = mountPanel({
      sessionIdentity: makeIdentity({ siteId: null }),
      intelligence: makeIntelligence({ provider: null, model: null }),
    });
    expect(wrapper.get('.onboarding-panel').attributes('data-phase')).toBe('ready');
    expect(wrapper.text()).toContain('Personal workspace');
    expect(wrapper.text()).toContain('Registry default');
    expect(wrapper.text()).toContain('Resolved at launch');
    expect(wrapper.text()).toContain('No project setup is needed');

    await wrapper.get('.onboarding-secondary-button').trigger('click');
    await wrapper.get('.onboarding-primary').trigger('click');
    expect(wrapper.emitted('intent-selected')).toEqual([
      ['What can you help me with?'],
      ['What would you like to work on?'],
    ]);
  });

  it('shows working while a request is active and complete after an assistant response', async () => {
    const wrapper = mountPanel({ rows: [makeRow('operator_input_submitted')] });
    expect(wrapper.get('.onboarding-panel').attributes('data-phase')).toBe('working');
    expect(wrapper.text()).toContain('Your assistant is working');

    await wrapper.setProps({
      rows: [makeRow('assistant_message')],
      agentActivity: makeActivity({ active: true, state: 'thinking', label: 'Thinking' }),
    });
    expect(wrapper.get('.onboarding-panel').attributes('data-phase')).toBe('complete');
    expect(wrapper.text()).toContain('Resident is enough to begin');
    await wrapper.get('.onboarding-primary').trigger('click');
    expect(wrapper.emitted('intent-selected')).toContainEqual([
      'What roles could I add later, and when would architect or builder help?',
    ]);
  });

  it('reacts to session and intelligence changes', async () => {
    const wrapper = mountPanel({
      sessionIdentity: makeIdentity({ siteId: null, sessionId: 'session-1' }),
      intelligence: makeIntelligence({ provider: null, model: null }),
    });
    expect(wrapper.text()).toContain('Personal workspace');

    await wrapper.setProps({
      sessionIdentity: makeIdentity({ siteId: 'narada.project', sessionId: 'session-2' }),
      intelligence: makeIntelligence({ provider: 'kimi-code-api', model: 'kimi-k2.7' }),
    });
    expect(wrapper.text()).toContain('narada.project');
    expect(wrapper.text()).toContain('kimi-code-api');
    expect(wrapper.text()).toContain('kimi-k2.7');
  });

  it('persists dismissal per session and keeps working when storage is unavailable', async () => {
    const wrapper = mountPanel();
    await wrapper.get('.onboarding-dismiss').trigger('click');
    expect(wrapper.find('.onboarding-panel').exists()).toBe(false);
    expect(window.sessionStorage.getItem('narada.user-site-onboarding.dismissed.session-1')).toBe('1');
    wrapper.unmount();

    const restored = mountPanel();
    await nextTick();
    expect(restored.find('.onboarding-panel').exists()).toBe(false);
    restored.unmount();

    const otherSession = mountPanel({ sessionIdentity: makeIdentity({ sessionId: 'session-2' }) });
    await nextTick();
    expect(otherSession.find('.onboarding-panel').exists()).toBe(true);
    otherSession.unmount();

    const noSession = mountPanel({ sessionIdentity: makeIdentity({ sessionId: null }) });
    await nextTick();
    await noSession.get('.onboarding-dismiss').trigger('click');
    expect(noSession.find('.onboarding-panel').exists()).toBe(false);
    noSession.unmount();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    const storageFailure = mountPanel({ sessionIdentity: makeIdentity({ sessionId: 'session-4' }) });
    await nextTick();
    await storageFailure.get('.onboarding-dismiss').trigger('click');
    expect(storageFailure.find('.onboarding-panel').exists()).toBe(false);
    expect(setItem).toHaveBeenCalled();
    storageFailure.unmount();

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const readFailure = mountPanel({ sessionIdentity: makeIdentity({ sessionId: 'session-3' }) });
    await nextTick();
    expect(readFailure.find('.onboarding-panel').exists()).toBe(true);
    expect(getItem).toHaveBeenCalled();
    readFailure.unmount();
  });
});
