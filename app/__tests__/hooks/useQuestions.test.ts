/**
 * useQuestions フックのテスト
 *
 * React 18 の act (react-dom/test-utils) + 手動 renderHook ヘルパーで実装。
 * @testing-library/react-native 不要。
 *
 * @jest-environment jsdom
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/storageKeys';

// ── モック ────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('react-native', () => ({}));

// ── renderHook ヘルパー ───────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom';

type HookResult<T> = { current: T };

function renderHook<T>(hookFn: () => T): { result: HookResult<T> } {
  const result: HookResult<T> = { current: undefined as unknown as T };
  const container = document.createElement('div');
  document.body.appendChild(container);

  function HookWrapper() {
    result.current = hookFn();
    return null;
  }

  act(() => {
    ReactDOM.render(React.createElement(HookWrapper), container);
  });

  return { result };
}

// ── テスト対象（React hooks を直接実装） ──────────────
// useQuestions 本体をインポート（react-native の hooks は jest 環境で動作）
import { useQuestions } from '../../hooks/useQuestions';

// ── テストデータ ──────────────────────────────
const makeQuestion = (id: number, override: Record<string, unknown> = {}) => ({
  id,
  question: `問題${id}`,
  answerType: 'truefalse' as const,
  trueFalseAnswer: true,
  enabled: true,
  tags: [] as string[],
  mistakeCount: 0,
  createdAt: 1700000000000,
  ...override,
});

// ─────────────────────────────────────────────
describe('useQuestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 初期状態 ──────────────────────────────────
  it('初期状態: questions は空配列、loading は true であること', () => {
    // getItem が resolve しない状態で初期値を検証
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useQuestions());

    expect(result.current.questions).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  // ── loadQuestions ──────────────────────────────
  it('loadQuestions: データを正しく読み込み questions に反映すること', async () => {
    const mockData = [makeQuestion(1, { question: 'テスト問題1' })];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.questions).toHaveLength(1);
    expect(result.current.questions[0].question).toBe('テスト問題1');
  });

  it('loadQuestions: answerType がない問題はフィルタリングされること', async () => {
    const mockData = [
      makeQuestion(1),
      { id: 2, question: '古い形式', enabled: true }, // answerType なし
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.questions).toHaveLength(1);
    expect(result.current.questions[0].id).toBe(1);
  });

  it('loadQuestions: データが null の場合 questions は空配列になること', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.questions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // ── saveQuestions ──────────────────────────────
  it('saveQuestions: AsyncStorage に保存し questions state を更新すること', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const newQuestions = [makeQuestion(1, { question: '新規問題' })];

    await act(async () => {
      await result.current.saveQuestions(newQuestions);
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.QUIZ_QUESTIONS,
      JSON.stringify(newQuestions)
    );
    expect(result.current.questions).toEqual(newQuestions);
  });

  // ── deleteQuestion ─────────────────────────────
  it('deleteQuestion: 指定 id の問題を削除すること', async () => {
    const mockData = [makeQuestion(1), makeQuestion(2)];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteQuestion(1);
    });

    expect(result.current.questions).toHaveLength(1);
    expect(result.current.questions[0].id).toBe(2);
  });

  it('deleteQuestion: 存在しない id を指定しても配列が変わらないこと', async () => {
    const mockData = [makeQuestion(1), makeQuestion(2)];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteQuestion(999);
    });

    expect(result.current.questions).toHaveLength(2);
  });

  // ── updateQuestion ─────────────────────────────
  it('updateQuestion: 指定問題の内容を更新すること', async () => {
    const mockData = [makeQuestion(1, { question: '元の問題' })];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const updated = { ...result.current.questions[0], question: '更新された問題' };

    await act(async () => {
      await result.current.updateQuestion(updated);
    });

    expect(result.current.questions[0].question).toBe('更新された問題');
    expect(result.current.questions).toHaveLength(1);
  });

  // ── addTagToQuestions ──────────────────────────
  it('addTagToQuestions: 指定した問題にタグを追加すること', async () => {
    const mockData = [makeQuestion(1, { tags: ['既存タグ'] })];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.addTagToQuestions([1], ['新規タグ1', '新規タグ2']);
    });

    const tags = result.current.questions[0].tags;
    expect(tags).toContain('既存タグ');
    expect(tags).toContain('新規タグ1');
    expect(tags).toContain('新規タグ2');
    expect(tags).toHaveLength(3);
  });

  it('addTagToQuestions: 重複するタグは追加しないこと（Set による重複排除）', async () => {
    const mockData = [makeQuestion(1, { tags: ['タグA'] })];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.addTagToQuestions([1], ['タグA', 'タグB']);
    });

    expect(result.current.questions[0].tags).toEqual(['タグA', 'タグB']);
  });

  it('addTagToQuestions: 対象外の問題 id はタグが変化しないこと', async () => {
    const mockData = [makeQuestion(1, { tags: [] }), makeQuestion(2, { tags: [] })];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    const { result } = renderHook(() => useQuestions());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.addTagToQuestions([1], ['新タグ']);
    });

    expect(result.current.questions[0].tags).toContain('新タグ');
    expect(result.current.questions[1].tags).toHaveLength(0);
  });
});
