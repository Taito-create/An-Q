import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialState, TutorialTask, TutorialType, tutorialContent } from './tutorialTypes';

interface TutorialContextType {
  // 状態
  tutorialState: TutorialState;
  
  // 操作
  startTutorial: (type: TutorialType) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  
  // インタラクティブ機能
  handleUserAction: (elementId: string, action: string) => void;
  showSuccessEffect: (message: string) => void;
  
  // スポットライト
  showSpotlight: (elementId: string, disableOthers?: boolean) => void;
  hideSpotlight: () => void;
  disableOtherElements: (targetId: string) => void;
  enableAllElements: () => void;
  
  // 初回起動チェック
  isFirstTime: boolean;
  markFirstTimeComplete: () => void;
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [tutorialState, setTutorialState] = useState<TutorialState>({
    isActive: false,
    currentStep: 0,
    tasks: [],
    spotlightElement: null,
    isWaitingForAction: false,
    completedTasks: [],
    currentPhase: 'solve',
  });
  
  const [isFirstTime, setIsFirstTime] = useState(false); // チュートリアル無効化（起動しない）
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const successOverlayRef = useRef<HTMLDivElement | null>(null);
  const disabledElementsRef = useRef<Set<string>>(new Set());

  // 初回起動チェック（現在は無効）
  useEffect(() => {
    const checkFirstTime = async () => {
      try {
        const completed = await AsyncStorage.getItem('tutorial_completed');
        if (completed) {
          setIsFirstTime(false);
        }
      } catch (error) {
        console.error('Failed to check tutorial status:', error);
      }
    };
    
    // チュートリアル無効化のため、checkFirstTime() の呼び出しをコメントアウト
    // checkFirstTime();
  }, []);

