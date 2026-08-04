import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
  deleteDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../auth/AuthContext';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Question, Folder } from '../types/question';
import { Alert } from 'react-native';
import { safeParseArray, loadTagMasterList, addTagToMasterList, removeTagFromMasterList } from '../utils/storageUtils';
import { normalizeQuestionFromFirestore } from '../utils/answerUtils';

// Contextの型定義
interface QuestionsContextType {
  questions: Question[];
  folders: Folder[];
  tagMasterList: string[];
  isMigrating: boolean;
  loadQuestions: () => Promise<void>;
  saveQuestions: (questions: Question[]) => Promise<void>;
  saveFolders: (folders: Folder[]) => Promise<void>;
  deleteQuestion: (id: number) => Promise<Question[]>;
  updateQuestion: (question: Question) => Promise<Question[]>;
  addTagToQuestions: (ids: number[], newTags: string[]) => Promise<Question[]>;
  removeTagFromAllQuestions: (tagToRemove: string) => Promise<void>;
  createFolder: (folder: Folder) => Promise<Folder[]>;
  updateFolder: (folder: Folder) => Promise<Folder[]>;
  deleteFolder: (folderId: string) => Promise<Folder[]>;
  addQuestionsToFolder: (folderId: string, questionIds: number[]) => Promise<Folder[]>;
  removeQuestionsFromFolder: (folderId: string, questionIds: number[]) => Promise<Folder[]>;
  cleanupOrphanFolders: () => Promise<number>;
  applyQuestionsChange: (mutate: (current: Question[]) => Question[]) => Promise<Question[]>;
  applyFoldersChange: (mutate: (current: Folder[]) => Folder[]) => Promise<Folder[]>;
  addTag: (tag: string) => Promise<void>;
  removeTag: (tag: string) => Promise<void>;
}

// Contextの作成
const QuestionsContext = createContext<QuestionsContextType | undefined>(undefined);

