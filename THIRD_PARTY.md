# Provenance

The converter and benchmark harness are authored for this repository.

`knowledge/laws.json` contains existing MIT-licensed Ink knowledge objects from
James Addison's [ink-knowledge](https://github.com/siliconjungle/ink-knowledge),
revision `41a81caf8621443d6aa9980d4ea2710b4b3e876a`. Their original content
identities and dependencies are retained. The repository's MIT copyright notice
also covers these objects. The historical experiment required no new law or
compiler patch. `knowledge/static-pipelines.json` additionally includes 18
existing polymorphic pipeline templates from the currently pinned knowledge
repository. The compiler follow-up fixes general proposal-context binding and
search pricing; it introduces no new arithmetic law.

The downloaded [Potion 2M model](https://huggingface.co/minishlab/potion-base-2M)
is published by Minish Lab under MIT. Model2Vec is by Stephan Tulkens and Thomas
van Dongen. The model card and original tokenizer are retained in the local
download. Weights are downloaded at the pinned revision and are not committed
to this repository. Their exact hashes are recorded in `generated/model.json`.

Python dependencies retain their individual licenses; `uv.lock` binds the
dependency versions. Ink, its planner and lowerings remain independently owned,
pinned dependencies. Generated modules contain Ink's emitted support code and
retain that project's MIT licensing.
