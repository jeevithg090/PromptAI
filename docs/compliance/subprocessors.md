# Subprocessor Register — PromptForge

| Subprocessor | Purpose | Data Shared | DPA/ZDR | Region |
|--------------|---------|-------------|---------|--------|
| **AWS (Lambda + SSM)** | Compute, secrets storage | Encrypted secrets (SSM params); no plaintext keys or content in logs | [AWS DPA](https://d1.awsstatic.com/legal/gdproffice/AWS_Customer_Addendum_GDPR.pdf) | us-east-1 |
| **Supabase** | PostgreSQL database | All user data (encrypted at rest); admin metadata | [Supabase DPA](https://supabase.com/legal/dpa) | AWS us-east-1 |
| **Cloudflare** | CDN, DNS, WAF | HTTP request metadata (IP, User-Agent) | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-processor-addendum/) | Global edge |
| **Groq** | LLM inference (default provider) | Prompt drafts + system prompts (sent as API request) | [Groq Terms](https://groq.com/terms/) | US |
| **Google (Gemini)** | LLM inference, embeddings, image gen | Prompt drafts + system prompts | [Google DPA](https://cloud.google.com/terms/data-processing-addendum) | US |
| **Cerebras** | LLM inference (reasoning models) | Prompt drafts + system prompts | [Cerebras Terms](https://cerebras.ai/terms) | US |
| **OpenAI** | LLM inference (BYOK — user's key) | Prompt drafts + system prompts (routed to user's own API) | User's own agreement | User-controlled |
| **Stripe** | Payment processing | Stripe customer ID, subscription status only — no card data | [Stripe DPA](https://stripe.com/legal/dpa) | US |

## Notes
- BYOK (T7.2): when a user connects their own OpenAI/Google key via BYOK, the prompt data goes to the user's own provider account — we never see or store the plaintext key (SSM only).
- All LLM provider calls include no PII beyond the prompt content; session IDs are random UUIDs.
- Prompt content is user-owned; we do not train on it or share it with any provider beyond what's needed for the API call.