// Providerコンポーネント
export const QuestionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tagMasterList, setTagMasterList] = useState<string[]>([]);
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
        let questions = data.questions || [];
        
        // Normalize questions from Firestore (parse descriptiveAnswerGroups from JSON string)
        questions = questions.map(normalizeQuestionFromFirestore);
        
        // Load tags from Firestore and sync to local
        const firestoreTags = data.tags || [];
        if (Array.isArray(firestoreTags) && firestoreTags.length > 0) {
          console.log(`Loaded ${firestoreTags.length} tags from Firestore`);
          // Update state and local storage
          setTagMasterList(firestoreTags);
          try {
            await AsyncStorage.setItem(STORAGE_KEYS.TAG_MASTER_LIST, JSON.stringify(firestoreTags));
          } catch (e) {
            console.error('Failed to save tags to local storage:', e);
          }
        }
        
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
        console.warn('⚠️ Firestore permission denied for questions, falling back to local data');
        return [];
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
        console.warn('⚠️ Firestore permission denied for folders, falling back to local data');
        return [];
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
      
      // 🟢 サニタイズ: descriptiveAnswerGroups を JSON 文字列に変換
      //    （Firestore はネストされた配列をサポートしていないため）
      const sanitizedQuestions = mergedQuestions.map(q => {
        const sanitized: any = { ...q };
        // ❌ descriptiveAnswer を削除（descriptiveAnswerGroups と重複するため）
        delete sanitized.descriptiveAnswer;
        if (q.descriptiveAnswerGroups !== undefined && Array.isArray(q.descriptiveAnswerGroups)) {
          sanitized.descriptiveAnswerGroups = JSON.stringify(q.descriptiveAnswerGroups);
        }
        return sanitized;
      });
      
      const dataToSave = {
        questions: sanitizedQuestions,
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
  // Firestoreのオフラインキャッシュが有効なので、瞬時にデータを読み込める
  const loadQuestions = useCallback(async () => {
    console.log('📋 loadQuestions called, user:', user?.uid);
    
    // 未ログイン時はローカルのみ
    if (!user) {
      console.log('👤 No user, loading from AsyncStorage only');
      const data = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
      const allQuestions: Question[] = safeParseArray(data, []);
      const filteredQuestions = allQuestions.filter((q: any) => q.answerType);
      console.log('📦 Loaded from AsyncStorage:', filteredQuestions.length, 'questions');
      setQuestions(filteredQuestions);
      
      const folderData = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
      const folders: Folder[] = safeParseArray(folderData, []);
      setFolders(folders);
      
      return;
    }

    // ログイン時はFirestoreから読み込み（オフラインキャッシュ優先）
    try {
      console.log('🔍 Loading from Firestore...');
      const firestoreQuestions = await loadQuestionsFromFirestore();
      const firestoreFolders = await loadFoldersFromFirestore();
      console.log('✅ Firestore questions:', firestoreQuestions.length);
      console.log('✅ Firestore folders:', firestoreFolders.length);
      
      // ローカルにデータがある場合は移行を試みる
      const localQuestionsData = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
      const localFoldersData = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
      
      console.log('💾 Local questions data exists:', !!localQuestionsData);
      console.log('💾 Local folders data exists:', !!localFoldersData);
      
      if (localQuestionsData) {
        const localQuestions: Question[] = safeParseArray(localQuestionsData, []);
        const filteredLocal = localQuestions.filter((q: any) => q.answerType);
        console.log('📦 Local questions (filtered):', filteredLocal.length);
        
        if (filteredLocal.length > 0 && firestoreQuestions.length === 0) {
          // Firestoreにデータがない場合、ローカルから移行
          console.log('🔄 Migrating local questions to Firestore...');
          const migrated = await migrateLocalQuestionsToFirestore(filteredLocal);
          
          if (migrated) {
            console.log('✅ Migration successful, using local data');
            setQuestions(filteredLocal);
            await AsyncStorage.removeItem(STORAGE_KEYS.QUIZ_QUESTIONS);
          } else {
            console.log('⚠️ Migration failed, using local data anyway');
            setQuestions(filteredLocal);
            Alert.alert(
              '同期エラー',
              '問題データのクラウド保存に失敗しました。ローカルに保存されています。'
            );
          }
        } else if (firestoreQuestions.length > 0) {
          console.log('✅ Using Firestore questions (has data)');
          setQuestions(firestoreQuestions);
          await AsyncStorage.removeItem(STORAGE_KEYS.QUIZ_QUESTIONS);
        } else {
          console.log('⚠️ No questions anywhere, setting empty');
          setQuestions([]);
        }
      } else {
        console.log('✅ No local data, using Firestore questions');
        console.log('📝 Setting questions to Firestore data:', firestoreQuestions.length);
        setQuestions(firestoreQuestions);
        console.log('✅ setQuestions called with', firestoreQuestions.length, 'questions');
      }

      // フォルダの移行処理
      if (localFoldersData) {
        const localFolders: Folder[] = safeParseArray(localFoldersData, []);
        console.log('📦 Local folders:', localFolders.length);
        
        if (localFolders.length > 0 && firestoreFolders.length === 0) {
          console.log('🔄 Migrating local folders to Firestore...');
          const migrated = await migrateLocalFoldersToFirestore(localFolders);
          
          if (migrated) {
            console.log('✅ Folder migration successful');
            setFolders(localFolders);
            await AsyncStorage.removeItem(STORAGE_KEYS.QUESTION_FOLDERS);
          } else {
            console.log('⚠️ Folder migration failed');
            setFolders(localFolders);
            Alert.alert(
              '同期エラー',
              '問題集データのクラウド保存に失敗しました。ローカルに保存されています。'
            );
          }
        } else if (firestoreFolders.length > 0) {
          console.log('✅ Using Firestore folders');
          console.log('📝 Setting folders to Firestore data:', firestoreFolders.length);
          setFolders(firestoreFolders);
          await AsyncStorage.removeItem(STORAGE_KEYS.QUESTION_FOLDERS);
        } else {
          console.log('⚠️ No folders anywhere, setting empty');
          setFolders([]);
        }
      } else {
        console.log('✅ No local folders, using Firestore folders');
        console.log('📝 Setting folders to Firestore data:', firestoreFolders.length);
        setFolders(firestoreFolders);
      }
      
      // Note: questions and folders state will update asynchronously
      // The UI should reflect the new values after re-render
      console.log('✅ loadQuestions complete - state updates queued');
    } catch (e) {
      console.error('❌ Failed to load questions:', e);
      
      // エラー時はローカルデータにフォールバック
      try {
        console.log('🔄 Falling back to local data...');
        const localQuestionsData = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);
        const localFoldersData = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
        
        const localQuestions: Question[] = safeParseArray(localQuestionsData, []);
        const filteredLocal = localQuestions.filter((q: any) => q.answerType);
        const localFolders: Folder[] = safeParseArray(localFoldersData, []);
        
        console.log('📦 Local questions (fallback):', filteredLocal.length);
        console.log('📦 Local folders (fallback):', localFolders.length);
        
        setQuestions(filteredLocal);
        setFolders(localFolders);
      } catch (localError) {
        console.error('❌ Failed to load local data:', localError);
        Alert.alert('エラー', 'データの読み込みに失敗しました。');
      }
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
      
      // undefinedを排除した安全な問題データに変換
      const sanitizedQuestions = newQuestions.map(q => {
        const sanitized: any = {
          id: q.id,
          question: q.question || '',
          answerType: q.answerType,
          tags: (q.tags || []).map((t: any) => String(t)), // ✅ Flat array of strings
          mistakeCount: q.mistakeCount || 0,
          createdAt: q.createdAt || Date.now(),
          enabled: q.enabled !== undefined ? q.enabled : true,
          isShared: q.isShared || false
        };
        
        // 回答タイプに応じて必要なフィールドを追加
        if (q.answerType === 'descriptive') {
          if (q.matchMode) {
            sanitized.matchMode = q.matchMode;
          }
          // ✅ descriptiveAnswerGroups を JSON 文字列に変換（ネスト配列を避ける）
          if (q.descriptiveAnswerGroups !== undefined) {
            if (Array.isArray(q.descriptiveAnswerGroups)) {
              sanitized.descriptiveAnswerGroups = JSON.stringify(q.descriptiveAnswerGroups);
            } else if (typeof q.descriptiveAnswerGroups === 'string') {
              // 既に文字列の場合はそのまま
              sanitized.descriptiveAnswerGroups = q.descriptiveAnswerGroups;
            }
          }
          // ❌ descriptiveAnswer は保存しない（重複フィールドによる競合を避ける）
        } else if (q.answerType === 'truefalse') {
          if (q.trueFalseAnswer !== undefined) {
            sanitized.trueFalseAnswer = q.trueFalseAnswer;
          }
          if (q.explanation) {
            sanitized.explanation = q.explanation;
          }
        } else if (q.answerType === 'multiple') {
          if (q.multipleChoice) {
            // ✅ options を平坦な文字列配列に強制
            const rawOptions = q.multipleChoice.options || ['', '', '', ''];
            sanitized.multipleChoice = {
              options: Array.isArray(rawOptions) 
                ? rawOptions.map((opt: any) => String(opt || ''))
                : ['', '', '', ''],
              correctAnswer: q.multipleChoice.correctAnswer ?? 0
            };
          }
          if (q.explanation) {
            sanitized.explanation = q.explanation;
          }
        }
        
        // 画像データがある場合
        if (q.image) {
          sanitized.image = q.image;
        }
        if (q.imageAnnotations && q.imageAnnotations.length > 0) {
          // ✅ imageAnnotations を安全なオブジェクト配列に強制
          sanitized.imageAnnotations = q.imageAnnotations.map(ann => ({
            id: String(ann.id || ''),
            x: Number(ann.x || 0),
            y: Number(ann.y || 0),
            width: Number(ann.width || 0),
            height: Number(ann.height || 0),
            color: String(ann.color || '#ffffff'),
            opacity: Number(ann.opacity || 1)
          }));
        }
        // ✅ sharedWith を保持（ACL共有用）
        if (q.sharedWith !== undefined) {
          sanitized.sharedWith = Array.isArray(q.sharedWith) ? q.sharedWith : [];
        }
        
        return sanitized;
      });
      
      // 🐛 デバッグログ: Firestoreに送信するデータを確認
      console.log('📤 Sending to Firestore (saveQuestionsToFirestore):', JSON.stringify(sanitizedQuestions, null, 2));
      
      const dataToSave = {
        questions: sanitizedQuestions,
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

  /**
   * Safely apply a change to the questions array using a Firestore
   * transaction. `mutate` receives the CURRENT question list read
   * fresh from Firestore at save time (not the possibly-stale local
   * state), and must return the new full list. This prevents
   * overwriting changes made by other tabs/devices/sessions.
   */
  const applyQuestionsChange = useCallback(async (
    mutate: (current: Question[]) => Question[]
  ): Promise<Question[]> => {
    if (!user?.uid) {
      // Not logged in: no concurrent-session risk from other
      // devices, fall back to the existing local-only path.
      const current = questions;
      const updated = mutate(current);
      await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(updated));
      setQuestions(updated);
      return updated;
    }

    const docRef = doc(db, 'userQuestions', user.uid);
    let updated: Question[] = [];

    try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const freshQuestions: Question[] = (docSnap.exists() ? (docSnap.data().questions || []) : [])
        .map(normalizeQuestionFromFirestore);
      updated = mutate(freshQuestions);

      // Reuse the exact same sanitization logic as
      // saveQuestionsToFirestore, applied to `updated`.
      const sanitizedQuestions = updated.map(q => {
        const sanitized: any = {
          id: q.id,
          question: q.question || '',
          answerType: q.answerType,
          tags: (q.tags || []).map((t: any) => String(t)), // ✅ Flat array of strings
          mistakeCount: q.mistakeCount || 0,
          createdAt: q.createdAt || Date.now(),
          enabled: q.enabled !== undefined ? q.enabled : true,
          isShared: q.isShared || false
        };
        if (q.answerType === 'descriptive') {
          if (q.matchMode) sanitized.matchMode = q.matchMode;
          // ✅ descriptiveAnswerGroups を JSON 文字列に変換（ネスト配列を避ける）
          if (q.descriptiveAnswerGroups !== undefined) {
            if (Array.isArray(q.descriptiveAnswerGroups)) {
              sanitized.descriptiveAnswerGroups = JSON.stringify(q.descriptiveAnswerGroups);
            } else if (typeof q.descriptiveAnswerGroups === 'string') {
              // 既に文字列の場合はそのまま（Firestoreから読み込んだデータ等）
              sanitized.descriptiveAnswerGroups = q.descriptiveAnswerGroups;
            }
          }
          // ❌ descriptiveAnswer は保存しない（重複フィールドによる競合を避ける）
        } else if (q.answerType === 'truefalse') {
          if (q.trueFalseAnswer !== undefined) sanitized.trueFalseAnswer = q.trueFalseAnswer;
          if (q.explanation) sanitized.explanation = q.explanation;
        } else if (q.answerType === 'multiple') {
          if (q.multipleChoice) {
            // ✅ options を平坦な文字列配列に強制
            const rawOptions = q.multipleChoice.options || ['', '', '', ''];
            sanitized.multipleChoice = {
              options: Array.isArray(rawOptions)
                ? rawOptions.map((opt: any) => String(opt || ''))
                : ['', '', '', ''],
              correctAnswer: q.multipleChoice.correctAnswer ?? 0
            };
          }
          if (q.explanation) sanitized.explanation = q.explanation;
        }
        if (q.image) sanitized.image = q.image;
        if (q.imageAnnotations && q.imageAnnotations.length > 0) {
          // ✅ imageAnnotations を安全なオブジェクト配列に強制
          sanitized.imageAnnotations = q.imageAnnotations.map(ann => ({
            id: String(ann.id || ''),
            x: Number(ann.x || 0),
            y: Number(ann.y || 0),
            width: Number(ann.width || 0),
            height: Number(ann.height || 0),
            color: String(ann.color || '#ffffff'),
            opacity: Number(ann.opacity || 1)
          }));
        }
        // ✅ sharedWith を保持（ACL共有用）
        if (q.sharedWith !== undefined) {
          sanitized.sharedWith = Array.isArray(q.sharedWith) ? q.sharedWith : [];
        }
        return sanitized;
      });

      // 🐛 デバッグログ: Firestoreに送信するデータを確認
      console.log('📤 Sending to Firestore (applyQuestionsChange):', JSON.stringify(sanitizedQuestions, null, 2));

      transaction.set(docRef, { questions: sanitizedQuestions, updatedAt: serverTimestamp() }, { merge: true });
    });
    } catch (error: any) {
      console.error('❌ applyQuestionsChange failed:', error);
      console.error('Error code:', error.code);
      
      // permission-denied エラー時はローカルにフォールバック
      if (error.code === 'permission-denied') {
        console.warn('⚠️ Firestore permission denied, using local data');
        const current = questions;
        updated = mutate(current);
      } else {
        throw error;
      }
    }

    // Update local state and local backup to match what was actually
    // written (the fresh-read result, not the stale pre-transaction state)
    setQuestions(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_QUESTIONS, JSON.stringify(updated));
    } catch (localError) {
      console.error('Failed to save local backup:', localError);
    }

    return updated;
  }, [user, questions]);

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
      
      // undefinedを排除した安全なフォルダデータに変換
      const sanitizedFolders = newFolders.map(f => ({
        id: f.id,
        name: f.name,
        questionIds: f.questionIds || [],
        parentId: f.parentId === undefined ? null : f.parentId,
        // ✅ sharedWith を保持（ACL共有用）
        sharedWith: Array.isArray(f.sharedWith) ? f.sharedWith : []
      }));
      
      const dataToSave = {
        folders: sanitizedFolders,
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

  /**
   * Safely apply a change to the folders array using a Firestore
   * transaction. `mutate` receives the CURRENT folder list read
   * fresh from Firestore at save time (not the possibly-stale local
   * state), and must return the new full list. This prevents
   * overwriting changes made by other tabs/devices/sessions.
   */
  const applyFoldersChange = useCallback(async (
    mutate: (current: Folder[]) => Folder[]
  ): Promise<Folder[]> => {
    if (!user?.uid) {
      // Not logged in: no concurrent-session risk from other
      // devices, fall back to the existing local-only path.
      const current = folders;
      const updated = mutate(current);
      await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(updated));
      setFolders(updated);
      return updated;
    }

    const docRef = doc(db, 'userQuestions', user.uid);
    let updated: Folder[] = [];

    try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const freshFolders: Folder[] = docSnap.exists() ? (docSnap.data().folders || []) : [];
      updated = mutate(freshFolders);

      // Reuse the exact same sanitization logic as
      // saveFoldersToFirestore, applied to `updated`.
      const sanitizedFolders = updated.map(f => ({
        id: f.id,
        name: f.name,
        questionIds: f.questionIds || [],
        parentId: f.parentId === undefined ? null : f.parentId,
        // ✅ sharedWith を保持（ACL共有用）
        sharedWith: Array.isArray(f.sharedWith) ? f.sharedWith : []
      }));

      transaction.set(docRef, { folders: sanitizedFolders, updatedAt: serverTimestamp() }, { merge: true });
    });
    } catch (error: any) {
      console.error('❌ applyFoldersChange failed:', error);
      console.error('Error code:', error.code);
      
      // permission-denied エラー時はローカルにフォールバック
      if (error.code === 'permission-denied') {
        console.warn('⚠️ Firestore permission denied, using local data');
        const current = folders;
        updated = mutate(current);
      } else {
        throw error;
      }
    }

    // Update local state and local backup to match what was actually
    // written (the fresh-read result, not the stale pre-transaction state)
    setFolders(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(updated));
    } catch (localError) {
      console.error('Failed to save local backup:', localError);
    }

    return updated;
  }, [user, folders]);

  const deleteQuestion = useCallback(async (id: number): Promise<Question[]> => {
    console.log('🗑️ deleteQuestion called with id:', id);
    const result = await applyQuestionsChange(current => current.filter(q => q.id !== id));
    console.log('🗑️ deleteQuestion result:', result.length, 'questions remaining');
    return result;
  }, [applyQuestionsChange]);

  const updateQuestion = useCallback(async (updatedQuestion: Question): Promise<Question[]> => {
    return await applyQuestionsChange(current => current.map(q => q.id === updatedQuestion.id ? updatedQuestion : q));
  }, [applyQuestionsChange]);

  const addTagToQuestions = useCallback(async (ids: number[], newTags: string[]): Promise<Question[]> => {
    return await applyQuestionsChange(current => current.map(q => {
      if (ids.includes(q.id)) {
        const currentTags = q.tags || [];
        const mergedTags = [...new Set([...currentTags, ...newTags])];
        return { ...q, tags: mergedTags };
      }
      return q;
    }));
  }, [applyQuestionsChange]);

  /**
   * 指定したタグを、全問題から一括で取り除く。
   * 1回の saveQuestions 呼び出しで完結させる（ループでの
   * updateQuestion 呼び出しは行わない）。
   */
  const removeTagFromAllQuestions = useCallback(async (tagToRemove: string): Promise<void> => {
    await applyQuestionsChange(current => current.map(q => {
      if (!q.tags || !q.tags.includes(tagToRemove)) return q;
      return { ...q, tags: q.tags.filter(t => t !== tagToRemove) };
    }));
  }, [applyQuestionsChange]);

  // フォルダCRUD操作
  const createFolder = useCallback(async (folder: Folder): Promise<Folder[]> => {
    return await applyFoldersChange(current => [...current, folder]);
  }, [applyFoldersChange]);

  const updateFolder = useCallback(async (updatedFolder: Folder): Promise<Folder[]> => {
    return await applyFoldersChange(current => current.map(f => f.id === updatedFolder.id ? updatedFolder : f));
  }, [applyFoldersChange]);

  const deleteFolder = useCallback(async (folderId: string): Promise<Folder[]> => {
    return await applyFoldersChange(current => current.filter(f => f.id !== folderId));
  }, [applyFoldersChange]);

  const addQuestionsToFolder = useCallback(async (folderId: string, questionIds: number[]): Promise<Folder[]> => {
    return await applyFoldersChange(current => current.map(f => {
      if (f.id === folderId) {
        return { ...f, questionIds: [...new Set([...f.questionIds, ...questionIds])] };
      }
      return f;
    }));
  }, [applyFoldersChange]);

  const removeQuestionsFromFolder = useCallback(async (folderId: string, questionIds: number[]): Promise<Folder[]> => {
    return await applyFoldersChange(current => current.map(f => {
      if (f.id === folderId) {
        return { ...f, questionIds: f.questionIds.filter(id => !questionIds.includes(id)) };
      }
      return f;
    }));
  }, [applyFoldersChange]);

  // タグをFirestoreに保存
  const saveTagsToFirestore = useCallback(async (tags: string[]): Promise<void> => {
    if (!user?.uid) {
      // 未ログイン時はローカルのみ（addTagToMasterList/removeTagFromMasterListで既に保存済み）
      return;
    }

    try {
      const docRef = doc(db, 'userQuestions', user.uid);
      await setDoc(docRef, { tags, updatedAt: serverTimestamp() }, { merge: true });
      console.log('✅ Tags saved to Firestore:', tags.length);
    } catch (error: any) {
      console.error('Failed to save tags to Firestore:', error);
      // エラー時はローカルのみ（既に保存済み）
    }
  }, [user]);

  // タグを追加（Firestore + AsyncStorage + state）
  const addTag = useCallback(async (tag: string): Promise<void> => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    const added = await addTagToMasterList(trimmed);
    if (added) {
      const updated = [...tagMasterList, trimmed];
      setTagMasterList(updated);
      await saveTagsToFirestore(updated);
    }
  }, [tagMasterList, saveTagsToFirestore]);

  // タグを削除（Firestore + AsyncStorage + state）
  const removeTag = useCallback(async (tag: string): Promise<void> => {
    await removeTagFromMasterList(tag);
    const updated = tagMasterList.filter(t => t !== tag);
    setTagMasterList(updated);
    await saveTagsToFirestore(updated);
  }, [tagMasterList, saveTagsToFirestore]);

  // ゴーストフォルダ（実体のないフォルダ）のクリーンアップ
  const cleanupOrphanFolders = useCallback(async (): Promise<number> => {
    // フォルダに紐づく問題が存在するかチェック
    const validFolders = folders.filter(folder => {
      const hasValidQuestions = folder.questionIds && folder.questionIds.length > 0 &&
        folder.questionIds.some(qid => questions.some(q => q.id === qid));
      return hasValidQuestions;
    });

    const removedCount = folders.length - validFolders.length;
    
    if (removedCount > 0) {
      await applyFoldersChange(() => validFolders);
    }
    
    return removedCount;
  }, [folders, questions, applyFoldersChange]);

  // 初回読み込み
  useEffect(() => {
    loadQuestions();
    // タグマスターリストをローカルから読み込み
    loadTagMasterList().then(setTagMasterList);
  }, [loadQuestions]);

  // Debug: Log actual state values after updates
  useEffect(() => {
    console.log('🔄 State updated - questions:', questions.length, 'folders:', folders.length);
  }, [questions, folders]);

  // ContextValueの作成
  const value: QuestionsContextType = {
    questions,
    folders,
    tagMasterList,
    isMigrating,
    loadQuestions,
    saveQuestions,
    applyQuestionsChange,
    applyFoldersChange,
    saveFolders,
    deleteQuestion,
    updateQuestion,
    addTagToQuestions,
    removeTagFromAllQuestions,
    createFolder,
    updateFolder,
    deleteFolder,
    addQuestionsToFolder,
    removeQuestionsFromFolder,
    cleanupOrphanFolders,
    addTag,
    removeTag,
  };

  return (
    <QuestionsContext.Provider value={value}>
      {children}
    </QuestionsContext.Provider>
  );
};

// カスタムフック
export const useQuestionsContext = () => {
  const context = useContext(QuestionsContext);
  if (context === undefined) {
    throw new Error('useQuestionsContext must be used within a QuestionsProvider');
  }
  return context;
};