"use strict";

/* The browser implements the rule thresholds in agents/workers.py.
   This is a local rule audit, not MOFA+ model fitting or medical advice. */
const RULES = Object.freeze({ primary: 25, secondary: 12 });
const REQUIRED_COLUMNS = ["task_id", "target_identifier", "primary_metric"];
const RESULT_COLUMNS = ["task_id", "target_identifier", "primary_metric",
  "secondary_metric", "status_descriptor", "is_critical_flag",
  "overall_urgency", "integrity_status", "total_alerts", "critical_alerts_count"];
const IDENTIFIERS = [
  /\b(?:MRN)[:#\s-]*\d{4,10}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:DOB|Date of Birth)[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
  /\b(?:Patient\s+Name|Patient)[:\s]+[A-Z][a-z]+\s+[A-Z][a-z]+\b/i
];

function numeric(value, field) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(field + " is required.");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(field + " must be a finite number.");
  return number;
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  const token = String(value ?? "").trim().toLowerCase();
  if (["", "0", "false", "no", "n", "off"].includes(token)) return false;
  if (["1", "true", "yes", "y", "on"].includes(token)) return true;
  throw new Error("is_critical_flag must be true or false (or 1/0, yes/no).");
}

function requiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + " is required.");
  if (text.length > 200) throw new Error(field + " exceeds 200 characters.");
  return text;
}

function evaluateTask(raw) {
  const task_id = requiredText(raw.task_id, "task_id");
  const target_identifier = requiredText(raw.target_identifier, "target_identifier");
  const status_descriptor = String(raw.status_descriptor ?? "NOMINAL").trim() || "NOMINAL";
  if (status_descriptor.length > 200) throw new Error("status_descriptor exceeds 200 characters.");
  const allText = [task_id, target_identifier, status_descriptor].join(" ");
  if (IDENTIFIERS.some(re => re.test(allText))) {
    throw new Error("Input contains a blocked sensitive identifier. Use de-identified research codes.");
  }

  const primary_metric = numeric(raw.primary_metric, "primary_metric");
  const secondary_metric = numeric(raw.secondary_metric ?? 0, "secondary_metric");
  const is_critical_flag = booleanValue(raw.is_critical_flag);
  const alerts = [];

  function alert(origin_worker, urgency, summary, technical_details) {
    alerts.push({origin_worker, urgency, summary, technical_details});
  }

  if (primary_metric > RULES.primary) {
    alert("InvariantQCWorker", "ELEVATED_RISK", "Primary Metric Threshold Exceeded",
      "Primary measurement " + primary_metric + " exceeds configured threshold " + RULES.primary + ".");
  }
  if (is_critical_flag || secondary_metric > RULES.secondary) {
    alert("SafetyEscalationWorker", is_critical_flag ? "CRITICAL_STAT_PANIC" : "ELEVATED_RISK",
      "Safety Rule Triggered",
      "Critical flag " + is_critical_flag + "; secondary index " + secondary_metric +
      " (threshold " + RULES.secondary + ").");
  }
  if (["DISCORDANT", "ANOMALY", "MUTANT", "VIOLATION", "FAIL", "REJECT"]
      .some(word => status_descriptor.toUpperCase().includes(word))) {
    alert("ProtocolConformanceWorker", "ELEVATED_RISK",
      "Descriptor Flag Detected", "Status descriptor contains a configured warning token.");
  }

  const critical_alerts_count = alerts.filter(a => a.urgency === "CRITICAL_STAT_PANIC").length;
  const overall_urgency = critical_alerts_count ? "CRITICAL_STAT_PANIC" :
    alerts.length ? "ELEVATED_RISK" : "ROUTINE";
  const integrity_status = critical_alerts_count ? "RECALIBRATION_REQUIRED" :
    alerts.length ? "DISCORDANT_ANOMALY" : "VALIDATED_OPTIMAL";
  return {task_id, target_identifier, primary_metric, secondary_metric, status_descriptor,
    is_critical_flag, overall_urgency, integrity_status, total_alerts: alerts.length,
    critical_alerts_count, alerts};
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {field += '"'; i++;}
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ',') {row.push(field); field = "";}
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else if (c === '"') {
      throw new Error("Invalid quote in CSV field.");
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("CSV file is empty.");
  const headers = rows.shift().map(v => v.trim());
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV column headers.");
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) throw new Error("Missing CSV column: " + required);
  }
  if (rows.length > 5000) throw new Error("CSV exceeds the 5,000-record limit.");
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error("CSV row " + (index + 2) + " has an incorrect column count.");
    const item = {};
    headers.forEach((h, j) => {item[h] = values[j];});
    return item;
  });
}

function csvEscape(value) {
  let text = String(value ?? "");
  // Spreadsheet formula injection protection for exported user-supplied strings.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function resultsCsv(results) {
  const lines = [RESULT_COLUMNS.map(csvEscape).join(",")];
  for (const result of results) lines.push(
    RESULT_COLUMNS.map(key => csvEscape(result[key])).join(","));
  return lines.join("\r\n") + "\r\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {evaluateTask, booleanValue, numeric, parseCsv, resultsCsv, csvEscape};
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("audit-form");
    const output = document.getElementById("output");
    const message = document.getElementById("message");
    const download = document.getElementById("download");
    const csvFile = document.getElementById("csv-file");
    const count = document.getElementById("processed");
    const flagged = document.getElementById("flagged");
    let total = 0, alerts = 0, latestCsv = "";

    const display = (data, msg) => {
      output.textContent = JSON.stringify(data, null, 2);
      message.textContent = msg;
    };
    const increment = (results) => {
      total += results.length;
      alerts += results.filter(r => r.total_alerts > 0).length;
      count.textContent = String(total);
      flagged.textContent = String(alerts);
    };

    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.is_critical_flag = document.getElementById("is-critical").checked;
        const result = evaluateTask(data);
        increment([result]);
        latestCsv = resultsCsv([result]);
        download.disabled = false;
        display(result, "Local evaluation completed; no data transmitted.");
      } catch (error) {
        display({error: error.message}, "Input rejected.");
      }
    });

    csvFile.addEventListener("change", async () => {
      const file = csvFile.files && csvFile.files[0];
      if (!file) return;
      download.disabled = true;
      latestCsv = "";
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error("File exceeds the 2 MB limit.");
        const records = parseCsv(await file.text());
        if (records.length === 0) throw new Error("CSV has no data rows.");
        const results = records.map((r, i) => {
          try {return evaluateTask(r);}
          catch (error) {throw new Error("CSV row " + (i + 2) + ": " + error.message);}
        });
        increment(results);
        latestCsv = resultsCsv(results);
        download.disabled = false;
        display({records: results.length, flagged: results.filter(r => r.total_alerts).length,
          preview: results.slice(0, 5)}, "Processed locally. Export the full results as CSV.");
      } catch (error) {
        display({error: error.message}, "CSV rejected.");
      }
    });

    download.addEventListener("click", () => {
      if (!latestCsv) return;
      const url = URL.createObjectURL(new Blob([latestCsv], {type:"text/csv;charset=utf-8"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "multi-omics-rule-audit.csv";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });
}
