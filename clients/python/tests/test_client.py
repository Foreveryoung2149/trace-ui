import io
import json
import hashlib
import hmac
import unittest
from unittest.mock import patch
from traceapi import Trace, TraceError, verify_webhook

class Response(io.BytesIO):
    def __init__(self, status, data, headers=None):
        super().__init__(json.dumps(data).encode()); self.code = status; self.headers = headers or {}

class ClientTests(unittest.TestCase):
    def test_idempotent_retry_and_unknown_timezone(self):
        client = Trace("fixture-key")
        responses = [Response(503, {"error": {"code": "busy"}}, {"Retry-After": "0"}), Response(200, {"shipment": {"tracking": {"events": [{"timestamp": None}]}}})]
        with patch.object(client._opener, "open", side_effect=responses) as opener, patch("time.sleep"):
            result = client.create_shipment({"tracking_number": "FIXTURE123"}, idempotency_key="order-1")
        self.assertEqual(opener.call_count, 2); self.assertIsNone(result["shipment"]["tracking"]["events"][0]["timestamp"])
        self.assertEqual(opener.call_args[0][0].headers["Idempotency-key"], "order-1")
    def test_replay_does_not_retry(self):
        client = Trace("fixture-key")
        with patch.object(client._opener, "open", return_value=Response(503, {"error": {"code": "busy"}}, {"Retry-After": "0"})) as opener:
            with self.assertRaises(TraceError): client.replay("wh-fixture", "delivery-fixture", "receiver recovered")
        self.assertEqual(opener.call_count, 1)
    def test_long_retry_after_and_auth(self):
        for status in [401, 429]:
            client = Trace("fixture-key")
            with patch.object(client._opener, "open", return_value=Response(status, {"error": {"code": "limited"}}, {"Retry-After": "999999"})) as opener:
                with self.assertRaises(TraceError) as ctx: client.shipments()
            self.assertEqual(opener.call_count, 1); self.assertEqual(ctx.exception.retry_after, "999999")
    def test_mixed_batch(self):
        rows = [{"status": "delivered"}, {"error": {"code": "source_unavailable"}}]
        client = Trace("fixture-key")
        with patch.object(client._opener, "open", return_value=Response(200, {"results": rows})):
            self.assertEqual(client.batch(["FIXTURE123", "FIXTURE456"])["results"], rows)
    def test_signatures_and_overlap(self):
        raw = b'{"fixture":true}'
        signatures = [hmac.new(secret.encode(), b"1000." + raw, hashlib.sha256).hexdigest() for secret in ["new", "old"]]
        header = "t=1000," + ",".join("v1=" + sig for sig in signatures)
        for secret in ["new", "old"]: self.assertTrue(verify_webhook(raw, header, secret, now=1000))
        self.assertFalse(verify_webhook(raw+b" ", header, "new", now=1000))
        self.assertFalse(verify_webhook(raw, header, "new", now=1301))
        self.assertFalse(verify_webhook(raw, header+",t=1000", "new", now=1000))

    def test_async_submit_retries_confirmed_rejection_with_same_key(self):
        client = Trace("fixture-key")
        responses = [Response(503, {"error": {"code": "busy"}}, {"Retry-After": "0"}), Response(202, {"job": {"status": "queued"}, "replayed": True})]
        with patch.object(client._opener, "open", side_effect=responses) as opener, patch("time.sleep"):
            result = client.create_tracking_job({"tracking_numbers": ["FIXTURE123"]}, idempotency_key="stable-async-key")
        self.assertEqual(result["job"]["status"], "queued")
        self.assertEqual(opener.call_count, 2)
        self.assertTrue(all(call[0][0].headers["Idempotency-key"] == "stable-async-key" for call in opener.call_args_list))

    def test_cancel_and_resolution_do_not_retry(self):
        for invoke in [lambda client: client.cancel_tracking_job("job_fixture"), lambda client: client.resolve_alert("alert_fixture", "Investigated")]:
            client = Trace("fixture-key")
            with patch.object(client._opener, "open", return_value=Response(503, {"error": {"code": "busy"}}, {"Retry-After": "0"})) as opener:
                with self.assertRaises(TraceError): invoke(client)
            self.assertEqual(opener.call_count, 1)

    def test_async_result_keeps_null_time_and_query(self):
        client = Trace("fixture-key")
        payload = {"data": [{"row": 1, "result": {"events": [{"timestamp": None, "timestamp_timezone": "unknown"}]}}], "next_row": None}
        with patch.object(client._opener, "open", return_value=Response(200, payload)) as opener:
            self.assertEqual(client.tracking_job_results("job_fixture", after_row=0, limit=20), payload)
        self.assertTrue(opener.call_args[0][0].full_url.endswith("/results?after_row=0&limit=20"))

if __name__ == "__main__": unittest.main()
