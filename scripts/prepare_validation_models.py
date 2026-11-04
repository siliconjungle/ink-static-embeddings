"""Reproduce the architecture validation matrix, including unseen local shapes."""
import argparse
import json
from pathlib import Path

from huggingface_hub import snapshot_download
import numpy as np
from safetensors.numpy import save_file
from tokenizers import Tokenizer, models, pre_tokenizers

from ink_static_embeddings.converter import convert

MODELS = [
    ('potion-2m', 'minishlab/potion-base-2M', '389b9f64be5aa4ae7a6bc6fe95ef20ce485ae5da'),
    ('potion-8m', 'minishlab/potion-base-8M', 'bf8b056651a2c21b8d2565580b8569da283cab23'),
    ('st-retrieval', 'sentence-transformers/static-retrieval-mrl-en-v1', 'f60985c706f192d45d218078e49e5a8b6f15283a'),
]


def tokenizer(rows):
    tokens = {'[UNK]': 0, **{f't{i}': i for i in range(1, rows)}}
    result = Tokenizer(models.WordLevel(tokens, unk_token='[UNK]'))
    result.pre_tokenizer = pre_tokenizers.Whitespace()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixtures-only', action='store_true')
    args = parser.parse_args()
    if not args.fixtures_only:
        for name, model_id, revision in MODELS:
            source = Path('work/models') / name
            snapshot_download(model_id, revision=revision, local_dir=source,
                              allow_patterns=['config.json', 'modules.json', 'model.safetensors', 'tokenizer.json', '0_StaticEmbedding/*', 'README.md'])
            convert(source, Path('build/general') / name, model_id, revision)
    rng = np.random.default_rng(91837)
    # Produced through upstream serialization: tests its actual mapping/weight
    # tensor names, not only a hand-authored approximation of the format.
    from model2vec import StaticModel
    source = Path('work/models/unseen-weighted')
    vectors = rng.normal(size=(5, 7)).astype(np.float32)
    mapping = rng.integers(0, 5, size=19, dtype=np.int64)
    weights = rng.uniform(.1, 2, size=19).astype(np.float32);weights[0]=0
    upstream = StaticModel(vectors, tokenizer(19), normalize=True,
                           config={'model_type':'model2vec','hidden_dim':7,'normalize':True},
                           token_mapping=mapping, weights=weights)
    upstream.save_pretrained(source)
    convert(source, Path('build/general/unseen-weighted'), 'fixture/unseen-weighted', 'seed-91837', shard_elements=11)
    source = Path('work/models/unseen-clamp')
    base = source / '0_StaticEmbedding';base.mkdir(exist_ok=True, parents=True)
    (source / 'modules.json').write_text(json.dumps([
        {'type':'sentence_transformers.models.StaticEmbedding','path':'0_StaticEmbedding'},
        {'type':'sentence_transformers.models.Normalize','path':'1_Normalize'}]))
    vectors = rng.normal(size=(17,5)).astype(np.float32)
    # The validator always queries the final vocabulary row by itself, so the
    # clamp branch is exercised directly rather than only in mixed averages.
    vectors[0]=0;vectors[-1]*=np.float32(1e-20)
    save_file({'embedding.weight':vectors},base / 'model.safetensors')
    tokenizer(17).save(str(base / 'tokenizer.json'))
    convert(source, Path('build/general/unseen-clamp'), 'fixture/unseen-clamp', 'seed-91837', shard_elements=13)
    print('Prepared metadata-driven real models and weighted/remapped/clamped local fixtures.')


if __name__ == '__main__':
    main()
