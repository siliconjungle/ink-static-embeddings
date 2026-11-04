"""Compile any supported static model with an unchanged Ink distribution."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

from ink_static_embeddings.static_model import digest
from ink_static_embeddings.targets import prepare_targets


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--build', type=Path, required=True)
    p.add_argument('--toolchain', type=Path, default=Path('work/toolchain'))
    p.add_argument('--targets', default='javascript,rust,webgpu')
    p.add_argument('--max-tokens', type=int, default=4096)
    p.add_argument('--optimize', action='store_true', help='also run the existing proof-checked JS optimizer')
    args = p.parse_args()
    build = args.build.resolve()
    ink = args.toolchain.resolve() / 'ink'
    targets = args.targets.split(',')
    if not targets or set(targets) - {'javascript', 'rust', 'webgpu'}:
        p.error('targets must be javascript,rust,webgpu or a subset')
    prepare_targets(build, args.max_tokens)
    phases = []
    for target in targets:
        source, output = {'javascript': ('model.ink', 'literal.mjs'),
                          'rust': ('native-model.ink', 'rust'),
                          'webgpu': ('gpu-model.ink', 'webgpu')}[target]
        start = time.perf_counter()
        result = subprocess.run([str(ink), 'build', str(build / source), '--target', target, '-o', str(build / output)], text=True, capture_output=True)
        (build / f'{target}-build.log').write_text(result.stdout + result.stderr)
        phases.append({'target': target, 'seconds': time.perf_counter() - start, 'exit_code': result.returncode})
        if result.returncode:
            raise RuntimeError(result.stderr[-4000:])
        print(target, round(phases[-1]['seconds'], 3), 'seconds', flush=True)
    if args.optimize:
        subprocess.run([sys.executable, 'scripts/build.py', '--build', str(build), '--toolchain', str(args.toolchain), '--catalogue', 'knowledge/static-pipelines.json'], check=True)
    record = {'schema': 2, 'compiler_sha256': digest(ink), 'source_sha256': digest(build / 'model.ink'), 'phases': phases,
              'scope': 'Metadata-driven target layouts; unchanged Ink. Authored layout changes are not optimizer-discovered rewrites.'}
    (build / 'target-compilation.json').write_text(json.dumps(record, indent=2) + '\n')


if __name__ == '__main__':
    main()
