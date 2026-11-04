"""Build explicit GPU experiments from model metadata and pinned Ink helpers."""
import argparse
import json
from pathlib import Path

from ink_static_embeddings.gpu import shaders
from ink_static_embeddings.static_model import digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    args = parser.parse_args()
    base = args.build
    m = json.loads((base / 'model.json').read_text())
    compiled = json.loads((base / 'webgpu/manifest.json').read_text())
    pool = next(f for f in compiled['functions'] if f['name'] == 'pool_batch')
    source = base / 'webgpu' / pool['shader']
    # This is the compiler's fixed integer arithmetic prelude, ending before
    # source-specific record/buffer declarations and the actual entry point.
    text = source.read_text()
    helpers = text[:text.index('struct R_Accumulator')]
    if not all(f'fn ink_f32_{name}(' in helpers for name in ('add','mul','div','sqrt','from_u64','lt')):
        raise ValueError('Unsupported Ink helper prelude')
    directory = base / 'gpu-experimental'
    directory.mkdir(exist_ok=True)
    records = {}
    for native in (False, True):
        mode = 'native' if native else 'strict'
        for name, shader in shaders(m, helpers, native).items():
            filename = f'{mode}-{name}.wgsl'
            (directory / filename).write_text(shader)
            records[filename] = digest(directory / filename)
    receipt = {'schema': 1, 'kind': 'authored-cooperative-static-embedding-gpu',
               'model_source_sha256': m['source_sha256'], 'weights_sha256': m['weights_sha256'],
               'dimensions': m['dimensions'], 'normalization': m['normalization'],
               'ink_manifest_sha256': digest(base / 'webgpu/manifest.json'),
               'ink_pool_shader_sha256': digest(source),
               'shaders': records,
               'strict_contract': compiled['float_contract'],
               'native_contract': 'Opt-in approximate WGSL f32. Source token/reduction order authored; device rounding, contraction, subnormal flushing and sqrt/division precision may differ. No exact equivalence or quality improvement claim.',
               'scope': 'Experimental host/schedule generator, NOT output of the Ink compiler or a proof-selected compiler optimization. Strict arithmetic helpers copied verbatim from the pinned Ink-emitted shader.'}
    (directory / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(directory)


if __name__ == '__main__':
    main()
