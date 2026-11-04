"""Replay existing general fold knowledge on the frozen unrelated programs."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ink-checkout',type=Path,required=True)
    parser.add_argument('--compiler',type=Path,required=True)
    parser.add_argument('--buffered',action='store_true')
    args=parser.parse_args()
    checkout=args.ink_checkout.resolve();compiler=str(args.compiler.resolve())
    sys.path[:0]=[str(checkout/'knowledge'),str(checkout/'planner')]
    from ink_knowledge import Store,canonical
    from ink_knowledge.source_algorithms import propose
    from producers.captured_fold_batching import templates
    root=Path('experiments/generalization');destination=Path('results/generalization/folds');destination.mkdir(parents=True,exist_ok=True)
    frozen=json.loads((root/'frozen.json').read_text())
    for name,expected in frozen['sha256'].items():
        if hashlib.sha256(Path(name).read_bytes()).hexdigest()!=expected:raise ValueError(f'Frozen input changed: {name}')
    def invoke(*command):
        result=subprocess.run(list(map(str,command)),capture_output=True,text=True,timeout=180)
        if result.returncode:raise RuntimeError(result.stderr[-4000:])
        return result.stdout
    laws=destination/'general-laws.json'
    receipt=json.loads(invoke(compiler,'emit-laws',checkout/'knowledge/libraries/independent-fold-batching.ink','-o',laws))
    bundle=json.loads(laws.read_text())
    bank=Store.publish(Path('work/generalization/knowledge'),bundle['objects'].values())
    bank=bank.extend([row['object']for row in templates(receipt['names']['map_fusion'])])
    if args.buffered:
        from scripts.buffered_fold_template import templates as buffered
        buffered_laws=destination/'buffered-laws.json'
        buffered_receipt=json.loads(invoke(compiler,'emit-laws',root/'buffered-fold-laws.ink','-o',buffered_laws))
        bank=bank.extend(json.loads(buffered_laws.read_text())['objects'].values())
        law_id=buffered_receipt['names']['buffer_fold_map']
        bank=bank.extend([r['object']for r in buffered(receipt['names']['map_fusion'],law_id,bank.object(law_id)['payload'])])
    report=[]
    manifest=json.loads((root/'manifest.json').read_text())
    for name,workload in manifest['frozen_workloads'].items():
        directory=destination/name;directory.mkdir(exist_ok=True)
        source=root/workload['source'];core=directory/'core.json'
        source_id=json.loads(invoke(compiler,'emit-core',source,'-o',core))['core_sha256']
        context=dict(core=json.loads(core.read_text()),compiler=compiler,source=source_id,
                     knowledge_root=str(bank.root.resolve()),knowledge_snapshot=bank.snapshot_id,check_timeout=120)
        candidates=list(propose(context));(directory/'proposals.json').write_bytes(canonical(candidates))
        accepted=[]
        invoke(compiler,'build',source,'--target','javascript','-o',directory/'literal.mjs')
        for index,candidate in enumerate(candidates):
            if candidate['status']!='proposal':continue
            if not any(a['function']=='run'for step in candidate['steps']if step['kind']=='rewrite'for a in step['package']['applications']):continue
            plan=directory/f'candidate-{index}.json'
            plan.write_bytes(canonical(dict(schema=1,semantics='ink-compiled-plan-v1',input_core_sha256=source_id,steps=candidate['steps'])))
            try:
                invoke(compiler,'check-plan',source,plan,'--target','javascript')
                invoke(compiler,'compile',source,'--plan',plan,'--target','javascript','-o',directory/f'candidate-{index}.mjs')
                accepted.append(index)
            except RuntimeError as error:
                (directory/f'candidate-{index}.rejected.txt').write_text(str(error))
        report.append(dict(name=name,role=workload['role'],accepted=accepted,proposals=len(candidates),declines=[r for r in candidates if r['status']!='proposal'],source_sha256=hashlib.sha256(source.read_bytes()).hexdigest()))
        print(name,'accepted',accepted,flush=True)
    result=dict(schema=1,scope='Existing generic captured-independent-fold law replayed through ordinary source extension/rewrite compilation. Candidates are not automatically profitable.',compiler_sha256=hashlib.sha256(Path(compiler).read_bytes()).hexdigest(),knowledge_snapshot=bank.snapshot_id,workloads=report)
    (destination/'discovery.json').write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
