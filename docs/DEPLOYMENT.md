# Deployment and Studio transactions

The public frontend uses the stable GenLayer StudioNet network (chain ID 61999) with genlayer-js. The deployed address and sample record IDs are in [web/config.json](../web/config.json). The deployed source is [contracts/access_route.py](../contracts/access_route.py).

## Submit using Studio's built-in account

1. Open [GenLayer Studio](https://studio.genlayer.com/contracts). Use the account selector to choose the built-in test account.
2. Upload `contracts/access_route.py` in the Contracts panel. Open **Run and Debug**. Use the attach/link control for that source and enter the published address from the app. When intentionally deploying a separate instance, use **Deploy** in Normal (Full Consensus) mode and wait for the deployment to finalize.
3. Open **verify_routes**. Use the app's four named arguments. The itinerary is a JSON string, so paste the JSON as displayed without adding outer quote characters. Keep **Simulation Mode** off and send the transaction.
4. Copy the public account address and the transaction hash from Studio. Enter them in the app and track the hash. The app distinguishes provisional acceptance, final execution success, execution failure, and unresolved consensus. For a successful write, it reads the sender-scoped request with the SDK's latest finalized state.
5. Copy the report URL from the browser address bar if you want to share a finalized result. Use public station and equipment identifiers only.

Studio's internal account signs in Studio's origin. The public app prepares the call and reads state and receipts. It does not request wallet private keys, use a browser wallet extension, or submit transactions directly from its own origin.

## Contract API

| Function | Arguments | Result |
| --- | --- | --- |
| `verify_routes` | `request_id: str` (32 lowercase hex chars), `mode: str` (`demo` or `mta`), `departure: u256` (UTC epoch seconds), `itinerary: str` | Sender-scoped key. One or two routes, each with one to six connected legs. Each leg is `[origin,target,start_min,end_min,[equipment_ids]]`. |
| `get_verdict` | `key: str` (lowercase sender address, slash, request ID) | Canonical JSON containing the report and SHA-256 commitment, or an empty string for an unknown key. |

GenLayer references: [Studio](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio), [networks](https://docs.genlayer.com/developers/networks), [transaction SDK](https://docs.genlayer.com/api-references/genlayer-js/transactions).
