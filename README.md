# Multi-Omics Rule Audit

Deterministic threshold screening of **de-identified** multi-omics research records. Includes a static browser application, Python CLI, and optional FastAPI service.

**Scientific limitation:** Despite this repository's historical name, it does **not** implement MOFA/MOFA+ Bayesian multi-view latent-factor inference, factor loadings, or variance decomposition. Its thresholds are project-defined example rules, not established MOFA+, CAP, CLSI, or clinical validation criteria. Do not use the results for diagnosis or treatment.

## Features

- Rule checks: primary metric >25; secondary metric >12 or explicit critical flag; descriptor tokens (`DISCORDANT`, `ANOMALY`, `MUTANT`, `VIOLATION`, `FAIL`, `REJECT`).
- Browser: single-record audit, local CSV batch processing (2 MB, 5,000 rows), JSON preview and downloadable CSV.
- Python: CLI, batch CSV, in-memory HMAC-SHA256 audit log, supervisor query, and optional REST API.
- API: `GET /health`, `GET /metrics`, `POST /api/audit`, `POST /api/chat`, `GET /api/audit/logs`.

## Browser use

Open `web/index.html`, or run `python -m http.server 8080` from the repository root and visit `http://localhost:8080/web/`.

Enter de-identified research codes and finite measurements, then choose **Evaluate rules**. Alternatively select a CSV file and download the batch results. The web app runs entirely in JavaScript. It does not invoke Pyodide, use backend APIs, upload files, retain browser storage, or generate cryptographic audit hashes.

## Python setup and CLI

Install Python 3.10–3.13 and run:

`python -m pip install -e ".[server,dev]"`

Run a single record:

`multi-omics-factor-analysis-mofa audit --task-id T1 --target SAMPLE-1 --primary 28 --secondary 13 --status NOMINAL`

Batch CSV:

`multi-omics-factor-analysis-mofa batch -i sample.csv -o results.csv`

Verify the *current process's* audit log:

`multi-omics-factor-analysis-mofa verify-audit`

Start the API:

`multi-omics-factor-analysis-mofa serve --host 127.0.0.1 --port 8000`

Open `http://127.0.0.1:8000/docs` for its interactive API documentation. The CLI-only install is `python -m pip install -e .`. The older alternative implementation remains under `mofa-integrator-legacy` with different thresholds and response fields.

### CSV schema

Required: `task_id,target_identifier,primary_metric`. Optional: `secondary_metric,status_descriptor,is_critical_flag`. Booleans accept true/false, 1/0, yes/no, or on/off (case-insensitive); blank means false. Use de-identified sample codes.

## Privacy and security

- Do **not** provide identifiable patient data. Regex guards cover selected identifier formats but are not comprehensive de-identification or HIPAA compliance.
- The Python HMAC chain verifies signed fields; it is held **in memory** and not persisted after a process restart. Set a strong `AUDIT_SECRET_KEY` for a stable signing key; without one the app creates an ephemeral key. Do not publish the key.
- The API has no built-in authentication. Docker Compose binds port 8000 to loopback, not the public internet. Configure access controls before exposing it on a network.
- The chat provider is a deterministic mock, not a deployed external model.
- There are no application-origin network requests or browser storage in the static site.

## Tests and deployment

Run `python -m pytest -q`, `node --test tests/web.test.cjs`, and `node --check web/app.js`.

CI tests Python 3.10–3.13 and Node 22. The GitHub Pages job publishes the browser-only `web/` directory after tests succeed on pushes to `master`. Browser requirements: a modern desktop or mobile browser with JavaScript and the File API. API deployment requires a Python server; GitHub Pages does not run it.

Technology: Python, Pydantic 2, optional FastAPI/Uvicorn, HTML/CSS/JavaScript.

## License

MIT; see [LICENSE](LICENSE).
