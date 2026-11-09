// Hand-maintained types for the LIVE Base44 schema in Supabase project
// zdnlouluogpdfhygdnjn — captured read-only via information_schema on 2026-02-11.
// DO NOT run DDL/migrations against that project (it hosts the live Base44 app);
// if a column you need is missing here, inspect the live table and extend this file.

export type Json = Record<string, unknown> | unknown[] | null;

export type CrmContact = {
  id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  lead_source: string | null;
  lead_score: number | null;
  stage: string | null;
  tags: Json;
  custom_fields: Json;
  social_profiles: Json;
  communication_preferences: Json;
  engagement_history: Json;
  last_contact: string | null;
  next_follow_up: string | null;
  assigned_to: string | null;
  estimated_value: number | null;
  notes: string | null;
  created_date: string;
  updated_date: string;
  deleted_at: string | null;
};

export type EmailVerification = {
  id: string;
  email: string | null;
  verification_status: string | null;
  deliverability: string | null;
  smtp_check: Json;
  domain_info: Json;
  syntax_validation: Json;
  risk_assessment: Json;
  verification_source: string | null;
  verification_date: string | null;
  confidence_score: number | null;
  processing_time_ms: number | null;
  created_date: string;
  updated_date: string;
  organization_id: string | null;
};

export type PhoneVerification = {
  id: string;
  phone_number: string | null;
  formatted_number: string | null;
  verification_status: string | null;
  number_type: string | null;
  carrier_info: Json;
  geographic_info: Json;
  dnc_status: Json;
  reachability: Json;
  risk_assessment: Json;
  verification_source: string | null;
  verification_date: string | null;
  confidence_score: number | null;
  processing_time_ms: number | null;
  created_date: string;
  updated_date: string;
  organization_id: string | null;
};

export type MarketingCampaign = {
  id: string;
  name: string | null;
  objective: string | null;
  target_audience: Json;
  budget: Json;
  content_strategy: Json;
  lead_capture_strategy: Json;
  a_b_tests: Json;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  performance_metrics: Json;
  created_date: string;
  updated_date: string;
  organization_id: string | null;
};

export type AiRunLog = {
  id: string;
  correlation_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  feature_key: string | null;
  model_used: string | null;
  fallback_used: string | null;
  success: boolean | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate: number | null;
  status_code: number | null;
  error_class: string | null;
  error_message: string | null;
  prompt_version: string | null;
  created_date: string;
  updated_date: string;
};

export type LeadEvent = {
  id: string;
  unified_lead_id: string | null;
  event_type: string | null;
  detail: string | null;
  data: Json;
  created_date: string;
  updated_date: string;
  organization_id: string | null;
};

export type UnifiedLead = {
  id: string;
  source: string | null;
  provider: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  site_id: string | null;
  form_id: string | null;
  page_url: string | null;
  external_ids: Json;
  utm: Json;
  consent: Json;
  tags: Json;
  status: string | null;
  ingest_metadata: Json;
  idempotency_key: string | null;
  created_date: string;
  updated_date: string;
  deleted_at: string | null;
  organization_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      unified_lead: {
        Row: UnifiedLead;
        Insert: Partial<UnifiedLead>;
        Update: Partial<UnifiedLead>;
        Relationships: [];
      };
      crm_contact: {
        Row: CrmContact;
        Insert: Partial<CrmContact>;
        Update: Partial<CrmContact>;
        Relationships: [];
      };
      email_verification: {
        Row: EmailVerification;
        Insert: Partial<EmailVerification>;
        Update: Partial<EmailVerification>;
        Relationships: [];
      };
      phone_verification: {
        Row: PhoneVerification;
        Insert: Partial<PhoneVerification>;
        Update: Partial<PhoneVerification>;
        Relationships: [];
      };
      marketing_campaign: {
        Row: MarketingCampaign;
        Insert: Partial<MarketingCampaign>;
        Update: Partial<MarketingCampaign>;
        Relationships: [];
      };
      ai_run_log: {
        Row: AiRunLog;
        Insert: Partial<AiRunLog>;
        Update: Partial<AiRunLog>;
        Relationships: [];
      };
      lead_event: {
        Row: LeadEvent;
        Insert: Partial<LeadEvent>;
        Update: Partial<LeadEvent>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
