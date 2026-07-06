import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { View } from 'react-native';
import LoadingScreen from '../app/LoadingScreen';
import RootLayout from './RootLayout';
import NotFound from './pages/NotFound';
import ProtectedRoute from '../app/auth/ProtectedRoute';

// Lazy load all screens for better performance
const HomeScreen = lazy(() => import('../app/index'));
const BrowseQuestionsScreen = lazy(() => import('../app/browse'));
const CalendarScreen = lazy(() => import('../app/calendar'));
const CreateQuestionScreen = lazy(() => import('../app/create'));
const CreditsScreen = lazy(() => import('../app/credits'));
const InboxScreen = lazy(() => import('../app/inbox'));
const DevModeScreen = lazy(() => import('../app/devmode'));
const FeedbackScreen = lazy(() => import('../app/feedback'));
const ManageTimerScreen = lazy(() => import('../app/manage'));
const MissionScreen = lazy(() => import('../app/mission'));
const MissionDetailScreen = lazy(() => import('../app/missionScreen'));
const MissionsScreen = lazy(() => import('../app/mission'));
const MultiScreen = lazy(() => import('../app/multi'));
const MusicScreen = lazy(() => import('../app/music'));
const ProfileScreen = lazy(() => import('../app/profile'));
const StatisticsScreen = lazy(() => import('../app/statistics'));
const QuizScreen = lazy(() => import('../app/quiz'));
const LoginScreen = lazy(() => import('../app/auth/loginScreen'));
const ReorderConfirmScreen = lazy(() => import('../app/reorderConfirm'));
const ResultsScreen = lazy(() => import('../app/results'));
const SettingsScreen = lazy(() => import('../app/settings'));
const ShopScreen = lazy(() => import('../app/shop'));
const TitleScreen = lazy(() => import('../app/title'));
const TitleListScreen = lazy(() => import('../app/titleScreen'));
const AppSettingsScreen = lazy(() => import('../app/appSettings'));
const GachaScreen = lazy(() => import('../app/gacha'));

const Loading = () => <LoadingScreen />;

export default function App() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });

      const handleControllerChange = () => {
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }

    const CURRENT_VERSION = '1.0.0';
    const cachedVersion = localStorage.getItem('app_version');

    if (cachedVersion && cachedVersion !== CURRENT_VERSION) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('app_version', CURRENT_VERSION);
      window.location.reload();
    } else if (!cachedVersion) {
      localStorage.setItem('app_version', CURRENT_VERSION);
    }
  }, []);

  return (
    <RootLayout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/credits" element={<CreditsScreen />} />
          <Route path="/title" element={<TitleScreen />} />
          <Route path="/titleScreen" element={<TitleListScreen />} />
          
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
          <Route path="/inbox" element={
            <ProtectedRoute>
              <InboxScreen />
            </ProtectedRoute>
          } />
          <Route path="/manage" element={
            <ProtectedRoute>
              <ManageTimerScreen />
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
              <MultiScreen />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RootLayout>
  );
}