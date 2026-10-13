"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {evaluateTask, booleanValue, parseCsv, resultsCsv} = require("../web/app.js");

const nominal = {task_id:"T1", target_identifier:"SAMPLE-1",
  primary_metric:25, secondary_metric:12, status_descriptor:"NOMINAL",
  is_critical_flag:false};

test("exact thresholds are nominal", () => {
  const r = evaluateTask(nominal);
  assert.equal(r.total_alerts, 0);
  assert.equal(r.overall_urgency, "ROUTINE");
  assert.equal(r.integrity_status, "VALIDATED_OPTIMAL");
});

test("primary and secondary warnings are independent", () => {
  const r = evaluateTask({...nominal, primary_metric:25.01, secondary_metric:12.01});
  assert.equal(r.total_alerts, 2);
  assert.equal(r.overall_urgency, "ELEVATED_RISK");
});

test("critical flag escalates irrespective of secondary metric", () => {
  const r = evaluateTask({...nominal, is_critical_flag:true});
  assert.equal(r.critical_alerts_count, 1);
  assert.equal(r.integrity_status, "RECALIBRATION_REQUIRED");
});

test("descriptor warning fires exactly one worker", () => {
  const r = evaluateTask({...nominal, status_descriptor:"DISCORDANT_ANOMALY"});
  assert.equal(r.total_alerts, 1);
  assert.equal(r.alerts[0].origin_worker, "ProtocolConformanceWorker");
});

test("false CSV boolean is not truthy", () => {
  assert.equal(booleanValue("False"), false);
  assert.equal(booleanValue("0"), false);
  assert.equal(booleanValue("yes"), true);
  assert.throws(() => booleanValue("maybe"), /must be/);
});

test("nonfinite and empty numeric inputs rejected", () => {
  assert.throws(() => evaluateTask({...nominal, primary_metric:"NaN"}), /finite/);
  assert.throws(() => evaluateTask({...nominal, primary_metric:""}), /required/);
  assert.throws(() => evaluateTask({...nominal, secondary_metric:"Infinity"}), /finite/);
});

test("identifiers rejected without reflecting private input", () => {
  assert.throws(() => evaluateTask({...nominal, task_id:"MRN-123456"}), /blocked/);
  assert.throws(() => evaluateTask({...nominal, target_identifier:"patient@example.com"}), /blocked/);
});

test("quoted CSV, CRLF, and boolean fields", () => {
  const rows = parseCsv("\uFEFFtask_id,target_identifier,primary_metric,is_critical_flag\r\n" +
    '"T,1",SAMPLE-1,12,False\r\nT2,SAMPLE-2,30,True\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].task_id, "T,1");
  assert.equal(evaluateTask(rows[0]).overall_urgency, "ROUTINE");
  assert.equal(evaluateTask(rows[1]).overall_urgency, "CRITICAL_STAT_PANIC");
});

test("malformed or absent CSV headers rejected", () => {
  assert.throws(() => parseCsv("task_id,primary_metric\nT1,4"), /target_identifier/);
  assert.throws(() => parseCsv('task_id,target_identifier,primary_metric\n"T1,ABC,12'), /Unterminated/);
  assert.throws(() => parseCsv("task_id,target_identifier,primary_metric\nT1,S1"), /column count/);
  assert.throws(() => parseCsv('task_id,target_identifier,primary_metric\n"T"X,S1,10'), /Unexpected/);
});

test("export quotes dangerous spreadsheet formulas", () => {
  const r = evaluateTask({...nominal, task_id:"=SUM(1,1)"});
  const csv = resultsCsv([r]);
  assert.match(csv, /"'=SUM\(1,1\)"/);
  assert.match(csv, /"ROUTINE"/);
});
