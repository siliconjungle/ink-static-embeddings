// Validate a newly compiled JS artifact against retained model reference cases.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createJavascriptEncoder} from '../runtime/static-embedding.mjs';

const [directory, artifact, layoutPath] = process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(`${directory}/model.json`));
const bytes=fs.readFileSync(`${directory}/weights.f32`);
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.weights_sha256);
const weights=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const fixture=JSON.parse(fs.readFileSync(`${directory}/validation.json`));
const module=await import(pathToFileURL(artifact));
const layout=layoutPath?JSON.parse(fs.readFileSync(layoutPath)):null;
const encode=createJavascriptEncoder(module,manifest,weights,{layout});
const actual=encode.encodeBatch(fixture.queries);
const expected=new Float32Array(fixture.ordered_outputs.flat());
assert.deepEqual(new Uint32Array(actual.buffer,actual.byteOffset,actual.length),new Uint32Array(expected.buffer));
process.stdout.write(JSON.stringify({model_id:manifest.model_id,revision:manifest.revision,
  layout:layout?.kind??'reference',layout_source_sha256:layout?.source_sha256??manifest.source_sha256,
  cases:fixture.queries.length,dimensions:manifest.dimensions,all_outputs_bit_exact:true,
  source_sha256:createHash('sha256').update(fs.readFileSync(`${directory}/model.ink`)).digest('hex'),
  artifact_sha256:createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'),
  outputs_sha256:createHash('sha256').update(new Uint8Array(actual.buffer,actual.byteOffset,actual.byteLength)).digest('hex')}));
