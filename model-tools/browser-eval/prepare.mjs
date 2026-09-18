import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const root = process.env.KIT_MODEL_WORK_DIR || path.resolve(repo, '../model-conversion');
const output = path.join(root, 'browser-eval');
await fs.access(path.join(root, 'mlc-q4f16_1', 'mlc-chat-config.json'));
await fs.mkdir(output, { recursive: true });
const sdk = JSON.parse(await fs.readFile(path.join(repo, 'frontend/node_modules/@mlc-ai/web-llm/package.json'), 'utf8'));
if (sdk.version !== '0.2.80') throw Error('This recorded experiment requires WebLLM 0.2.80; review runtime compatibility before changing it.');
const evidence = JSON.parse(await fs.readFile(path.join(repo, 'evaluations/results/medical-3b-mlc-browser.json'), 'utf8'));
const wasmPath = path.join(output, 'model.wasm');
let wasm;
try { wasm = await fs.readFile(wasmPath); }
catch {
  const response = await fetch(evidence.librarySource);
  if (!response.ok) throw Error(`Runtime download failed: ${response.status}`);
  wasm = Buffer.from(await response.arrayBuffer());
}
if (crypto.createHash('sha256').update(wasm).digest('hex') !== evidence.artifactHashes.wasm) throw Error('Runtime hash differs from the recorded experiment.');
await fs.writeFile(wasmPath, wasm);
for (const name of ['index.html', 'sw.js']) await fs.copyFile(path.join(here,name),path.join(output,name));
const { build } = await import(pathToFileURL(path.join(repo, 'frontend/node_modules/esbuild/lib/main.js')));
for (const name of ['client', 'worker']) await build({ entryPoints:[path.join(here,`${name}.js`)], bundle:true,
  format:'esm', platform:'browser', outfile:path.join(output,`${name}.bundle.js`),
  nodePaths:[path.join(repo,'frontend/node_modules')], logLevel:'warning' });
const python = `
import json, sys
from pathlib import Path
repo=Path(sys.argv[1])
sys.path.insert(0, str(repo/'huggingface-space'))
from prompting import build_messages
run=json.loads((repo/'evaluations/results/medical-3b-float-before-retrieval.json').read_text())
ids=['minor-cut-en','minor-cut-es','infant-choking-en','infant-choking-es']
cases=[{'caseId':r['caseId'],'language':r['language'],'messages':build_messages(r['exactApiInput'],8),'floatAnswer':r['answer']} for r in run['results'] if r['caseId'] in ids]
print(json.dumps({'datasetSha256':run['datasetSha256'],'modelRevision':run['modelRevision'],'cases':cases},ensure_ascii=False,indent=2))
`;
const inputs = execFileSync(process.env.KIT_PYTHON || 'python3', ['-c',python,repo], {encoding:'utf8'});
await fs.writeFile(path.join(output,'cases.json'),inputs);
console.log(`Prepared four frozen cases, browser/worker bundles and verified runtime in ${output}`);
