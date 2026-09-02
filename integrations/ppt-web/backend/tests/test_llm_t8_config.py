"""Tests for the T8-selected LLM bridge used by PPT planning."""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.app import llm  # noqa: E402


class _Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        payload = {
            "choices": [{"message": {"content": json.dumps({"outline": ["Cover", "Plan"]})}}],
        }
        return json.dumps(payload).encode("utf-8")


class T8LlmConfigTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "T8_PPT_CODEX_API_KEY": "test-secret",
            "T8_PPT_CODEX_BASE_URL": "https://llm.example.com/openai/v1",
            "T8_PPT_CODEX_MODEL": "test-model",
        },
        clear=False,
    )
    @patch("backend.app.llm.urllib.request.urlopen", return_value=_Response())
    def test_chat_json_uses_t8_openai_compatible_config(self, urlopen):
        result, info = llm.chat_json("Return JSON", "Build an outline")

        request = urlopen.call_args.args[0]
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, "https://llm.example.com/openai/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")
        self.assertEqual(body["model"], "test-model")
        self.assertEqual(body["messages"][0]["role"], "system")
        self.assertEqual(result["outline"], ["Cover", "Plan"])
        self.assertEqual(info["id"], "t8-llm-default")


if __name__ == "__main__":
    unittest.main()
