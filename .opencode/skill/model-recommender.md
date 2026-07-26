# Model Recommender Skill

## Overview
Platform-aware model recommendation using live OpenRouter data (345+ models) + Cerebras LLM reasoning. Automatically filters to models available on the current platform when `platform_id` is provided.

## Endpoint
```
POST /api/recommend/with-openrouter
```

## Request
```json
{
  "task": "Create a pikachu svg",
  "platform_id": "claude",
  "prioritizeQuality": 1,
  "prioritizeCost": 0,
  "prioritizeLatency": 0
}
```

## Platform Filtering
| `platform_id` | OpenRouter Filter |
|---|---|
| `claude` | `anthropic/...` |
| `openai` | `openai/...` |
| `gemini` | `google/...` |
| `groq` | `groq/...` |
| `deepseek` | `deepseek/...` |
| `meta` | `meta-llama/...` |
| `mistral` | `mistralai/...` |
| `cohere` | `cohere/...` |
| `nvidia` | `nvidia/...` |
| `qwen` | `qwen/...` |
| `zai` | `zai-org/...` |
| `x-ai` | `x-ai/...` |

If `platform_id` omitted, ranks across all 345 models.

## Response
```json
{
  "status": "ok",
  "task_type": "coding",
  "total_models_considered": 17,
  "candidates_filtered_to": 12,
  "best_model": "anthropic/claude-sonnet-5",
  "runner_up": "~anthropic/claude-sonnet-latest",
  "llm_reasoning": "Claude Sonnet 5 offers top-tier coding performance at the lowest price...",
  "confidence": 95,
  "top_candidates": [
    {"model_id": "anthropic/claude-sonnet-5", "score": 100, "price": "0.000002", "reasoning_efforts": ["max","xhigh","high","medium","low"]},
    ...
  ]
}
```

## How It Works
1. Load all 345 OpenRouter models from cached `config/openrouter-models.json`
2. Apply platform filter (prefix match on model `id` or `name`)
3. Task profile detection (coding, reasoning, chat, creative, multimodal, analysis)
4. Score candidates by: context window, reasoning support, tool/structured output, price sensitivity
5. Pass top 12 to Cerebras (`gpt-oss-120b`) for final LLM selection
6. Return best model + reasoning + alternatives

## Example: Platform-Specific Curl
```bash
# Best model on Claude for SVG generation
curl -s http://localhost:3001/recommend/with-openrouter \
  -H "Content-Type: application/json" \
  -d '{"task":"Create a pikachu svg", "platform_id":"claude"}'

# Best on OpenAI for reasoning
curl -s http://localhost:3001/recommend/with-openrouter \
  -H "Content-Type: application/json" \
  -d '{"task":"Solve this math proof", "platform_id":"openai"}'

# Best on Groq for speed
curl -s http://localhost:3001/recommend/with-openrouter \
  -H "Content-Type: application/json" \
  -d '{"task":"Quick code review", "platform_id":"groq", "prioritizeLatency": 1}'
```