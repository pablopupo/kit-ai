"""Repair invalid signatures only in an isolated MLC environment on macOS.

No Gatekeeper settings, quarantine attributes, or system files are changed.
Run with the MLC environment's Python. Without --repair this is read-only.
"""
import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repair", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Darwin" or sys.prefix == sys.base_prefix:
        raise SystemExit("Use an isolated macOS virtual environment")
    root = Path(sysconfig.get_paths()["purelib"])
    results = []
    for package in ["tvm", "mlc_llm"]:
        for path in sorted((root / package).rglob("*.dylib")):
            check = subprocess.run(["codesign", "--verify", "--verbose=2", str(path)], capture_output=True, text=True)
            if check.returncode == 0:
                continue
            entry = {"path": str(path.relative_to(root)), "before_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "original_verification": check.stderr.strip()}
            if args.repair:
                # Break potential package-cache hard links before changing bytes.
                temporary = path.with_suffix(".localcopy")
                shutil.copy2(path, temporary)
                os.replace(temporary, path)
                repair = subprocess.run(["codesign", "--force", "--sign", "-", str(path)], capture_output=True, text=True)
                verify = subprocess.run(["codesign", "--verify", "--verbose=2", str(path)], capture_output=True, text=True)
                entry.update(after_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), repair_exit=repair.returncode, verification_exit=verify.returncode)
            results.append(entry)
    print(json.dumps(results, indent=2))
    if args.repair and any(r["verification_exit"] for r in results):
        raise SystemExit(1)
