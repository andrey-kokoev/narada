import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue';

interface OperatorInterruptPromptOptions {
  disabled: ComputedRef<boolean>;
  canInterrupt: ComputedRef<boolean>;
  commandPaletteOpen: ComputedRef<boolean>;
  interrupt: () => void;
}

export function useOperatorInterruptPrompt(options: OperatorInterruptPromptOptions) {
  const interruptArmed = ref(false);
  const interruptModalVisible = ref(false);
  const interruptCountdown = ref(3);
  const interruptCountdownLabel = computed(() => `${interruptCountdown.value}s`);
  let interruptShowTimer: ReturnType<typeof setTimeout> | null = null;
  let interruptCountdownTimer: ReturnType<typeof setInterval> | null = null;

  watch(options.canInterrupt, (canInterrupt) => {
    if (!canInterrupt) clearInterruptPrompt();
  });

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
    clearInterruptPrompt();
  });

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented || options.disabled.value || !options.canInterrupt.value || options.commandPaletteOpen.value) return;
    event.preventDefault();
    if (interruptArmed.value) {
      sendInterrupt();
      return;
    }
    armInterruptPrompt();
  }

  function armInterruptPrompt() {
    interruptArmed.value = true;
    interruptCountdown.value = 3;
    interruptShowTimer = setTimeout(() => {
      interruptModalVisible.value = true;
      interruptCountdownTimer = setInterval(() => {
        interruptCountdown.value -= 1;
        if (interruptCountdown.value <= 0) clearInterruptPrompt();
      }, 1000);
    }, 180);
  }

  function sendInterrupt() {
    clearInterruptPrompt();
    options.interrupt();
  }

  function clearInterruptPrompt() {
    interruptArmed.value = false;
    interruptModalVisible.value = false;
    interruptCountdown.value = 3;
    if (interruptShowTimer) clearTimeout(interruptShowTimer);
    if (interruptCountdownTimer) clearInterval(interruptCountdownTimer);
    interruptShowTimer = null;
    interruptCountdownTimer = null;
  }

  return { interruptModalVisible, interruptCountdownLabel, clearInterruptPrompt };
}
