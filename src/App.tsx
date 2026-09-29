import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { View, Text, TouchableOpacity } from 'react-native';
import LoadingScreen from '../app/LoadingScreen';
import RootLayout from './RootLayout';
import NotFound from './pages/NotFound';
import ProtectedRoute from '../app/auth/ProtectedRoute';
import { CURRENT_APP_VERSION } from './config/version';
import { auth } from './config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { syncLoginStreak } from './utils/userProgress';
import { STORAGE_KEYS } from '../app/constants/storageKeys';
import { Sparkles } from 'lucide-react';
import BottomNavBar from '../app/BottomNavBar';
// 遷移ラグ解消（P1-6）：クイズ設定画面は遅延ロードせずバンドルに含める
import QuizScreen from '../app/quiz';

// キャッシュ不整合によるChunkLoadErrorを自動検知してリロードする安全なlazy loading
const safeLazy = (importFn: () => Promise<any>) => {
  return lazy(() =>
    importFn().catch((error) => {
      if (error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk')) {
        console.log('古いキャッシュを検知したため、最新版に自動リロードします。');
        window.location.reload();
      }
      throw error;
    })
  );
};

// Lazy load all screens for better performance
const HomeScreen = safeLazy(() => import('../app/index'));
const BrowseQuestionsScreen = safeLazy(() => import('../app/browse'));
const CalendarScreen = safeLazy(() => import('../app/calendar'));
const CreateQuestionScreen = safeLazy(() => import('../app/create'));
const CreateHubScreen = safeLazy(() => import('../app/createHub'));
const CreditsScreen = safeLazy(() => import('../app/credits'));
const DevModeScreen = safeLazy(() => import('../app/devmode'));
const FeedbackScreen = safeLazy(() => import('../app/feedback'));
const TimerSettingsScreen = safeLazy(() => import('../app/timer'));
const MissionScreen = safeLazy(() => import('../app/mission'));
const MissionDetailScreen = safeLazy(() => import('../app/missionScreen'));
const MissionsScreen = safeLazy(() => import('../app/mission'));
const MultiScreen = safeLazy(() => import('../app/multi'));
const MultiHubScreen = safeLazy(() => import('../app/multiHub'));
const PublicQuestionsScreen = safeLazy(() => import('../app/publicQuestions'));
const MusicScreen = safeLazy(() => import('../app/music'));
const ProfileScreen = safeLazy(() => import('../app/profile'));
const StatisticsScreen = safeLazy(() => import('../app/statistics'));
// QuizScreen は上部で静的 import に変更（遷移ラグ解消：lazy解除）
const LoginScreen = safeLazy(() => import('../app/auth/loginScreen'));
const ReorderConfirmScreen = safeLazy(() => import('../app/reorderConfirm'));
const ResultsScreen = safeLazy(() => import('../app/results'));
const SettingsScreen = safeLazy(() => import('../app/settings'));
const ShopScreen = safeLazy(() => import('../app/shop'));
const AchievementsScreen = safeLazy(() => import('../app/achievements'));
const BattleScreen = safeLazy(() => import('../app/battle'));
const BattleLobbyScreen = safeLazy(() => import('../app/battleLobby'));
const TitleScreen = safeLazy(() => import('../app/title'));
const AppSettingsScreen = safeLazy(() => import('../app/appSettings'));
const SubHubScreen = safeLazy(() => import('../app/subHub'));
const GachaScreen = safeLazy(() => import('../app/gacha'));

const Loading = () => <LoadingScreen />;

// Suspense フォールバックを即座に出さないことで、キャッシュ済み/高速な遷移のちらつきを防止する
// （遅延表示＝React.lazy のチャンク取得が完了すればタイマー破棄→ローダーは一切表示されない）
const SUSPENSE_FALLBACK_DELAY = 300;
const SuspenseFallback = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), SUSPENSE_FALLBACK_DELAY);
    return () => clearTimeout(t);
  }, []);
  return show ? <Loading /> : null;
};

