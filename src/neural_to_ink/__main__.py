import argparse
import json
from pathlib import Path
from .converter import convert


def main():
    p=argparse.ArgumentParser(description='Convert static lookup/mean embeddings into Ink plus F32 weights.')
    p.add_argument('model_directory',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--model-id',required=True);p.add_argument('--revision',required=True)
    p.add_argument('--format',choices=['auto','model2vec','sentence-transformers'],default='auto')
    args=p.parse_args()
    print(json.dumps(convert(args.model_directory,args.output,args.model_id,args.revision,source_format=args.format),indent=2))


if __name__=='__main__':main()
