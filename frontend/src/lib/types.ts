export type Provider = {
  id: number;
  name: string;
  official_pricing_url: string | null;
  last_sync: string;
  is_active: boolean;
};

export type AiModel = {
  id: number;
  provider_id: number;
  provider: Provider;
  name: string;
  display_name: string;
  recommended_task: string;
  is_vision: boolean;
  input_price_per_million: number;
  output_price_per_million: number;
  image_token_cost: number;
  is_active: boolean;
  cached_input_price_per_million?: number;
};

export type Scenario = {
  id: number;
  name: string;
  description: string | null;
  monthly_volume: number;
  incidence_rate: number;
  chat_turns: number;
  telecom_cost_per_session: number;
  infrastructure_monthly_cost: number;
  ocr_model_id: number | null;
  chat_model_id: number | null;
  rag_system_prompt_tokens?: number;
  rag_chunk_size?: number;
  rag_top_k?: number;
  created_at: string;
};

export type EstimateRequest = {
  monthly_volume: number;
  incidence_rate: number;
  chat_turns: number;
  telecom_cost_per_session: number;
  infrastructure_monthly_cost: number;
  ocr_model_id: number;
  chat_model_id: number;
  safety_margin?: number;
  tokens?: {
    ocr_image_width?: number;
    ocr_image_height?: number;
  };
};

export type EstimateResponse = {
  request: EstimateRequest;
  ocr_model: AiModel;
  chat_model: AiModel;
  tokens: {
    ocr_input_tokens: number;
    ocr_output_tokens: number;
    chat_input_tokens: number;
    chat_output_tokens: number;
  };
  costs: {
    ocr_cost: number;
    chat_cost: number;
    ai_cost: number;
    telecom_cost: number;
    infrastructure_cost: number;
    total_monthly_cost: number;
    cost_per_receipt: number;
    monthly_chat_sessions: number;
    weekly_cost: number;
  };
};

export type PriceSyncLog = {
  id: number;
  provider_id: number | null;
  source: string;
  status: string;
  message: string | null;
  created_at: string;
};

export type ReceiptAnalysisResponse = {
  image: {
    width: number;
    height: number;
    format: string;
  };
  model_id: number;
  model_name: string;
  fields: string[];
  sections: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
  tokens: {
    image_tokens: number;
    prompt_tokens: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  costs: {
    cost_per_receipt: number;
    daily_cost: number;
    weekly_cost: number;
    monthly_cost: number;
    daily_volume: number;
    monthly_volume: number;
  };
  quality_analysis?: {
    contrast: number;
    sharpness: number;
    rotation_angle: number;
    shadow_variance: number;
    requires_enhancement: boolean;
    reasons: string[];
    suggested_mode: string;
  };
};

export type ReceiptEnhancementResponse = {
  image_base64: string;
  mime_type: string;
  original: {
    contrast: number;
    sharpness: number;
  };
  enhanced: {
    contrast: number;
    sharpness: number;
  };
  operations: string[];
};

export type ReceiptExtractionResponse = {
  provider: string;
  model_name: string;
  fields: string[];
  enhanced: boolean;
  extracted: Record<string, unknown> | null;
  raw_text: string;
  usage: {
    prompt_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  cost: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number | null;
    cost_per_receipt: number;
  };
};

export type CostComparisonReport = {
  generated_at: string;
  receipt: {
    filename: string;
    width: number;
    height: number;
    format: string;
    quality_analysis: {
      contrast: number;
      sharpness: number;
      rotation_angle: number;
      shadow_variance: number;
      requires_enhancement: boolean;
      reasons: string[];
      suggested_mode: string;
    };
  };
  parameters: {
    daily_volume: number;
    monthly_volume: number;
    fields: string[];
    sections: string[];
  };
  comparisons: Array<{
    model_id: number;
    model_name: string;
    provider: string;
    input_price_per_million: number;
    output_price_per_million: number;
    tokens: {
      image_tokens: number;
      prompt_tokens: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
    costs: {
      cost_per_receipt: number;
      daily_cost: number;
      weekly_cost: number;
      monthly_cost: number;
      daily_volume: number;
      monthly_volume: number;
    };
  }>;
  summary: {
    total_models: number;
    cheapest: string | null;
    most_expensive: string | null;
    cheapest_cost: number;
    most_expensive_cost: number;
  };
};

export type ProcessedReceipt = {
  id: string;
  filename: string;
  processedAt: string;
  modelName: string;
  provider: string;
  image: {
    width: number;
    height: number;
    format: string;
  };
  qualityRequiresEnhancement: boolean;
  wasEnhanced: boolean;
  estimatedCost: number;
  estimatedTokens: {
    input: number;
    output: number;
    total: number;
  };
  realCost?: number;
  realTokens?: {
    input: number;
    output: number;
    total: number;
  };
  extractedData?: Record<string, unknown>;
  error?: string;
  rateLimited?: boolean;
};


export type CustomProvider = {
  name: string;
  base_url: string;
  api_key: string;
};

export type ApiKeys = {
  google_ai: string | null;
  groq: string | null;
  cerebras: string | null;
  openai: string | null;
  deepseek: string | null;
  custom_providers?: CustomProvider[];
};

export type DiscoveryResult = {
  new_models_inserted: number;
};
