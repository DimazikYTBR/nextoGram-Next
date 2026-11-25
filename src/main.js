const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

// ---------- хранилище настроек и сессии (в папке данных приложения) ----------
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
function loadCfg() {
  try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { return {}; }
}
function saveCfg(cfg) {
  fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
  fs.writeFileSync(cfgPath(), JSON.stringify(cfg));
}

let win = null;
let client = null;
const peers = new Map();   // id чата -> inputEntity
const waiting = {};        // ожидание ответа от окна (телефон / код / пароль)

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

const ask = (kind) => new Promise((resolve) => {
  waiting[kind] = resolve;
  send('auth:need', kind);
});

const ser = (m) => ({
  id: m.id,
  text: m.message || (m.media ? '[вложение]' : ''),
  out: !!m.out,
  date: m.date,
});

// ---------- подключение к Telegram ----------
async function connect() {
  const cfg = loadCfg();
  if (!cfg.apiId || !cfg.apiHash) { send('auth:need', 'api'); return; }

  client = new TelegramClient(
    new StringSession(cfg.session || ''),
    Number(cfg.apiId),
    cfg.apiHash,
    { connectionRetries: 5 }
  );

  try {
    await client.start({
      phoneNumber: () => ask('phone'),
      phoneCode: () => ask('code'),
      password: () => ask('password'),
      onError: (e) => { send('auth:error', String(e.message || e)); return false; },
    });
  } catch (e) {
    send('auth:error', String(e.message || e));
    return;
  }

  cfg.session = client.session.save();
  saveCfg(cfg);

  client.addEventHandler((event) => {
    const m = event.message;
    send('message:new', { chatId: String(event.chatId), msg: ser(m) });
  }, new NewMessage({}));

  send('auth:ok');
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => {
  const { apiId, apiHash } = loadCfg();
  return { hasConfig: !!(apiId && apiHash) };
});

ipcMain.handle('config:set', (_e, { apiId, apiHash }) => {
  const cfg = loadCfg();
  cfg.apiId = String(apiId).trim();
  cfg.apiHash = String(apiHash).trim();
  saveCfg(cfg);
  connect();
});

ipcMain.handle('auth:answer', (_e, { kind, value }) => {
  if (waiting[kind]) { waiting[kind](value); delete waiting[kind]; }
});

ipcMain.handle('auth:logout', async () => {
  try { if (client) await client.invoke(new (require('telegram').Api.auth.LogOut)()); } catch {}
  const cfg = loadCfg();
  delete cfg.session;
  saveCfg(cfg);
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('chats:list', async () => {
  const dialogs = await client.getDialogs({ limit: 60 });
  return dialogs.map((d) => {
    peers.set(String(d.id), d.inputEntity);
    return {
      id: String(d.id),
      title: d.title || 'Без названия',
      last: d.message?.message || (d.message?.media ? '[вложение]' : ''),
      unread: d.unreadCount || 0,
      date: d.date || 0,
    };
  });
});

ipcMain.handle('messages:get', async (_e, chatId) => {
  const list = await client.getMessages(peers.get(chatId), { limit: 50 });
  try { await client.markAsRead(peers.get(chatId)); } catch {}
  return list.reverse().map(ser);
});

ipcMain.handle('messages:send', async (_e, { chatId, text }) => {
  const m = await client.sendMessage(peers.get(chatId), { message: text });
  return ser(m);
});

// ---------- окно ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 480,
    backgroundColor: '#0e1621',
    title: 'NextoGram',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', connect);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
