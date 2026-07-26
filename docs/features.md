# PromptForge — Platform Features

> Comprehensive list of all features across the PromptForge platform.

---

## 1. Core Prompt Drafting Pipeline

| Feature | Description |
|---|---|
| **Reverse-Prompting** | Type a rough idea and the system interviews you, then drafts an excellent, platform-tailored prompt |
| **Platform-Aware Drafting** | Detects the target AI platform and grounds prompt generation in that platform's real, current documentation (PKB) |
| **Adaptive Clarification Engine** | Asks MCQ/free-text questions (3-5 max) to disambiguate intent, with "Just Generate Now" escape hatch |
| **Multi-Agent Pipeline** | Intent Classification → Doc Retrieval → Clarification → Drafting → Critic → Alternatives agents orchestrated by Supervisor |
| **Generate-Critique-Refine Loop** | Bounded 2-pass refinement: any dimension scoring 1/3 triggers a targeted refinement pass |
| **Prompt Strength Score** | 0-100 score across 8 dimensions (Specificity, Unambiguity, Non-Conflict, Platform-Fit, Constraint Completeness, Format Determinacy, Context Efficiency, Technique) |
| **Scoring Bands** | 0-39 "Needs Work" · 40-69 "Solid" · 70-89 "Strong" · 90-100 "Excellent" |
| **Degraded Mode** | If generation fails, returns the best available partial result rather than failing |

## 2. Prompt Node Architecture

| Feature | Description |
|---|---|
| **Structured Nodes** | Every prompt is broken into typed, editable nodes (subject, action, setting, style, composition, lighting, persona, constraints, technical, negative_prompt, output_format) |
| **Node Editing** | Edit any node directly with live scoring feedback |
| **Node Locking** | Lock nodes to prevent them from being changed during refinement |
| **Node Alternatives** | 2-4 ranked alternatives per node with rationale |
| **Node Redrafting** | Regenerate a single node independently via LLM |
| **Node Fan-Out** | Re-serialize the same node set for multiple target platforms simultaneously |

## 3. Prompt Enhancement (Enhance Mode)

| Feature | Description |
|---|---|
| **Paste Enhancement** | Paste an existing finished prompt → parsed into nodes → scored → improved |
| **Before/After Comparison** | Shows per-dimension deltas between original and enhanced versions |
| **Already-Strong Detection** | If the refine doesn't beat the original, presents the original with an honest "already strong" message |
| **Platform Hint Detection** | Auto-detects which platform a pasted prompt was likely written for |

## 4. Prompt Versioning & History

| Feature | Description |
|---|---|
| **Version Chain** | Every edit creates an immutable prior-version record |
| **Version Restore** | Restore any prior version (creates a new version, never rewrites history) |
| **Version Diff** | Compare two versions side-by-side by node type |
| **Prompt History** | List all saved prompts with metadata (platform, score, date, state) |
| **Prompt Listing** | Full CRUD for saved prompts with metadata only (content encrypted) |

## 5. Prompt Library

| Feature | Description |
|---|---|
| **Curated Templates** | 20+ seeded, battle-tested prompt templates across 8 niches (Marketing, Coding, Art, Writing, Education, Product/UX, Data, Video) |
| **Library Filtering** | Filter by niche/category and search by keyword |
| **Library Remixing** | Open any template in the builder and customize it |
| **Autonomous Curation** | Background agent mines opted-in sessions for high-value patterns and auto-publishes (planned) |
| **Trending Discovery** | Surveys public prompt-sharing sites for trending patterns (planned) |

## 6. Model & Platform Recommendation

