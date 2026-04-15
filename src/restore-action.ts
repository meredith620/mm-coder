import type { QueuedMessage } from './types.js';

export type RestoreAction = 'replay' | 'confirm' | 'discard';

export interface RestoreContext {
  hasApprovalContext: boolean;
  isHighRisk: boolean;
}

export function determineRestoreAction(msg: QueuedMessage, ctx: RestoreContext): RestoreAction {
  if (ctx.hasApprovalContext) {
    return 'confirm';
  }

  if (ctx.isHighRisk) {
    return 'discard';
  }

  return 'replay';
}
