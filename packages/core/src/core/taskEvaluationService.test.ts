/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskEvaluationService } from './taskEvaluationService.js';
import { TaskType } from './modelTypes.js';
import { ContentGenerator } from './contentGenerator.js';
import { Turn } from './turn.js';

describe('TaskEvaluationService', () => {
  let service: TaskEvaluationService;
  let mockContentGenerator: ContentGenerator;

  beforeEach(() => {
    service = new TaskEvaluationService();
    
    // Create a mock content generator
    mockContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
      getTier: vi.fn()
    } as unknown as ContentGenerator;
  });

  it('should classify exploration tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'EXPLORATION'
    } as any);

    const result = await service.evaluateTaskType(
      'Help me understand the structure of this codebase',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.EXPLORATION);
  });

  it('should classify planning tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'PLANNING'
    } as any);

    const result = await service.evaluateTaskType(
      'Design a new authentication system for the app',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.PLANNING);
  });

  it('should classify troubleshooting tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'TROUBLESHOOTING'
    } as any);

    const result = await service.evaluateTaskType(
      'Debug why the login is failing',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.TROUBLESHOOTING);
  });

  it('should classify review tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'REVIEW'
    } as any);

    const result = await service.evaluateTaskType(
      'Review this pull request for security issues',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.REVIEW);
  });

  it('should classify documentation tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'DOCUMENTATION'
    } as any);

    const result = await service.evaluateTaskType(
      'Write API documentation for this endpoint',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.DOCUMENTATION);
  });

  it('should classify implementation tasks correctly', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'IMPLEMENTATION'
    } as any);

    const result = await service.evaluateTaskType(
      'Add a new button to the header',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.IMPLEMENTATION);
  });

  it('should default to IMPLEMENTATION on invalid response', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: 'INVALID_TASK_TYPE'
    } as any);

    const result = await service.evaluateTaskType(
      'Some random task',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.IMPLEMENTATION);
  });

  it('should default to IMPLEMENTATION on error', async () => {
    vi.mocked(mockContentGenerator.generateContent).mockRejectedValueOnce(
      new Error('API error')
    );

    const result = await service.evaluateTaskType(
      'Some task',
      [],
      mockContentGenerator
    );

    expect(result).toBe(TaskType.IMPLEMENTATION);
  });

  it('should include conversation history in evaluation', async () => {
    const history: Turn[] = [];

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValueOnce({
      text: () => 'EXPLORATION'
    } as any);

    await service.evaluateTaskType(
      'Current task',
      history,
      mockContentGenerator
    );

    // Verify that generateContent was called
    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
  });
});