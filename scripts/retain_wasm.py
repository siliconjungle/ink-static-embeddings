"""Retain validated Wasm binaries, Ink sources and checked plans, not weights."""
import hashlib
import json
from pathlib import Path
import shutil


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    root=Path('results/wasm');report=json.loads((root/'report.json').read_text())
    for path,expected in report['source_sha256'].items():
        if sha(path)!=expected:raise ValueError(f'Measured source changed: {path}')
    records=[]
    for row in report['validation']:
        candidates=[p for p in Path('build/general').glob('*/model.json') if json.loads(p.read_text())['model_id']==row['model_id']]
        if len(candidates)!=1:raise ValueError('Ambiguous model')
        model=candidates[0].parent;build=model/'wasm';receipt=json.loads((build/'build.json').read_text())
        if sha(build/'model.wasm')!=receipt['wasm_sha256']:raise ValueError('Changed binary')
        dest=Path('artifacts/wasm')/model.name;dest.mkdir(exist_ok=True,parents=True)
        files=['model.wasm','model.ink','plan.json','build.json','Cargo.lock']
        for name in files:shutil.copyfile(build/name,dest/name)
        shutil.copyfile(build/'src/lib.rs',dest/'resident.rs')
        record={**row,'artifacts':str(dest),'wasm_sha256':receipt['wasm_sha256'],
                'retained_sha256':{p.name:sha(p) for p in dest.iterdir() if p.is_file()}}
        records.append(record)
    model=Path('build/general/potion-2m');dest=Path('artifacts/wasm/potion-2m')
    for a,b in [('optimized.mjs','optimized.mjs'),('selection.json','js-selection.json'),('js-final.mjs','literal.mjs')]:shutil.copyfile(model/a,dest/b)
    (root/'validation.json').write_text(json.dumps({'scope':'Both Ink/Rust/Wasm layouts validated in installed Chrome; inference compatibility, not embedding-quality evaluation.','models':records},indent=2)+'\n')
    (root/'toolchain.json').write_text(json.dumps({'toolchain':json.loads(Path('toolchain.lock.json').read_text()),
      'wasm_builds':{p.parent.parent.name:json.loads(p.read_text()) for p in Path('build/general').glob('*/wasm/build.json')},
      'wasm_source_sha256':{s:sha(s) for s in ['scripts/build_wasm.py','wasm/resident.rs','runtime/static-embedding-wasm.mjs','scripts/wasm_browser_benchmark.mjs','scripts/wasm_conformance.mjs','scripts/inspect_wasm.py']}},indent=2)+'\n')
    probe=root/'literal-probe';old=json.loads((probe/'report.json').read_text())
    # Preserve the initial unoptimized-baseline harness under its recorded hash.
    text=Path('scripts/wasm_browser_benchmark.mjs').read_text()
    text=text.replace("import('/'+build+'/optimized.mjs')","import('/'+build+'/js-final.mjs')")
    text=text.replace("build+'/optimized.mjs',build+'/selection.json'","build+'/js-final.mjs'")
    text=text.replace('JavaScript uses the checked selection with ordered pooling/norm fusion. ','')
    if hashlib.sha256(text.encode()).hexdigest()!=old['source_sha256']['scripts/wasm_browser_benchmark.mjs']:
        raise ValueError('Initial harness reconstruction differs')
    (probe/'wasm_browser_benchmark.mjs').write_text(text)
    (probe/'README.md').write_text('''# Initial literal-JavaScript probe

This initial run used literal, unoptimized JavaScript as the baseline. The main
[report](../REPORT.md) uses checked-optimized JavaScript with both pooling and
norm fusion. The raw initial samples remain here; its larger JS/Wasm ratio is
not the headline comparison. The retained harness matches its recorded hash.
''')
    print('Retained all five checked Wasm artifacts and the initial literal-baseline probe.')


if __name__=='__main__':main()
