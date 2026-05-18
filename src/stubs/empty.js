// Stub module for native-only React Native packages

// Expo AV
export const Audio = {
  Sound: class Sound {
    static createAsync() { return Promise.resolve({ sound: new Sound(), status: {} }); }
    playAsync() { return Promise.resolve(); }
    playFromPositionAsync() { return Promise.resolve(); }
    pauseAsync() { return Promise.resolve(); }
    stopAsync() { return Promise.resolve(); }
    unloadAsync() { return Promise.resolve(); }
    setVolumeAsync() { return Promise.resolve(); }
    setIsLoopingAsync() { return Promise.resolve(); }
    getStatusAsync() { return Promise.resolve({ isLoaded: true }); }
    setOnPlaybackStatusUpdate() {}
  },
  setAudioModeAsync() { return Promise.resolve(); },
  setIsEnabledAsync() { return Promise.resolve(); },
  Recording: {
    createAsync() { return Promise.resolve({ recording: { startAsync() {}, stopAndUnloadAsync() {}, getURI() { return null; } }, status: {} }); },
    setOnRecordingStatusUpdate() {},
  },
};

// Expo Notifications
export const scheduleNotificationAsync = () => Promise.resolve('');
export const cancelScheduledNotificationAsync = () => Promise.resolve();
export const requestPermissionsAsync = () => Promise.resolve({ granted: false });
export const getExpoPushTokenAsync = () => Promise.resolve({ data: '' });
export const setNotificationChannelAsync = () => Promise.resolve();
export const addNotificationReceivedListener = () => ({ remove() {} });
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const IOSAuthorizationStatus = { AUTHORIZED: 1, DENIED: 2, NOT_DETERMINED: 0 };
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, NONE: 0 };

// Expo Status Bar
export const StatusBar = () => null;
export const setStatusBarStyle = () => {};

// Expo Modules
export default {};
