import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAllTracksFromDB, saveTrackToDB, deleteTrackFromDB } from './musicDB';
import { SoundManager } from './sound';

export interface CustomTrack {
  id: string;
  name: string;
  url: string;
}

export interface CustomPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

interface CustomBGMContextType {
  // ライブラリ
  library: CustomTrack[];
  addFiles: (files: File[]) => Promise<{ duplicates: string[] }>;
  removeFromLibrary: (id: string) => void;

  // プレイリスト
  playlists: CustomPlaylist[];
  activePlaylistId: string | null;
  setActivePlaylistId: (id: string | null) => void;
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  getActiveTracks: () => CustomTrack[];

  // 再生（miniPlayerで使用）
  tracks: CustomTrack[]; // getActiveTracks()の結果をキャッシュ
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  play: (index?: number) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setSpeed: (s: number) => void;
  currentTrack: CustomTrack | null;

  // 重複警告
  duplicateWarning: string[];
  clearDuplicateWarning: () => void;
}

const CustomBGMContext = createContext<CustomBGMContextType | null>(null);

export function useCustomBGM() {
  const ctx = useContext(CustomBGMContext);
  if (!ctx) throw new Error('useCustomBGM must be used within CustomBGMProvider');
  return ctx;
}

const PLAYLIST_KEY = 'music_playlists_meta';

