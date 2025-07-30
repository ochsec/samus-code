/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from './contentGenerator.js';

export async function fetchContextLength(
  provider: AuthType,
  model: string,
  baseUrl?: string
): Promise<number> {
  switch (provider) {
    case AuthType.USE_OLLAMA: {
      const url = `${baseUrl || 'http://localhost:11434'}/api/show`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model })
        });
        const data = await res.json();
        return data.model_info?.['general.context_length'] || 
               data.context_length || 
               32_768;
      } catch (error) {
        console.warn(`Failed to fetch context length for Ollama model ${model}:`, error);
        return 32_768;
      }
    }
    
    case AuthType.USE_LM_STUDIO: {
      const url = `${baseUrl || 'http://localhost:1234'}/v1/models`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const modelInfo = data.data?.find((m: { id: string; context_length?: number; max_tokens?: number }) => m.id === model);
        return modelInfo?.context_length || 
               modelInfo?.max_tokens || 
               32_768;
      } catch (error) {
        console.warn(`Failed to fetch context length for LM Studio model ${model}:`, error);
        return 32_768;
      }
    }
    
    case AuthType.USE_OPENAI: {
      // For OpenRouter or OpenAI-compatible endpoints
      if (baseUrl?.includes('openrouter')) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/models');
          const data = await res.json();
          const modelInfo = data.data?.find((m: { id: string; context_length?: number; max_tokens?: number }) => m.id === model);
          return modelInfo?.context_length || 32_768;
        } catch (error) {
          console.warn(`Failed to fetch context length for OpenRouter model ${model}:`, error);
          return 32_768;
        }
      }
      // Default for OpenAI models
      return getOpenAIContextLength(model);
    }
    
    default:
      return 32_768;
  }
}

function getOpenAIContextLength(model: string): number {
  // Known OpenAI model context lengths
  const contextLengths: Record<string, number> = {
    'gpt-4-turbo': 128_000,
    'gpt-4-turbo-preview': 128_000,
    'gpt-4-1106-preview': 128_000,
    'gpt-4': 8_192,
    'gpt-4-32k': 32_768,
    'gpt-3.5-turbo': 16_385,
    'gpt-3.5-turbo-16k': 16_385,
  };
  
  // Check for exact match or partial match
  for (const [key, value] of Object.entries(contextLengths)) {
    if (model.includes(key)) {
      return value;
    }
  }
  
  return 32_768; // Default fallback
}