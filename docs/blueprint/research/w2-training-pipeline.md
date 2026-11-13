# Training and distillation pipeline (wave 2)

*Research lens: if and when PromptAI trains models. Spike: `spikes/w2-training-pipeline`. Written 2026-11-10. Stars and push dates are from `gh api` today. Every timing ran while ~30 other agents shared the M5 (load average 50-130), so latencies are noisy and not comparable with wave-1 runs.*

## Bottom line

Keep BLUEPRINT §8 as written: **nothing is trained through the MVP.** The first model worth training is a **small on-device dictation-cleanup student**. It is trained on the team's own Mac with `mlx-lm` LoRA, from **synthetic data only** (no user data, no API teacher), and ships as merged 4-bit weights in the signed bundle. The guard falls back to rules, and the student ships only if it matches rules on meaning errors. Rent GPUs (TRL or Unsloth on an hourly pod) only for a later student above ~2B or a preference-trained router. Never train foundation models, ASR, embeddings, per-user adapters or federated models, and never train on another vendor's outputs without legal sign-off.

**Spike in one line.** 3,000 template-made pairs and 13 minutes of LoRA on the busy laptop lifted Qwen3-1.7B from 53% exact and 17 meaning errors (its 514-token few-shot prompt) to 63% and 14 with a 28-token prompt. With the guard it reaches 70% and 9, the same as the shipped S1-mini pipeline. It still has **3× the meaning errors of rules** (9 vs 3), and on the holdout it rewrote 2 of 3 already-clean sentences. Most failures trace to quirks of the templates. So synthetic-only training is cheap and fast enough to try, but it does not pass the gate without targeted generator fixes and real donated examples.

## 1. Starting point

BLUEPRINT §8 trains nothing: no per-user LoRA, reward models, federated learning or vendor fine-tuning. `research/learning-rl.md` allows one exception later: KTO or DPO on LoRA for a router or ranker once tens of thousands of clean pairs exist. §7 makes Clean mode rules-only for now (63% exact, 3 meaning errors on 60 items), cloud `clean` waits for S8, and superwhisper's S1-mini is ASSESS. This report adds the order of work, the minimum infrastructure, and a measured answer to the riskiest question: **can a 1-3 person team produce a useful on-device student without user data, a GPU budget or an MLOps stack?**

## 2. Spike: a cleanup student made on the laptop

**Data, no teacher.** `gen_synth.py` writes clean target sentences from templates (names, dates, tasks, tool jargon, lists, emails, AI prompts, Hinglish). It then *corrupts* them the way STT output looks: lower case, no punctuation, fillers, stutters, spoken numbers, "actually / sorry / no wait" self-corrections, and split vocabulary ("postgres q l"). The labels are exact by construction. That produced 3,000 training and 150 validation pairs in 9 kinds, mostly short utterances (targets average 9 words). A leak check found **0 of 80** test and holdout items sharing a 5-gram with the training data.

