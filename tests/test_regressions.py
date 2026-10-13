"""Security, input validation and CSV regression tests."""
import csv
from pathlib import Path

import pytest
from pydantic import ValidationError

from agents.base import AuditTrail, PHIGuard, SecurityException
from agents.models import SystemTaskPayload
from agents.supervisor import SystemSupervisor
from cli import main as main_cli, parse_csv_bool as parse_main_bool
from mofa_integrator.cli import main as alternate_main, parse_csv_bool as parse_alt_bool


def test_audit_recomputes_signature_after_same_link_tampering():
    trail = AuditTrail(secret_key="local-test-key")
    trail.log("tester", "qa", "EVALUATE", {"metric": 1})
    assert trail.verify_integrity()
    trail.logs[0]["payload_hash"] = "f" * 64
    assert not trail.verify_integrity()


def test_audit_does_not_expose_mutable_internal_log():
    trail = AuditTrail(secret_key="local-test-key")
    trail.log("tester", "qa", "EVALUATE", {"metric": 1})
    snapshot = trail.get_trail()
    snapshot[0]["prev_hash"] = "external-tamper"
    assert trail.verify_integrity()


def test_audit_blocks_identifiers_in_actor():
    trail = AuditTrail(secret_key="local-test-key")
    with pytest.raises(SecurityException):
        trail.log("patient@example.com", "qa", "EVENT", {"metric": 1})


def test_nested_metadata_identifiers_blocked():
    payload = SystemTaskPayload(task_id="T1", target_identifier="S1",
                                primary_metric=10, attributes={"note": "MRN-123456"})
    with pytest.raises(SecurityException):
        SystemSupervisor().process_task(payload)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_metrics_rejected(value):
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="T1", target_identifier="S1", primary_metric=value)
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="T1", target_identifier="S1",
                          primary_metric=1, secondary_metric=value)


@pytest.mark.parametrize("func", [parse_main_bool, parse_alt_bool])
def test_csv_boolean_parser(func):
    assert func("False") is False
    assert func("0") is False
    assert func("") is False
    assert func("TRUE") is True
    assert func("yes") is True
    with pytest.raises(ValueError):
        func("perhaps")


@pytest.mark.parametrize("runner,field", [
    (main_cli, "overall_urgency"),
    (alternate_main, "overall_status")
])
def test_batch_csv_false_and_true(tmp_path: Path, runner, field):
    source = tmp_path / "input.csv"
    output = tmp_path / "output.csv"
    source.write_text(
        "task_id,target_identifier,primary_metric,secondary_metric,is_critical_flag,status_descriptor\n"
        "T1,S1,10,1,False,NOMINAL\n"
        "T2,S2,10,1,True,NOMINAL\n", encoding="utf-8")
    assert runner(["batch", "-i", str(source), "-o", str(output)]) == 0
    with output.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 2
    assert "CRITICAL" not in rows[0][field]
    assert "CRITICAL" in rows[1][field]


def test_api_phi_error_is_client_error():
    from fastapi.testclient import TestClient
    from agents.api import app
    client = TestClient(app)
    response = client.post("/api/audit", json={
        "task_id": "MRN-123456", "target_identifier": "S1", "primary_metric": 5
    })
    assert response.status_code == 400
    assert "MRN-123456" not in response.text