export function CustomBGMProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<CustomTrack[]>([]);
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1.0);
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialized = useRef(false);

  // 初回起動時にIndexedDBとAsyncStorageから復元
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // BGMコンテキストからカスタムBGMを停止できるようにコールバック登録
    if (typeof window !== 'undefined') {
      (window as any).__stopCustomBGM = () => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.onended = null;
        audioRef.current = null;
        setIsPlaying(false);
        setCurrentIndex(0);
      };
    }

    if (Platform.OS === 'web') {
      loadAllTracksFromDB().then(saved => {
        const restored: CustomTrack[] = saved.map(t => ({
          id: t.id,
          name: t.name,
          url: URL.createObjectURL(t.blob),
        }));
        setLibrary(restored);
      }).catch(() => {});
    }

    AsyncStorage.getItem(PLAYLIST_KEY).then(raw => {
      if (raw) setPlaylists(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  const savePlaylists = async (pls: CustomPlaylist[]) => {
    setPlaylists(pls);
    await AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(pls));
  };

  // ─── ライブラリ ───
  const addFiles = useCallback(async (files: File[]): Promise<{ duplicates: string[] }> => {
    const duplicates: string[] = [];
    const newTracks: CustomTrack[] = [];

    for (const file of files) {
      // 重複チェック（ファイル名で判定）
      const alreadyExists = library.some(t => t.name === file.name);
      if (alreadyExists) {
        duplicates.push(file.name);
        continue;
      }
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(file);
      newTracks.push({ id, name: file.name, url });
      // IndexedDBに自動保存
      await saveTrackToDB(id, file.name, file).catch(() => {});
    }

    if (newTracks.length > 0) {
      setLibrary(prev => [...prev, ...newTracks]);
    }
    if (duplicates.length > 0) {
      setDuplicateWarning(duplicates);
    }
    return { duplicates };
  }, [library]);

  const removeFromLibrary = useCallback((id: string) => {
    // 再生中のトラックが削除される場合は停止
    if (audioRef.current) {
      const currentSrc = audioRef.current.src;
      // 削除対象のURLと一致する場合は停止
      setLibrary(prev => {
        const track = prev.find(f => f.id === id);
        if (track && currentSrc.includes(track.id)) {
          audioRef.current?.pause();
          audioRef.current!.onended = null;
          audioRef.current = null;
          setIsPlaying(false);
        }
        return prev.filter(f => f.id !== id);
      });
    } else {
      setLibrary(prev => prev.filter(f => f.id !== id));
    }
    setPlaylists(prev => {
      const updated = prev.map(pl => ({
        ...pl,
        trackIds: pl.trackIds.filter(tid => tid !== id),
      }));
      AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
      return updated;
    });
    if (Platform.OS === 'web') deleteTrackFromDB(id).catch(() => {});
  }, []);

  const clearDuplicateWarning = useCallback(() => setDuplicateWarning([]), []);

  // ─── プレイリスト ───
  const createPlaylist = useCallback((name: string) => {
    const pl: CustomPlaylist = { id: Date.now().toString(), name, trackIds: [] };
    setPlaylists(prev => {
      const updated = [...prev, pl];
      AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
      return updated;
    });
    setActivePlaylistId(pl.id);
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists(prev => {
      const updated = prev.filter(pl => pl.id !== id);
      AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
      return updated;
    });
    setActivePlaylistId(prev => prev === id ? null : prev);
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const updated = prev.map(pl =>
        pl.id === playlistId && !pl.trackIds.includes(trackId)
          ? { ...pl, trackIds: [...pl.trackIds, trackId] }
          : pl
      );
      AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const updated = prev.map(pl =>
        pl.id === playlistId
          ? { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId) }
          : pl
      );
      AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(updated));

      // 再生中のプレイリストからトラックが削除された場合
      if (playlistId === activePlaylistId) {
        const updatedPl = updated.find(p => p.id === playlistId);
        if (updatedPl) {
          // 削除後のトラック数が0になったら停止
          if (updatedPl.trackIds.length === 0) {
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.onended = null;
            audioRef.current = null;
            setIsPlaying(false);
            setCurrentIndex(0);
          }
          // 現在のインデックスが範囲外になった場合は先頭に戻す
          else if (currentIndex >= updatedPl.trackIds.length) {
            setCurrentIndex(0);
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.onended = null;
            audioRef.current = null;
            setIsPlaying(false);
          }
        }
      }

      return updated;
    });
  }, [activePlaylistId, currentIndex]);

  const getActiveTracks = useCallback((): CustomTrack[] => {
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return [];
    return pl.trackIds
      .map(id => library.find(f => f.id === id))
      .filter(Boolean) as CustomTrack[];
  }, [playlists, activePlaylistId, library]);

  // ─── 再生 ───
  const playIndex = useCallback((index: number, trackList?: CustomTrack[]) => {
    const list = trackList ?? getActiveTracks();
    if (!list[index] || Platform.OS !== 'web') return;
    // 同じ曲が既に再生中なら何もしない（重複防止）
    if (
      audioRef.current &&
      !audioRef.current.paused &&
      audioRef.current.src === list[index].url
    ) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    // カスタムBGM再生時はプリセットBGMを停止してOFFに切り替え
    SoundManager.pauseBGM().catch(() => {});
    // bgmContextのON/OFF状態も更新（SoundManager含めて完全にOFF）
    if (typeof window !== 'undefined') {
      (window as any).__customBGMPlaying = true;
      (window as any).__bgmToggleOff?.();
    }

    const audio = new (window as any).Audio(list[index].url);
    audio.playbackRate = speed;
    audio.loop = false;
    audio.onended = () => {
      // onended時に最新のトラックリストを取得（削除対応）
      const currentTracks = getActiveTracks();
      if (currentTracks.length === 0) {
        // トラックが全て削除された場合は停止
        setIsPlaying(false);
        audioRef.current = null;
        return;
      }
      const next = (index + 1) % currentTracks.length;
      setCurrentIndex(next);
      playIndex(next, currentTracks);
    };
    audioRef.current = audio;
    audio.play().catch(() => {});
    setCurrentIndex(index);
    setIsPlaying(true);
  }, [getActiveTracks, speed]);

  const play = useCallback((index?: number) => {
    const tracks = getActiveTracks();
    if (tracks.length === 0) return;
    if (index === undefined) {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else if (!audioRef.current) {
        playIndex(currentIndex);
      }
    } else {
      playIndex(index);
    }
  }, [getActiveTracks, currentIndex, playIndex]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    if (typeof window !== 'undefined') {
      (window as any).__customBGMPlaying = false;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const next = useCallback(() => {
    const tracks = getActiveTracks();
    if (!tracks.length) return;
    const n = (currentIndex + 1) % tracks.length;
    playIndex(n);
  }, [getActiveTracks, currentIndex, playIndex]);

  const prev = useCallback(() => {
    const tracks = getActiveTracks();
    if (!tracks.length) return;
    const p = (currentIndex - 1 + tracks.length) % tracks.length;
    playIndex(p);
  }, [getActiveTracks, currentIndex, playIndex]);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }, []);

  const activeTracks = getActiveTracks();
  const currentTrack = activeTracks[currentIndex] ?? null;

  return (
    <CustomBGMContext.Provider value={{
      library, addFiles, removeFromLibrary,
      playlists, activePlaylistId, setActivePlaylistId,
      createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, getActiveTracks,
      tracks: activeTracks,
      currentIndex, isPlaying, speed,
      play, pause, togglePlay, next, prev, setSpeed,
      currentTrack,
      duplicateWarning, clearDuplicateWarning,
    }}>
      {children}
    </CustomBGMContext.Provider>
  );
}
