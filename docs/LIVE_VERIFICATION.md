# Live verification

**Network** StudioNet, chain ID 61999. Deployment and writes were signed through Studio's built-in account in Normal (Full Consensus) mode.

**Contract** [0x2CF552BC6611Bb8B9f17C70832f3Ab1530026742](https://explorer-studio.genlayer.com/address/0x2CF552BC6611Bb8B9f17C70832f3Ab1530026742)

**Signing account** `0x56944456AEFf47F7312a4D8c8b712558E86D68Bf`

| Evidence | Final outcome |
| --- | --- |
| [Deployment receipt](https://explorer-studio.genlayer.com/tx/0x0ecd5c9025ad6f27d307084fb0d41036ed0bc665dbb5af17a2b7c8f1f2c21209) | Finalized, successful. Deployment bytes match [contract source](../contracts/access_route.py). |
| [Harbor Exchange comparison](https://explorer-studio.genlayer.com/tx/0x44c5b54be3c3ef40e9ed74d480085f961a5bbbeb54c5ac9dec0df68085231c9e) | Finalized, successful. Original north entrance blocked. South alternative and shared transfer supported for 13 November 2026 at 07:00 UTC. |
| [Official MTA live-feed check](https://explorer-studio.genlayer.com/tx/0xe8daa16609c0baea3a14a673d9580e9ba2269a3b326d55a937c726490b47ca4f) | Finalized, successful. MTA reported a scheduled EL786 outage overlapping the Grand St leg on 17 December 2026 at 03:05 UTC. This is a finalized observation of the schedule, which can change. |
| [Rejected duplicate](https://explorer-studio.genlayer.com/tx/0x054fe1cd2b1ba3a970bf2f4041787adae4a393247c9857272fedb5275d04115d) | Finalized execution failure. A second write using the original request ID did not replace the stored report. |

The source SHA-256 is `78bae90f42952ab8bc8db45f4db9721c11e8b87a10a75ba8a2e96315de6a8ba0`. The Harbor Exchange decision commitment is `f37b8a7a482bce60c9392385c13398f50111a876042e69cbb6345c3a7458321e`. The MTA decision commitment is `896ea728a881f5b8d952015f3eefbfa9b96a36dc003c540ab1a7cbf02cfa131f`.

[Open the Harbor Exchange record](https://accessroute.tinymule33.chatgpt.site/?record=0x56944456aeff47f7312a4d8c8b712558e86d68bf%2Fa0010000000000000000000000000001) · [Open the MTA record](https://accessroute.tinymule33.chatgpt.site/?record=0x56944456aeff47f7312a4d8c8b712558e86d68bf%2Fa0010000000000000000000000000002)

## Reproduce

1. Run `npm ci`, then `npm test`. The suite has 14 Python tests and 3 browser-state module tests.
2. Run `npm run build` and `genvm-lint check contracts/access_route.py`.
3. Run `node scripts/verify-studionet.mjs` to verify the network ID, source bytes from the deployment receipt, execution states and both finalized reports.
4. In the public app, select **Read finalized sample**, **Read MTA sample**, and **Inspect rejected duplicate** to reproduce the reader and receipt tracker workflow without a wallet. To run a new assessment, follow [the Studio workflow](DEPLOYMENT.md).

The initial integration deployment surfaced a Studio response-field incompatibility. The corrected deployment above is the default for the frontend and all records in this document.
