import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getTaskCompletionSoundSettings, getTaskFailureSoundSettings, type TaskCompletionSoundSettings, type TaskFailureSoundSettings } from '../services/api';
import {
  isCompletionSoundEligibleNodeType,
  playTaskFailureSound,
  playTaskCompletionSound,
  primeTaskCompletionSoundAudio,
  resolveCompletionSoundNodeType,
  shouldNotifyCompletionSoundForNodeType,
} from '../utils/taskCompletionSound';

const completionSoundNodeTypes = new Map<string, string>();
const TASK_COMPLETION_SOUND_SETTINGS_TTL_MS = 30_000;
const DEFAULT_TASK_COMPLETION_SOUND_SETTINGS: TaskCompletionSoundSettings = { mode: 'default', url: '' };
const DEFAULT_TASK_FAILURE_SOUND_SETTINGS: TaskFailureSoundSettings = { mode: 'default', url: '' };

interface TaskCompletionSoundState {
  enabled: boolean;
  lastPlayedAt: number;
  lastFailurePlayedAt: number;
  soundSettings: TaskCompletionSoundSettings;
  failureSoundSettings: TaskFailureSoundSettings;
  soundSettingsLoadedAt: number;
  failureSoundSettingsLoadedAt: number;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  loadSoundSettings: (force?: boolean) => Promise<TaskCompletionSoundSettings>;
  loadFailureSoundSettings: (force?: boolean) => Promise<TaskFailureSoundSettings>;
  primeAudio: () => void;
  notifyComplete: (nodeId: string, fallbackNodeType?: string, now?: number) => void;
  notifyFailure: (nodeId: string, fallbackNodeType?: string, now?: number) => void;
}

export function registerTaskCompletionSoundNode(nodeId: string, nodeType?: string | null): () => void {
  if (nodeId && isCompletionSoundEligibleNodeType(nodeType)) {
    completionSoundNodeTypes.set(nodeId, String(nodeType));
  } else {
    completionSoundNodeTypes.delete(nodeId);
  }
  return () => {
    completionSoundNodeTypes.delete(nodeId);
  };
}

export const useTaskCompletionSoundStore = create<TaskCompletionSoundState>()(
  persist(
    (set, get) => ({
      enabled: true,
      lastPlayedAt: 0,
      lastFailurePlayedAt: 0,
      soundSettings: DEFAULT_TASK_COMPLETION_SOUND_SETTINGS,
      failureSoundSettings: DEFAULT_TASK_FAILURE_SOUND_SETTINGS,
      soundSettingsLoadedAt: 0,
      failureSoundSettingsLoadedAt: 0,
      setEnabled: (enabled) => set({ enabled }),
      toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
      loadSoundSettings: async (force = false) => {
        const state = get();
        const now = Date.now();
        if (!force && state.soundSettingsLoadedAt > 0 && now - state.soundSettingsLoadedAt < TASK_COMPLETION_SOUND_SETTINGS_TTL_MS) {
          return state.soundSettings || DEFAULT_TASK_COMPLETION_SOUND_SETTINGS;
        }
        try {
          const soundSettings = await getTaskCompletionSoundSettings();
          set({ soundSettings: soundSettings || DEFAULT_TASK_COMPLETION_SOUND_SETTINGS, soundSettingsLoadedAt: now });
          return soundSettings || DEFAULT_TASK_COMPLETION_SOUND_SETTINGS;
        } catch (error) {
          console.warn('[task-completion-sound] unable to load custom sound settings', error);
          return get().soundSettings || DEFAULT_TASK_COMPLETION_SOUND_SETTINGS;
        }
      },
      loadFailureSoundSettings: async (force = false) => {
        const state = get();
        const now = Date.now();
        if (!force && state.failureSoundSettingsLoadedAt > 0 && now - state.failureSoundSettingsLoadedAt < TASK_COMPLETION_SOUND_SETTINGS_TTL_MS) {
          return state.failureSoundSettings || DEFAULT_TASK_FAILURE_SOUND_SETTINGS;
        }
        try {
          const failureSoundSettings = await getTaskFailureSoundSettings();
          set({ failureSoundSettings: failureSoundSettings || DEFAULT_TASK_FAILURE_SOUND_SETTINGS, failureSoundSettingsLoadedAt: now });
          return failureSoundSettings || DEFAULT_TASK_FAILURE_SOUND_SETTINGS;
        } catch (error) {
          console.warn('[task-failure-sound] unable to load custom sound settings', error);
          return get().failureSoundSettings || DEFAULT_TASK_FAILURE_SOUND_SETTINGS;
        }
      },
      primeAudio: () => {
        if (!get().enabled) return;
        void get().loadSoundSettings().then((soundSettings) => primeTaskCompletionSoundAudio(soundSettings)).catch((error) => {
          console.warn('[task-completion-sound] unable to prime audio', error);
        });
        void get().loadFailureSoundSettings().then((soundSettings) => primeTaskCompletionSoundAudio(soundSettings)).catch((error) => {
          console.warn('[task-failure-sound] unable to prime audio', error);
        });
      },
      notifyComplete: (nodeId, fallbackNodeType, now = Date.now()) => {
        const state = get();
        const nodeType = resolveCompletionSoundNodeType(completionSoundNodeTypes.get(nodeId), fallbackNodeType);
        if (!shouldNotifyCompletionSoundForNodeType(state, nodeType, now)) return;
        set({ lastPlayedAt: now });
        void get().loadSoundSettings().then((soundSettings) => playTaskCompletionSound(soundSettings)).catch((error) => {
          console.warn('[task-completion-sound] unable to play completion tone', error);
        });
      },
      notifyFailure: (nodeId, fallbackNodeType, now = Date.now()) => {
        const state = get();
        const nodeType = resolveCompletionSoundNodeType(completionSoundNodeTypes.get(nodeId), fallbackNodeType);
        if (!shouldNotifyCompletionSoundForNodeType({ enabled: state.enabled, lastPlayedAt: state.lastFailurePlayedAt }, nodeType, now)) return;
        set({ lastFailurePlayedAt: now });
        void get().loadFailureSoundSettings().then((soundSettings) => playTaskFailureSound(soundSettings)).catch((error) => {
          console.warn('[task-failure-sound] unable to play failure tone', error);
        });
      },
    }),
    {
      name: 't8-task-completion-sound',
      partialize: (state) => ({ enabled: state.enabled }),
      merge: (persisted, current) => ({
        ...current,
        ...((persisted || {}) as Partial<TaskCompletionSoundState>),
        lastPlayedAt: 0,
        lastFailurePlayedAt: 0,
        soundSettings: DEFAULT_TASK_COMPLETION_SOUND_SETTINGS,
        failureSoundSettings: DEFAULT_TASK_FAILURE_SOUND_SETTINGS,
        soundSettingsLoadedAt: 0,
        failureSoundSettingsLoadedAt: 0,
      }),
    },
  ),
);

export const taskCompletionSound = {
  primeAudio: () => useTaskCompletionSoundStore.getState().primeAudio(),
  notifyComplete: (nodeId: string, fallbackNodeType?: string, now?: number) =>
    useTaskCompletionSoundStore.getState().notifyComplete(nodeId, fallbackNodeType, now),
  notifyFailure: (nodeId: string, fallbackNodeType?: string, now?: number) =>
    useTaskCompletionSoundStore.getState().notifyFailure(nodeId, fallbackNodeType, now),
  refreshSettings: () => Promise.all([
    useTaskCompletionSoundStore.getState().loadSoundSettings(true),
    useTaskCompletionSoundStore.getState().loadFailureSoundSettings(true),
  ]),
};
