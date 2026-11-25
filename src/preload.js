const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (apiId, apiHash) => ipcRenderer.invoke('config:set', { apiId, apiHash }),
  answer: (kind, value) => ipcRenderer.invoke('auth:answer', { kind, value }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  chats: () => ipcRenderer.invoke('chats:list'),
  messages: (chatId) => ipcRenderer.invoke('messages:get', chatId),
  send: (chatId, text) => ipcRenderer.invoke('messages:send', { chatId, text }),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, payload) => fn(payload)),
});