| Feature | Description |
|---|---|
| **Model Recommendation** | Ranks candidate models/platforms for a given task against constraints (modality, latency, cost, quality) |
| **Trade-off Display** | Shows quality vs. cost vs. speed trade-offs, never a single bare winner |
| **Task-Aware Recommendation** | Natural-language task description → best model with detailed reasoning |
| **OpenRouter Integration** | Queries 345+ models via OpenRouter with live pricing and capabilities |
| **Mode Recommendation** | Recommends which mode (e.g. Gemini's chat vs vision) fits a given task |
| **Capability Matrix** | Full model capability data with last_verified freshness indicator |
| **Model Refresh** | Admin-triggered refresh of model capability matrix from provider docs |

## 7. Token & Cost Intelligence

| Feature | Description |
|---|---|
| **Token Governor** | Token counting, platform-ceiling check, near-limit warnings |
| **Token-Reduction Advisor** | Suggests concrete trims: PDF→Markdown, prose tables→CSV, base64→references |
| **Cost Simulation** | Estimate cost across different models before committing |
| **Per-Node Token Display** | Shows approximate token count per node |
| **Platform Context Limit** | Shows the target platform's practical prompt ceiling |

## 8. Live Preview System

| Feature | Description |
|---|---|
| **Textual Preview** | 1-2 sentence "what you'll likely get" generated from current node state |
| **Visual Preview** | Optional AI-generated image preview (for image-modality platforms, gated by env flag) |
| **Per-Session Caps** | Text preview: 30/session · Visual preview: 3/session, 10/day/user |
| **Live Updates** | Preview updates between clarification questions |

## 9. Conversational Drafting (Chat Mode)

| Feature | Description |
|---|---|
| **Chat-First Interface** | Describe what you want conversationally, agent asks follow-up questions |
| **Guided Form Mode** | Traditional form-based drafting as alternative to chat |
| **File Attachments** | Attach text, code, CSV, JSON, or PDF files for context |
| **Chat Refinement** | Refine the draft via natural language ("make it more dramatic") |

## 10. Voice Dictation

| Feature | Description |
|---|---|
| **Speech-to-Text** | Voice input for ideas, powered by Groq Whisper |
| **Audio MIME Support** | webm, ogg, mp4, m4a, wav |
| **5MB Audio Cap** | Max audio upload size |
| **Per-User Daily Cap** | Plan-aware limits (pro gets 4x the free tier) |
| **No Persistence** | Audio buffer never persisted; transcript never logged |

## 11. Memory & Personalization

| Feature | Description |
|---|---|
| **Cross-Session Memory** | Agent-proposed and user-added preference statements remembered across sessions |
| **Scope Control** | Global and project-scoped memory |
| **Pending Confirmation** | Agent-proposed entries stored pending until user confirms |
| **Memory Management** | View, add, edit, delete, and reset memory per scope |
| **End-to-End Encrypted** | Memory encrypted at rest with client-derived keys |

## 12. Projects

| Feature | Description |
|---|---|
| **Persistent Context** | Group related work into Projects with their own pinned context |
| **Project CRUD** | Create, read, update, delete projects |
| **Default Platform** | Set per-project default target platform |
| **Multi-User Ready** | Schema designed for future owner/editor/viewer roles |

## 13. BYOK (Bring Your Own Key)

| Feature | Description |
|---|---|
| **Own API Key** | Connect your own OpenAI or Gemini API key |
| **Provider Connections** | Manage provider connections (add/revoke) |
| **Revocable** | Keys stored as encrypted references, never retrievable |
| **Usage Metering** | Per-connection usage counters |

## 14. Prompt Debugging & Analysis Tools

| Feature | Description |
|---|---|
| **Prompt Debugger** | Paste prompt + actual output + expected output → diagnose the fault and patch it |
| **Reverse Prompt** | Paste an example output → infer the prompt that could produce it |
| **Ambiguity Analysis** | Find risky/high-ambiguity spans in a prompt with fix suggestions |
| **Style Linter** | Enforce style guide rules (banned/required terms, length, tone, required nodes) |
| **Prompt Porting/Migration** | Port a prompt from one platform to another with a change report |
| **Cost Simulator** | Estimate cost across different models |
| **Workflow Composer** | Chain prompts together where each step's output feeds the next as a variable |
| **Regression Tests** | Add test cases with assertions to catch prompt rot |

## 15. Sharing & Collaboration

| Feature | Description |
|---|---|
| **Share Links** | Create public share links for prompts (rate-limited, revocable) |
| **Safety Gate on Share** | Re-runs safety classifier before publishing share link |
| **No Owner Identity** | Public share page returns no owner information |
| **Template Variables** | Share prompts with fill-in-the-blank variables (planned) |
| **Teams** | Create teams, manage members, shared prompt access (planned) |

## 16. Comparison Engine (A/B Testing)

| Feature | Description |
|---|---|
| **Side-by-Side Comparison** | Run original vs. enhanced prompts on the user's own model API |
| **Voting** | User votes which version was better (ties allowed) |
| **Latency Display** | Shows response time for each version |
| **Pro Feature** | Requires BYOK connection (Pro plan) |

## 17. Feedback & Analytics

| Feature | Description |
|---|---|
| **Prompt Feedback** | Rate prompts as "worked well / not really / mixed results" |
| **Anonymized Outcomes** | Aggregate-only outcome signals with no user/session identity |
| **Analytics Dashboard** | Per-dimension worked-vs-failed averages |
| **Continuous Improvement** | Aggregate tuning recommendations from outcome data |
| **Usage Tracking** | Token consumption, pipeline steps, cost per user/plan |

## 18. Safety & Guardrails

| Feature | Description |
|---|---|
| **Three-Layer Safety** | Pre-flight classifier → post-generation validation → library publishing gate |
| **Content Safety Classifier** | Blocks jailbreaks, illegal instructions, CSAM, targeted harassment, disinformation |
| **Fail Closed** | When classifier is unavailable, requests are blocked (not allowed) |
| **Appeals** | Users can appeal blocked prompts |
| **Acceptable-Use Policy** | Explicit policy defining what is blocked vs. allowed |
| **Immutable Audit Log** | Append-only audit trail for all safety decisions |
| **Heuristic Scorer** | Parallel heuristic scoring as a cheaper safety check |

## 19. Account & Billing

| Feature | Description |
|---|---|
| **Authentication** | Email/password signup, signin, password reset (Supabase Auth) |
| **Plan Gating** | Platform entitlement checks per plan tier (403 plan_restricted) |
| **Budget Enforcement** | Monthly token budget with per-session pre-flight check (429 budget_exceeded) |
| **Usage Dashboard** | View usage metrics and plan progress |
| **Data Export** | Download all user data |
| **Account Deletion** | Full account and data deletion |
| **Data Portability** | Export prompts, memory, and projects |

## 20. Custom Platform Support

| Feature | Description |
|---|---|
| **Docs URL Ingestion** | Paste any documentation URL → system reads and profiles the platform |
| **Custom Platform Profile** | Auto-generated platform registry entry from analyzed docs |
| **No Plan Gate** | Custom platforms are not restricted by plan entitlements |
| **Temporary Storage** | Custom platform profiles stored in IndexedDB (web) or localStorage |

## 21. Platform Guides & Knowledge Base

| Feature | Description |
|---|---|
| **Platform Registry** | Curated registry of supported platforms with rules, quirks, and modes |
| **Platform Guides** | Per-platform guides with docs-grounding, quirks, and starter prompts |
| **Platform Knowledge Base (PKB)** | Curated, versioned knowledge chunks per platform with RAG retrieval |
| **Model KB (MPKB)** | Per-model-family behavior knowledge (negation handling, few-shot guidance, formatting sensitivity) |
| **Strategy Profiles** | Versioned config per task type (drafting template, technique/format requirements) |
| **Platform Usage Coaching** | Contextual tips for using target platforms more effectively |
| **New Site Walkthrough** | Guided walkthrough for unfamiliar AI platforms |
| **Doc Ingestion** | Scheduled crawler to keep PKB fresh (planned) |
| **Doc Fetch Service** | Live doc fetching with fallback to cached KB |

## 22. Web Application Features

| Feature | Description |
|---|---|
| **Try Now (Demo)** | No-account-needed demo with curated examples |
| **Build Page** | Full drafting interface with platform selection, idea input, clarification |
| **Enhance Page** | Paste-and-improve interface for existing prompts |
| **Library Page** | Browse, filter, search, and use prompt templates |
| **Platform Guides** | Per-platform reference pages |
| **Saved Prompts** | View, version, diff, restore saved prompts |
| **History** | Browse all past drafting sessions |
| **Account Dashboard** | Profile, plan, usage, memory, provider connections, export |
| **Tools Section** | Debugger, reverse prompt, ambiguity analysis, cost simulator, porting, style linter |
| **Workflow Composer** | Multi-step chained prompt workflows |
| **Regression Tests** | Prompt test cases with assertions |
| **Share View** | Public read-only view of shared prompts |
| **Download Page** | Desktop app download for macOS and Windows |
| **Auth Pages** | Signup, signin, login, password reset |
| **Static Export** | Full static export via Next.js for Cloudflare Pages |

## 23. Browser Extension — Chrome

| Feature | Description |
|---|---|
| **In-Context Overlay** | Floating overlay on target AI platforms |
| **Auto-Detection** | Automatically detects which AI platform the user is on |
| **Platform Selector** | Manual platform selection with all supported platforms |
| **Draft in Place** | Draft prompts without leaving the current page |
| **Enhance Mode** | Select text → right-click "Enhance with PromptForge" → improve in-place |
| **Inline Insert** | Insert the finished prompt directly into the page's input field |
| **Voice Dictation** | Record audio → transcribe → fill idea field |
| **Clarification UI** | MCQ/free-text clarification step within the overlay |
| **Result Display** | View scored result, copy or insert |
| **API Proxy** | Background worker proxies API requests (keeps credentials secure) |
| **Context Menus** | Right-click "Enhance with PromptForge" on selected text |
| **MV3 Architecture** | Manifest V3 compliant |

## 24. Browser Extension — Firefox

| Feature | Description |
|---|---|
| **Firefox MV3 Port** | Full feature port to Firefox Manifest V3 |
| **Content & Background** | Same content/background architecture as Chrome |
| **Platform Detection** | Platform auto-detection for Firefox users |

## 25. Desktop Application (Electron)

| Feature | Description |
|---|---|
| **Cross-Platform** | macOS and Windows support |
| **Menu-Bar Icon** | Quick access from system tray/menu bar |
| **Floating Widget** | On-screen floating widget for quick drafting |
| **Full Drafting Pipeline** | Same drafting, enhance, and dictation features |
| **V1.3 Voice Features** | Voice dictation in the desktop environment |

## 26. macOS Native App

| Feature | Description |
|---|---|
| **Menu-Bar App** | Native Swift/SwiftUI menu-bar application |
| **Draft View** | Simple drafting interface |
| **Settings View** | Configuration and preferences |
| **Hotkey Manager** | Global keyboard shortcuts |
| **Accessibility Detector** | Detects which app/window is active for context |
| **API Integration** | Communicates with PromptForge backend |

## 27. macOS SDK

| Feature | Description |
|---|---|
| **Embeddable Swift Client** | Swift Package for embedding PromptForge functionality into third-party apps |
| **API Client** | Pre-built Swift API client for the PromptForge backend |
| **SDK Build** | Build with Swift Package Manager |

## 28. Admin Control Plane

| Feature | Description |
|---|---|
| **Admin Dashboard** | Separate deployable admin application (port 3002) |
| **Library Moderation** | Review and moderate pending library submissions |
| **Platform Registry Management** | CRUD for platform registry entries |
| **Trace Viewer** | Inspect pipeline traces for debugging |
| **Feature Flags** | Toggle features on/off |
| **Health Monitoring** | Service health checks |
| **Kill Switch** | Emergency feature disable |
| **Admin Authentication** | Role-based access (support, security, infra, superadmin) |
| **No Content Decryption** | Admin plane has no access to encrypted user content by design |

## 29. Security & Privacy Features

| Feature | Description |
|---|---|
| **End-to-End Encryption** | Client-derived keys, server stores only ciphertext (planned T7.1) |
| **Encryption at Rest** | All user content in `*_ciphertext` columns |
| **No Prompt Logging** | Logs never contain prompt content |
| **Ephemeral Processing** | Decrypted content exists only in-memory during processing |
| **CORS Protection** | Allowlisted origins only |
| **Body Size Limits** | 100KB max request body |
| **Rate Limiting** | Per-user/endpoint rate limiting |
| **HSTS & Security Headers** | Security response headers on all responses |
| **Audit Log** | Immutable, append-only audit trail |
| **Data Retention** | Sessions 90d, usage 24mo, outcomes indefinite |
| **Secure Deletion** | Deleting blob + wrapped keys = data deletion |

## 30. Compliance & Trust

| Feature | Description |
|---|---|
| **ISO 27001 Readiness** | Architecture designed for future certification |
| **SOC 2 Readiness** | Audit-friendly design principles |
| **Data Classification** | All fields marked plaintext/encrypted/never-persisted |
| **Acceptable-Use Policy** | Defined policy document |
| **Retention Policy** | Defined data retention schedules |
| **Incident Response** | Documented incident response plan |
| **Subprocessor Register** | Third-party subprocessor documentation |
| **Terms of Service** | Platform ToS document |
| **GDPR Considerations** | Data portability, deletion, privacy-by-design |

## 31. Internationalization (i18n)

| Feature | Description |
|---|---|
| **Locale System** | All UI strings centralized with locale overlay merging |
| **Spanish Locale** | Machine-translated Spanish locale (needs review) |
| **Extensible** | New locales override English subset; fallback to English |
| **Persisted Choice** | Locale saved to localStorage; switching reloads |

## 32. Onboarding & UX

| Feature | Description |
|---|---|
| **Guided Tour** | 4-step onboarding tour (Pick platform → Describe idea → Edit nodes → Read score) |
| **Command Palette** | Quick command palette (⌘K) for navigation |
| **Real Pipeline Progress** | Honest step-by-step progress display during drafting |
| **Teaching Mode** | Explains why prompt structures work to improve user skill over time |
| **Document Grounding Citations** | Shows which doc passages informed each suggestion |
| **Defaulted Node Indicators** | Visually marks nodes that were assumed from defaults |
| **Improvement Suggestions** | Shows concrete "how to improve" guidance per dimension |
