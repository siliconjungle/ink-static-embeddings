"""Reproduce checked fusion/borrowing on the unchanged historical model source.

This is a two-shard schema-1 benchmark fixture, not an importer restriction.
All before/after paths execute the same source and weights on CPU. Proof search
finishes before measurements. No hand-edited arithmetic or GPU path is timed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys

import numpy as np


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ink-checkout',type=Path,required=True)
    parser.add_argument('--compiler',type=Path,default=Path('work/toolchain/ink'))
    parser.add_argument('--measure-only',action='store_true')
    args=parser.parse_args();checkout=args.ink_checkout.resolve();ink=str(args.compiler.resolve())
    sys.path[:0]=[str(checkout/'knowledge'),str(checkout/'planner')]
    from ink_knowledge import Store,identity
    from producers.pipeline_templates import templates
    from producers.readonly_borrows import scoped_candidates
    manifest=json.load(open('build/model.json'))
    if manifest['schema']!=1:raise ValueError('This retained benchmark uses the historical schema-1 two-shard fixture')
    dest=Path('results/compiler');dest.mkdir(parents=True,exist_ok=True)
    scratch=Path('work/compiler-improvements');scratch.mkdir(exist_ok=True)
    environment={**os.environ,'PYTHONPATH':os.pathsep.join([str(checkout/'knowledge'),str(checkout/'planner')])}
    def run(name,command,env=None):
        result=subprocess.run(list(map(str,command)),text=True,capture_output=True,env=env,timeout=300)
        (scratch/(name+'.log')).write_text(result.stdout+result.stderr)
        if result.returncode:raise RuntimeError(name+': '+result.stderr[-3000:])
        return result.stdout
    if not args.measure_only:
        bundle=json.load(open('knowledge/laws.json'));rows=templates()
        catalogue=scratch/'catalogue'
        Store.publish(catalogue,list(bundle['objects'].values())+[r['object']for r in rows],
                      {**bundle['names'],**{'pipeline-templates/'+r['name']:identity(r['object'])for r in rows}})
        run('plan',[sys.executable,checkout/'planner/plan.py','--compiler',ink,'--core','build/model.core.json',
             '--snapshot',catalogue/'store/snapshot.json','--knowledge-root',catalogue,'--budget','256','--rounds','8',
             '--time-seconds','40','--compact-output','--diagnostics',dest/'diagnostics.json','-o',dest/'selection.json'],environment)
        run('check-selection',[ink,'check-selection','build/model.core.json',dest/'selection.json'])
        run('javascript',[ink,'build','build/model.ink','--selection',dest/'selection.json','--target','javascript','-o','build/compiler-optimized.mjs'])
        run('subject',[ink,'emit-semantic','build/model.core.json','--core','-o',scratch/'subject.json'])
        core=json.load(open('build/model.core.json'));subject=json.load(open(scratch/'subject.json'))
        candidate=next(scoped_candidates({'core':core,'source':subject['input_core_sha256'],'emit_target':'rust'},strategies=['aggregate-observations']))
        physical=candidate['step']['package'];(dest/'physical.json').write_text(json.dumps(physical,indent=2)+'\n')
        package=dict(schema=1,semantics='ink-compiled-plan-v1',input_core_sha256=subject['input_core_sha256'],steps=[candidate['step']])
        (dest/'plan.json').write_text(json.dumps(package,indent=2)+'\n')
        run('physical-check',[ink,'check-plan','build/model.ink',dest/'plan.json'])
        project=scratch/'rust'
        run('rust-project',[ink,'build','build/model.ink','--target','rust','-o',project])
        run('planned-rust',[ink,'compile','build/model.ink','--plan',dest/'plan.json','--target','rust','-o',project/'src/lib.rs'])
        bins=project/'src/bin';bins.mkdir(exist_ok=True)
        original=Path('scripts/native_bench.rs').read_text()
        (bins/'owning.rs').write_text(original)
        borrowed=original.replace('state.function_l_encode(black_box(first.clone()), black_box(second.clone()), black_box(ids.clone()))',
                    'state.ink_borrowed_function_l_encode(black_box(&first), black_box(&second), black_box(&ids))')
        borrowed=borrowed.replace('persistent weights cloned into its by-value API','checked borrowed parameters; no model copy-in')
        (bins/'borrowed.rs').write_text(borrowed)
        run('rust-build',['cargo','build','--release','--manifest-path',project/'Cargo.toml','--bin','owning','--bin','borrowed'])
    oracle=np.array(json.load(open('results/raw-0-upstream.json'))['ordered_outputs'],np.float32)
    summary=[]
    for process in range(6):
        modes=['literal','optimized','compiler-optimized']
        if process%2:modes.reverse()
        for mode in modes:
            data=json.loads(run(f'js-{process}-{mode}',['node','scripts/node_bench.mjs','build',mode,'9']))
            np.testing.assert_array_equal(np.array(data.pop('outputs'),np.float32).view(np.uint32),oracle.view(np.uint32))
            data['all_outputs_bit_exact']=True
            (dest/f'js-{process}-{mode}.json').write_text(json.dumps(data,indent=2)+'\n')
            summary.append({'process':process,'mode':mode,'median_ns':statistics.median(data['samples_ns_per_embedding'])})
    for process in range(3):
        for mode in (['owning','borrowed']if process%2==0 else['borrowed','owning']):
            data=json.loads(run(f'rust-{process}-{mode}',[scratch/'rust/target/release'/mode,'build','9','64']))
            for i,row in enumerate(data['results']):
                out=np.array(row.pop('output'),np.float32)
                np.testing.assert_array_equal(out.view(np.uint32),oracle[i].view(np.uint32))
                row['output_sha256']=hashlib.sha256(out.tobytes()).hexdigest()
            (dest/f'rust-{process}-{mode}.json').write_text(json.dumps(data,indent=2)+'\n')
            medians=[statistics.median(row['samples_ns'])for row in data['results']]
            summary.append({'process':process,'mode':'rust-'+mode,'median_ns':statistics.mean(medians),
                            'first_eight_token_ns':medians[0]})
    aggregate={mode:statistics.median(r['median_ns']for r in summary if r['mode']==mode)
               for mode in ['literal','optimized','compiler-optimized','rust-owning','rust-borrowed']}
    report={'schema':1,'scope':__doc__,'model':manifest,'summary_ns_per_embedding':aggregate,'process_medians':summary,
            'compiler_sha256':sha(ink),'source_sha256':sha('build/model.ink'),
            'selection_applications':json.load(open(dest/'selection.json'))['applications'],
            'package_revisions':{name:subprocess.check_output(['git','-C',str(checkout/name),'rev-parse','HEAD'],text=True).strip()for name in ['knowledge','planner']},
            'source_sha256_files':{str(p):sha(p)for p in [Path('scripts/compiler_improvements.py'),checkout/'knowledge/ink_knowledge/law_templates.py',checkout/'planner/ink_planner/semantic_search.py']},
            'comparison':'JS paths include changing-ID capture and complete output consumption. Rust owning/borrowed differ at the caller boundary; both use the identical checked physical plan. Startup/loading excluded. NumPy is a separate runtime, not an isolated compiler comparison. Original unplanned Rust is retained in the earlier target report; it is deliberately not run over the full long-sequence corpus.'}
    (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    rows=['# Checked compiler pipeline improvements','',report['comparison'],'',
          '| CPU implementation | µs / embedding |','| --- | ---: |',
          *[f'| {mode} | {value/1000:.3f} |'for mode,value in aggregate.items()],
          '',f"Same-source JavaScript improvement versus prior checked optimization: {aggregate['optimized']/aggregate['compiler-optimized']:.2f}×.",
          '', 'Six fresh JS process groups and three fresh Rust groups; nine rounds per group/case. All 64 complete embeddings match the independent ordered F32 oracle bit for bit. The selected general laws remove both mapped pooling and norm-square intermediates. Rust uses the existing checked read-only parameter capabilities and generated borrowed entrypoint; no model-specific Rust rewrite or weight changes are made.',
          '', 'The historical NumPy CPU kernel measured 8.513 µs/embedding under its original harness. Fresh-process raw samples are adjacent; comparisons to that historical number are not simultaneous runtime-isolated speedups. Source, model, compiler and proof/physical packets are bound by hashes in report.json.']
    (dest/'REPORT.md').write_text('\n'.join(rows)+'\n');print('\n'.join(rows))


if __name__=='__main__':main()
