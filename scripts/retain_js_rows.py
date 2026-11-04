"""Retain measured row kernels and compatibility receipts without model weights."""
import hashlib
import json
from pathlib import Path
import shutil


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    output=Path('results/javascript-rows');node=json.loads((output/'report.json').read_text())
    browser=json.loads((output/'browser/report.json').read_text())
    for report in [node,browser]:
        for name,expected in report['source_sha256'].items():
            if sha(name)!=expected:raise ValueError('Measured file changed: '+name)
    rows=[]
    for r in browser['validation']:
        model=next(p.parent for p in Path('build/general').glob('*/model.json') if json.loads(p.read_text())['model_id']==r['model_id'])
        build=model/'javascript/packed-rows';dest=Path('artifacts/javascript-rows')/model.name;dest.mkdir(parents=True,exist_ok=True)
        for name in ['model.ink','model.mjs','layout.json']:shutil.copyfile(build/name,dest/name)
        layout=json.loads((dest/'layout.json').read_text())
        if sha(dest/'model.mjs')!=layout['module_sha256'] or sha(dest/'model.ink')!=layout['source_sha256']:raise ValueError('Changed target')
        rows.append({**r,'row_shards':len(layout['shards']),'artifacts':str(dest),
                     'retained_sha256':{p.name:sha(p) for p in dest.iterdir() if p.is_file()}})
    base=Path('build/general/potion-2m');dest=Path('artifacts/javascript-rows/potion-2m')
    for a,b in [('optimized.mjs','reference.mjs'),('selection.json','reference-selection.json'),
                ('javascript/packed-rows/array-reference.mjs','array-reference.mjs')]:shutil.copyfile(base/a,dest/b)
    shutil.copyfile('runtime/static-embedding.mjs','artifacts/javascript-rows/runtime-after.mjs')
    (output/'validation.json').write_text(json.dumps({'scope':'Hardware Chrome CPU validation of public packed-row loader; ordered F32, not an embedding-quality benchmark.','models':rows},indent=2)+'\n')
    probes=dest.parent/'probes';probes.mkdir(exist_ok=True)
    for name in ['tile4','tile8','tile16','row-list','row-buffer','packed-list','packed-buffer','short-only']:
        source=Path('build/js-layout-probes')/(name+'.ink')
        if source.exists():shutil.copyfile(source,probes/source.name)
    (probes/'README.md').write_text('''# Exploratory source layouts

These Potion 2M-specific source probes were not enabled. Source-only tiling and
row loops did not improve on the current compiler's optimized reference. The
production layout is metadata-driven and includes a short-input path plus dense
Buffer support in the compiler. These files are source construction experiments,
not admitted equality laws or universal performance evidence. Hand-edited target
diagnostics are not shipped or used as measured compiler artifacts.
''')
    print('Retained all five row artifacts and both measured storage implementations.')


if __name__=='__main__':main()
