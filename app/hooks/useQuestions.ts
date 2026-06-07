import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Question } from '../types/question';

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQuestions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
      if (data) {
        const allQuestions: Question[] = JSON.parse(data);
        const filteredQuestions = allQuestions.filter((q: any) => q.answerType);
        setQuestions(filteredQuestions);
      } else {
        setQuestions([]);
      }
    } catch (e) {
      console.error('Failed to load questions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveQuestions = useCallback(async (newQuestions: Question[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(newQuestions));
    setQuestions(newQuestions);
  }, []);

  const deleteQuestion = useCallback(async (id: number): Promise<Question[]> => {
    const updated = questions.filter(q => q.id !== id);
    await saveQuestions(updated);
    return updated;
  }, [questions, saveQuestions]);

  const updateQuestion = useCallback(async (updatedQuestion: Question): Promise<Question[]> => {
    const updated = questions.map(q => q.id === updatedQuestion.id ? updatedQuestion : q);
    await saveQuestions(updated);
    return updated;
  }, [questions, saveQuestions]);

  const addTagToQuestions = useCallback(async (ids: number[], newTags: string[]): Promise<Question[]> => {
    const updated = questions.map(q => {
      if (ids.includes(q.id)) {
        const currentTags = q.tags || [];
        const mergedTags = [...new Set([...currentTags, ...newTags])];
        return { ...q, tags: mergedTags };
      }
      return q;
    });
    await saveQuestions(updated);
    return updated;
  }, [questions, saveQuestions]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  return {
    questions,
    setQuestions,
    loading,
    loadQuestions,
    saveQuestions,
    deleteQuestion,
    updateQuestion,
    addTagToQuestions,
  };
};