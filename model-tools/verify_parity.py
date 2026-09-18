"""One bounded, non-clinical forward-pass comparison of NF4 and its saved export."""
import argparse
import gc
import hashlib
import importlib.util
import json
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


def compare(work, case_file=None, case_id=None, max_new_tokens=0):
    torch.set_num_threads(4)
    source, export = work / "source", work / "float-export"
    question = [{"role": "user", "content": "Reply with the single word READY."}]
    if case_file:
        cases = json.loads(case_file.read_text())["cases"]
        case = next(c for c in cases if c["id"] == case_id)
        path = Path(__file__).resolve().parents[1] / "huggingface-space" / "prompting.py"
        spec = importlib.util.spec_from_file_location("space_prompting", path)
        prompting = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(prompting)
        question = prompting.build_messages(case["exactApiInput"], 8)
    before_tokenizer = AutoTokenizer.from_pretrained(source, local_files_only=True)
    after_tokenizer = AutoTokenizer.from_pretrained(export, local_files_only=True)
    before = before_tokenizer.apply_chat_template(question, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt")
    after = after_tokenizer.apply_chat_template(question, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt")
    if not torch.equal(before["input_ids"], after["input_ids"]):
        raise ValueError("Tokenizer/chat-template mismatch")
    ids = before["input_ids"]
    results, logits = {}, []
    for name, path in [("original_nf4_cpu", source), ("export_fp16_cpu", export)]:
        start = time.time()
        print(f"Starting {name}", flush=True)
        model = AutoModelForCausalLM.from_pretrained(path, device_map={"": "cpu"}, dtype=torch.float16, local_files_only=True, trust_remote_code=False)
        model.eval()
        with torch.inference_mode():
            last = model(input_ids=ids).logits[0, -1].float().cpu()
        if not bool(last.isfinite().all()):
            raise ValueError(f"Nonfinite logits from {name}")
        logits.append(last)
        top = torch.topk(last, 10)
        results[name] = {"seconds": round(time.time() - start, 3), "logit_shape": list(last.shape), "top_10_token_ids": top.indices.tolist(), "top_token": before_tokenizer.decode([top.indices[0].item()])}
        if max_new_tokens:
            with torch.inference_mode():
                output = model.generate(**before, max_new_tokens=max_new_tokens, do_sample=False, repetition_penalty=1.1,
                    eos_token_id=before_tokenizer.eos_token_id, pad_token_id=before_tokenizer.pad_token_id)
            generated = output[0, ids.shape[1]:]
            results[name].update(raw_output=before_tokenizer.decode(generated, skip_special_tokens=True), generated_token_ids=generated.tolist(), generation_seconds=round(time.time() - start, 3))
        print(json.dumps({name: results[name]}), flush=True)
        del model
        gc.collect()
    a, b = logits
    results.update({"prompt": question, "prompt_tokens": ids.shape[1], "tokenizer_equal": True,
        "max_abs_logit_difference": float((a - b).abs().max()), "mean_abs_logit_difference": float((a - b).abs().mean()),
        "logit_cosine_similarity": float(torch.nn.functional.cosine_similarity(a, b, dim=0)),
        "top_token_equal": bool(a.argmax() == b.argmax()), "top_10_overlap": len(set(a.topk(10).indices.tolist()) & set(b.topk(10).indices.tolist())),
        "scope": "One CPU prompt comparison; checks conversion differences, not broad medical accuracy or equivalence for all inputs"})
    if case_file:
        results.update(case_id=case_id, case_file_sha256=hashlib.sha256(case_file.read_bytes()).hexdigest(), max_new_tokens=max_new_tokens)
    if max_new_tokens:
        results["generation_token_ids_equal"] = results["original_nf4_cpu"]["generated_token_ids"] == results["export_fp16_cpu"]["generated_token_ids"]
        results["generated_token_count"] = len(results["original_nf4_cpu"]["generated_token_ids"])
    (work / (f"parity-{case_id}.json" if case_id else "parity.json")).write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--case-file", type=Path)
    parser.add_argument("--case-id")
    parser.add_argument("--max-new-tokens", type=int, choices=range(0, 129), default=0)
    args = parser.parse_args()
    compare(args.work_dir.resolve(), args.case_file, args.case_id, args.max_new_tokens)
