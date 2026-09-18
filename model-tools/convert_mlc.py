"""Convert the validated float export to MLC weights, preserving provenance."""
import argparse
import importlib.metadata
import json
import subprocess
import sys
import time
from pathlib import Path

from convert_checkpoint import REVISION, sha256


def convert(work, validate_existing=False):
    export, output = work / "float-export", work / "mlc-q4f16_1"
    source = json.loads((work / "dequantization-provenance.json").read_text())
    if source["source_revision"] != REVISION:
        raise ValueError("Unexpected source revision")
    for name, info in source["files"].items():
        if sha256(export / name) != info["sha256"]:
            raise ValueError(f"Float export changed: {name}")
    if output.exists() and not validate_existing:
        raise FileExistsError(f"Refusing to overwrite {output}; use a new work directory")
    commands = [
        [sys.executable, "-m", "mlc_llm", "convert_weight", str(export), "--quantization", "q4f16_1", "--device", "cpu", "--output", str(output)],
        [sys.executable, "-m", "mlc_llm", "gen_config", str(export), "--quantization", "q4f16_1", "--conv-template", "llama-3_1", "--context-window-size", "4096", "--prefill-chunk-size", "128", "--output", str(output)],
    ]
    started = time.time()
    if not validate_existing:
        for command in commands:
            print(json.dumps(command), flush=True)
            subprocess.run(command, check=True, timeout=300)
        subprocess.run([sys.executable, str(Path(__file__).with_name("preserve_template.py")), "--work-dir", str(work)], check=True, timeout=60)
    config = json.loads((output / "mlc-chat-config.json").read_text())
    reference = json.loads((export / "config.json").read_text())
    if config["model_config"]["position_embedding_base"] != reference["rope_theta"] or config["model_config"]["rope_scaling"] != reference["rope_scaling"]:
        raise ValueError("MLC rotary configuration does not match the float export")
    if config["context_window_size"] != 4096 or config["prefill_chunk_size"] != 128:
        raise ValueError("Unexpected MLC context/prefill settings")
    cache = json.loads((output / "tensor-cache.json").read_text())
    for shard in cache["records"]:
        if (output / shard["dataPath"]).stat().st_size != shard["nbytes"]:
            raise ValueError(f"Truncated output shard: {shard['dataPath']}")
    report = {
        "source_revision": REVISION, "source_weight_sha256": source["source_weight_sha256"],
        "commands": commands, "validation_only": validate_existing, "elapsed_seconds": round(time.time() - started, 3), "metadata": cache["metadata"],
        "packages": {p: importlib.metadata.version(p) for p in ["mlc-llm-nightly-cpu", "mlc-ai-nightly-cpu", "apache-tvm-ffi", "numpy"]},
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(output.iterdir()) if p.is_file()},
        "status": "MLC weights and config converted; matching WebGPU library/inference and medical quality still need validation",
    }
    (work / "mlc-provenance.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "metadata": report["metadata"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--validate-existing", action="store_true")
    args = parser.parse_args()
    convert(args.work_dir.resolve(), args.validate_existing)
