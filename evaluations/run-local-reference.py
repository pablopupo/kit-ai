"""Evaluate the separately exported float checkpoint; never label it original NF4 inference."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import time
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--inputs', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--device', choices=['mps', 'cpu'], default='mps')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--ids', help='Optional comma-separated case IDs')
    parser.add_argument('--prompt-style', choices=['space', 'historical'], default='space')
    args = parser.parse_args()
    import torch
    import transformers
    from transformers import AutoModelForCausalLM, AutoTokenizer

    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location('kit_prompting', root / 'huggingface-space/prompting.py')
    prompting = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(prompting)
    fixture = json.loads(Path(args.inputs).read_text())
    selected = fixture['cases']
    if args.ids:
        selected = [case for case in selected if case['id'] in args.ids.split(',')]
    selected = selected[:args.limit]
    if not selected:
        raise ValueError('No selected evaluation cases')
    if args.device == 'mps' and not torch.backends.mps.is_available():
        raise RuntimeError('MPS is unavailable; select CPU explicitly to run there')
    model_path = Path(args.model).resolve()
    # The preserved file includes a provenance header, which is NOT model input.
    historical_template = (root / 'evaluations/original-space-prompt.txt').read_text().split('\n\n', 1)[1]
    config = json.loads((model_path / 'config.json').read_text())
    if config.get('quantization_config'):
        raise ValueError('Expected a separate dequantized float export, not an NF4 checkpoint')
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    report = {
        'schemaVersion': 1, 'kind': 'synthetic-evaluation', 'startedAt': now(),
        'model': 'Pablo305/llama3-medical-3b-4bit',
        'modelRevision': 'df5aa311d5b017bdd4d1719c50c5d7a1dd1fa37b',
        'stage': 'NF4 dequantized float reference', 'mode': 'app' if args.prompt_style == 'space' else 'historical',
        'clinicalReview': 'pending', 'phoneTest': False,
        'datasetSha256': fixture['datasetSha256'], 'sourceHashes': fixture['sourceHashes'],
        'serverPromptSha256': hashlib.sha256((root / 'huggingface-space/prompting.py').read_bytes()).hexdigest(),
        'pipeline': ('Frozen frontend prompts + current Space chat template' if args.prompt_style == 'space' else 'Historical Space raw text prompt/tokenizer with no retrieved references; raw answer before historical sentence truncation') + ', run locally on the dequantized float export. Not the original NF4 kernel or hosted Space.',
        'runtime': {'device': args.device, 'platform': platform.platform(), 'torch': torch.__version__, 'transformers': transformers.__version__},
        'generation': {'preferredSentences': 8, 'maxNewTokens': 512, 'doSample': args.prompt_style == 'historical', 'repetitionPenalty': 1.1, 'seed': 0},
        'timingDescription': 'Local Mac reference-model generation; not phone inference performance.',
        'selectedCaseIds': [case['id'] for case in selected], 'results': [],
    }
    if args.prompt_style == 'historical':
        report['historicalPromptSha256'] = hashlib.sha256(historical_template.encode()).hexdigest()
        report['generation'].update(temperature=0.4, topP=0.8)

    def save():
        temporary = out.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(out)

    save()
    torch.set_num_threads(4)
    torch.manual_seed(0)
    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=True, dtype=torch.float16 if args.device == 'mps' else torch.float32)
    model = model.to(args.device).eval()
    report['loadMs'] = round((time.perf_counter() - started) * 1000)
    print(f"Loaded local float reference in {report['loadMs']} ms", flush=True)
    for case in selected:
        item = {'caseId': case['id'], 'language': case['language'], 'question': case['prompt'],
                'reference': case['reference'], 'exactApiInput': case['exactApiInput'],
                'messages': case['messages'], 'startedAt': now()}
        try:
            if args.prompt_style == 'historical':
                item['reference'] = ''
                item['messages'] = None
                item['exactApiInput'] = historical_template.format(question=case['prompt'], n=8)
                inputs = tokenizer(item['exactApiInput'], return_tensors='pt').to(args.device)
                generation_options = {'do_sample': True, 'temperature': 0.4, 'top_p': 0.8}
            else:
                messages = prompting.build_messages(case['exactApiInput'], 8)
                inputs = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                                        return_dict=True, return_tensors='pt').to(args.device)
                generation_options = {'do_sample': False}
            input_length = inputs['input_ids'].shape[1]
            if input_length > 4096:
                raise ValueError('Input exceeds the deployed Space input limit')
            if args.device == 'mps':
                torch.mps.synchronize()
            started = time.perf_counter()
            with torch.inference_mode():
                output = model.generate(**inputs, max_new_tokens=512, **generation_options, repetition_penalty=1.1,
                                        eos_token_id=tokenizer.eos_token_id, pad_token_id=tokenizer.pad_token_id)
            if args.device == 'mps':
                torch.mps.synchronize()
            item['elapsedMs'] = round((time.perf_counter() - started) * 1000)
            generated = output[0][input_length:]
            at_limit = len(generated) >= 512 and int(generated[-1]) != tokenizer.eos_token_id
            item['answer'] = prompting.finish_response(tokenizer.decode(generated, skip_special_tokens=True), at_limit)
            item.update(status='generated', reviewStatus='unreviewed', inputTokens=input_length,
                        generatedTokens=len(generated), lengthLimitNotice=at_limit)
            print(f"{case['id']}: generated {len(generated)} tokens in {item['elapsedMs']} ms", flush=True)
        except Exception as error:
            item.update(status='error', error=f'{type(error).__name__}: {error}')
            print(f"{case['id']}: {item['error']}", flush=True)
        report['results'].append(item)
        save()
        if item['status'] == 'error':
            report['stoppedBecause'] = item['error']
            break
    report['finishedAt'] = now()
    report['generated'] = sum(item['status'] == 'generated' for item in report['results'])
    report['errors'] = sum(item['status'] == 'error' for item in report['results'])
    report['complete'] = len(report['results']) == len(selected) and report['errors'] == 0
    save()
    print(f"Saved {report['generated']}/{len(selected)} answers to {out}", flush=True)


if __name__ == '__main__':
    main()
