'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Safe IPC wrapper ─────────────────────────────────────────
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// ── Exposed API ──────────────────────────────────────────────
contextBridge.exposeInMainWorld('em', {

  // Window controls
  window: {
    minimize:    ()  => invoke('window:minimize'),
    maximize:    ()  => invoke('window:maximize'),
    close:       ()  => invoke('window:close'),
    isMaximized: ()  => invoke('window:isMaximized')
  },

  // Exercises — reads exercises.json from disk via main process
  exercises: {
    getAll: () => invoke('exercises:getAll')
  },

  // Persistent preferences via electron-store
  store: {
    get:    (key)        => invoke('store:get', key),
    set:    (key, value) => invoke('store:set', key, value),
    getAll: ()           => invoke('store:getAll')
  },

  // Shell
  shell: {
    openExternal: (url) => invoke('shell:openExternal', url)
  },

  // Ollama Integration
  ollama: {
    isOnline:         ()       => invoke('ollama:isOnline'),
    getModels:        ()       => invoke('ollama:getModels'),
    explain:          (params) => invoke('ollama:explain', params),
    checkTranslation: (params) => invoke('ollama:checkTranslation', params)
  }
});
