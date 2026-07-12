import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  getDocs,
  collection,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../app/auth/AuthContext';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Question } from '../types/question';
import { Alert } from 'react-native';

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const { user } = useAuth();

  // Firestoreから問題を読み込み
  const loadQuestionsFromFirestore = useCallback(async (): Promise<Question[]> => {
    if (!user?.uid) {
      console.log('No user logged in, skipping Firestore load');
      return [];
    }

    try {
      console.log('Loading questions from Firestore for user:', user.uid);
      const docRef = doc(db, 'userQuestions', user.uid);
      console.log('Document reference created:', docRef.path);
      
      const docSnap = await getDoc(docRef);
      console.log('Document snapshot:', docSnap.exists ? 'exists' : 'not found');
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('Document data:', data);
        const questions = data.questions || [];
        console.log(`Loaded ${questions.length} questions from Firestore`);
        return questions;
      }
      
      console.log('No questions found in Firestore for user:', user.uid);
      return [];
    } catch (error: any) {
      console.error('Failed to load questions from Firestore:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      
      // 権限エラーの場合は詳細を表示
      if (error.code === 'permission-denied') {
        Alert.alert(
          '権限エラー',
          '問題データの読み込み権限がありません。Firestoreのセキュリティルールを確認してください。'
        );
      }
      
      throw error;
    }
  }, [user]);

  // ローカルの問題をFirestoreに移行
  const migrateLocalQuestionsToFirestore = useCallback(async (localQuestions: Question[]): Promise<boolean> => {
    if (!user?.uid || localQuestions.length === 0) {
      console.log('Skipping migration: no user or no local questions');
      return true;
    }

    try {
      setIsMigrating(true);
      console.log(`Starting migration of ${localQuestions.length} questions to Firestore...`);
      
      const docRef = doc(db, 'userQuestions', user.uid);
      console.log('Migration target document:', docRef.path);
      
      const dataToSave = {
        questions: localQuestions,
        updatedAt: serverTimestamp(),
        migratedAt: serverTimestamp()
      };
      
      console.log('Data to save:', dataToSave);
      
      await setDoc(docRef, dataToSave, { merge: true });

      console.log(`Successfully migrated ${localQuestions.length} questions to Firestore`);
      Alert.alert(
        '同期完了',
        `${localQuestions.length}件の問題データをクラウドに保存しました。`
      );
      return true;
    } catch (error: any) {
      console.error('Failed to migrate questions:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      
      // ユーザーに詳細なエラー情報を表示
      let errorMessage = '問題データのクラウド保存に失敗しました。\n\n';
      
      if (error.code === 'permission-denied') {
        errorMessage += '権限がありません。Firestoreのセキュリティルールを確認してください。';
      } else if (error.code === 'unavailable') {
        errorMessage += 'ネットワーク接続を確認してください。';
      } else {
        errorMessage += `エラー: ${error.message || '不明なエラー'}`;
      }
      
      Alert.alert('同期エラー', errorMessage);
      return false;
    } finally {
      setIsMigrating(false);
    }
  }, [user]);

  // 問題を読み込み（マイグレーション付き）
  const loadQuestions = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!user) {
        // 未ログイン時はローカルのみ
        const data = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
        if (data) {
          const allQuestions: Question[] = JSON.parse(data);
          const filteredQuestions = allQuestions.filter((q: any) => q.answerType);
          setQuestions(filteredQuestions);
        } else {
          setQuestions([]);
        }
        return;
      }

      // ログイン時はFirestoreから読み込み
      let firestoreQuestions: Question[] = [];
      
      try {
        firestoreQuestions = await loadQuestionsFromFirestore();
      } catch (error) {
        console.error('Firestore load failed, falling back to local:', error);
      }

      // ローカルにデータがある場合は移行を試みる
      const localData = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
      if (localData) {
        const localQuestions: Question[] = JSON.parse(localData);
        const filteredLocal = localQuestions.filter((q: any) => q.answerType);
        
        if (filteredLocal.length > 0 && firestoreQuestions.length === 0) {
          // Firestoreにデータがない場合、ローカルから移行
          const migrated = await migrateLocalQuestionsToFirestore(filteredLocal);
          
          if (migrated) {
            // 移行成功時はFirestoreのデータを使用
            setQuestions(filteredLocal);
            // ローカルデータをクリア
            await AsyncStorage.removeItem(STORAGE_KEYS.QUIZ_QUESTIONS);
          } else {
            // 移行失敗時はローカルデータを使用
            setQuestions(filteredLocal);
            Alert.alert(
              '同期エラー',
              '問題データのクラウド保存に失敗しました。ローカルに保存されています。'
            );
          }
        } else if (firestoreQuestions.length > 0) {
          // Firestoreにデータがある場合
          setQuestions(firestoreQuestions);
          // ローカルデータをクリア
          await AsyncStorage.removeItem(STORAGE_KEYS.QUIZ_QUESTIONS);
        } else {
          setQuestions([]);
        }
      } else {
        // ローカルデータがない場合
        setQuestions(firestoreQuestions);
      }
    } catch (e) {
      console.error('Failed to load questions:', e);
      Alert.alert('エラー', '問題データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [user, loadQuestionsFromFirestore, migrateLocalQuestionsToFirestore]);

  // Firestoreに保存
  const saveQuestionsToFirestore = useCallback(async (newQuestions: Question[]): Promise<boolean> => {
    if (!user?.uid) {
      // 未ログイン時はローカルに保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(newQuestions));
        return true;
      } catch (error) {
        console.error('Failed to save questions locally:', error);
        return false;
      }
    }

    try {
      console.log(`Saving ${newQuestions.length} questions to Firestore for user:`, user.uid);
      const docRef = doc(db, 'userQuestions', user.uid);
      console.log('Save target:', docRef.path);
      
      const dataToSave = {
        questions: newQuestions,
        updatedAt: serverTimestamp()
      };
      
      await setDoc(docRef, dataToSave, { merge: true });
      console.log('Successfully saved to Firestore');
      
      // ローカルにもバックアップとして保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(newQuestions));
      } catch (localError) {
        console.error('Failed to save local backup:', localError);
      }
      
      return true;
    } catch (error: any) {
      console.error('Failed to save questions to Firestore:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      
      // エラー時はローカルに保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(newQuestions));
        console.log('Saved to local storage as fallback');
      } catch (localError) {
        console.error('Failed to save questions locally:', localError);
      }
      
      // ユーザーに通知
      let errorMessage = '問題データの保存に失敗しました。\n\n';
      
      if (error.code === 'permission-denied') {
        errorMessage += '権限がありません。Firestoreのセキュリティルールを確認してください。';
      } else if (error.code === 'unavailable') {
        errorMessage += 'ネットワーク接続を確認してください。オフラインで保存しています。';
      } else {
        errorMessage += `エラー: ${error.message || '不明なエラー'}`;
      }
      
      Alert.alert('保存エラー', errorMessage);
      return false;
    }
  }, [user]);

  const saveQuestions = useCallback(async (newQuestions: Question[]) => {
    const success = await saveQuestionsToFirestore(newQuestions);
    
    if (success) {
      setQuestions(newQuestions);
    } else {
      Alert.alert(
        '保存エラー',
        '問題データの保存に失敗しました。ローカルに保存されています。'
      );
      setQuestions(newQuestions);
    }
  }, [saveQuestionsToFirestore]);

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
    isMigrating,
    loadQuestions,
    saveQuestions,
    deleteQuestion,
    updateQuestion,
    addTagToQuestions,
  };
};