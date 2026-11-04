"""Retain source/metadata/correctness evidence without publishing model weights."""
import argparse
import json
from pathlib import Path
import shutil

from neural_to_ink.static_model import digest


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('directories',nargs='+',type=Path)
    args=parser.parse_args()
    output=Path('results/general');output.mkdir(exist_ok=True,parents=True)
    records=[]
    for directory in args.directories:
        report=json.loads((directory/'validation-report.json').read_text())
        browser=json.loads((directory/'browser-validation.json').read_text())
        if not browser['all_outputs_bit_exact'] or not browser['invalid_ids_rejected']:
            raise ValueError('incomplete validation')
        for name,expected in report['identities'].items():
            if digest(directory/name)!=expected:raise ValueError(f'changed validated file: {directory/name}')
        destination=output/directory.name;destination.mkdir(exist_ok=True)
        names=['model.json','model.ink','gpu-model.ink','native-model.ink','targets.json',
               'target-compilation.json','validation.json','validation-report.json','browser-validation.json']
        for optional in ['compilation.json','selection.json']:
            if (directory/optional).exists():names.append(optional)
        for name in names:shutil.copyfile(directory/name,destination/name)
        records.append({**report,'browser':browser,'retained_directory':directory.name,
                        'retained_sha256':{name:digest(destination/name)for name in names}})
    sources=['src/neural_to_ink/static_model.py','src/neural_to_ink/targets.py',
             'runtime/static-embedding.mjs','scripts/prepare_validation_models.py',
             'scripts/build_model.py','scripts/validate_model.py','scripts/validate_native.rs',
             'scripts/validate_browser.mjs','scripts/retain_validation.py']
    result={'schema':2,'scope':'Architecture compatibility validation, not a general performance benchmark or universal equivalence proof.',
            'models':records,'source_sha256':{name:digest(Path(name))for name in sources}}
    (output/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    rows=['# General static architecture validation','',result['scope'],'',
          '| Model / fixture | Dimensions | F32 table values | JS shards | JS / Rust / hardware WebGPU |',
          '| --- | ---: | ---: | ---: | --- |']
    for r in records:
        rows.append(f"| {r['model_id']} | {r['dimensions']} | {r['parameters']:,} | {r['shards']} | Bit-exact ordered F32 |")
    rows+=['','Each model has 16 cases: text/empty/Unicode/unknown-token inputs, vocabulary endpoints, repeated IDs and seeded sequences up to 512 tokens. WebGPU checks three changing permutations of every case, with actual hardware execution required. Invalid IDs, overlong documents and oversized allocation requests are rejected.',
           '', 'Model2Vec tokenization/inference is checked against upstream 0.7.0. Sentence Transformers exports are checked against the PyTorch EmbeddingBag(mean) and optional normalize operations used by its StaticEmbedding pipeline; the complete Sentence Transformers SDK is not imported. Upstream tolerance is rtol=2e-5, atol=2e-6. Generated targets must match the independent ordered binary32 oracle bit for bit.',
           '', 'The two generated fixtures exercise unfamiliar five/seven-dimensional shapes, non-row-aligned sharding, clustered vocabulary remapping, F32 token weights, zero/tiny rows and clamped normalization. They are deterministic test models, not pretrained quality benchmarks. The generated weighted fixture is serialized by upstream Model2Vec itself.',
           '', 'Potion 2M additionally runs the unchanged proof-checked optimizer and validates its selected output. Only that model has an optimized JS result in this matrix. This upgrade does not claim a new compiler optimization speedup.',
           '', 'Imported model IDs/revisions, source files, emitted sources, compiler hashes, reference outputs, browser/device identity and output hashes are retained beside this report. Learned model tables are redownloaded from pinned revisions, rather than committed. Larger tables can exceed existing Ink/device GPU budgets even though CPU import succeeds.']
    (output/'REPORT.md').write_text('\n'.join(rows)+'\n')
    print('\n'.join(rows))


if __name__=='__main__':main()
