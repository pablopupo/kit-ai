#!/usr/bin/env python3
"""Verify the public phone-trial conversion without downloading its weight shards.

Uses unauthenticated HTTPS only. LFS object SHA-256 values attest large remote
files; small Git files are fetched and hashed. This verifies publication and
browser delivery, not successful phone inference or medical answer quality.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


REPO = "Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC"
ORIGIN = "https://kit-ai-pablopupo.vercel.app"
RUNTIME_SHA256 = "34de0d60ab598c6a85ae882b48474f250193076f902057a21070bb2daae96d5b"


def digest_file(path, algorithm="sha256"):
    digest = hashlib.new(algorithm)
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_manifest(stage):
    files = sorted(path for path in stage.rglob("*") if path.is_file())
    manifest = {
        path.relative_to(stage).as_posix(): {
            "size": path.stat().st_size,
            "sha256": digest_file(path),
        }
        for path in files
    }
    for required in ("LICENSE", "NOTICE", "RUNTIME-LICENSE", "README.md"):
        assert required in manifest, f"Missing required publication file: {required}"
    assert len(manifest) == 67, f"Expected 67 staged files, found {len(manifest)}"
    config = json.loads((stage / "mlc-chat-config.json").read_text())
    assert config["model_type"] == "llama"
    assert config["quantization"] == "q4f16_1"
    assert config["context_window_size"] == 4096
    assert config["prefill_chunk_size"] == 128
    assert config["model_config"]["num_hidden_layers"] == 28
    assert config["model_config"]["hidden_size"] == 3072
    for tokenizer in config["tokenizer_files"]:
        assert tokenizer in manifest, f"Missing tokenizer: {tokenizer}"
    assert manifest["model.wasm"]["sha256"] == RUNTIME_SHA256, "Runtime differs from evaluated version"
    cache = json.loads((stage / "tensor-cache.json").read_text())
    assert len(cache["records"]) == 58
    names = []
    total_bytes = 0
    for shard in cache["records"]:
        name = shard["dataPath"]
        assert name in manifest and manifest[name]["size"] == shard["nbytes"], f"Shard size: {name}"
        assert digest_file(stage / name, "md5") == shard["md5sum"], f"Shard MD5: {name}"
        total_bytes += shard["nbytes"]
        for tensor in shard["records"]:
            names.append(tensor["name"])
            assert tensor["byteOffset"] + tensor["nbytes"] <= shard["nbytes"], f"Tensor outside shard: {tensor['name']}"
    assert len(names) == len(set(names)) == cache["metadata"]["ParamSize"] == 283
    assert total_bytes == cache["metadata"]["ParamBytes"] == 1807423488
    return manifest


def request(url, method="GET", limit=None):
    # Deliberately omit Authorization and do not load Hugging Face credentials.
    redirects = []
    class RecordRedirects(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            redirects.append({"status": code, "allowOrigin": headers.get("Access-Control-Allow-Origin")})
            if not newurl.startswith("https://"):
                raise ValueError("Refusing non-HTTPS artifact redirect")
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    req = Request(url, method=method, headers={"Origin": ORIGIN, "User-Agent": "Kit-AI-publication-verifier/1"})
    with build_opener(RecordRedirects()).open(req, timeout=90) as response:
        body = b"" if method == "HEAD" else response.read(None if limit is None else limit + 1)
        if limit is not None and len(body) > limit:
            raise ValueError(f"Unexpectedly large response: {url}")
        return body, dict(response.headers.items()), response.status, redirects


def remote_tree(repo, revision):
    endpoint = f"https://huggingface.co/api/models/{repo}/tree/{revision}?" + urlencode({"recursive": "true", "expand": "true"})
    entries = {}
    while endpoint:
        body, headers, _, _ = request(endpoint, limit=10 * 1024 * 1024)
        for item in json.loads(body):
            if item["type"] == "file":
                entries[item["path"]] = item
        link = next((v for k, v in headers.items() if k.lower() == "link"), "")
        match = re.search(r'<([^>]+)>;\s*rel="next"', link)
        endpoint = match[1] if match else None
        if endpoint and not endpoint.startswith("https://huggingface.co/api/models/"):
            raise ValueError("Unexpected pagination host")
    return entries


def verify_remote_file(repo, revision, name, local, remote):
    result = {"file": name, **local, "errors": []}
    if remote is None:
        result["errors"].append("Missing public file")
        return result
    if remote.get("size") != local["size"]:
        result["errors"].append(f"Size mismatch: remote={remote.get('size')}")
    url = f"https://huggingface.co/{repo}/resolve/{revision}/{quote(name, safe='/')}"
    lfs = remote.get("lfs")
    if lfs:
        result["hashMethod"] = "public-lfs-sha256"
        actual = lfs.get("oid") or lfs.get("sha256")
        actual = actual.removeprefix("sha256:") if isinstance(actual, str) else actual
        if actual != local["sha256"]:
            result["errors"].append("LFS SHA-256 mismatch")
        if lfs.get("size") != local["size"]:
            result["errors"].append("LFS size mismatch")
    else:
        # No accidental large download if the repository's storage format changes.
        if local["size"] > 25 * 1024 * 1024:
            result["errors"].append("Large file has no public LFS hash; refusing full download")
            return result
        body, _, _, _ = request(url, limit=local["size"])
        result["hashMethod"] = "download-sha256"
        if hashlib.sha256(body).hexdigest() != local["sha256"]:
            result["errors"].append("Downloaded SHA-256 mismatch")
    if name.endswith((".json", ".wasm", ".bin")):
        _, headers, status, redirects = request(url, method="HEAD")
        headers = {key.lower(): value for key, value in headers.items()}
        result["delivery"] = {"status": status, "allowOrigin": headers.get("access-control-allow-origin"), "contentType": headers.get("content-type"), "redirects": redirects}
        if headers.get("access-control-allow-origin") not in ("*", ORIGIN):
            result["errors"].append("Missing browser CORS permission on final artifact response")
        if any(hop["allowOrigin"] not in ("*", ORIGIN) for hop in redirects):
            result["errors"].append("Missing browser CORS permission on artifact redirect")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=Path, default=Path(__file__).resolve().parents[2] / "model-conversion/phone-trial-upload")
    parser.add_argument("--repo", default=REPO)
    parser.add_argument("--revision", help="Immutable 40-character Hugging Face commit")
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--retry-failed", action="store_true", help="Retry only failed checks in an existing --output for the same immutable revision")
    args = parser.parse_args()
    if not args.local_only and not re.fullmatch(r"[0-9a-f]{40}", args.revision or ""):
        parser.error("Public verification requires --revision with an immutable 40-character commit")
    if args.retry_failed and (args.local_only or not args.output or not args.output.is_file()):
        parser.error("--retry-failed requires an existing --output and public revision")
    manifest = local_manifest(args.stage)
    report = {"schema": "kit-ai-model-publication-v1", "checkedAt": datetime.now(timezone.utc).isoformat(), "repo": args.repo,
              "revision": args.revision, "localFileCount": len(manifest), "localBytes": sum(x["size"] for x in manifest.values()),
              "localChecks": {"shards": 58, "tensors": 283, "quantization": "q4f16_1", "runtimeSha256": RUNTIME_SHA256},
              "scope": "Publication integrity and browser CORS only; not phone inference or medical validation."}
    if args.local_only:
        report.update({"publicVerified": False, "files": [{"file": name, **item} for name, item in manifest.items()]})
    else:
        remote = remote_tree(args.repo, args.revision)
        previous = {}
        if args.retry_failed:
            prior = json.loads(args.output.read_text())
            if prior.get("repo") != args.repo or prior.get("revision") != args.revision:
                parser.error("Cannot reuse checks from a different repository or revision")
            previous = {item["file"]: item for item in prior["files"]
                        if not item.get("errors") and item.get("sha256") == manifest.get(item["file"], {}).get("sha256")
                        and item.get("size") == manifest.get(item["file"], {}).get("size")}
            report["previousAttempts"] = prior.get("previousAttempts", []) + [{"checkedAt": prior["checkedAt"],
                "failures": [item for item in prior["files"] if item.get("errors")]}]
        def check(item):
            name, local = item
            if name in previous:
                return previous[name]
            try:
                return verify_remote_file(args.repo, args.revision, name, local, remote.get(name))
            except Exception as error:
                return {"file": name, "errors": [f"{type(error).__name__}: {error}"]}
        with ThreadPoolExecutor(max_workers=4) as pool:
            report["files"] = list(pool.map(check, manifest.items()))
        report["extraFiles"] = sorted(set(remote) - set(manifest))
        report["verifiedFileCount"] = sum(not item["errors"] for item in report["files"])
        report["publicVerified"] = report["verifiedFileCount"] == len(manifest) and set(report["extraFiles"]) <= {".gitattributes"}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "files"}, indent=2))
    failures = [item for item in report["files"] if item.get("errors")]
    if failures:
        print(json.dumps(failures, indent=2))
    return 0 if args.local_only or report["publicVerified"] else 1


if __name__ == "__main__":
    sys.exit(main())
