from __future__ import annotations
import hashlib
import hmac
import json
import math
import re
import time
from email.utils import parsedate_to_datetime
from typing import Any, cast
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from .models import ShipmentInput, ShipmentPatch, Shipment, ImportInput, ImportJob, AnalyticsReport, TrackingResult, SandboxTrackingResult


class TraceError(Exception):
    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, retry_after: str | None = None, body: Any = None):
        super().__init__(message)
        self.status, self.code = status, code
        self.request_id, self.retry_after, self.body = request_id, retry_after, body


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Trace:
    def __init__(self, api_key: str, *, base_url: str = "https://api.traceapi.dev", timeout: float = 95, retries: int = 2):
        url = urlsplit(base_url)
        if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")):
            raise ValueError("Use HTTPS, or localhost for testing")
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("base_url must not contain credentials, query or fragment")
        if not api_key or not isinstance(retries, int) or not 0 <= retries <= 5 or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("Invalid client configuration")
        self.api_key, self.base_url = api_key, base_url.rstrip("/")
        self.timeout, self.retries = timeout, retries
        self._opener = build_opener(_NoRedirect())

    def request(self, method: str, path: str, body: Any = None, *, idempotency_key: str | None = None) -> Any:
        if not path.startswith("/v1/") or ".." in path:
            raise ValueError("Use a Trace /v1/ path")
        safe = method == "GET" or (bool(idempotency_key) and path in ("/v1/shipments", "/v1/imports", "/v1/tracking-jobs")) or path in ("/v1/track", "/v1/track/batch", "/v1/sandbox/track")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "trace-python/0.3.0"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range((self.retries if safe else 0) + 1):
            request = Request(self.base_url + path, data=data, headers=headers, method=method)
            try:
                response = self._opener.open(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                raw = response.read()
                try:
                    parsed = json.loads(raw) if raw else None
                except (ValueError, UnicodeDecodeError):
                    raise TraceError(status, "invalid_response", "Trace returned an invalid JSON response") from None
                if 200 <= status < 300:
                    return parsed
                retry_after = response.headers.get("Retry-After")
                try:
                    delay = float(retry_after) if retry_after and re.fullmatch(r"\d+(\.\d+)?", retry_after) else parsedate_to_datetime(retry_after).timestamp() - time.time() if retry_after else .5 * 2 ** attempt
                except (ValueError, TypeError, OverflowError):
                    delay = float("inf")
                if safe and attempt < self.retries and status in (429, 503) and math.isfinite(delay) and delay <= 60:
                    time.sleep(max(0, delay))
                    continue
                error = parsed.get("error", {}) if isinstance(parsed, dict) else {}
                raise TraceError(status, error.get("code", "request_failed"), error.get("message", "Trace request failed"), response.headers.get("X-Request-Id"), retry_after, parsed)

    def track(self, tracking_number: str, *, carrier: str | None = None, allow_stale: bool = False) -> TrackingResult:
        return cast(TrackingResult, self.request("POST", "/v1/track", {"tracking_number": tracking_number, "allow_stale": allow_stale, **({"carrier": carrier} if carrier else {})}))

    def batch(self, tracking_numbers: list[str], *, carrier: str | None = None) -> dict[str, Any]:
        return self.request("POST", "/v1/track/batch", {"tracking_numbers": tracking_numbers, **({"carrier": carrier} if carrier else {})})

    def sandbox(self, scenario: str = "delivered") -> SandboxTrackingResult:
        return cast(SandboxTrackingResult, self.request("POST", "/v1/sandbox/track", {"scenario": scenario}))

    def create_shipment(self, shipment: ShipmentInput, *, idempotency_key: str) -> dict[str, Any]:
        return self.request("POST", "/v1/shipments", shipment, idempotency_key=idempotency_key)

    def shipment(self, shipment_id: str) -> dict[str, Shipment]:
        return self.request("GET", f"/v1/shipments/{quote(shipment_id, safe='')}")

    def shipments(self, **query: str | int) -> dict[str, Any]:
        return self.request("GET", "/v1/shipments" + ("?" + urlencode(query) if query else ""))

    def update_shipment(self, shipment_id: str, patch: ShipmentPatch) -> dict[str, Shipment]:
        return self.request("PATCH", f"/v1/shipments/{quote(shipment_id, safe='')}", patch)

    def alerts(self, **query: str | int) -> dict[str, Any]:
        return self.request("GET", "/v1/alerts" + ("?" + urlencode(query) if query else ""))

    def acknowledge_alert(self, alert_id: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/alerts/{quote(alert_id, safe='')}/acknowledge", {})

    def assign_alert(self, alert_id: str, owner_label: str | None) -> dict[str, Any]:
        return self.request("PATCH", f"/v1/alerts/{quote(alert_id, safe='')}", {"owner_label": owner_label})

    def resolve_alert(self, alert_id: str, note: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/alerts/{quote(alert_id, safe='')}/resolve", {"note": note})

    def alert_history(self, alert_id: str, **query: str | int) -> dict[str, Any]:
        return self.request("GET", f"/v1/alerts/{quote(alert_id, safe='')}/history" + ("?" + urlencode(query) if query else ""))

    def create_tracking_job(self, data: dict[str, Any], *, idempotency_key: str) -> dict[str, Any]:
        return self.request("POST", "/v1/tracking-jobs", data, idempotency_key=idempotency_key)

    def tracking_jobs(self, **query: str | int) -> dict[str, Any]:
        return self.request("GET", "/v1/tracking-jobs" + ("?" + urlencode(query) if query else ""))

    def tracking_job(self, job_id: str) -> dict[str, Any]:
        return self.request("GET", f"/v1/tracking-jobs/{quote(job_id, safe='')}")

    def tracking_job_results(self, job_id: str, *, after_row: int = 0, limit: int = 100) -> dict[str, Any]:
        return self.request("GET", f"/v1/tracking-jobs/{quote(job_id, safe='')}/results?" + urlencode({"after_row": after_row, "limit": limit}))

    def cancel_tracking_job(self, job_id: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/tracking-jobs/{quote(job_id, safe='')}/cancel", {})

    def reliability(self, *, days: int = 30) -> dict[str, Any]:
        return self.request("GET", f"/v1/analytics/reliability?days={days}")

    def create_import(self, data: ImportInput, *, idempotency_key: str) -> dict[str, ImportJob]:
        return self.request("POST", "/v1/imports", data, idempotency_key=idempotency_key)

    def import_job(self, job_id: str) -> dict[str, ImportJob]:
        return self.request("GET", f"/v1/imports/{quote(job_id, safe='')}")

    def import_results(self, job_id: str, *, after_row: int = 0) -> dict[str, Any]:
        return self.request("GET", f"/v1/imports/{quote(job_id, safe='')}/results?after_row={after_row}")

    def cancel_import(self, job_id: str) -> dict[str, ImportJob]:
        return self.request("POST", f"/v1/imports/{quote(job_id, safe='')}/cancel", {})

    def analytics(self, *, days: int = 30) -> AnalyticsReport:
        return cast(AnalyticsReport, self.request("GET", f"/v1/analytics?days={days}"))

    def deliveries(self, webhook_id: str, *, cursor: str | None = None) -> dict[str, Any]:
        return self.request("GET", f"/v1/webhooks/{quote(webhook_id, safe='')}/deliveries" + ("?" + urlencode({"cursor": cursor}) if cursor else ""))

    def replay(self, webhook_id: str, delivery_id: str, reason: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/webhooks/{quote(webhook_id, safe='')}/deliveries/{quote(delivery_id, safe='')}/replay", {"reason": reason})


def verify_webhook(raw_body: bytes, signature: str, secret: str, *, now: float | None = None, tolerance_seconds: int = 300) -> bool:
    parts = [part.split("=", 1) for part in signature.split(",")]
    timestamps = [p[1] for p in parts if len(p) == 2 and p[0] == "t"]
    if len(timestamps) != 1 or not timestamps[0].isdigit() or not math.isfinite(tolerance_seconds) or tolerance_seconds < 0:
        return False
    timestamp = timestamps[0]
    if abs((time.time() if now is None else now) - int(timestamp)) > tolerance_seconds:
        return False
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(len(p) == 2 and p[0] == "v1" and bool(re.fullmatch(r"[a-f0-9]{64}", p[1])) and hmac.compare_digest(expected, p[1]) for p in parts)
