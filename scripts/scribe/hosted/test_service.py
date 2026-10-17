"""Protocol checks use only the standard library and synthetic data, not real care records."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch
import service


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        service.KEY = "test-only-key-12345678901234567890"
        cls.server = service.ThreadingHTTPServer(("127.0.0.1", 0), service.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None, authenticated=True):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        values = {"Authorization": "Bearer " + service.KEY} if authenticated else {}
        values.update(headers or {})
        connection.request(method, path, body, values)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_authentication_precedes_every_route(self):
        for method, path in [("GET", "/health"), ("POST", "/transcribe"), ("POST", "/ollama/api/chat")]:
            self.assertEqual(self.request(method, path, authenticated=False)[0], 401)

    def test_audio_is_bounded_before_reading(self):
        self.assertEqual(self.request("POST", "/transcribe", headers={"Content-Length": str(service.MAX_PCM + 1)})[0], 413)
        self.assertEqual(self.request("POST", "/transcribe", b"")[0], 400)
        self.assertEqual(self.request("POST", "/transcribe?speech=../../private", b"12")[0], 400)

    def test_only_specific_model_endpoints_are_proxied(self):
        self.assertEqual(self.request("POST", "/ollama/api/pull", b"{}")[0], 404)
        self.assertEqual(self.request("GET", "/ollama/api/show")[0], 404)
        with patch.object(service, "upstream", return_value={"models": []}) as upstream:
            self.assertEqual(self.request("GET", "/ollama/api/tags"), (200, {"models": []}))
            upstream.assert_called_once_with("/api/tags")

    def test_chat_is_nonstreaming_and_errors_are_sanitized(self):
        with patch.object(service, "upstream", return_value={"message": {"content": "synthetic"}}) as upstream:
            self.assertEqual(self.request("POST", "/ollama/api/chat", b'{"model":"test","stream":true}')[0], 200)
            self.assertFalse(json.loads(upstream.call_args.args[1])["stream"])
        with patch.object(service, "upstream", side_effect=RuntimeError("private input")):
            status, payload = self.request("POST", "/ollama/api/chat", b"{}")
            self.assertEqual(status, 503)
            self.assertNotIn("private", json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
