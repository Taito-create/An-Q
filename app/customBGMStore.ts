// セッション中のカスタムBGM状態を保持するグローバルストア
// ファイル本体はBlobURLでセッション中のみ管理（AsyncStorageには保存しない）

export interface LibraryTrack {
  id: string;       // ユニークID
  name: string;     // ファイル名
  url: string;      // BlobURL（セッション中のみ有効）
}

export interface PlaylistItem {
  trackId: string;  // LibraryTrackのid
  name: string;     // 表示名（変更可能）
}

export interface CustomPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
}

interface Store {
  library: LibraryTrack[];
  playlists: CustomPlaylist[];
  activePlaylistId: string | null;
  currentTrackIndex: number;
  isPlaying: boolean;
  speed: number;
  audio: HTMLAudioElement | null;
}

const store: Store = {
  library: [],
  playlists: [],
  activePlaylistId: null,
  currentTrackIndex: 0,
  isPlaying: false,
  speed: 1.0,
  audio: null,
};

export const BGMStore = {
  get: () => store,
  setLibrary: (v: LibraryTrack[]) => { store.library = v; },
  setPlaylists: (v: CustomPlaylist[]) => { store.playlists = v; },
  setActivePlaylist: (id: string | null) => { store.activePlaylistId = id; },
  setCurrentIndex: (i: number) => { store.currentTrackIndex = i; },
  setIsPlaying: (v: boolean) => { store.isPlaying = v; },
  setSpeed: (v: number) => { store.speed = v; },
  setAudio: (a: HTMLAudioElement | null) => { store.audio = a; },

  // アクティブプレイリストのトラック一覧を取得
  getActiveTracks(): LibraryTrack[] {
    const pl = store.playlists.find(p => p.id === store.activePlaylistId);
    if (!pl) return [];
    return pl.items
      .map(item => store.library.find(t => t.id === item.trackId))
      .filter(Boolean) as LibraryTrack[];
  },
};
