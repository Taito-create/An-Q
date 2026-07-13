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
  where,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../app/auth/AuthContext';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Question, Folder } from '../types/question';
import { Alert } from 'react-native';

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
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
      
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
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
      
      if (error.code === 'permission-denied') {
        Alert.alert(
          '権限エラー',
          '問題データの読み込み権限がありません。Firestoreのセキュリティルールを確認してください。'
        );
      }
      
      throw error;
    }
  }, [user]);

  // Firestoreからフォルダを読み込み
  const loadFoldersFromFirestore = useCallback(async (): Promise<Folder[]> => {
    if (!user?.uid) {
      console.log('No user logged in, skipping Firestore load for folders');
      return [];
    }

    try {
      console.log('Loading folders from Firestore for user:', user.uid);
      const docRef = doc(db, 'userQuestions', user.uid);
      
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const folders = data.folders || [];
        console.log(`Loaded ${folders.length} folders from Firestore`);
        return folders;
      }
      
      console.log('No folders found in Firestore for user:', user.uid);
      return [];
    } catch (error: any) {
      console.error('Failed to load folders from Firestore:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.code === 'permission-denied') {
        Alert.alert(
          '権限エラー',
          'フォルダデータの読み込み権限がありません。Firestoreのセキュリティルールを確認してください。'
        );
      }
      
      return [];
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
      
      // 既存のFirestoreデータを確認
      const docSnap = await getDoc(docRef);
      const existingData = docSnap.exists() ? docSnap.data() : {};
      const existingQuestions = existingData.questions || [];
      
      // 重複を避けてマージ
      const mergedQuestions = [...existingQuestions];
      localQuestions.forEach(localQ => {
        const exists = mergedQuestions.some(q => q.id === localQ.id);
        if (!exists) {
          mergedQuestions.push(localQ);
        }
      });
      
      const dataToSave = {
        questions: mergedQuestions,
        updatedAt: serverTimestamp(),
        migratedAt: serverTimestamp()
      };
      
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

  // ローカルのフォルダをFirestoreに移行
  const migrateLocalFoldersToFirestore = useCallback(async (localFolders: Folder[]): Promise<boolean> => {
    if (!user?.uid || localFolders.length === 0) {
      console.log('Skipping folder migration: no user or no local folders');
      return true;
    }

    try {
      setIsMigrating(true);
      console.log(`Starting migration of ${localFolders.length} folders to Firestore...`);
      
      const docRef = doc(db, 'userQuestions', user.uid);
      
      // 既存のFirestoreデータを確認
      const docSnap = await getDoc(docRef);
      const existingData = docSnap.exists() ? docSnap.data() : {};
      const existingFolders = existingData.folders || [];
      
      // 重複を避けてマージ（IDで比較）
      const mergedFolders = [...existingFolders];
      localFolders.forEach(localFolder => {
        const exists = mergedFolders.some(f => f.id === localFolder.id);
        if (!exists) {
          mergedFolders.push(localFolder);
        }
      });
      
      const dataToSave = {
        folders: mergedFolders,
        updatedAt: serverTimestamp(),
        migratedAt: serverTimestamp()
      };
      
      await setDoc(docRef, dataToSave, { merge: true });

      console.log(`Successfully migrated ${localFolders.length} folders to Firestore`);
      Alert.alert(
        '同期完了',
        `${localFolders.length}件の問題集データをクラウドに保存しました。`
      );
      return true;
    } catch (error: any) {
      console.error('Failed to migrate folders:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = '問題集データのクラウド保存に失敗しました。\n\n';
      
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
        
        // フォルダもローカルのみ
        const folderData = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
        if (folderData) {
          setFolders(JSON.parse(folderData));
        } else {
          setFolders([]);
        }
        
        return;
      }

      // ログイン時はFirestoreから読み込み
      let firestoreQuestions: Question[] = [];
      let firestoreFolders: Folder[] = [];
      
      try {
        firestoreQuestions = await loadQuestionsFromFirestore();
        firestoreFolders = await loadFoldersFromFirestore();
      } catch (error) {
        console.error('Firestore load failed, falling back to local:', error);
      }

      // ローカルにデータがある場合は移行を試みる
      const localQuestionsData = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
      const localFoldersData = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
      
      if (localQuestionsData) {
        const localQuestions: Question[] = JSON.parse(localQuestionsData);
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

      // フォルダの移行処理
      if (localFoldersData) {
        const localFolders: Folder[] = JSON.parse(localFoldersData);
        
        if (localFolders.length > 0 && firestoreFolders.length === 0) {
          // Firestoreにフォルダがない場合、ローカルから移行
          const migrated = await migrateLocalFoldersToFirestore(localFolders);
          
          if (migrated) {
            setFolders(localFolders);
            await AsyncStorage.removeItem(STORAGE_KEYS.QUESTION_FOLDERS);
          } else {
            setFolders(localFolders);
            Alert.alert(
              '同期エラー',
              '問題集データのクラウド保存に失敗しました。ローカルに保存されています。'
            );
          }
        } else if (firestoreFolders.length > 0) {
          // Firestoreにフォルダがある場合
          setFolders(firestoreFolders);
          await AsyncStorage.removeItem(STORAGE_KEYS.QUESTION_FOLDERS);
        } else {
          setFolders([]);
        }
      } else {
        setFolders(firestoreFolders);
      }
    } catch (e) {
      console.error('Failed to load questions:', e);
      Alert.alert('エラー', 'データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [user, loadQuestionsFromFirestore, loadFoldersFromFirestore, migrateLocalQuestionsToFirestore, migrateLocalFoldersToFirestore]);

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

  // Firestoreにフォルダを保存
  const saveFoldersToFirestore = useCallback(async (newFolders: Folder[]): Promise<boolean> => {
    if (!user?.uid) {
      // 未ログイン時はローカルに保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(newFolders));
        return true;
      } catch (error) {
        console.error('Failed to save folders locally:', error);
        return false;
      }
    }

    try {
      console.log(`Saving ${newFolders.length} folders to Firestore for user:`, user.uid);
      const docRef = doc(db, 'userQuestions', user.uid);
      
      const dataToSave = {
        folders: newFolders,
        updatedAt: serverTimestamp()
      };
      
      await setDoc(docRef, dataToSave, { merge: true });
      console.log('Successfully saved folders to Firestore');
      
      // ローカルにもバックアップとして保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(newFolders));
      } catch (localError) {
        console.error('Failed to save local backup:', localError);
      }
      
      return true;
    } catch (error: any) {
      console.error('Failed to save folders to Firestore:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // エラー時はローカルに保存
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(newFolders));
        console.log('Saved folders to local storage as fallback');
      } catch (localError) {
        console.error('Failed to save folders locally:', localError);
      }
      
      // ユーザーに通知
      let errorMessage = '問題集データの保存に失敗しました。\n\n';
      
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

  const saveFolders = useCallback(async (newFolders: Folder[]) => {
    const success = await saveFoldersToFirestore(newFolders);
    
    if (success) {
      setFolders(newFolders);
    } else {
      Alert.alert(
        '保存エラー',
        '問題集データの保存に失敗しました。ローカルに保存されています。'
      );
      setFolders(newFolders);
    }
  }, [saveFoldersToFirestore]);

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

  // フォルダCRUD操作
  const createFolder = useCallback(async (folder: Folder): Promise<Folder[]> => {
    const updated = [...folders, folder];
    await saveFolders(updated);
    return updated;
  }, [folders, saveFolders]);

  const updateFolder = useCallback(async (updatedFolder: Folder): Promise<Folder[]> => {
    const updated = folders.map(f => f.id === updatedFolder.id ? updatedFolder : f);
    await saveFolders(updated);
    return updated;
  }, [folders, saveFolders]);

  const deleteFolder = useCallback(async (folderId: string): Promise<Folder[]> => {
    console.log('=== deleteFolder 開始 ===');
    console.log('folderId:', folderId);
    console.log('現在のfolders数:', folders.length);
    
    const updated = folders.filter(f => f.id !== folderId);
    console.log('削除後のfolders数:', updated.length);
    
    try {
      await saveFolders(updated);
      console.log('deleteFolder 成功');
      return updated;
    } catch (error) {
      console.error('deleteFolder エラー:', error);
      throw error;
    }
  }, [folders, saveFolders]);

  const addQuestionsToFolder = useCallback(async (folderId: string, questionIds: number[]): Promise<Folder[]> => {
    console.log('=== addQuestionsToFolder 開始 ===');
    console.log('folderId:', folderId);
    console.log('questionIds:', questionIds);
    console.log('現在のfolders数:', folders.length);
    
    const updated = folders.map(f => {
      if (f.id === folderId) {
        const newQuestionIds = [...new Set([...f.questionIds, ...questionIds])];
        console.log(`フォルダ "${f.name}" の問題数: ${f.questionIds.length} → ${newQuestionIds.length}`);
        return { ...f, questionIds: newQuestionIds };
      }
      return f;
    });
    
    try {
      await saveFolders(updated);
      console.log('addQuestionsToFolder 成功');
      return updated;
    } catch (error) {
      console.error('addQuestionsToFolder エラー:', error);
      throw error;
    }
  }, [folders, saveFolders]);

  const removeQuestionsFromFolder = useCallback(async (folderId: string, questionIds: number[]): Promise<Folder[]> => {
    const updated = folders.map(f => {
      if (f.id === folderId) {
        const newQuestionIds = f.questionIds.filter(id => !questionIds.includes(id));
        return { ...f, questionIds: newQuestionIds };
      }
      return f;
    });
    await saveFolders(updated);
    return updated;
  }, [folders, saveFolders]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  return {
    questions,
    folders,
    setQuestions,
    setFolders,
    loading,
    isMigrating,
    loadQuestions,
    saveQuestions,
    saveFolders,
    deleteQuestion,
    updateQuestion,
    addTagToQuestions,
    createFolder,
    updateFolder,
    deleteFolder,
    addQuestionsToFolder,
    removeQuestionsFromFolder,
  };
};