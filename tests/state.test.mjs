import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptState, recordKey, verifyPlan } from '../web/state.mjs';

test('StudioNet receipts distinguish accepted, success, failure and unavailable outcomes', () => {
  assert.equal(receiptState({statusName: 'ACCEPTED'}).kind, 'pending');
  assert.equal(receiptState({statusName: 'FINALIZED', consensus_data: {leader_receipt: [{execution_result: 'SUCCESS'}]}}).kind, 'success');
  assert.equal(receiptState({statusName: 'FINALIZED', consensus_data: {leader_receipt: [{execution_result: 'ERROR'}]}}).kind, 'error');
  assert.equal(receiptState({statusName: 'UNDETERMINED'}).kind, 'error');
  assert.equal(receiptState({statusName: 'FINALIZED'}).kind, 'unknown');
});

test('lookup key validates identifiers and canonicalizes account case', () => {
  assert.equal(recordKey('0x' + 'A'.repeat(40), '2'.repeat(32)), '0x' + 'a'.repeat(40) + '/' + '2'.repeat(32));
  assert.throws(() => recordKey('0x', '2'.repeat(32)));
});

test('planner accepts connected legs and rejects overlaps and invalid IDs', () => {
  const date = 1794553200;
  const first = ['NORTH', 'P2', 0, 5, ['DEMO-N']];
  assert.doesNotThrow(() => verifyPlan([[first, ['P2', 'P4', 10, 15, ['DEMO-T']]]], 'demo', date));
  assert.throws(() => verifyPlan([[first, ['P2', 'P4', 3, 15, ['DEMO-T']]]], 'demo', date), /overlap/);
  assert.throws(() => verifyPlan([[first, ['P3', 'P4', 10, 15, ['DEMO-T']]]], 'demo', date), /previous/);
  assert.throws(() => verifyPlan([[first]], 'mta', date), /MTA equipment/);
});
