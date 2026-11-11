import os
import unittest

from fastapi import HTTPException

from desktop_agent.main import ExecuteRequest, execute


class DesktopAgentSecurityTests(unittest.TestCase):
    def test_execution_fails_closed_without_backend_token(self):
        previous = os.environ.pop("MYRAA_AGENT_TOKEN", None)
        try:
            with self.assertRaises(HTTPException) as raised:
                execute(ExecuteRequest(tool="systemInfo", args={}), None)
            self.assertEqual(raised.exception.status_code, 401)
        finally:
            if previous is not None:
                os.environ["MYRAA_AGENT_TOKEN"] = previous

    def test_execution_rejects_wrong_token(self):
        previous = os.environ.get("MYRAA_AGENT_TOKEN")
        os.environ["MYRAA_AGENT_TOKEN"] = "launch-secret"
        try:
            with self.assertRaises(HTTPException) as raised:
                execute(ExecuteRequest(tool="systemInfo", args={}), "Bearer wrong-secret")
            self.assertEqual(raised.exception.status_code, 401)
        finally:
            if previous is None:
                os.environ.pop("MYRAA_AGENT_TOKEN", None)
            else:
                os.environ["MYRAA_AGENT_TOKEN"] = previous


if __name__ == "__main__":
    unittest.main()
