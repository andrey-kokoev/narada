export const SITE_OPERATING_LOOP_MODULE_CONTRACT_SCHEMA = 'narada.site_operating_loop.module_contract.v1';

export function resolveSiteOperatingLoopModule(module, { moduleRef = null } = {}) {
  const createSteps = module?.createSiteOperatingLoopSteps ?? module?.createSteps;
  const prepareRun = module?.prepareSiteOperatingLoopRun ?? module?.prepareRun ?? null;
  const errors = [];
  if (typeof createSteps !== 'function') errors.push('missing_createSiteOperatingLoopSteps');
  if (prepareRun != null && typeof prepareRun !== 'function') {
    errors.push('invalid_prepareSiteOperatingLoopRun');
  }
  if (module?.summarizeSiteOperatingLoopRun != null && typeof module.summarizeSiteOperatingLoopRun !== 'function') {
    errors.push('invalid_summarizeSiteOperatingLoopRun');
  }
  return {
    schema: SITE_OPERATING_LOOP_MODULE_CONTRACT_SCHEMA,
    status: errors.length === 0 ? 'ok' : 'invalid',
    module_ref: moduleRef,
    errors,
    createSteps: errors.length === 0 ? createSteps : null,
    prepareRun: errors.length === 0 && typeof prepareRun === 'function' ? prepareRun : null,
    summarize: typeof module?.summarizeSiteOperatingLoopRun === 'function' ? module.summarizeSiteOperatingLoopRun : null,
  };
}

export async function createValidatedSiteOperatingLoopSteps(moduleContract, context) {
  if (moduleContract?.status !== 'ok' || typeof moduleContract.createSteps !== 'function') {
    throw new Error('invalid Site Operating Loop module contract');
  }
  const steps = await moduleContract.createSteps(context);
  const validation = validateSiteOperatingLoopSteps(steps);
  if (validation.status !== 'ok') {
    throw new Error(`invalid Site Operating Loop steps: ${validation.errors.join(', ')}`);
  }
  return steps;
}

export function validateSiteOperatingLoopSteps(steps) {
  const errors = [];
  if (!Array.isArray(steps)) {
    return {
      schema: 'narada.site_operating_loop.steps_validation.v1',
      status: 'invalid',
      errors: ['steps_not_array'],
    };
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object') errors.push(`step_${i}_not_object`);
    if (!step?.stepId) errors.push(`step_${i}_missing_stepId`);
    if (step?.execute != null && typeof step.execute !== 'function') errors.push(`step_${i}_invalid_execute`);
  }
  return {
    schema: 'narada.site_operating_loop.steps_validation.v1',
    status: errors.length === 0 ? 'ok' : 'invalid',
    errors,
  };
}
