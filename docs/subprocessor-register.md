# Sub-processor Register

| Sub-processor | Service | Data | Location | DPA Status |
|---|---|---|---|---|
| Supabase | Database & Auth | All user data (encrypted blobs, metadata) | AWS US East (N. Virginia) | In place |
| Cloudflare | CDN, R2 storage, KV cache | Registry config, encrypted blobs | Global edge network | In place |
| AWS (Lambda, API Gateway, SSM) | Compute, API, secrets | BYOK keys (SSM), ephemeral compute | US East (N. Virginia) | In place |
| Groq | LLM inference | Prompt text (inference only, §19.4 zero-retention) | US (Groq datacenters) | Requested — user opts-in by using free tier |
| Cerebras | LLM inference (alternative) | Prompt text (inference only) | US (Cerebras DC) | Requested |
