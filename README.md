# AccessRoute

AccessRoute checks proposed step-free station paths against elevator evidence at the time each leg would use the equipment. An entrance closure can block one route while leaving an alternate entrance and the same transfer usable. An agency outage list alone cannot establish that an alternate route works.

**[Public app](https://accessroute.tinymule33.chatgpt.site)** · **[Live verification](docs/LIVE_VERIFICATION.md)** · **[Project Explorer entry](docs/SUBMISSION.md)**

## Try the app

1. Open the public app and read the finalized Harbor Exchange sample. The fictional north entrance is blocked. The south entrance and its shared transfer are supported for the sample window.
2. Use the planner to enter one or two connected paths. The minute offsets are measured from the departure time in UTC. Add the equipment IDs the path depends on.
3. Choose **Prepare Studio transaction**. The app gives you the deployed address and the four exact call arguments. Sign and submit in GenLayer Studio using its built-in account, then paste the hash into the app to follow consensus and finality. Anyone can look up finalized verdicts with an account address and request ID.

See [deployment and usage](docs/DEPLOYMENT.md) for the Studio flow and the public read API.

## What validators agree on

Each validator independently retrieves the configured HTTPS evidence and derives a canonical report. Strict equivalence compares the full report, including verdicts, leg windows, cited equipment IDs, matching official notice windows and evidence status. Irrelevant differences in MTA feed ordering or unrelated equipment do not affect agreement. The contract stores a SHA-256 decision commitment under the sender and a request ID. Finalized records are append-only.

| Mode | Evidence | Meaning |
| --- | --- | --- |
| Harbor Exchange | Commit-pinned fictional station map and notice with a SHA-256 commitment | Supports a connected path only when every leg has explicit coverage for its entire window. |
| NYC subway | Official MTA elevator outage feed | Flags a reported outage when the rider-supplied elevator ID and time overlap. Missing entries, elapsed estimated repair times and missing data yield insufficient evidence. |

The contract accepts fixed evidence sources. Rider-provided free-form URLs, automatic route discovery, accessibility accommodations beyond step-free paths, and live topology verification are outside this release. The NYC mode works from rider-provided equipment IDs and does not establish that those IDs form a step-free path. Use [official MTA status](https://www.mta.info/elevator-escalator-status) to confirm current conditions before travelling. AccessRoute is independent of MTA.

## Development

Requires Node.js 22 or newer and Python 3.10 or newer.

```sh
npm ci
npm test
npm run build
genvm-lint check contracts/access_route.py
node scripts/verify-studionet.mjs
```

The build outputs a static site to `dist/`. Python tests use a GenLayer test double for deterministic logic. The separate StudioNet check verifies finalized receipts, on-chain reports and the deployed source bytes.

See [evidence and limitations](docs/EVIDENCE.md) for the trust model and the extension path for agency station topology.
