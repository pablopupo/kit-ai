import hashlib
import unittest
from unittest.mock import patch

import verify_phone_trial_publication as publication


class PublicFileVerificationTests(unittest.TestCase):
    def setUp(self):
        self.content = b"model bytes"
        self.local = {"size": len(self.content), "sha256": hashlib.sha256(self.content).hexdigest()}
        self.remote = {"size": len(self.content), "lfs": {"size": len(self.content), "oid": self.local["sha256"]}}
        self.head = (b"", {"Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream"}, 200, [])

    def verify(self, name="params_shard_0.bin", remote=None, local=None):
        return publication.verify_remote_file(publication.REPO, "a" * 40, name, local or self.local, remote or self.remote)

    def test_lfs_hash_verified_without_downloading_weights(self):
        with patch.object(publication, "request", return_value=self.head) as request:
            result = self.verify()
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["hashMethod"], "public-lfs-sha256")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.kwargs, {"method": "HEAD"})

    def test_rejects_wrong_remote_hash_and_size(self):
        wrong = {"size": 1, "lfs": {"size": 1, "oid": "0" * 64}}
        with patch.object(publication, "request", return_value=self.head):
            result = self.verify(remote=wrong)
        self.assertEqual(len(result["errors"]), 3)

    def test_rejects_missing_file(self):
        with patch.object(publication, "request") as request:
            result = publication.verify_remote_file(publication.REPO, "a" * 40, "model.wasm", self.local, None)
        self.assertEqual(result["errors"], ["Missing public file"])
        request.assert_not_called()

    def test_rejects_missing_cors_on_redirect(self):
        response = (*self.head[:3], [{"status": 302, "allowOrigin": None}])
        with patch.object(publication, "request", return_value=response):
            result = self.verify()
        self.assertIn("Missing browser CORS permission on artifact redirect", result["errors"])

    def test_rejects_missing_final_cors(self):
        with patch.object(publication, "request", return_value=(b"", {}, 200, [])):
            result = self.verify()
        self.assertIn("Missing browser CORS permission on final artifact response", result["errors"])

    def test_downloads_and_hashes_small_git_file(self):
        with patch.object(publication, "request", return_value=(self.content, {}, 200, [])) as request:
            result = self.verify(name="LICENSE", remote={"size": len(self.content)})
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["hashMethod"], "download-sha256")
        self.assertEqual(request.call_args.kwargs, {"limit": len(self.content)})

    def test_refuses_large_download_without_lfs_metadata(self):
        local = {**self.local, "size": 100 * 1024 * 1024}
        with patch.object(publication, "request") as request:
            result = self.verify(local=local, remote={"size": local["size"]})
        self.assertEqual(result["errors"], ["Large file has no public LFS hash; refusing full download"])
        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
