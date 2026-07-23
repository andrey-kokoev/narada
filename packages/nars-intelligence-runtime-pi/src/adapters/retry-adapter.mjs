function retryableOutcome(outcome, allowUncertainRetry = false) {
  // An uncertain transport outcome may already have crossed the provider
  // boundary. Retrying it automatically would be a client-style resubmission
  // and can duplicate an external provider request.
  return Boolean(outcome?.error?.retryable)
    && (allowUncertainRetry || ['acknowledged', 'not-acknowledged'].includes(outcome?.admission));
}

export async function runProviderWithBoundedRetry(operation, {
  maxAttempts = 2,
  eventSink = async () => {},
  abortSignal = null,
  now = () => new Date().toISOString(),
  allowUncertainRetry = false,
  rethrowOperationErrors = false,
} = {}) {
  const boundedMaxAttempts = Math.max(1, Math.min(8, Math.trunc(Number(maxAttempts) || 2)));
  let lastOutcome = null;
  for (let attempt = 1; attempt <= boundedMaxAttempts; attempt += 1) {
    if (abortSignal?.aborted) return { outcome: { admission: 'uncertain', error: { code: 'aborted', message: 'provider retry aborted', retryable: false } }, attempts: attempt - 1 };
    try {
      const outcome = await operation(attempt);
      lastOutcome = outcome;
      if (!retryableOutcome(outcome, allowUncertainRetry) || attempt === boundedMaxAttempts) return { outcome, attempts: attempt };
      await eventSink({ kind: 'pi_retry_telemetry', attempt, next_attempt: attempt + 1, reason: outcome?.error?.code ?? 'admission_uncertain', timestamp: now() });
    } catch (error) {
      if (rethrowOperationErrors) throw error;
      lastOutcome = { admission: 'uncertain', error: { code: error?.code ?? 'provider_threw', message: error instanceof Error ? error.message : String(error), retryable: true } };
      if (attempt === boundedMaxAttempts || !allowUncertainRetry) return { outcome: lastOutcome, attempts: attempt };
      await eventSink({ kind: 'pi_retry_telemetry', attempt, next_attempt: attempt + 1, reason: lastOutcome.error.code, timestamp: now() });
    }
  }
  return { outcome: lastOutcome, attempts: boundedMaxAttempts };
}
