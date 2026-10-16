"use client";
import { useState } from "react";
import { ShipmentTimeline, type TimelineShipment } from "../src/index";
import { sampleShipments, sampleScenarioLabels } from "../src/samples";
import "./demo.css";
const scenarios = Object.entries(sampleScenarioLabels);
export default function TimelineDemo({shipment}: {shipment?: TimelineShipment}) {
  const [scenario, setScenario] = useState("delivered");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  return <div className="timeline-demo">
    <div className="td-controls">
      {!shipment && <label>Shipment state<select aria-label="Shipment state" value={scenario} onChange={event => setScenario(event.target.value)}>{scenarios.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
      <label>Appearance<select aria-label="Timeline appearance" value={theme} onChange={event => setTheme(event.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <span className="td-local">{shipment ? "Server-supplied data" : "Local samples · No API calls"}</span>
    </div>
    <ShipmentTimeline shipment={shipment || sampleShipments[scenario]} theme={theme} />
    {!shipment && <p className="td-caption">Illustrative scenarios, including stale and unavailable states. No real parcel or estimated delivery is represented.</p>}
  </div>;
}
