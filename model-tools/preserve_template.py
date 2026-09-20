"""Carry the checkpoint's text chat prefix into MLC and test actual renderers."""
import argparse
from copy import deepcopy
import json
from pathlib import Path


def preserve_template(config, tokenizer):
    from mlc_llm.protocol.conversation_protocol import Conversation
    result = deepcopy(config)
    template = result["conv_template"]
    marker = "KIT_CONVERSION_SYSTEM_PROBE_5a4d"
    probe = [{"role": "system", "content": marker}, {"role": "user", "content": "Hello"}]
    rendered = tokenizer.apply_chat_template(probe, tokenize=False, add_generation_prompt=True)
    prefix = tokenizer.decode(template["system_prefix_token_ids"], skip_special_tokens=False)
    if not rendered.startswith(prefix):
        raise ValueError("Unexpected beginning-of-sequence token")
    block = rendered[len(prefix):].split("<|eot_id|>", 1)[0] + "<|eot_id|>"
    if block.count(marker) != 1:
        raise ValueError("Unsupported system template")
    template["system_template"] = block.replace(marker, "{system_message}")
    template["stop_token_ids"] = [tokenizer.eos_token_id]
    fixtures = [
        probe,
        [{"role": "system", "content": "Responde en español."}, {"role": "user", "content": "¿Qué contiene un botiquín?"}],
        [{"role": "system", "content": "Be helpful."}, {"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi."}, {"role": "user", "content": "One more question."}],
    ]
    checks = []
    for messages in fixtures:
        conversation = Conversation.model_validate(template)
        conversation.system_message = messages[0]["content"]
        conversation.messages = [(m["role"], m["content"]) for m in messages[1:]] + [("assistant", None)]
        mlc_text = prefix + "".join(conversation.as_prompt())
        hf_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        if mlc_text != hf_text:
            raise ValueError("MLC and HF text chat renderers differ")
        checks.append({"turns": len(messages), "language": "es" if "español" in messages[0]["content"] else "en", "identical_rendered_text": True})
    return result, checks


if __name__ == "__main__":
    from transformers import AutoTokenizer
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=Path, required=True)
    work = parser.parse_args().work_dir.resolve()
    path = work / "mlc-q4f16_1" / "mlc-chat-config.json"
    config = json.loads(path.read_text())
    tokenizer = AutoTokenizer.from_pretrained(work / "float-export", local_files_only=True)
    fixed, checks = preserve_template(config, tokenizer)
    path.write_text(json.dumps(fixed, indent=2) + "\n")
    (work / "template-validation.json").write_text(json.dumps(checks, indent=2) + "\n")
    print(json.dumps(checks))
