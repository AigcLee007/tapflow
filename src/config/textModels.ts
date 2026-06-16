export type TextModelProvider = 'gemini' | 'openai' | 'anthropic';

export interface TextModelOption {
  id: string;
  label: string;
  provider: TextModelProvider;
  routeKey: string;
}

export const TEXT_MODEL_OPTIONS: TextModelOption[] = [
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    provider: 'gemini',
    routeKey: 'text.default',
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite Preview',
    provider: 'gemini',
    routeKey: 'text.default',
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    routeKey: 'text.gpt-5-5',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'openai',
    routeKey: 'text.default',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'anthropic',
    routeKey: 'text.default',
  },
];

export const DEFAULT_TEXT_MODEL_ID = 'gpt-5.5';
export const DEFAULT_TEXT_ROUTE_KEY = 'text.gpt-5-5';

export const getTextModelOption = (modelId?: string | null) =>
  TEXT_MODEL_OPTIONS.find((model) => model.id === modelId)
  || TEXT_MODEL_OPTIONS.find((model) => model.id === DEFAULT_TEXT_MODEL_ID)
  || TEXT_MODEL_OPTIONS[0];

export const getTextModelRouteKey = (modelId?: string | null) =>
  getTextModelOption(modelId).routeKey || DEFAULT_TEXT_ROUTE_KEY;
