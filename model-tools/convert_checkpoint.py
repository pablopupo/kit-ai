"""Download/dequantize the exact user-trained model; no training or publishing."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import shutil
import time
from pathlib import Path

from checkpoint_config import normalize_config, validate_shapes

MODEL = "Pablo305/llama3-medical-3b-4bit"
REVISION = "df5aa311d5b017bdd4d1719c50c5d7a1dd1fa37b"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def dequantize(work):
    import torch
    import bitsandbytes as bnb
    from huggingface_hub import HfApi, snapshot_download, save_torch_model
    from transformers import AutoModelForCausalLM
    from safetensors import safe_open

    started = time.time()
    source, target = work / "source", work / "float-export"
    if target.exists():
        raise FileExistsError(f"Refusing to overwrite {target}")
    info = HfApi().model_info(MODEL, revision=REVISION, files_metadata=True)
    if info.sha != REVISION:
        raise ValueError("Hugging Face did not resolve the pinned revision")
    snapshot_download(MODEL, revision=REVISION, local_dir=source, max_workers=2)
    source_hash = sha256(source / "model.safetensors")
    expected_hash = next(file.lfs.sha256 for file in info.siblings if file.rfilename == "model.safetensors")
    if source_hash != expected_hash:
        raise ValueError("Source weight SHA-256 differs from the pinned repository")
    print(f"Verified source SHA-256: {source_hash}", flush=True)
    config = json.loads((source / "config.json").read_text())
    if config.get("quantization_config", {}).get("bnb_4bit_quant_type") != "nf4":
        raise ValueError("Expected the audited NF4 checkpoint")
    print("Loading original NF4 on CPU", flush=True)
    model = AutoModelForCausalLM.from_pretrained(source, device_map={"": "cpu"}, dtype=torch.float16, trust_remote_code=False)
    print("Dequantizing using official bitsandbytes/Transformers", flush=True)
    model.dequantize()
    if any(isinstance(module, bnb.nn.Linear4bit) for module in model.modules()):
        raise ValueError("Quantized modules remain after dequantization")
    model.to(dtype=torch.float16)
    state = model.state_dict()
    validate_shapes({name: tuple(tensor.shape) for name, tensor in state.items()}, config)
    for name, tensor in state.items():
        if tensor.dtype != torch.float16 or not bool(torch.isfinite(tensor).all()):
            raise ValueError(f"Invalid dequantized tensor: {name}")
    target.mkdir()
    # Transformers 5.17 save_pretrained tries to reverse its NF4 loading
    # operations even after dequantize(), raising NotImplementedError. Save the
    # validated ordinary float tensors with HF's supported sharding utility.
    save_torch_model(model, target, safe_serialization=True, max_shard_size="2GB",
                     shared_tensors_to_discard=["lm_head.weight"] if config.get("tie_word_embeddings") else None)
    for name in ["tokenizer.json", "tokenizer_config.json", "chat_template.jinja", "generation_config.json"]:
        shutil.copy2(source / name, target / name)
    (target / "config.json").write_text(json.dumps(normalize_config(config), indent=2) + "\n")
    shapes = {}
    for shard in target.glob("*.safetensors"):
        with safe_open(shard, framework="pt", device="cpu") as f:
            for name in f.keys():
                if name in shapes:
                    raise ValueError(f"Duplicate saved tensor: {name}")
                shapes[name] = f.get_slice(name).get_shape()
    validate_shapes(shapes, config)
    provenance = {
        "source_model": MODEL, "source_revision": REVISION, "source_weight_sha256": source_hash,
        "method": "Official bitsandbytes NF4 CPU dequantization through Transformers; FP16 export",
        "limitations": "Lossy NF4 reconstruction, not original pre-quantization weights; medical quality and browser inference not validated",
        "platform": platform.platform(), "seconds": round(time.time() - started, 2), "tensor_count": len(shapes),
        "packages": {p: importlib.metadata.version(p) for p in ["torch", "bitsandbytes", "transformers", "safetensors", "huggingface_hub", "accelerate"]},
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(target.iterdir()) if p.is_file()},
    }
    (work / "dequantization-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps({"result": "dequantized", "target": str(target), "tensor_count": len(shapes), "seconds": provenance["seconds"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=Path, required=True)
    args = parser.parse_args()
    dequantize(args.work_dir.resolve())
