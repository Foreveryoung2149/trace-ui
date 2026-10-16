import {test, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readdir, unlink, rmdir} from "node:fs/promises";
import {fileURLToPath, pathToFileURL} from "node:url";
import {join, resolve} from "node:path";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {sampleOrders, sampleShipments} from "@traceapi/timeline/samples";

const directory = fileURLToPath(new URL("./", import.meta.url));
const output = await mkdtemp(join(directory, ".template-tests-"));
after(async () => {
  assert.ok(resolve(output).startsWith(resolve(directory) + "\\.template-tests-") || resolve(output).startsWith(resolve(directory) + "/.template-tests-"));
  for (const name of await readdir(output)) {assert.match(name, /^[A-Za-z]+\.js$/); await unlink(join(output, name));}
  await rmdir(output);
});
const config = ts.readConfigFile(join(directory, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
const program = ts.createProgram(parsed.fileNames, {...parsed.options, noEmit: false, declaration: false, rootDir: directory, outDir: output});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCurrentDirectory:()=>directory,getCanonicalFileName:file=>file,getNewLine:()=>"\n"}));
assert.equal(program.emit().emitSkipped, false);
const {OrderTrackingPage} = await import(pathToFileURL(join(output, "OrderTrackingPage.js")).href);
const {SupportShipmentPanel} = await import(pathToFileURL(join(output, "SupportShipmentPanel.js")).href);
const {ReadOnlyReturnTimeline} = await import(pathToFileURL(join(output, "ReadOnlyReturnTimeline.js")).href);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("order template compiles and renders independent split parcels with no external resources", () => {
  const html = render(OrderTrackingPage, {order:sampleOrders.split});
  assert.match(html, /<main/);assert.match(html, /2 parcels/);assert.match(html, /DEMO-1042/);assert.match(html, /DEMO-1043/);
  assert.doesNotMatch(html, /All parcels delivered|<script|<iframe|<img|https?:\/\//);
});
test("support template preserves stale warnings and escapes notes instead of treating them as carrier events", () => {
  const html = render(SupportShipmentPanel, {shipment:sampleShipments.stale,supportNote:"<script>internal example</script>"});
  assert.match(html, /<aside/);assert.match(html, /current shipment state has not been verified/);assert.match(html, /Internal support note/);
  assert.match(html, /&lt;script&gt;/);assert.doesNotMatch(html, /<script>/);assert.match(html, /does not change the carrier/);
});
test("return template renders a return path only from supplied status and never implies a refund", () => {
  const returning = render(ReadOnlyReturnTimeline, {shipment:sampleShipments.returning});
  assert.match(returning, /aria-current="step"/);assert.match(returning, /do not establish that a refund was issued/);
  for (const shipment of [sampleShipments.exception,sampleShipments.cancelled]) {
    const html = render(ReadOnlyReturnTimeline, {shipment});assert.match(html, /No return status or return scan was supplied/);assert.doesNotMatch(html, /aria-current="step"/);
  }
});
