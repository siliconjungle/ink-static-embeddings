"""Freeze the measured shaders and summarize matched GPU controls."""
import json
from pathlib import Path
import shutil
import statistics

from ink_static_embeddings.static_model import digest


def main():
    result = Path('results/gpu-fusion')
    report = json.loads((result / 'report.json').read_text())
    conformance = json.loads((result / 'conformance.json').read_text())
    for record in (report['hashes'], conformance['sha256']):
        for name, expected in record.items():
            if digest(Path(name)) != expected:
                raise ValueError(f'Measured file changed: {name}')
    retained = Path('artifacts/gpu-fusion')
    identities = {}
    for name in ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']:
        source = Path('build/general') / name
        dest = retained / name
        dest.mkdir(exist_ok=True)
        shutil.copytree(source / 'gpu-experimental',dest / 'gpu-experimental',dirs_exist_ok=True)
        for filename in ['model.json','gpu-model.ink','targets.json','target-compilation.json','validation.json']:
            shutil.copyfile(source / filename,dest / filename)
        # Retain the literal Ink entry points/prelude as the compiler control;
        # the rest of the original bundle remains reproducible from pinned Ink.
        compiled = json.loads((source / 'webgpu/manifest.json').read_text())
        (dest / 'ink-control').mkdir(exist_ok=True)
        shutil.copyfile(source / 'webgpu/manifest.json',dest / 'ink-control/manifest.json')
        for function in compiled['functions']:
            if function['name'] in ('pool_batch','norm_batch','normalize_batch'):
                filename = function['shader']
                shutil.copyfile(source / 'webgpu' / filename,dest / 'ink-control' / filename)
        identities[name] = {'model_id': json.loads((source / 'model.json').read_text())['model_id'],
                            'sha256': {str(p.relative_to(dest)):digest(p) for p in dest.rglob('*') if p.is_file()}}
    for d in [1,7,65,1025]:
        source = Path('build/gpu-edges') / str(d)
        dest = retained / 'edges' / str(d)
        shutil.copytree(source,dest,dirs_exist_ok=True)
    for name in ['static-embedding.mjs','static-embedding-gpu.mjs']:
        shutil.copyfile(Path('runtime') / name,retained / name)
    (retained / 'identities.json').write_text(json.dumps(identities,indent=2)+'\n')
    rows = (result / 'REPORT.md').read_text().split('\n## Matched controls')[0].rstrip().splitlines()
    rows += ['', '## Matched controls and variation', '',
             'The baseline is the previous public Ink GPU loader, frozen at project commit `9b37148`. The experimental adapter packs query metadata into one upload, bypasses the general packed-value runtime and reuses staging storage. The matched strict split control uses the same experimental host and arithmetic as strict fusion, with three dispatches. These differences are retained separately; the full speedup is not evidence that dispatch fusion alone caused the gain.', '',
             '| Mode, batch 1,024 | Median of process medians (µs/embedding) | Process-median range |',
             '| --- | ---: | ---: |']
    for mode in ['ink','split-strict','fused-strict','split-native','fused-native']:
        samples = [statistics.median(next(x for x in run['reports'] if x['batch']==1024)['measurements'][mode]['query_ns'])/1000 for run in report['runs']]
        rows.append(f'| {mode} | {statistics.median(samples):.3f} | {min(samples):.3f}–{max(samples):.3f} |')
    last = report['summary'][-1]['modes']
    rows += ['', f"At batch 1,024 strict fusion is **{last['ink']['query_ns']/last['fused-strict']['query_ns']:.2f}×** faster than the previous public Ink path, but only **{last['split-strict']['query_ns']/last['fused-strict']['query_ns']:.2f}×** faster than the matched strict three-dispatch control. Native fusion versus native split is **{last['split-native']['query_ns']/last['fused-native']['query_ns']:.2f}×**. Fusion is not a universal win; per-process and small-batch adverse outcomes are retained in the raw samples.", '',
             'The existing Ink runtime already retains intermediate GPU buffers. The experimental fused path removes the means/norm storage, retains a single output buffer, and reuses readback staging. It never returns borrowed CPU results.', '',
             '| Batch | Native fused, completed resident encode (µs/embedding) | Subsequent full read (µs/embedding) |',
             '| ---: | ---: | ---: |']
    for r in report['summary']:
        if r['batch'] in (1,16,1024):
            mode = r['modes']['fused-native']
            rows.append(f"| {r['batch']} | {mode['resident_finish_ns']/1000:.3f} | {mode['read_ns']/1000:.3f} |")
    rows += ['', 'These are separate wall-clock operations with an explicit queue completion before readback, not GPU timestamp measurements. Their medians must not be added to reconstruct the overlapped public API timing. Read includes GPU copy, map, detached CPU copy and unmap.', '',
             '## Arithmetic and correctness', '',
             'Strict split and fused shaders match the independent ordered F32 oracle bit-for-bit on all five model fixtures, each with 16 queries and three changed permutations, plus resident reads. Four additional generated shapes (1, 7, 65, 1,025 dimensions) cover signed zero, subnormals, cancellation, overflow/canonical NaNs, empty inputs and 4,096-token documents, in both strict schedules. This is finite test evidence, not a universal shader proof.', '',
             '| Model / fixture | Native maximum absolute error vs ordered F32 |',
             '| --- | ---: |']
    validation = report['runs'][0]['validation']
    for name in ['potion-2m','potion-8m','st-retrieval','unseen-weighted','unseen-clamp']:
        error = max(c['max_abs_error'] for v in validation if v['name']==name and v['mode'].endswith('native') for c in v['checks'])
        rows.append(f'| {name} | {error:.9g} |')
    rows += ['', 'Native float is an explicit approximate contract, with `atol=2e-6, rtol=2e-5` checked on the model/query fixtures. It does not preserve exact Ink arithmetic. Device rounding/contraction, subnormals and sqrt/division can differ; these error tolerances are validation thresholds, not guarantees for unseen inputs. The loader rejects weights/epsilon outside its finite-intermediate input bounds. No model fine-tuning or semantic-quality improvement is claimed.', '',
             '## Resident similarity search', '',
             'Sixteen Potion queries search a resident 256-document corpus, using GPU dot products and GPU top-10 selection. Corpus embeddings are computed once outside timing. Each measured request encodes new query embeddings and reads only 1,280 bytes of IDs/scores. It does not read embeddings. The matched forced-read control adds a 4,096-byte query-embedding download before those same search kernels; both keep the corpus resident, and neither is an upstream search baseline.', '',
             '| Mode | Resident encode + search (µs/query) | Same search with forced embedding read | Top-10 ID agreement with ordered dots of the same embeddings |',
             '| --- | ---: | ---: | ---: |']
    for mode in ['fused-strict','fused-native']:
        entries = [next(s for s in r['search'] if s['mode']==mode) for r in report['runs']]
        resident = statistics.median(statistics.median(s['resident_encode_search_ns_per_query']) for s in entries)/1000
        forced = statistics.median(statistics.median(s['forced_embedding_read_before_search_ns_per_query']) for s in entries)/1000
        recall = min(min(s['recall_at_10_vs_same_embeddings']) for s in entries)
        rows.append(f'| {mode} | {resident:.3f} | {forced:.3f} | {100*recall:.1f}% |')
    rows += ['', 'The native path changes some top-k IDs despite small embedding/score errors. This small repeated-corpus fixture measures numerical ranking agreement, not semantic retrieval quality or MTEB. Equal dot products use the lower document index; NaNs sort last.', '',
             'Resident leases expire on the next encode in that session or on close. Cross-model/stale handles and invalid IDs/capacities/k are rejected. Focused hardware conformance also checks search cache growth/shrinkage, detached results, queued close and zero live bytes after close; the main experiment checks cleanup after device loss.', '',
             '## Reproduction and retained artifacts', '',
             'Prepare the five models using the repository validation instructions and build their existing WebGPU targets first. Then:', '',
             '```sh',
             'for name in potion-2m potion-8m st-retrieval unseen-weighted unseen-clamp; do',
             '  uv run python scripts/build_gpu_fusion.py --build build/general/$name',
             'done',
             'uv run python -m scripts.prepare_gpu_edges',
             'PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/gpu_fusion_browser.mjs',
             'PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/gpu_fusion_conformance.mjs',
             'uv run python -m scripts.retain_gpu_fusion',
             '```', '',
             'The source/hash receipts bind the measured inputs before and after the run. Experimental shaders, literal Ink control entry points, source/target metadata, small synthetic edge tables and the before/after host are retained under `artifacts/gpu-fusion/`. Pretrained weights remain external data at their pinned revisions. Historical compiler build identities remain in each `target-compilation.json`; this experiment adds no Ink compiler change. Three fresh browser groups × nine rounds × eight complete query calls, with 20 warmups per mode/batch. CPU tokenization, cold loading and session creation are excluded. Large-batch values describe amortized throughput, not single-request latency.', '',
             'The existing published animation retains its original measurements; these experimental timings have not been substituted into it.']
    (result / 'REPORT.md').write_text('\n'.join(rows)+'\n')
    print(result / 'REPORT.md')


if __name__ == '__main__':
    main()
