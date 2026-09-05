# Multi Omics Factor Analysis MOFA

> **Domain:** Clinical Decision Support & Biomedical Computing

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB.svg?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688.svg?logo=fastapi&logoColor=white)
![Audit Trail](https://img.shields.io/badge/Audit-HMAC--SHA256_Tamper--Evident-brightgreen.svg)
![Zero-PHI Guard](https://img.shields.io/badge/Guard-Zero--PHI_Outbound-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)

</div>

---

## Overview

**Multi Omics Factor Analysis MOFA** is an analytical platform implementing Multi-Omics Factor Analysis (MOFA+) Bayesian group factor variance decomposition. It provides clinical decision support with multi-agent consensus evaluation, cryptographic audit trails, and PHI (Protected Health Information) outbound protection.

---

## Key Features

- **Multi-Agent Consensus**: Three specialized workers evaluate each task:
  - `InvariantQCWorker` - Primary metric threshold auditing
  - `SafetyEscalationWorker` - Critical safety interlock detection
  - `ProtocolConformanceWorker` - Specification conformance checking
- **PHI Outbound Guard**: Regex-based detection and blocking of SSNs, MRNs, phone numbers, emails, DOBs, and patient names
- **HMAC-SHA256 Audit Trail**: Cryptographic, tamper-evident chained logging
- **FastAPI REST API**: OpenAPI 3.1 endpoints for task processing and chat
- **Prometheus Metrics**: Operational telemetry export
- **Active Learning Calibration**: Bayesian worker weight adjustment

---

## Installation

```bash
# Clone the repository
git clone https://github.com/abusuraihsakhri/multi-omics-factor-analysis-mofa.git
cd multi-omics-factor-analysis-mofa

# Install dependencies
pip install -e ".[dev]"

# Or install runtime dependencies only
pip install fastapi uvicorn pydantic
```

---

## Configuration

Set the `AUDIT_SECRET_KEY` environment variable for persistent audit integrity:

```bash
# Generate a secure key
export AUDIT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")

# Or copy the example env file
cp .env.example .env
# Edit .env with your secure values
```

**Required Environment Variables:**
- `AUDIT_SECRET_KEY` - HMAC-SHA256 signing key (generate with `secrets.token_hex(32)`)

**Optional Environment Variables:**
- `MODEL_PROVIDER` - LLM provider: `mock` (default), `ollama`, `claude`, `openai`

---

## Usage

### CLI Commands

```bash
# Single task evaluation
python cli.py audit --task-id TASK-001 --target KEY-01 --primary 28.5 --secondary 14.2 --critical --status DISCORDANT

# Interactive chat query
python cli.py chat "What is the system status?"

# Batch processing from CSV
python cli.py batch -i sample.csv -o results.csv

# Verify audit trail integrity
python cli.py verify-audit

# Start REST API server
python cli.py serve --host 127.0.0.1 --port 8000
```

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/metrics` | Prometheus metrics |
| POST | `/api/audit` | Submit task for evaluation |
| POST | `/api/chat` | Query supervisor chat |
| GET | `/api/audit/logs` | Retrieve audit trail |

### Docker Deployment

```bash
# Build and run with Docker Compose
cp .env.example .env
# Edit .env with secure AUDIT_SECRET_KEY
docker-compose up --build

# Or use Docker directly
docker build -t multi-omics-factor-analysis-mofa .
docker run -p 8000:8000 --env-file .env multi-omics-factor-analysis-mofa
```

---

## Input Data Schema

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `task_id` | string | Unique task/case identifier | Yes |
| `target_identifier` | string | Entity or target key | Yes |
| `primary_metric` | float | Primary measurement value | Yes |
| `secondary_metric` | float | Secondary measurement value | No (default: 0.0) |
| `status_descriptor` | string | Status code or phenotype | No (default: "NOMINAL") |
| `is_critical_flag` | boolean | Emergency escalation trigger | No (default: false) |

---

## Testing

```bash
# Run all tests
pytest -v

# Run with coverage
pytest -v --cov=agents --cov-report=term-missing

# Run specific test file
pytest tests/test_multi_omics_factor_analysis_mofa.py -v

# Run enrichment tests
pytest tests/test_enrichment.py -v
```

**Test Coverage:**
- PHI guard enforcement (SSN, MRN, phone, email, DOB, patient name patterns)
- Audit trail integrity and tamper detection
- Multi-agent consensus evaluation
- Worker boundary condition testing
- CLI command validation

---

## Project Structure

```
multi-omics-factor-analysis-mofa/
├── agents/                  # Core agent modules
│   ├── api.py              # FastAPI REST server
│   ├── base.py             # PHI guard, HMAC audit trail
│   ├── models.py           # Pydantic data models
│   ├── supervisor.py       # Multi-agent orchestrator
│   ├── workers.py          # Specialized evaluation workers
│   ├── llm_factory.py      # LLM provider factory
│   ├── metrics.py          # Prometheus metrics
│   ├── learning.py         # Bayesian calibration engine
│   └── streamer.py         # WebSocket telemetry
├── mofa_integrator/        # MOFA-Integrator sub-package
│   ├── agents.py           # Coordinator and sub-agents
│   ├── engine.py           # Core evaluation engine
│   ├── models.py           # Data models
│   ├── cli.py              # CLI entry point
│   └── server.py           # FastAPI server factory
├── tests/                  # Test suite
├── web/                    # Web console (HTML)
├── cli.py                  # Main CLI entry point
├── simulator.py            # Stress testing simulator
├── enrichment.py           # Enrichment feature engines
├── Dockerfile              # Container build
├── docker-compose.yml      # Container orchestration
├── pyproject.toml          # Project configuration
└── .env.example            # Environment template
```

---

## Security Considerations

- **Audit Secret Key**: Always set `AUDIT_SECRET_KEY` in production. Without it, an ephemeral key is generated (audit trail won't persist across restarts).
- **PHI Protection**: All outbound data is scanned for PHI patterns before logging or transmission.
- **Docker Secrets**: Use `.env` file (git-ignored) or Docker secrets for sensitive configuration.

---

## License

MIT License - see [LICENSE](LICENSE) for details.
