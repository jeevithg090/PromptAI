export interface DbSchema {
  public: {
    Tables: {
      app_users: {
        Row: { id: string; name: string; email: string; plan: string; monthly_token_budget: number; created_at: string };
        Insert: { id?: string; name: string; email: string; plan?: string; monthly_token_budget?: number };
        Update: { name?: string; email?: string; plan?: string; monthly_token_budget?: number };
        Relationships: [];
      };
      sessions: {
        Row: { id: string; user_id: string; project_id: string | null; platform_id: string; final_state: string | null; strength_score: number | null; rubric_scores: unknown; refinement_count: number; created_at: string };
        Insert: {};
        Update: {};
        Relationships: [];
      };
      feature_flags: {
        Row: { key: string; value: unknown; updated_at: string };
        Insert: { key: string; value: unknown; updated_at?: string };
        Update: { value?: unknown; updated_at?: string };
        Relationships: [];
      };
      platforms: {
        Row: { platform_id: string; display_name: string; modalities: string[]; url_patterns: string[]; dom_fingerprint_selectors: string[]; input_selector_candidates: string[]; docs_url: string; quirks: string[]; syntax_rules: string[]; max_prompt_tokens: number; tos_reviewed: boolean; schema_version: string; last_verified: string; deprecated: boolean };
        Insert: { platform_id: string; display_name: string; modalities: string[]; url_patterns: string[]; dom_fingerprint_selectors?: string[]; input_selector_candidates?: string[]; docs_url: string; quirks?: string[]; syntax_rules?: string[]; max_prompt_tokens: number; tos_reviewed?: boolean; schema_version?: string; last_verified?: string; deprecated?: boolean };
        Update: {};
        Relationships: [];
      };
      audit_log: {
        Row: { id: number; actor: string; action: string; status: string; detail: unknown; created_at: string; session_id: string | null };
        Insert: { actor: string; action: string; status: string; detail?: unknown; session_id?: string | null };
        Update: {};
        Relationships: [];
      };
      library_entries: {
        Row: { id: string; source: string; title: string; description: string; modality: string; platform_tags: string[]; template: unknown; preview_url: string | null; popularity: number; remix_count: number; moderation_status: string; version: number; created_at: string; user_id: string | null; attributed_user_id: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null };
        Insert: {};
        Update: { moderation_status?: string; reviewed_by?: string | null; reviewed_at?: string | null; review_note?: string | null };
        Relationships: [];
      };
      admin_roles: {
        Row: { user_id: string };
        Insert: { user_id: string };
        Update: {};
        Relationships: [];
      };
      usage_events: {
        Row: { id: number; user_id: string | null; session_id: string | null; pipeline_step: string | null; provider_connection: string | null; tokens_used: number; cost_usd: number; created_at: string };
        Insert: {};
        Update: {};
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
  };
}
