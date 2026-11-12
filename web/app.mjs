import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { addressPattern, hashPattern, recordKey, receiptState, verifyPlan } from './state.mjs';

const rpc = createClient({ chain: studionet });
const explorer = 'https://explorer-studio.genlayer.com';
const byId = id => document.getElementById(id);
const demoRoutes = [
  [['NORTH', 'P2', 0, 5, ['DEMO-N']], ['P2', 'P4', 10, 15, ['DEMO-T']]],
  [['SOUTH', 'P2', 0, 5, ['DEMO-S']], ['P2', 'P4', 10, 15, ['DEMO-T']]]
];
const labels = { BLOCKED: 'Blocked', SUPPORTED: 'Step-free path supported', INSUFFICIENT: 'Insufficient evidence' };
const sourceLabels = { READ: 'Source retrieved', UNAVAILABLE: 'Source unavailable', HASH_MISMATCH: 'Evidence commitment mismatch' };
let config;
let reading = 0;
let tracking = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function link(text, url) {
  const node = element('a', text);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

function addLeg(container, values = ['', '', 0, 5, []]) {
  const row = element('div', undefined, 'leg');
  const fields = ['From', 'To', 'Start min', 'End min', 'Elevator IDs'];
  fields.forEach((name, index) => {
    const label = element('label', name);
    const input = element('input');
    input.required = true;
    if (index === 2 || index === 3) {
      input.type = 'number';
      input.min = '0';
      input.max = '240';
    } else {
      input.maxLength = index === 4 ? 100 : 24;
      input.spellcheck = false;
    }
    input.value = index === 4 ? values[index].join(', ') : values[index];
    label.append(input);
    row.append(label);
  });
  row.append(button('Remove leg', () => {
    if (container.childElementCount > 1) row.remove();
    else byId('plan-status').textContent = 'Each route needs at least one leg.';
  }));
  container.append(row);
}

function addRoute(legs) {
  const routes = byId('routes');
  const index = routes.childElementCount;
  const route = element('fieldset');
  const rows = element('div');
  route.append(element('legend', index ? 'Alternate route' : 'Original route'), rows);
  legs.forEach(leg => addLeg(rows, leg));
  const controls = element('div', undefined, 'actions');
  controls.append(button('Add leg', () => {
    if (rows.childElementCount < 6) addLeg(rows);
    else byId('plan-status').textContent = 'Each route supports up to six legs.';
  }));
  if (index) controls.append(button('Remove alternate route', () => {
    route.remove();
    byId('add-route').disabled = false;
  }));
  route.append(controls);
  routes.append(route);
  byId('add-route').disabled = routes.childElementCount === 2;
}

function modeHelp() {
  byId('mode-help').textContent = byId('mode').value === 'demo'
    ? 'The fictional notice and station map cover 07:00–08:00 UTC on 13 November 2026.'
    : 'The MTA feed can flag reported outages for supplied equipment IDs. It cannot verify your station path or prove a lift is in service.';
}

function loadDemo() {
  byId('mode').value = 'demo';
  byId('departure').value = '2026-11-13T07:00';
  byId('routes').replaceChildren();
  demoRoutes.forEach(addRoute);
  byId('handoff').hidden = true;
  byId('plan-status').textContent = '';
  modeHelp();
}

function collect() {
  return Array.from(byId('routes').children, route =>
    Array.from(route.querySelectorAll('.leg'), row => {
      const [from, to, start, end, ids] = Array.from(row.querySelectorAll('input'), input => input.value.trim().toUpperCase());
      return [from, to, Number(start), Number(end), ids.split(/[,\s]+/).filter(Boolean)];
    })
  );
}

function prepare(event) {
  event.preventDefault();
  const status = byId('plan-status');
  const handoff = byId('handoff');
  handoff.hidden = true;
  try {
    if (!config || !addressPattern.test(config.address)) throw new Error('StudioNet deployment configuration is unavailable.');
    const mode = byId('mode').value;
    const departure = Date.parse(byId('departure').value + ':00Z') / 1000;
    const routes = collect();
    verifyPlan(routes, mode, departure);
    const id = crypto.randomUUID().replaceAll('-', '');
    const args = { contract: config.address, request_id: id, mode, departure: String(departure), itinerary: JSON.stringify(routes) };
    const list = byId('arguments');
    list.replaceChildren();
    for (const [name, value] of Object.entries(args)) {
      const item = element('dd');
      item.append(element('code', value), button('Copy ' + name, async () => {
        try {
          await navigator.clipboard.writeText(value);
          status.textContent = name + ' copied.';
        } catch {
          status.textContent = 'Clipboard unavailable. Select and copy the argument.';
        }
      }));
      list.append(element('dt', name), item);
    }
    byId('request').value = id;
    handoff.hidden = false;
    status.textContent = 'Arguments ready. Submit them in Studio to start consensus.';
    byId('studio').focus();
  } catch (error) {
    status.textContent = error.message;
  }
}

function render(record) {
  const { report, digest } = record;
  const target = byId('report');
  target.replaceChildren(element('p', report.mode === 'demo' ? 'Fictional exercise · finalized on StudioNet' : 'MTA NYC subway · finalized on StudioNet'));
  const evidence = element('p');
  evidence.append(link(report.mode === 'demo' ? 'Pinned station map and notice ↗' : 'Official MTA equipment feed ↗', report.source),
    document.createTextNode(' · ' + (sourceLabels[report.source_status] ?? report.source_status)));
  target.append(evidence);
  const time = epoch => new Date(epoch * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const badge = verdict => element('span', labels[verdict] ?? verdict, 'pill ' + verdict.toLowerCase());
  report.routes.forEach((route, index) => {
    const article = element('article');
    const header = element('div', undefined, 'section-head');
    header.append(element('h3', index ? 'Alternate route' : 'Original route'), badge(route.verdict));
    article.append(header);
    route.legs.forEach(leg => {
      const row = element('div', undefined, 'finding');
      const line = element('div', undefined, 'section-head');
      line.append(element('strong', leg.path.join(' → ')), badge(leg.verdict));
      row.append(line, element('p', leg.window.map(time).join(' – ')),
        element('p', 'Required lifts · ' + leg.equipment.join(', ') +
          (leg.matched.length ? ' | Cited lifts · ' + leg.matched.join(', ') : '')));
      for (const [lift, start, end] of leg.outages_ny ?? []) {
        row.append(element('p', lift + ' reported outage · ' + start.replace('T', ' ') + ' to ' + end.replace('T', ' ') + ' (New York time, estimated end)'));
      }
      article.append(row);
    });
    target.append(article);
  });
  const detail = element('details');
  detail.append(element('summary', 'Decision commitment'), element('code', digest));
  if (report.source_commitment) detail.append(element('p', 'Evidence SHA-256'), element('code', report.source_commitment));
  target.append(detail);
}

async function read(account, request) {
  const status = byId('read-status');
  const id = ++reading;
  byId('report').replaceChildren();
  try {
    const key = recordKey(account, request);
    if (!config?.address) throw new Error('StudioNet deployment configuration is unavailable.');
    status.textContent = 'Reading finalized StudioNet state…';
    const result = await rpc.readContract({ address: config.address, functionName: 'get_verdict',
      args: [key], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
    if (id !== reading) return;
    if (!result) {
      status.textContent = 'No finalized verdict for this account and request ID.';
      return;
    }
    render(JSON.parse(result));
    status.textContent = 'Finalized verdict loaded.';
    const url = new URL(location.href);
    url.searchParams.set('record', key);
    history.replaceState(null, '', url);
  } catch (error) {
    if (id === reading) status.textContent = 'Verdict unavailable. ' + (error.shortMessage ?? error.message);
  }
}

async function track(hash) {
  const id = ++tracking;
  const output = byId('receipt');
  const show = text => output.replaceChildren(document.createTextNode(text + ' '), link('Transaction explorer ↗', explorer + '/tx/' + hash));
  if (!hashPattern.test(hash) || !config?.address) {
    output.textContent = 'Enter a valid StudioNet transaction hash.';
    return;
  }
  show('Looking up transaction…');
  for (let attempt = 0; attempt < 36 && tracking === id; attempt++) {
    try {
      const tx = await rpc.getTransaction({ hash });
      if (tracking !== id) return;
      const recipient = tx.to_address ?? tx.recipient ?? tx.txDataDecoded?.contractAddress;
      if (recipient && recipient.toLowerCase() !== config.address.toLowerCase() && hash.toLowerCase() !== config.deployment.toLowerCase()) {
        show('This transaction belongs to a different contract.');
        return;
      }
      const state = receiptState(tx);
      show(state.text);
      if (state.kind !== 'pending') {
        if (state.kind === 'success' && addressPattern.test(byId('account').value)) void read(byId('account').value, byId('request').value);
        return;
      }
    } catch {
      if (tracking !== id) return;
      show('Receipt unavailable or not indexed yet. Retrying…');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (tracking === id) show('Polling paused. Select Track transaction to check again.');
}

function openSample(sample, trackReceipt = true) {
  byId('account').value = sample.account;
  byId('request').value = sample.request;
  if (trackReceipt && sample.hash) {
    byId('tx').value = sample.hash;
    void track(sample.hash);
  } else {
    void read(sample.account, sample.request);
  }
}

byId('load-demo').addEventListener('click', loadDemo);
byId('mode').addEventListener('change', modeHelp);
byId('add-route').addEventListener('click', () => addRoute([['', '', 0, 5, []]]));
byId('plan').addEventListener('submit', prepare);
byId('lookup').addEventListener('submit', event => {
  event.preventDefault();
  void read(byId('account').value, byId('request').value);
});
byId('track').addEventListener('submit', event => {
  event.preventDefault();
  void track(byId('tx').value);
});
loadDemo();

try {
  const response = await fetch('./config.json');
  if (!response.ok) throw new Error('Configuration unavailable');
  config = await response.json();
  if (!addressPattern.test(config.address)) throw new Error('Deployment address unavailable');
  byId('contract').href = explorer + '/address/' + config.address;
  byId('contract').hidden = false;
  for (const [buttonId, sample] of [['demo-record', config.demo], ['live-record', config.live]]) {
    if (!sample) continue;
    byId(buttonId).disabled = false;
    byId(buttonId).addEventListener('click', () => openSample(sample));
  }
  if (hashPattern.test(config.rejected ?? '')) {
    byId('rejected-record').disabled = false;
    byId('rejected-record').addEventListener('click', () => {
      byId('tx').value = config.rejected;
      void track(config.rejected);
    });
  }
  const requested = new URL(location.href).searchParams.get('record')?.split('/');
  if (requested?.length === 2) {
    const [account, request] = requested;
    recordKey(account, request);
    openSample({ account, request }, false);
  } else if (config.demo) openSample(config.demo, false);
} catch (error) {
  byId('read-status').textContent = error.message;
}
