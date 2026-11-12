import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
class UserError(Exception):
    pass


class Map(dict):
    pass


wallet = "0x1111111111111111111111111111111111111111"
web = types.SimpleNamespace()
consensus_calls = []

def strict_eq(run):
    leader, validator = run(), run()
    consensus_calls.append((leader, validator))
    if leader != validator:
        raise RuntimeError("Validator disagreement")
    return leader


genlayer = types.ModuleType("genlayer")
genlayer.gl = types.SimpleNamespace(
    UserError=UserError, Contract=object,
    public=types.SimpleNamespace(write=lambda f: f, view=lambda f: f),
    nondet=types.SimpleNamespace(web=web), eq_principle=types.SimpleNamespace(strict_eq=strict_eq),
    message=types.SimpleNamespace(sender_address=wallet),
)
genlayer.TreeMap, genlayer.u256 = Map, int
sys.modules["genlayer"] = genlayer
spec = importlib.util.spec_from_file_location("access_route", ROOT / "contracts/access_route.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)

FIXTURE = (ROOT / "evidence/harbor-exchange.json").read_bytes()
DEPARTURE = 1794553200
ORIGINAL = [["NORTH", "P2", 0, 5, ["DEMO-N"]], ["P2", "P4", 10, 15, ["DEMO-T"]]]
ALTERNATE = [["SOUTH", "P2", 0, 5, ["DEMO-S"]], ["P2", "P4", 10, 15, ["DEMO-T"]]]
MTA_ROUTE = [["NW", "PLATFORM", 0, 5, ["EL786"]]]
MTA_NOTICE = {"equipment": "EL786", "equipmenttype": "EL", "outagedate": "12/16/2026 10:00:00 PM",
              "estimatedreturntoservice": "12/17/2026 06:00:00 AM"}


def response(content, **kwargs):
    return types.SimpleNamespace(body=content, **kwargs)


def demo(body=FIXTURE, departure=DEPARTURE, routes=None):
    return json.loads(contract.evaluate("demo", departure, routes or [ORIGINAL, ALTERNATE],
                                        lambda _: response(body, status=200)))


def live(notices, departure=1797476700):
    return json.loads(contract.evaluate("mta", departure, [MTA_ROUTE],
                                        lambda _: response(json.dumps(notices).encode(), status_code=200)))


class EvidenceTests(unittest.TestCase):
    def test_demo_commitment_and_both_routes(self):
        result = demo()
        self.assertEqual(result["source_commitment"], contract.digest(FIXTURE.decode()))
        self.assertEqual([r["verdict"] for r in result["routes"]], ["BLOCKED", "SUPPORTED"])
        self.assertEqual(result["routes"][0]["legs"][0]["matched"], ["DEMO-N"])
        self.assertEqual(result["routes"][0]["legs"][1]["verdict"], "SUPPORTED")

    def test_demo_modified_evidence(self):
        result = demo(FIXTURE + b" ")
        self.assertEqual(result["source_status"], "HASH_MISMATCH")
        self.assertTrue(all(r["verdict"] == "INSUFFICIENT" for r in result["routes"]))

    def test_demo_no_positive_outside_window(self):
        result = demo(departure=DEPARTURE + 3600)
        self.assertTrue(all(r["verdict"] == "INSUFFICIENT" for r in result["routes"]))

    def test_demo_wrong_equipment_cannot_clear_path(self):
        result = demo(routes=[[["NORTH", "P2", 0, 5, ["DEMO-S"]]]])
        self.assertEqual(result["routes"][0]["verdict"], "INSUFFICIENT")

    def test_live_notice_is_cited(self):
        result = live([MTA_NOTICE])
        leg = result["routes"][0]["legs"][0]
        self.assertEqual(leg["verdict"], "BLOCKED")
        self.assertEqual(leg["outages_ny"], [["EL786", "2026-12-16T22:00:00", "2026-12-17T06:00:00"]])

    def test_unrelated_and_malformed_notice_cannot_block_or_clear(self):
        for notices in ([], [{"equipment": "EL786"}], [dict(MTA_NOTICE, equipment="EL785")],
                        [dict(MTA_NOTICE, equipmenttype="ES")], [dict(MTA_NOTICE, outagedate="junk")]):
            self.assertEqual(live(notices)["routes"][0]["verdict"], "INSUFFICIENT")

    def test_estimated_end_does_not_prove_reopening(self):
        self.assertEqual(live([MTA_NOTICE], 1797505200)["routes"][0]["verdict"], "INSUFFICIENT")

    def test_order_and_duplicate_rows_have_same_outcome(self):
        other = dict(MTA_NOTICE, estimatedreturntoservice="12/17/2026 08:00:00 AM")
        self.assertEqual(live([other, MTA_NOTICE, other]), live([MTA_NOTICE, other]))

    def test_transport_http_invalid_json_and_oversize_fail_closed(self):
        for item in (response(b"[]", status=403), response(b"bad", status=200),
                     response(b" " * 524289, status=200), response(b"{}", status=200)):
            result = json.loads(contract.evaluate("mta", DEPARTURE, [MTA_ROUTE], lambda _: item))
            self.assertEqual(result["source_status"], "UNAVAILABLE")

    def test_new_york_offset_and_ambiguous_window(self):
        self.assertEqual(str(contract.ny_wall_time(1797476700)), "2026-12-16 22:05:00")
        self.assertEqual(str(contract.ny_wall_time(1782864000)), "2026-06-30 20:00:00")
        from datetime import datetime
        ambiguous = int(datetime.fromisoformat("2026-11-01T06:10:00+00:00").timestamp())
        self.assertEqual(live([MTA_NOTICE], ambiguous)["routes"][0]["verdict"], "INSUFFICIENT")


class StateTests(unittest.TestCase):
    def setUp(self):
        self.access = contract.AccessRoute()
        self.access.records = Map()
        web.get = lambda _: response(FIXTURE, status=200)
        genlayer.gl.message.sender_address = wallet

    def verify(self, request="1" * 32, routes=None):
        return self.access.verify_routes(request, "demo", DEPARTURE, json.dumps(routes or [ORIGINAL, ALTERNATE]))

    def test_verdict_is_committed_and_sender_scoped(self):
        key = self.verify()
        data = json.loads(self.access.get_verdict(key))
        self.assertEqual(data["digest"], contract.digest(contract.pack(data["report"])))
        self.assertEqual(consensus_calls[-1][0], consensus_calls[-1][1])
        genlayer.gl.message.sender_address = "0x" + "2" * 40
        self.assertNotEqual(self.verify(), key)

    def test_duplicate_never_overwrites(self):
        key = self.verify()
        before = self.access.get_verdict(key)
        with self.assertRaises(UserError):
            self.verify(routes=[ALTERNATE])
        self.assertEqual(self.access.get_verdict(key), before)

    def test_inconsistent_validator_fetch_creates_no_record(self):
        values = iter([FIXTURE, FIXTURE + b" "])
        web.get = lambda _: response(next(values), status=200)
        with self.assertRaises(RuntimeError):
            self.verify()
        self.assertEqual(self.access.get_verdict(wallet + "/" + "1" * 32), "")

    def test_request_rejects_malformed_and_disconnected_itinerary(self):
        for routes in ([[["NORTH", "P2", True, 5, ["DEMO-N"]]]],
                       [[["NORTH", "P2", 0, 5, ["DEMO-N", "DEMO-N"]]]],
                       [[ORIGINAL[0], ALTERNATE[0]]], [ORIGINAL] * 3):
            with self.assertRaises(UserError):
                self.verify(routes=routes)
        with self.assertRaises(UserError):
            self.verify(request="malformed")
        self.assertFalse(self.access.records)
