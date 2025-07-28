/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { Config } from '../config/config.js';

/**
 * Content generator for LM Studio local LLM server.
 * LM Studio provides an OpenAI-compatible API, so we use OpenAIContentGenerator
 * by setting the appropriate environment variables.
 */
export class LMStudioContentGenerator extends OpenAIContentGenerator {
  private baseUrl: string;

  constructor(baseUrl: string, model: string, config: Config) {
    // Set environment variable for OpenAI base URL to LM Studio's v1 endpoint
    process.env.OPENAI_BASE_URL = `${baseUrl}/v1`;
    
    // Call parent constructor with dummy API key (not needed for LM Studio)
    super('not-required', model, config);
    this.baseUrl = baseUrl;
  }
  
  /**
   * List available models from LM Studio server
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      return data.data?.map((model: any) => model.id) || [];
    } catch (error) {
      console.error('Failed to list LM Studio models:', error);
      return [];
    }
  }

  /**
   * Check if LM Studio server is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}