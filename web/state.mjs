export const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export const hashPattern = /^0x[0-9a-fA-F]{64}$/;
export const requestPattern = /^[0-9a-f]{32}$/;

export function recordKey(account, request) {
  if (!addressPattern.test(account) || !requestPattern.test(request)) throw new Error('Enter a valid account address and request ID.');
  return account.toLowerCase() + '/' + request;
}

export function receiptState(tx) {
  const state = String(tx.statusName ?? tx.status ?? '').toUpperCase();
  if (['CANCELED', 'UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'].includes(state)) {
    return { kind: 'error', text: 'Transaction ended · ' + state };
  }
  if (state !== 'FINALIZED') return { kind: 'pending', text: 'Pending finality' + (state ? ' · ' + state : '') };
  const leader = Array.isArray(tx.consensus_data?.leader_receipt)
    ? tx.consensus_data.leader_receipt[0] : tx.consensus_data?.leader_receipt;
  const result = String(tx.txExecutionResultName ?? leader?.execution_result ?? tx.resultName ?? '').toUpperCase();
  if (['FINISHED_WITH_ERROR', 'ERROR', 'FAILURE'].includes(result)) return { kind: 'error', text: 'Finalized · execution failed' };
  if (['FINISHED_WITH_RETURN', 'SUCCESS'].includes(result)) return { kind: 'success', text: 'Finalized · execution succeeded' };
  return { kind: 'unknown', text: 'Finalized · execution outcome unavailable' };
}

export function verifyPlan(routes, mode, departure) {
  const token = /^[A-Z0-9][A-Z0-9-]{0,23}$/;
  if (!Number.isInteger(departure) || departure < 1735689600 || departure >= 4102444800) throw new Error('Choose a departure from 2025 through 2099.');
  for (const route of routes) {
    let previous = 0;
    let previousTarget;
    for (const [from, to, start, end, ids] of route) {
      if (!token.test(from) || !token.test(to) || from === to) throw new Error('Use distinct entrance and platform identifiers (letters, digits or hyphens).');
      if (previousTarget && from !== previousTarget) throw new Error("Each leg must start where the previous leg ends.");
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < previous || end <= start || end > 240) throw new Error('Leg minute offsets must be in order, without overlap, and between 0 and 240.');
      if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length || ids.some(id => !token.test(id) || (mode === 'mta' && !/^EL[0-9]{1,6}[A-Z]?$/.test(id)))) {
        throw new Error('Enter one to four distinct elevator IDs per leg. Use MTA equipment IDs such as EL433 in MTA mode.');
      }
      previous = end;
      previousTarget = to;
    }
  }
}
