import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { receiptState, recordKey } from '../web/state.mjs';

const config = JSON.parse(await readFile(new URL('../web/config.json', import.meta.url)));
const localSource = await readFile(new URL('../contracts/access_route.py', import.meta.url));
const client = createClient({ chain: studionet });
const sha256 = input => createHash('sha256').update(input).digest('hex');
assert.equal(await client.getChainId(), 61999);

const [deployment, ...samples] = await Promise.all([
  client.getTransaction({ hash: config.deployment }),
  ...[config.demo, config.live].map(async ({ account, request, hash }) => {
    const [transaction, response] = await Promise.all([
      client.getTransaction({ hash }),
      client.readContract({
        address: config.address, functionName: 'get_verdict', args: [recordKey(account, request)],
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL
      })
    ]);
    assert.equal(transaction.from_address.toLowerCase(), account.toLowerCase());
    assert.equal(transaction.to_address.toLowerCase(), config.address.toLowerCase());
    assert.equal(receiptState(transaction).kind, 'success');
    assert.equal(transaction.leader_only, false);
    const record = JSON.parse(response);
    assert.equal(sha256(JSON.stringify(record.report)), record.digest);
    return record;
  })
]);
assert.equal(receiptState(deployment).kind, 'success');
assert.equal(deployment.data.contract_address.toLowerCase(), config.address.toLowerCase());
const code = deployment.data.contract_code;
const deployedSource = code.startsWith('0x') ? Buffer.from(code.slice(2), 'hex') : Buffer.from(code, 'base64');
assert.equal(sha256(deployedSource), sha256(localSource), 'Deployed bytes must match the source file');
assert.deepEqual(samples[0].report.routes.map(route => route.verdict), ['BLOCKED', 'SUPPORTED']);
assert.equal(samples[0].report.source_status, 'READ');
assert.equal(samples[1].report.source_status, 'READ');
assert.equal(samples[1].report.routes[0].verdict, 'BLOCKED');
if (config.rejected) {
  const duplicate = await client.getTransaction({ hash: config.rejected });
  assert.equal(receiptState(duplicate).kind, 'error');
  assert.equal(duplicate.to_address.toLowerCase(), config.address.toLowerCase());
}
console.log(JSON.stringify({ network: 61999, address: config.address, sourceSHA256: sha256(localSource), samples }, null, 2));
