# Generated from Trace OpenAPI. Do not edit.
from __future__ import annotations
from typing import Any, Literal, NotRequired, TypedDict

Carrier = TypedDict("Carrier", {
    "code": "str",
    "name": "str",
    "type": "Literal[\"premium\", \"standard\", \"domestic\", \"regional\", \"dropshipping\", \"freight\", \"unknown\"]"
})

TrackingEvent = TypedDict("TrackingEvent", {
    "status": "Literal[\"pending\", \"in_transit\", \"out_for_delivery\", \"customs\", \"delivered\", \"exception\"]",
    "description": "str",
    "location": "NotRequired[str | None]",
    "timestamp": "str | None",
    "timestamp_local": "NotRequired[str]",
    "timestamp_timezone": "NotRequired[Literal[\"unknown\"]]",
    "timestamp_precision": "NotRequired[Literal[\"minute\", \"second\"]]"
})

TrackingResult = TypedDict("TrackingResult", {
    "tracking_number": "str",
    "carrier": "Carrier",
    "status": "Literal[\"pending\", \"in_transit\", \"out_for_delivery\", \"customs\", \"delivered\", \"exception\"]",
    "estimated_delivery": "NotRequired[str | None]",
    "events": "list[TrackingEvent]",
    "cached": "bool",
    "stale": "NotRequired[bool]",
    "warning": "NotRequired[dict[str, Any]]",
    "data_freshness": "NotRequired[dict[str, Any]]",
    "request_id": "NotRequired[str]",
    "last_checked_at": "NotRequired[str]"
})

SandboxTrackingResult = TypedDict("SandboxTrackingResult", {
    "test": "Literal[True]",
    "scenario": "Literal[\"pending\", \"in_transit\", \"out_for_delivery\", \"delivered\", \"exception\", \"unknown_timezone\"]",
    "tracking_number": "str",
    "carrier": "Carrier",
    "status": "str",
    "events": "list[TrackingEvent]",
    "estimated_delivery": "NotRequired[None]",
    "cached": "Literal[False]",
    "last_checked_at": "None",
    "data_freshness": "dict[str, Any]",
    "request_id": "str"
})

Error = TypedDict("Error", {
    "error": "dict[str, Any]"
})

HealthStatus = TypedDict("HealthStatus", {
    "ok": "bool",
    "service": "str",
    "database": "Literal[\"operational\", \"degraded\", \"memory\"]",
    "acquisition": "NotRequired[dict[str, Any]]",
    "timestamp": "NotRequired[str]",
    "started_at": "NotRequired[str]",
    "uptime_seconds": "NotRequired[int]",
    "environment": "NotRequired[str]",
    "version": "NotRequired[str]",
    "version_short": "NotRequired[str]"
})

Webhook = TypedDict("Webhook", {
    "id": "str",
    "url": "str",
    "active": "bool",
    "events": "list[Literal[\"tracking.updated\", \"tracking.delivered\", \"tracking.exception\", \"shipment.updated\", \"shipment.delivered\", \"shipment.alert\"]]",
    "secret": "NotRequired[str]",
    "createdAt": "NotRequired[str]",
    "updatedAt": "NotRequired[str]"
})

BatchItemError = TypedDict("BatchItemError", {
    "tracking_number": "str",
    "error": "dict[str, Any]"
})

ShipmentInput = TypedDict("ShipmentInput", {
    "tracking_number": "str",
    "carrier": "NotRequired[str]",
    "order_id": "NotRequired[str]",
    "reference": "NotRequired[str]",
    "destination_country": "NotRequired[str]",
    "metadata": "NotRequired[dict[str, str]]",
    "stalled_after_hours": "NotRequired[int]"
})

ShipmentPatch = TypedDict("ShipmentPatch", {
    "order_id": "NotRequired[str]",
    "reference": "NotRequired[str]",
    "destination_country": "NotRequired[str]",
    "metadata": "NotRequired[dict[str, str]]",
    "stalled_after_hours": "NotRequired[int]",
    "active": "NotRequired[bool]"
})

