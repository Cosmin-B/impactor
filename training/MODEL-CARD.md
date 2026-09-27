# Impactor dispatch adapter

The adapter returns one action label: `normal`, `charge`, or `detour`. Its input includes the simulated result of taking the normal route. This makes it a corrective-action classifier. It does not independently predict the outcome of an untested route.

The base model is Qwen/Qwen3.6-35B-A3B-FP8. River trained a rank-8 LoRA adapter for 12 optimizer steps on 27 synthetic examples. The entire run, including setup and evaluation, took 290 seconds. The saved checkpoint is recorded in `result.json`.

Nine distinct prompts were held out, with no exact prompt overlap with training. With greedy decoding, a 12-token limit and a newline stop, the adapter returned all nine expected labels. The base model returned empty replies under that format.

A second test loaded the saved checkpoint and compared it with the base model on the same nine prompts, using a 32-token limit and no newline stop. The adapter again returned all nine exact labels. The base began reasoning or explanatory text within the token limit. These tests establish a compact response format on this small synthetic task. They do not establish better general reasoning or broad reliability.

The deployed app displays these measurements. TypeSafe Jev continues to control live dispatches.
