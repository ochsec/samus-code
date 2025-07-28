/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { Config } from '../config/config.js';

/**
 * Content generator for Ollama local LLM server.
 * Ollama provides an OpenAI-compatible API, so we use OpenAIContentGenerator
 * by setting the appropriate environment variables.
 */
export class OllamaContentGenerator extends OpenAIContentGenerator {
  private baseUrl: string;

  constructor(baseUrl: string, model: string, config: Config) {
    // Set environment variable for OpenAI base URL to Ollama's v1 endpoint
    process.env.OPENAI_BASE_URL = `${baseUrl}/v1`;
    
    // Call parent constructor with dummy API key (not needed for Ollama)
    super('not-required', model, config);
    this.baseUrl = baseUrl;
  }
  
  /**
   * List available models from Ollama server
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  /**
   * Check if Ollama server is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}