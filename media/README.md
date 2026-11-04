# Shareable speed comparison

[GIF](potion-2m-speed.gif) · [MP4](potion-2m-speed.mp4) · [Static PNG](potion-2m-speed.png)

![Potion 2M comparison](potion-2m-speed.gif)

The 16-second seamless animation compares Ink with original Model2Vec/NumPy inference for
**Potion 2M on an Apple M4 Pro**, with two CPU panels and one GPU/CPU batch panel:

| Workload | Ink / JS | Model2Vec / NumPy | Result |
| --- | ---: | ---: | --- |
| Short, 1–16 tokens | 1.84 µs/query | 4.85 µs/query | Ink 2.63× faster |
| Mixed 64-case corpus | 16.84 µs/query | 8.77 µs/query | NumPy 1.92× faster |
| GPU vs CPU, batch 1,024 | 3.77 µs/embedding (GPU) | 6.87 µs/embedding (CPU) | Ink GPU 1.82× CPU throughput |

Each panel uses its own animation time scale and a common track distance for its
two balls. Integer trip counts make the loop seamless; relative speeds approximate
the measured ratios within 0.4%. Motion is illustrative, not real-time execution;
the displayed timings are the recorded measurements. Empty inputs are excluded
from the short group and included in the mixed corpus.

The first two panels are single-query CPU results. Loading/tokenization are excluded; changing
ID capture and complete output consumption are included. Same weights and IDs;
the generated path reuses a caller destination while NumPy allocates its normal
result. Raw timing samples, setup costs and checks are in the
[CPU latency report](../results/javascript/REPORT.md).

The third panel uses the [native GPU batch report](../results/targets/REPORT.md):
Apple GPU/Metal with resident weights, new-query uploads, three completed
dispatches and complete decoded readback. It shows amortized throughput at batch
1,024, not individual request latency. The NumPy comparison runs on CPU; no
upstream GPU implementation is benchmarked. These are the native GPU numbers,
not the separately measured Chrome WebGPU numbers.

Styling follows [inkwell.ing](https://inkwell.ing/) and the
[Ink site](https://siliconjungle.github.io/ink-spec-site/): Arial, near-black,
warm white, muted grey/green, open spacing and thin rules. Details stay here in
the caption so the animation remains minimal.

To regenerate from the recorded JSON data (Pillow and ffmpeg required):

```sh
uv run --no-project --with pillow python scripts/render_speed_animation.py
```

The default font path uses macOS Arial; `--font-dir` accepts another directory
containing `Arial.ttf` and `Arial Bold.ttf`. Font files are not included.

Suggested post:

> I ported static embedding inference to Ink and built tooling to load existing model weights and compile the inference code to JS, Rust & WebGPU.
>
> On Potion 2M, JS beats NumPy by 2.6× for short inputs. NumPy wins on longer ones.
>
> Code + benchmarks: [github.com/siliconjungle/ink-static-embeddings](https://github.com/siliconjungle/ink-static-embeddings)