Shipment = TypedDict("Shipment", {
    "id": "str",
    "tracking_number": "str",
    "carrier": "str | None",
    "order_id": "str | None",
    "reference": "str | None",
    "destination_country": "str | None",
    "metadata": "dict[str, str]",
    "status": "Literal[\"pending\", \"in_transit\", \"out_for_delivery\", \"customs\", \"delivered\", \"exception\"]",
    "active": "bool",
    "tracking": "TrackingResult | None",
    "last_checked_at": "str | None",
    "last_error": "str | None",
    "next_refresh_at": "str",
    "monitor_until": "str",
    "stalled_after_hours": "int",
    "created_at": "str",
    "updated_at": "str"
})

ShipmentEvent = TypedDict("ShipmentEvent", {
    "id": "str",
    "event": "TrackingEvent",
    "observed_at": "str"
})

ShipmentAlert = TypedDict("ShipmentAlert", {
    "id": "str",
    "shipmentId": "str",
    "code": "str",
    "kind": "Literal[\"carrier_fact\", \"trace_inference\"]",
    "severity": "Literal[\"high\", \"medium\"]",
    "message": "str",
    "action": "str",
    "evidence": "dict[str, Any]",
    "active": "bool",
    "acknowledgedAt": "str | None",
    "resolvedAt": "str | None",
    "createdAt": "str",
    "updatedAt": "str",
    "shipment": "dict[str, Any]"
})

ImportJob = TypedDict("ImportJob", {
    "id": "str",
    "status": "Literal[\"queued\", \"processing\", \"completed\", \"cancelled\"]",
    "total": "int",
    "processed": "int",
    "succeeded": "int",
    "failed": "int",
    "cancel_requested": "bool",
    "created_at": "str",
    "updated_at": "str"
})

ImportInput = dict[str, Any] | dict[str, Any]

ImportResult = TypedDict("ImportResult", {
    "row": "int",
    "shipment_id": "str | None",
    "error": "dict[str, Any] | None"
})

WebhookAttempt = TypedDict("WebhookAttempt", {
    "id": "str",
    "deliveryId": "str",
    "attempt": "int",
    "status": "str",
    "statusCode": "int | None",
    "error": "str | None",
    "createdAt": "str"
})

WebhookDelivery = TypedDict("WebhookDelivery", {
    "id": "str",
    "userId": "str",
    "webhookId": "str",
    "eventId": "str | None",
    "eventType": "str",
    "trackingNumber": "str",
    "payload": "dict[str, Any]",
    "status": "Literal[\"pending\", \"processing\", \"retry\", \"paused\", \"delivered\", \"failed\"]",
    "statusCode": "int | None",
    "error": "str | None",
    "attempt": "int",
    "nextAttemptAt": "str | None",
    "leaseUntil": "str | None",
    "deliveredAt": "str | None",
    "createdAt": "str",
    "updatedAt": "str",
    "diagnostic": "dict[str, Any] | None"
})

AnalyticsCohort = TypedDict("AnalyticsCohort", {
    "carrier": "str",
    "destination_country": "str",
    "total_shipments": "int",
    "verified_shipments": "int",
    "unverified_shipments": "int",
    "delivered_shipments": "int",
    "delivered_rate": "float | None",
    "exception_shipments": "int",
    "stalled_shipments": "int",
    "monitoring_errors": "int",
    "utc_duration_samples": "int",
    "excluded_delivered_durations": "int",
    "median_observed_transit_hours": "float | None"
})

AnalyticsReport = TypedDict("AnalyticsReport", {
    "from": "str",
    "to": "str",
    "cohort_basis": "str",
    "duration_basis": "str",
    "total_shipments": "int",
    "verified_shipments": "int",
    "unverified_shipments": "int",
    "delivered_shipments": "int",
    "delivered_rate": "float | None",
    "exception_shipments": "int",
    "stalled_shipments": "int",
    "monitoring_errors": "int",
    "utc_duration_samples": "int",
    "excluded_delivered_durations": "int",
    "median_observed_transit_hours": "float | None",
    "cohorts": "list[AnalyticsCohort]"
})