  // 成功エフェクト表示
  const showSuccessEffect = useCallback((message: string) => {
    if (Platform.OS !== 'web') return;

    // 成功オーバーレイ作成
    if (!successOverlayRef.current) {
      successOverlayRef.current = document.createElement('div');
      successOverlayRef.current.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px 30px;
        border-radius: 16px;
        font-size: 18px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        animation: successPop 0.6s ease-out;
        text-align: center;
      `;
      successOverlayRef.current.textContent = message;
      document.body.appendChild(successOverlayRef.current);

      // アニメーションスタイル
      const style = document.createElement('style');
      style.textContent = `
        @keyframes successPop {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(style);

      // 自動的に消す
      setTimeout(() => {
        if (successOverlayRef.current) {
          successOverlayRef.current.style.animation = 'successPop 0.6s ease-out reverse';
          setTimeout(() => {
            if (successOverlayRef.current) {
              successOverlayRef.current.remove();
              successOverlayRef.current = null;
            }
          }, 600);
        }
      }, 2000);
    }
  }, []);

  // 他の要素を無効化
  const disableOtherElements = useCallback((targetId: string) => {
    if (Platform.OS !== 'web') return;

    // すべてのインタラクティブ要素を無効化
    const elements = document.querySelectorAll('button, a, input, textarea, select, [role="button"]');
    elements.forEach(element => {
      if (element.id !== targetId && !element.closest('#tutorial-overlay')) {
        element.setAttribute('data-tutorial-disabled', 'true');
        element.style.pointerEvents = 'none';
        element.style.opacity = '0.5';
        disabledElementsRef.current.add(element.id || '');
      }
    });
  }, []);

  // すべての要素を有効化
  const enableAllElements = useCallback(() => {
    if (Platform.OS !== 'web') return;

    const elements = document.querySelectorAll('[data-tutorial-disabled="true"]');
    elements.forEach(element => {
      element.removeAttribute('data-tutorial-disabled');
      element.style.pointerEvents = '';
      element.style.opacity = '';
    });
    disabledElementsRef.current.clear();
  }, []);

  // 強化されたスポットライト表示
  const showSpotlight = useCallback((elementId: string, disableOthers = false) => {
    if (Platform.OS !== 'web') return;
    
    const element = document.getElementById(elementId);
    if (!element) return;

    // 他の要素を無効化
    if (disableOthers) {
      disableOtherElements(elementId);
    }

    // オーバーレイ作成
    if (!overlayRef.current) {
      overlayRef.current = document.createElement('div');
      overlayRef.current.id = 'tutorial-overlay';
      overlayRef.current.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 9999;
        pointer-events: none;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(overlayRef.current);
    }

    // スポットライト計算
    const rect = element.getBoundingClientRect();
    const spotlight = document.createElement('div');
    spotlight.style.cssText = `
      position: absolute;
      top: ${rect.top - 15}px;
      left: ${rect.left - 15}px;
      width: ${rect.width + 30}px;
      height: ${rect.height + 30}px;
      border: 4px solid #007AFF;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(0, 122, 255, 0.4);
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      animation: tutorialPulse 2s infinite;
      z-index: 10000;
    `;

    // 矢印を追加
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      top: ${rect.top - 60}px;
      left: ${rect.left + rect.width / 2 - 20}px;
      width: 0;
      height: 0;
      border-left: 20px solid transparent;
      border-right: 20px solid transparent;
      border-top: 30px solid #007AFF;
      z-index: 10001;
      animation: bounce 1.5s infinite;
    `;

    // アニメーションスタイル
    const style = document.createElement('style');
    style.textContent = `
      @keyframes tutorialPulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.7); }
        70% { box-shadow: 0 0 0 25px rgba(0, 122, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
      }
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
        60% { transform: translateY(-5px); }
      }
    `;
    document.head.appendChild(style);

    overlayRef.current.appendChild(spotlight);
    overlayRef.current.appendChild(arrow);
    setTutorialState(prev => ({ ...prev, spotlightElement: element }));

    // 要素を画面中央にスクロール
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [disableOtherElements]);

  // スポットライト非表示
  const hideSpotlight = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '0';
      setTimeout(() => {
        if (overlayRef.current) {
          overlayRef.current.remove();
          overlayRef.current = null;
        }
      }, 300);
    }
    enableAllElements();
    setTutorialState(prev => ({ ...prev, spotlightElement: null }));
  }, [enableAllElements]);

  // ユーザーアクションハンドラ
  const handleUserAction = useCallback((elementId: string, action: string) => {
    if (!tutorialState.isActive || !tutorialState.isWaitingForAction) return;

    const currentTask = tutorialState.tasks[tutorialState.currentStep];
    if (!currentTask || !currentTask.isInteractive) return;

    // 期待されるアクションをチェック
    if (currentTask.expectedAction === action && elementId === currentTask.targetElement) {
      // 成功処理
      if (currentTask.successMessage) {
        showSuccessEffect(currentTask.successMessage);
      }

      // タスク完了を記録
      setTutorialState(prev => ({
        ...prev,
        completedTasks: [...(prev.completedTasks || []), currentTask.id],
        isWaitingForAction: false,
      }));

      // 次のステップへ
      setTimeout(() => {
        nextStep();
      }, 2500);
    }
  }, [tutorialState, showSuccessEffect]);

  // チュートリアル開始
  const startTutorial = useCallback((type: TutorialType) => {
    const tasks = tutorialContent[type];
    setTutorialState({
      isActive: true,
      currentStep: 0,
      tasks,
      spotlightElement: null,
      isWaitingForAction: false,
      completedTasks: [],
      currentPhase: type === 'firstTime' ? 'solve' : undefined,
    });
  }, []);

  // 次のステップ
  const nextStep = useCallback(() => {
    setTutorialState(prev => {
      const nextIndex = prev.currentStep + 1;
      if (nextIndex >= prev.tasks.length) {
        return { ...prev, isActive: false };
      }
      return { 
        ...prev, 
        currentStep: nextIndex,
        isWaitingForAction: prev.tasks[nextIndex]?.isInteractive || false,
      };
    });
  }, []);

  // 前のステップ
  const previousStep = useCallback(() => {
    setTutorialState(prev => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  // チュートリアルスキップ
  const skipTutorial = useCallback(() => {
    setTutorialState(prev => ({ ...prev, isActive: false }));
    hideSpotlight();
  }, [hideSpotlight]);

  // チュートリアル完了
  const completeTutorial = useCallback(async () => {
    setTutorialState(prev => ({ ...prev, isActive: false }));
    hideSpotlight();
    
    // 初回起動完了を記録
    try {
      await AsyncStorage.setItem('tutorial_completed', 'true');
      setIsFirstTime(false);
    } catch (error) {
      console.error('Failed to save tutorial completion:', error);
    }
  }, [hideSpotlight]);

  // ステップ変更時のスポットライト更新
  useEffect(() => {
    if (tutorialState.isActive && tutorialState.tasks[tutorialState.currentStep]) {
      const task = tutorialState.tasks[tutorialState.currentStep];
      
      if (task.targetElement) {
        setTimeout(() => {
          showSpotlight(
            task.targetElement, 
            task.disableOtherElements && !task.highlightOnly
          );
        }, 300);
      } else {
        hideSpotlight();
      }

      // インタラクティブタスクの場合はアクション待機を開始
      if (task.isInteractive) {
        setTutorialState(prev => ({ ...prev, isWaitingForAction: true }));
      }
    }
  }, [tutorialState.currentStep, tutorialState.isActive, showSpotlight, hideSpotlight]);

  // イベントリスナー設定
  useEffect(() => {
    if (Platform.OS !== 'web' || !tutorialState.isWaitingForAction) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const element = target.closest('[id]') as HTMLElement;
      if (element && element.id) {
        handleUserAction(element.id, 'click');
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [tutorialState.isWaitingForAction, handleUserAction]);

  // 初回起動時の自動チュートリアル開始
  useEffect(() => {
    if (isFirstTime && Platform.OS === 'web') {
      setTimeout(() => {
        startTutorial('firstTime');
      }, 1000);
    }
  }, [isFirstTime, startTutorial]);

  return (
    <TutorialContext.Provider value={{
      tutorialState,
      startTutorial,
      nextStep,
      previousStep,
      skipTutorial,
      completeTutorial,
      handleUserAction,
      showSuccessEffect,
      showSpotlight,
      hideSpotlight,
      disableOtherElements,
      enableAllElements,
      isFirstTime,
      markFirstTimeComplete: completeTutorial,
    }}>
      {children}
    </TutorialContext.Provider>
  );
}
