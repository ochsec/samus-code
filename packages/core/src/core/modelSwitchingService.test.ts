/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelSwitchingService } from './modelSwitchingService.js';
import { TaskEvaluationService } from './taskEvaluationService.js';
import { ModelStrength, TaskType } from './modelTypes.js';
import { AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';

describe('ModelSwitchingService', () => {
  let service: ModelSwitchingService;
  let mockTaskEvaluator: TaskEvaluationService;
  let mockConfig: Config;

  beforeEach(() => {
    mockTaskEvaluator = {
      evaluateTaskType: vi.fn()
    } as unknown as TaskEvaluationService;
    
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session')
    } as unknown as Config;

    service = new ModelSwitchingService(mockTaskEvaluator, mockConfig);
  });

  describe('model strength assignment', () => {
    it('should assign strong models to exploration tasks', () => {
      const model = service.getModelForTask(TaskType.EXPLORATION, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.1:70b'); // default strong model
    });

    it('should assign strong models to planning tasks', () => {
      const model = service.getModelForTask(TaskType.PLANNING, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.1:70b'); // default strong model
    });

    it('should assign strong models to troubleshooting tasks', () => {
      const model = service.getModelForTask(TaskType.TROUBLESHOOTING, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.1:70b'); // default strong model
    });

    it('should assign strong models to review tasks', () => {
      const model = service.getModelForTask(TaskType.REVIEW, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.1:70b'); // default strong model
    });

    it('should assign weak models to documentation tasks', () => {
      const model = service.getModelForTask(TaskType.DOCUMENTATION, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.2'); // default weak model
    });

    it('should assign weak models to implementation tasks', () => {
      const model = service.getModelForTask(TaskType.IMPLEMENTATION, AuthType.USE_OLLAMA);
      expect(model).toBe('llama3.2'); // default weak model
    });
  });

  describe('getCurrentStrength', () => {
    it('should return current strength', () => {
      const strength = service.getCurrentStrength();
      expect(strength).toBe(ModelStrength.WEAK); // default
    });
  });

  describe('getModelConfig', () => {
    it('should return model config for provider', () => {
      const config = service.getModelConfig(AuthType.USE_OLLAMA);
      expect(config).toEqual({
        weak: 'llama3.2',
        strong: 'llama3.1:70b'
      });
    });

    it('should return undefined for unknown provider', () => {
      const config = service.getModelConfig('unknown' as AuthType);
      expect(config).toBeUndefined();
    });
  });
});