**Training.** Qwen3-1.7B MLX 4-bit (Apache-2.0), LoRA rank 8 on all layers (8.7M trainable parameters, 0.51%). Settings: batch 8, lr 5e-5, prompt masked, one-line system prompt with no rules and no few-shot examples. Validation loss fell from 7.14 to 0.005 by iteration 100, so the run was stopped at 200 iterations (~0.5 epoch, 24.1k supervised tokens). That took **791 s wall time on the shared M5, cost $0, and produced a 35 MB adapter.** Rank 8 follows "LoRA Without Regret": for small SFT sets "LoRA performs the same as full fine-tuning", applied to all layers ([Thinking Machines](https://thinkingmachines.ai/blog/lora/)).

**First attempt failed.** Qwen3.5-0.8B (a hybrid Gated DeltaNet model) ran out of Metal memory at batch 8 with a **20.7 GB peak footprint**. With gradient checkpointing it did not reach iteration 100 in 1,206 s, which is >12 s per iteration against ~4 s for the dense 1.7B model under similar or heavier load. In `mlx-lm` 0.32.2, students with standard attention are far cheaper to train.

**Eval.** The unchanged `spikes/dictation-cleanup/score.py`, run on the same 60-item main set and 20-item holdout. "Guard" means falling back to rules when more than 40% of words change.

| Main set, 60 items | exact | token acc | meaning errors | no-change kept | + guard: exact / meaning | prompt prefix | peak GB |
|---|---|---|---|---|---|---|---|
| rules | 63% | 90.9% | **3** | 100% | 63% / **3** | n/a | 0 |
| Qwen3-1.7B few-shot (wave 1) | 53% | 84.7% | 17 | 75% | 63% / 13 | 514 tok | 1.54 |
| Qwen3-1.7B, rules prompt, zero-shot (wave 1) | 17% | 55.4% | 28 | 100% | 35% / 16 | — | 1.36 |
| S1-mini 4-bit (wave 1) | 65% | 88.6% | 12 | 88% | 70% / 9 | 68 tok | 0.49 |
| Qwen3-4B-2507 few-shot (wave 1) | 78% | 92.5% | 12 | 88% | 82% / 8 | — | 2.99 |
| **student (Qwen3-1.7B + LoRA)** | **63%** | **90.5%** | **14** | 75% | **70% / 9** | **28 tok** | **1.11** |

Exact match at 38/60 has a 95% Wilson interval of 51-74%, so the student's lead over its few-shot base (53%) is suggestive, not proven. On the holdout (20 items) the student scored 55% exact with 5 meaning errors. Rules scored 50% / 5, S1-mini 70% / 5 and Qwen3-4B 75% / 4. The student kept only 1 of 3 already-clean sentences, rules 3 of 3. The same base with the one-line prompt and no adapter slipped into thinking mode (the MLX Qwen3 template ignores `enable_thinking`): 60 of 60 items hit the token cap. The adapter is what makes the short prompt usable.

**Why it fails.** It learned the templates' rules, not the task. It expands "postgres" to "PostgreSQL" when no vocabulary asks for it. It deletes "I mean it:", "You know what," and "Like I said," from clean text, because the generator only ever used them as fillers or corrections. It writes "$60 thousand" and "4:3" (for "four oh three"). It garbles Hinglish: 3 of its 14 meaning errors fall on the 6 Hinglish items. Each of these points to a fix in the generator, and each is invisible on the synthetic validation set (loss 0.005). **The evaluation set, not the training loss, is the product.**

## 3. Options compared

| | A. Laptop MLX (non-obvious) | B. Rented GPU + OSS trainer | C. Managed training API | D. Platform adapters | E. Don't train |
|---|---|---|---|---|---|
| What | `mlx-lm lora`, fused; runs via `mlx-swift-lm` (Apple) or GGUF in llama.cpp (Android) | TRL / Unsloth / Axolotl on an hourly RunPod pod | Tinker, Together, Fireworks | Apple Foundation Models adapter toolkit | prompts, retrieval, GEPA, counts |
| ≤2B on-device student | **yes, measured** (dense 1.7B) | yes | **no**: Tinker's smallest is Qwen3.5-4B ([Tinker](https://thinkingmachines.ai/tinker/)) | only Apple's system model | n/a |
| Cash | $0 | $0.34-2.69 per GPU-hour (§8) | per-token meters + $0.10/GB-month | free; ship entitlement | API tokens |
| Lock-in | none | none | checkpoints downloadable | **dead end**: "Version 26.0.0 is the last release … not compatible with … 27 and later" ([Apple](https://developer.apple.com/apple-intelligence/foundation-models-adapter/)) | none |
| Verdict | **Adopt, Stage 1** | **Adopt, Stage 3**, by the hour | Assess for ≥4B server models | **Avoid** | **Default elsewhere** |

**Commitment: E everywhere, plus A for one student.** For students under 2B the bottleneck is data and evaluation, not FLOPs. A script on a machine the team already owns needs no cloud account, no data egress and no idle-pod bill. The same weights run in the Apple apps: `mlx-swift-lm` (MIT) ships `Qwen3.swift` and `LoraTrain.swift`. llama.cpp has supported Qwen3.5 since b7973 ([release](https://newreleases.io/project/github/ggml-org/llama.cpp/release/b7973)). B is only for models too big for the laptop, or for KTO/DPO/GRPO, which TRL and Unsloth do better. Unsloth's Mac app claims to "run and train MLX or GGUF models" ([docs](https://unsloth.ai/docs/get-started/install/mac)); not tested here.

## 4. What never to train

| Never train | Why | Instead |
|---|---|---|
| Foundation LLMs (`compose`, `answer`, `verify`) | frontier models improve quarterly | `routes.yaml`, GEPA |
| ASR | needs consented audio at scale | vocabulary biasing, post-ASR replacement |
| Embeddings | good open models exist; retraining forces a re-index | swap via config |
| Per-user LoRA | retrieval beat per-user PEFT on LaMP, a 14.92% vs 1.07% gain (`learning-rl.md`); one adapter per user multiplies deletion and serving work | memories, counts, cohort priors |
| Prediction networks, reward models, PPO/GRPO on traffic | counts and bandits suffice; reward hacking | BLUEPRINT §8-9 |
| Implicit user content (edit diffs, memories, telemetry) | consent covers personalization, not training; models trained on personal data are not automatically anonymous (EDPB Opinion 28/2024, [CMS](https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models)) | donations with a training purpose |
| Students trained on Claude or other API outputs, by default | Anthropic's Commercial Terms D.4 bar using the Services "to build a competing product or service, including to train competing AI models" ([terms](https://www.anthropic.com/legal/commercial-terms)); whether a cleanup model "competes" is for counsel | templates or an Apache-2.0 open-weight teacher |

## 5. What to distill first

1. **Clean-mode cleanup, English (Stage 1).** It is narrow, verifiable and latency-bound, it runs on every utterance, its labels can be synthesized, and running it locally keeps the most private text off the network.
2. **Locale slices (Stage 2):** en-IN numbers, then Hinglish and other locale packs, with donated items added. These are the slices where both rules and the student are weakest.
3. **Router or ranker preference model (Stage 3):** the `learning-rl.md` exception. KTO with TRL or Unsloth on rented GPUs. TRL's on-policy `DistillationTrainer` is still `trl.experimental` ([HF, Apr 2026](https://huggingfacetb-trl-distillation-trainer.hf.space/)).
4. **`understand`-lite on device: probably never.** In wave 1, Qwen3-4B needed 2.4 s and 2 GB and reached a missing-slot F1 of only 0.35.

## 6. Consented data flywheel

Inputs are listed in `data-map.yaml` under a new purpose, `train_models`:

1. **Synthetic first.** Each locale pack gets a template-and-corrupt generator in `training/gen/`. With no user data in, the weights hold none. Generators grow from **failure categories, never failure text**. Content-free events (undo, "Show original", re-dictation) are counted per category, and the spike's failure list becomes the first set of fixes: clean discourse markers kept, no unrequested vocabulary, number formats, Hinglish.
2. **Donations with a training purpose.** Next to BLUEPRINT's "Share this item", add a separately ticked, unpreselected line: "also use it to train PromptAI's on-device models". Withdrawal removes the row.
3. **Retrain-to-forget.** Train only models that can be retrained from scratch in under an hour on one machine. Deletion is then "drop rows, retrain", and no unlearning research is needed. Each bundle records its dataset manifest hash.
4. **Curation is scripts.** Exact and MinHash de-duplication, a check that on-device redaction ran, a 5-gram leak check against every eval set as a failing test, per-kind and per-locale counts, and a dataset card (sources, consent version, generator commit). Data is JSONL in a private bucket.
5. **At scale (assess):** Apple learns aggregate trends by having opted-in devices pick the nearest synthetic candidate and aggregating the votes under DP ([Apple](https://machinelearning.apple.com/research/differential-privacy-aggregate-trends)). That would show which synthetic distributions match real dictation without collecting any. It needs thousands of devices.

## 7. Evaluation before deployment

- **Offline gates**, run by `score.py` on the 80 items plus donated golden items. After the guard, meaning errors must be no worse than rules, and no-change items kept must be no lower than rules. There must be no runaway outputs and no category below rules. Peak memory and p95 latency must fit the oldest supported device (measured on an idle machine). Report Wilson intervals, since 80 items cannot resolve gaps under ~10 points. **Today's student fails the first two gates.**
- **Shadow, then canary.** The student runs beside rules without inserting text. Content-free counters record agreement and guard triggers. A 5% canary then watches undo, re-dictation and "Show original". Rollback is a pointer flip in the signed bundle.
- **Base-model churn.** A new base is a new candidate, and nothing is grandfathered. `promptfoo` remains the CI harness and calls `score.py` through a Python provider.

## 8. Cost on rented GPUs

RunPod list prices, fetched today from [runpod.io/pricing](https://www.runpod.io/pricing), in $/hour, Community / Secure: RTX 4090 0.34 / 0.89; RTX 5090 0.69 / 1.19; L40S 0.79 / 1.09; A100 80GB SXM 1.39 / 1.79; H100 SXM 2.69 / 3.99. Secure prices rose twice in July-October 2026 ([usagepricing](https://www.usagepricing.com/blueprint/activity/runpod-2026-10-15-secure-cloud-second-hike)). My arithmetic on *assumed* hours: a 10-GPU-hour Stage 3 KTO run on a 4B model costs $3.40 on a 4090 or $26.90 on an H100. An open teacher relabelling 20k items over 5 H100-hours costs ≈ $13. Stage 1 measured $0. **Money is not the constraint; time spent on data and evals is.**

## 9. Privacy techniques

- **DP-SGD: avoid for now.** VaultGemma 1B (sequence-level ε ≤ 2) trails non-private Gemma 3 1B on every reported benchmark, for example ARC-C 26.45 vs 38.31 and TriviaQA 11.24 vs 39.75 ([arXiv 2510.15001](https://arxiv.org/abs/2510.15001)). Synthetic-only data has nothing to protect. If donations ever dominate, prefer **DP synthetic data**: DP-LoRA a generator, then train the student on its output. In that setting LoRA beat full fine-tuning under DP by up to 11 points ([arXiv 2306.01684](https://arxiv.org/abs/2306.01684)).
- **Federated learning: avoid.** It needs on-device training, a fleet and DP anyway.
- **What earns its keep:** synthetic-first data, on-device redaction before donation, k ≥ 20 thresholds, and retrain-to-forget.

## 10. Minimum infrastructure

```
training/                  # uv project, Python 3.12; never imported by the apps
  gen/<task>/<locale>.py   # template-and-corrupt generators + leak_check
  curate.py                # dedupe, redaction check, manifest, dataset card
  train.sh                 # mlx_lm lora (Stage 3: TRL/Unsloth script on a pod)
  eval/score.py gates.yaml # called from CI and promptfoo
  export.sh                # mlx_lm fuse → 4-bit MLX (Apple) + GGUF (Android)
```

There is no Kubernetes, feature store, tracker or model server. Cards, manifests and eval reports ride in the existing signed bundle. Stage 3 adds one RunPod template with a network volume, started by hand. **vLLM multi-LoRA** is only for an owned server-side model, with adapters loaded statically. The runtime `/v1/load_lora_adapter` "should not be used in production unless it is an isolated, fully trusted environment" ([vLLM](https://docs.vllm.ai/en/latest/features/lora/)). **LoRAX was archived on 2026-10-12.**

## 11. Staged plan

| Stage | Trigger | Trains | Data | Gate |
|---|---|---|---|---|
| 0 | now → MVP | nothing; add the `train_models` purpose and donation copy | golden sets, content-free events | n/a |
| 1 | desktop ships a local LLM runtime (BLUEPRINT 2d) and S8 is done | English cleanup student on the laptop | synthetic only, generator fixed per failure category | §7 vs rules |
| 2 | ≥ ~500 donated items in a slice (my threshold) | locale slices | synthetic + donations | per-slice gates; deletion → retrain |
| 3 | a measured cost or latency bottleneck and ≥10k clean pairs | router/ranker KTO/DPO | donations + open teacher | G4 off-policy + canary |

## 12. OSS verdicts

| Project | License | ★ / push | Verdict |
|---|---|---|---|
| ml-explore/mlx-lm | MIT | 7.6k / 11-06 | **adopt** |
| ml-explore/mlx-swift-lm | MIT | 861 / today | **trial** |
| huggingface/trl | Apache-2.0 | 19.7k / today, v1.17.1 | adopt at Stage 3 |
| unslothai/unsloth | Apache-2.0 | 79.3k / today | trial at Stage 3 |
| axolotl, LlamaFactory | Apache-2.0 | 12.7k / 76.0k | assess |
| OpenRLHF, verl, NeMo-RL | Apache-2.0 | 10.1k / 24.2k / 2.1k | avoid (multi-node RL) |
| meta-pytorch/torchtune | BSD-3 | 5.8k | avoid: "no longer actively maintained" |
| vllm-project/vllm | Apache-2.0 | 96.7k / today | assess |
| predibase/lorax | Apache-2.0 | archived | avoid |
| opacus, flower | Apache-2.0 | 2.0k / 7.2k | avoid for now |
| argilla-io/distilabel | Apache-2.0 | 3.5k / 11-09 | assess (only with an LLM teacher) |

## 13. Risks

- **Synthetic-to-real gap (measured).** Template artefacts caused most of the student's meaning errors, and the synthetic validation loss hid all of them.
- **Small, agent-written evals.** 80 items written from the same style rules as the generator, so they are optimistic. Real donated clips are needed before any ship decision.
- **Architecture churn.** The hybrid Qwen3.5 base was impractical to train in MLX today, and Android runtime support for hybrids beyond llama.cpp is unverified. Pick dense students and re-check each release.
- **Template traps.** The Qwen3 MLX template ignored `enable_thinking`, so test format as well as content.
- **Teacher terms and consent.** A shortcut through API labels or implicit content would create legal debt that retraining cannot undo.
- **Platform adapters vanish.** Apple's toolkit stops at OS 26, so ship weights PromptAI controls.
- **Second-product creep.** Keep `training/` to a few scripts. If it needs a platform, the stage was premature.

## Sources

- https://thinkingmachines.ai/blog/lora/
- https://thinkingmachines.ai/tinker/
- https://developer.apple.com/apple-intelligence/foundation-models-adapter/
- https://machinelearning.apple.com/research/differential-privacy-aggregate-trends
- https://unsloth.ai/docs/get-started/install/mac
- https://github.com/unslothai/unsloth
- https://github.com/meta-pytorch/torchtune
- https://github.com/predibase/lorax
- https://github.com/ml-explore/mlx-swift-lm
- https://newreleases.io/project/github/ggml-org/llama.cpp/release/b7973
- https://docs.vllm.ai/en/latest/features/lora/
- https://github.com/huggingface/trl/releases
- https://huggingfacetb-trl-distillation-trainer.hf.space/
- https://www.runpod.io/pricing
- https://www.usagepricing.com/blueprint/activity/runpod-2026-10-15-secure-cloud-second-hike
- https://arxiv.org/abs/2510.15001
- https://arxiv.org/abs/2306.01684
- https://research.google/blog/protecting-users-with-differentially-private-synthetic-training-data/
- https://www.anthropic.com/legal/commercial-terms
- https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models
- https://huggingface.co/Qwen/Qwen3.5-0.8B
- Wave-1 inputs: `BLUEPRINT.md` §6-8, `research/learning-rl.md`, `research/evals-observability.md`, `spikes/dictation-cleanup/results/tables.md`, `spikes/on-device-intent`
- Spike files: `spikes/w2-training-pipeline/{gen_synth.py,train.sh,run_eval.sh,eval_student.py,logs/,results/,adapters/q3-17b-syn3k}`
