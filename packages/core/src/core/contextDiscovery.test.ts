/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchContextLength } from './contextDiscovery.js';
import { AuthType } from './contentGenerator.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('fetchContextLength', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Ollama provider', () => {
    it('should fetch context length from Ollama API', async () => {
      const mockResponse = {
        model_info: {
          'general.context_length': 4096
        }
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse
      });

      const result = await fetchContextLength(
        AuthType.USE_OLLAMA,
        'llama3.2',
        'http://localhost:11434'
      );

      expect(result).toBe(4096);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/show',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'llama3.2' })
        })
      );
    });

    it('should return default value on Ollama API error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchContextLength(
        AuthType.USE_OLLAMA,
        'llama3.2'
      );

      expect(result).toBe(32768);
    });
  });

  describe('LM Studio provider', () => {
    it('should fetch context length from LM Studio API', async () => {
      const mockResponse = {
        data: [
          { id: 'phi-3-mini', context_length: 8192 },
          { id: 'mixtral-8x7b', context_length: 32768 }
        ]
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse
      });

      const result = await fetchContextLength(
        AuthType.USE_LM_STUDIO,
        'phi-3-mini',
        'http://localhost:1234'
      );

      expect(result).toBe(8192);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:1234/v1/models');
    });

    it('should return default value when model not found', async () => {
      const mockResponse = {
        data: [
          { id: 'other-model', context_length: 8192 }
        ]
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse
      });

      const result = await fetchContextLength(
        AuthType.USE_LM_STUDIO,
        'unknown-model'
      );

      expect(result).toBe(32768);
    });
  });

  describe('OpenRouter provider', () => {
    it('should fetch context length from OpenRouter API', async () => {
      const mockResponse = {
        data: [
          { id: 'mistralai/Mistral-7B-Instruct-v0.2', context_length: 16384 },
          { id: 'anthropic/claude-3.5-sonnet', context_length: 200000 }
        ]
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse
      });

      const result = await fetchContextLength(
        AuthType.USE_OPENAI,
        'anthropic/claude-3.5-sonnet',
        'https://openrouter.ai/api/v1'
      );

      expect(result).toBe(200000);
      expect(global.fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
    });
  });

  describe('OpenAI provider', () => {
    it('should return known OpenAI model context lengths', async () => {
      const result = await fetchContextLength(
        AuthType.USE_OPENAI,
        'gpt-4-turbo',
        'https://api.openai.com'
      );

      expect(result).toBe(128000);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return default for unknown OpenAI models', async () => {
      const result = await fetchContextLength(
        AuthType.USE_OPENAI,
        'unknown-gpt-model',
        'https://api.openai.com'
      );

      expect(result).toBe(32768);
    });
  });
});