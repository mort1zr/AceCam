"""PCIT-247: el workflow del worker solo descarga la imagen si hay partidos en cola."""

import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "queued_matches", Path(__file__).resolve().parent.parent / "scripts" / "queued_matches.py"
)
queued_matches = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(queued_matches)


class FakeFilter:
    def __init__(self, field_path, op_string, value):
        self.field_path = field_path
        self.op_string = op_string
        self.value = value


class FakeQuery:
    def __init__(self, docs, calls):
        self.docs = docs
        self.calls = calls

    def where(self, filter):
        self.calls.append(("where", filter.field_path, filter.op_string, filter.value))
        return self

    def limit(self, value):
        self.calls.append(("limit", value))
        return self

    def stream(self):
        return iter(self.docs)


class FakeDb:
    def __init__(self, docs):
        self.calls = []
        self.docs = docs

    def collection(self, name):
        self.calls.append(("collection", name))
        return FakeQuery(self.docs, self.calls)


@pytest.mark.parametrize("docs, expected", [([], 0), (["m-1"], 1)])
def test_counts_only_queued_matches(docs, expected):
    db = FakeDb(docs)
    assert queued_matches.queued_count(db, FakeFilter) == expected
    assert db.calls == [("collection", "matches"), ("where", "status", "==", "en cola"), ("limit", 1)]


def test_writes_the_github_output(tmp_path, capsys):
    output = tmp_path / "output"
    queued_matches.write_output(True, str(output))
    queued_matches.write_output(False, str(output))
    assert output.read_text() == "hay=true\nhay=false\n"
    assert "hay=false" in capsys.readouterr().out


def test_without_credentials_it_fails_clearly(monkeypatch, capsys):
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT", raising=False)
    assert queued_matches.main() == 1
    assert "FIREBASE_SERVICE_ACCOUNT" in capsys.readouterr().err
