# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import datetime
import hashlib
import json
import re

DEMO = "https://raw.githubusercontent.com/amzar1st/AccessRoute-/ab2e31740e758c8e167ed7c92e5d86a2e3ac15ec/evidence/harbor-exchange.json"
DEMO_HASH = "714b72cc2abeeaf794f77717b875a570bc54f5a371d90c7164ab540a5832f65b"
MTA = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json"


def pack(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def require(condition, message):
    if not condition:
        raise gl.UserError(message)


def valid_token(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Z0-9][A-Z0-9-]{0,23}", value) is not None


def parse_request(mode, departure, raw):
    require(mode in ("demo", "mta"), "Unknown evidence mode")
    require(1735689600 <= departure < 4102444800, "Departure outside supported dates")
    require(len(raw) <= 4096, "Itinerary too large")
    try:
        routes = json.loads(raw)
    except ValueError:
        raise gl.UserError("Invalid itinerary JSON")
    require(type(routes) is list and 1 <= len(routes) <= 2, "Provide one or two routes")
    for route in routes:
        require(type(route) is list and 1 <= len(route) <= 6, "Provide one to six legs per route")
        last_end = 0
        previous_target = None
        for leg in route:
            require(type(leg) is list and len(leg) == 5, "Invalid leg")
            origin, target, start, end, lifts = leg
            require(valid_token(origin) and valid_token(target) and origin != target, "Invalid entrance or platform")
            require(previous_target is None or origin == previous_target, "Legs must connect")
            require(type(start) is int and type(end) is int and last_end <= start < end <= 240,
                    "Invalid or overlapping leg offsets")
            require(type(lifts) is list and 1 <= len(lifts) <= 4 and all(valid_token(x) for x in lifts),
                    "Provide one to four equipment IDs")
            require(len(set(lifts)) == len(lifts), "Duplicate equipment ID")
            if mode == "mta":
                require(all(re.fullmatch(r"EL[0-9]{1,6}[A-Z]?", x) for x in lifts), "Use MTA elevator IDs")
            last_end = end
            previous_target = target
    return routes


def ny_wall_time(epoch):
    utc = datetime.datetime(1970, 1, 1) + datetime.timedelta(seconds=epoch)
    march = datetime.datetime(utc.year, 3, 8, 7)
    november = datetime.datetime(utc.year, 11, 1, 6)
    spring = march + datetime.timedelta(days=(6 - march.weekday()) % 7)
    fall = november + datetime.timedelta(days=(6 - november.weekday()) % 7)
    return utc - datetime.timedelta(hours=4 if spring <= utc < fall else 5)


def mta_date(value):
    # Feed uses New York local wall time. Parse its documented 12-hour format.
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)", value)
    if not match:
        return None
    month, day, year, hour, minute, second = map(int, match.groups()[:6])
    if not 1 <= hour <= 12:
        return None
    try:
        return datetime.datetime(year, month, day, hour % 12 + (12 if match[7] == "PM" else 0), minute, second)
    except ValueError:
        return None


def classify_demo(leg, start, end, feed):
    origin, target, _, _, lifts = leg
    if feed["paths"].get(origin + ">" + target) != lifts:
        return "INSUFFICIENT", []
    matched = []
    for lift in lifts:
        verdict, begin, until = feed["windows"][lift]
        if verdict == "BLOCKED" and start < until and begin < end:
            return "BLOCKED", [lift]
        if verdict == "SUPPORTED" and begin <= start and end <= until:
            matched.append(lift)
    return ("SUPPORTED" if len(matched) == len(lifts) else "INSUFFICIENT"), matched


def classify_mta(leg, start, end, feed):
    begin, until = ny_wall_time(start), ny_wall_time(end)
    # Both repeated and skipped local hours are ambiguous for this feed.
    if ny_wall_time(start - 3600) + datetime.timedelta(hours=1) != begin or (
        ny_wall_time(end + 3600) - datetime.timedelta(hours=1) != until
    ) or until - begin != datetime.timedelta(seconds=end - start):
        return "INSUFFICIENT", [], []
    matched = {}
    for row in feed:
        if not isinstance(row, dict) or row.get("equipmenttype") != "EL":
            continue
        equipment = row.get("equipment")
        if equipment not in leg[4]:
            continue
        starts = mta_date(row.get("outagedate"))
        ends = mta_date(row.get("estimatedreturntoservice"))
        if starts is not None and ends is not None and starts < ends and begin < ends and starts < until:
            matched.setdefault(equipment, set()).add((starts.isoformat(), ends.isoformat()))
    # An estimated repair or the absence of an outage never proves operability.
    return ("BLOCKED" if matched else "INSUFFICIENT"), sorted(matched), [
        [equipment, start_at, end_at] for equipment in sorted(matched)
        for start_at, end_at in sorted(matched[equipment])[:8]
    ]


def evaluate(mode, departure, routes, fetch):
    url = DEMO if mode == "demo" else MTA
    feed = None
    source_status = "UNAVAILABLE"
    try:
        response = fetch(url)
        status = getattr(response, "status", None)
        if status is None:
            status = response.status_code
        if status == 200 and 0 < len(response.body) <= 524288:
            raw = response.body.decode("utf-8")
            if mode == "demo" and digest(raw) != DEMO_HASH:
                source_status = "HASH_MISMATCH"
            else:
                parsed = json.loads(raw)
                if (mode == "demo" and isinstance(parsed, dict)) or (mode == "mta" and isinstance(parsed, list)):
                    feed, source_status = parsed, "READ"
    except Exception:
        pass
    results = []
    for route in routes:
        findings = []
        for leg in route:
            start, end = (departure + offset * 60 for offset in leg[2:4])
            verdict, ids, notices = "INSUFFICIENT", [], []
            if feed is not None and mode == "demo":
                verdict, ids = classify_demo(leg, start, end, feed)
            elif feed is not None:
                verdict, ids, notices = classify_mta(leg, start, end, feed)
            findings.append({"path": leg[:2], "window": [start, end], "equipment": leg[4],
                             "matched": ids, "outages_ny": notices, "verdict": verdict})
        statuses = [item["verdict"] for item in findings]
        verdict = "BLOCKED" if "BLOCKED" in statuses else (
            "SUPPORTED" if all(item == "SUPPORTED" for item in statuses) else "INSUFFICIENT"
        )
        results.append({"verdict": verdict, "legs": findings})
    return pack({"mode": mode, "departure": departure, "source": url, "source_status": source_status,
                 "source_commitment": DEMO_HASH if mode == "demo" else "", "routes": results})


class AccessRoute(gl.Contract):
    records: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def verify_routes(self, request_id: str, mode: str, departure: u256, itinerary: str) -> str:
        require(re.fullmatch(r"[0-9a-f]{32}", request_id) is not None, "Invalid request ID")
        routes = parse_request(mode, int(departure), itinerary)
        key = str(gl.message.sender_address).lower() + "/" + request_id
        require(key not in self.records, "Request already exists")
        def verify() -> str:
            return evaluate(mode, int(departure), routes, gl.nondet.web.get)
        report = gl.eq_principle.strict_eq(verify)
        self.records[key] = pack({"report": json.loads(report), "digest": digest(report)})
        return key

    @gl.public.view
    def get_verdict(self, key: str) -> str:
        return self.records.get(key, "") if len(key) == 75 else ""