export default function App() {
  const [showUpdatePrompt, setShowUpdatePrompt] = React.useState(false);
  const updateAvailableRef = React.useRef(false);

  useEffect(() => {
    // マウントから500ms後にアップデート確認（Safari等のフォーカスイベントとの競合を回避）
    const timer = setTimeout(() => {
      if (updateAvailableRef.current) {
        setShowUpdatePrompt(true);
      }
    }, 500);

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });

      const handleControllerChange = () => {
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      // Service Workerからの更新メッセージをリッスン
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
          // フラグのみ保存し、表示タイミングはマウント時のタイマーに任せる
          updateAvailableRef.current = true;
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      return () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }

    const cachedVersion = localStorage.getItem('app_version');

    if (cachedVersion && cachedVersion !== CURRENT_APP_VERSION) {
      // プロフィール画像は AsyncStorage (Web では localStorage) にしか存在しないため、
      // バージョン更新時のクリアで失われないように退避してから復元する
      const localProfileImage = localStorage.getItem(STORAGE_KEYS.USER_PROFILE_IMAGE);
      localStorage.clear();
      sessionStorage.clear();
      if (localProfileImage) {
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE_IMAGE, localProfileImage);
      }
      localStorage.setItem('app_version', CURRENT_APP_VERSION);
      window.location.reload();
    } else if (!cachedVersion) {
      localStorage.setItem('app_version', CURRENT_APP_VERSION);
    }

    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser?.uid) {
        void syncLoginStreak(currentUser.uid);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <RootLayout>
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/credits" element={<CreditsScreen />} />
          <Route path="/title" element={<TitleScreen />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <HomeScreen />
            </ProtectedRoute>
          } />
          <Route path="/browse" element={
            <ProtectedRoute>
              <BrowseQuestionsScreen />
            </ProtectedRoute>
          } />
          <Route path="/calendar" element={
            <ProtectedRoute>
              <CalendarScreen />
            </ProtectedRoute>
          } />
          <Route path="/create" element={
            <ProtectedRoute>
              <CreateHubScreen />
            </ProtectedRoute>
          } />
          <Route path="/create/manual" element={
            <ProtectedRoute>
              <CreateQuestionScreen />
            </ProtectedRoute>
          } />
          <Route path="/create/ocr" element={
            <ProtectedRoute>
              <CreateQuestionScreen />
            </ProtectedRoute>
          } />
          <Route path="/devmode" element={
            <ProtectedRoute>
              <DevModeScreen />
            </ProtectedRoute>
          } />
          <Route path="/feedback" element={
            <ProtectedRoute>
              <FeedbackScreen />
            </ProtectedRoute>
          } />
          <Route path="/inbox" element={<Navigate to="/multi/share" replace />} />
          <Route path="/timer" element={
            <ProtectedRoute>
              <TimerSettingsScreen />
            </ProtectedRoute>
          } />
          <Route path="/mission" element={
            <ProtectedRoute>
              <MissionScreen />
            </ProtectedRoute>
          } />
          <Route path="/missions" element={
            <ProtectedRoute>
              <MissionsScreen />
            </ProtectedRoute>
          } />
          <Route path="/missionScreen" element={
            <ProtectedRoute>
              <MissionDetailScreen />
            </ProtectedRoute>
          } />
          <Route path="/multi" element={
            <ProtectedRoute>
              <MultiHubScreen />
            </ProtectedRoute>
          } />
          <Route path="/multi/share" element={
            <ProtectedRoute>
              <MultiScreen />
            </ProtectedRoute>
          } />
          <Route path="/multi/public" element={
            <ProtectedRoute>
              <PublicQuestionsScreen />
            </ProtectedRoute>
          } />
          <Route path="/music" element={
            <ProtectedRoute>
              <MusicScreen />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfileScreen />
            </ProtectedRoute>
          } />
          <Route path="/statistics" element={
            <ProtectedRoute>
              <StatisticsScreen />
            </ProtectedRoute>
          } />
          <Route path="/quiz" element={
            <ProtectedRoute>
              <QuizScreen />
            </ProtectedRoute>
          } />
          <Route path="/reorderConfirm" element={
            <ProtectedRoute>
              <ReorderConfirmScreen />
            </ProtectedRoute>
          } />
          <Route path="/results" element={
            <ProtectedRoute>
              <ResultsScreen />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <SettingsScreen />
            </ProtectedRoute>
          } />
          <Route path="/shop" element={
            <ProtectedRoute>
              <ShopScreen />
            </ProtectedRoute>
          } />
          <Route path="/sub" element={
            <ProtectedRoute>
              <SubHubScreen />
            </ProtectedRoute>
          } />
          <Route path="/appSettings" element={
            <ProtectedRoute>
              <AppSettingsScreen />
            </ProtectedRoute>
          } />
          <Route path="/gacha" element={
            <ProtectedRoute>
              <GachaScreen />
            </ProtectedRoute>
          } />
          <Route path="/achievements" element={
            <ProtectedRoute>
              <AchievementsScreen />
            </ProtectedRoute>
          } />
          <Route path="/battle/:roomId" element={
            <ProtectedRoute>
              <BattleScreen />
            </ProtectedRoute>
          } />
          <Route path="/battle" element={
            <ProtectedRoute>
              <BattleLobbyScreen />
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <BottomNavBar />
      </Suspense>

      {/* 更新通知モーダル */}
      {showUpdatePrompt && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            padding: 32,
            width: '90%',
            maxWidth: 400,
            alignItems: 'center',
          }}>
            <Sparkles size={48} color="#FFB020" style={{ marginBottom: 16 }} />
            <Text style={{
              fontSize: 22,
              fontWeight: 'bold',
              color: '#1A1A1A',
              marginBottom: 12,
              textAlign: 'center',
            }}>
              新しいバージョンがあります
            </Text>
            <Text style={{
              fontSize: 15,
              color: '#666',
              marginBottom: 24,
              textAlign: 'center',
              lineHeight: 22,
            }}>
              最新版をダウンロードしました。<br/>ボタンをタップして更新してください。
            </Text>
            <TouchableOpacity
              onPress={handleUpdate}
              style={{
                backgroundColor: '#007AFF',
                paddingVertical: 16,
                paddingHorizontal: 32,
                borderRadius: 12,
                width: '100%',
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: '#fff',
                fontSize: 16,
                fontWeight: 'bold',
              }}>
                今すぐ更新
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </RootLayout>
  );
}
