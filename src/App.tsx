import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ActivityIndicator, View } from 'react-native';
import RootLayout from './RootLayout';
import NotFound from './pages/NotFound';

// Lazy load all screens for better performance
const HomeScreen = lazy(() => import('../app/index'));
const BrowseQuestionsScreen = lazy(() => import('../app/browse'));
const CalendarScreen = lazy(() => import('../app/calendar'));
const CreateQuestionScreen = lazy(() => import('../app/create'));
const CreditsScreen = lazy(() => import('../app/credits'));
const DevModeScreen = lazy(() => import('../app/devmode'));
const FeedbackScreen = lazy(() => import('../app/feedback'));
const ManageTimerScreen = lazy(() => import('../app/manage'));
const MissionScreen = lazy(() => import('../app/mission'));
const MissionDetailScreen = lazy(() => import('../app/missionScreen'));
const MusicScreen = lazy(() => import('../app/music'));
const QuizScreen = lazy(() => import('../app/quiz'));
const ReorderConfirmScreen = lazy(() => import('../app/reorderConfirm'));
const ResultsScreen = lazy(() => import('../app/results'));
const SettingsScreen = lazy(() => import('../app/settings'));
const ShopScreen = lazy(() => import('../app/shop'));
const TitleScreen = lazy(() => import('../app/title'));
const TitleListScreen = lazy(() => import('../app/titleScreen'));
const AppSettingsScreen = lazy(() => import('../app/appSettings'));

const Loading = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
);

export default function App() {
  return (
    <RootLayout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/browse" element={<BrowseQuestionsScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/create" element={<CreateQuestionScreen />} />
          <Route path="/credits" element={<CreditsScreen />} />
          <Route path="/devmode" element={<DevModeScreen />} />
          <Route path="/feedback" element={<FeedbackScreen />} />
          <Route path="/manage" element={<ManageTimerScreen />} />
          <Route path="/mission" element={<MissionScreen />} />
          <Route path="/missionScreen" element={<MissionDetailScreen />} />
          <Route path="/music" element={<MusicScreen />} />
          <Route path="/quiz" element={<QuizScreen />} />
          <Route path="/reorderConfirm" element={<ReorderConfirmScreen />} />
          <Route path="/results" element={<ResultsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/shop" element={<ShopScreen />} />
          <Route path="/title" element={<TitleScreen />} />
          <Route path="/titleScreen" element={<TitleListScreen />} />
          <Route path="/appSettings" element={<AppSettingsScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RootLayout>
  );
}