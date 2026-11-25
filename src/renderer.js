const $ = (id) => document.getElementById(id);

let currentChat = null;
let chatsCache = [];

// ---------- вход ----------
const STEPS = {
  api: {
    title: 'Данные приложения Telegram',
    hint: 'Получи api_id и api_hash на my.telegram.org → API development tools.',
    fields: [['apiId', 'api_id', 'text'], ['apiHash', 'api_hash', 'text']],
    submit: (v) => window.api.setConfig(v.apiId, v.apiHash),
  },
  phone: {
    title: 'Введи номер телефона',
    hint: 'В формате +79991234567',
    fields: [['phone', 'Номер телефона', 'tel']],
    submit: (v) => window.api.answer('phone', v.phone),
  },
  code: {
    title: 'Код из Telegram',
    hint: 'Код придёт в Telegram на другом устройстве или по SMS.',
    fields: [['code', 'Код', 'text']],
    submit: (v) => window.api.answer('code', v.code),
  },
  password: {
    title: 'Облачный пароль',
    hint: 'Двухфакторная защита включена на твоём аккаунте.',
    fields: [['password', 'Пароль', 'password']],
    submit: (v) => window.api.answer('password', v.password),
  },
};

function showStep(kind) {
  const step = STEPS[kind];
  if (!step) return;
  $('app').classList.remove('on');
  $('login').style.display = 'flex';
  $('step-title').textContent = step.title;
  $('hint').textContent = step.hint;
  $('err').textContent = '';

  const box = $('fields');
  box.textContent = '';
  const form = document.createElement('form');
  const inputs = {};
  step.fields.forEach(([name, ph, type]) => {
    const i = document.createElement('input');
    i.placeholder = ph; i.type = type; i.autocomplete = 'off';
    inputs[name] = i; form.appendChild(i);
  });
  const btn = document.createElement('button');
  btn.textContent = 'Далее';
  form.appendChild(btn);
  box.appendChild(form);
  Object.values(inputs)[0].focus();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const vals = {};
    for (const k in inputs) vals[k] = inputs[k].value.trim();
    if (Object.values(vals).some((v) => !v)) { $('err').textContent = 'Заполни все поля'; return; }
    btn.disabled = true;
    step.submit(vals);
  });
}

window.api.on('auth:need', showStep);
window.api.on('auth:error', (msg) => { $('err').textContent = msg; document.querySelectorAll('#fields button').forEach((b) => (b.disabled = false)); });
window.api.on('auth:ok', async () => {
  $('login').style.display = 'none';
  $('app').classList.add('on');
  await loadChats();
});

// ---------- список чатов ----------
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

async function loadChats() {
  chatsCache = await window.api.chats();
  renderChats();
}

function renderChats() {
  const box = $('chats');
  box.textContent = '';
  chatsCache.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'chat' + (c.id === currentChat ? ' active' : '');
    const row1 = document.createElement('div'); row1.className = 'row';
    const t = document.createElement('span'); t.className = 't'; t.textContent = c.title;
    const time = document.createElement('span'); time.style.color = 'var(--muted)'; time.textContent = fmtTime(c.date);
    row1.append(t, time);
    const row2 = document.createElement('div'); row2.className = 'row';
    const l = document.createElement('span'); l.className = 'l'; l.textContent = c.last;
    row2.appendChild(l);
    if (c.unread) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = c.unread; row2.appendChild(b); }
    el.append(row1, row2);
    el.addEventListener('click', () => openChat(c.id));
    box.appendChild(el);
  });
}

// ---------- переписка ----------
function addMessage(m) {
  const el = document.createElement('div');
  el.className = 'm' + (m.out ? ' out' : '');
  el.textContent = m.text;
  const s = document.createElement('small');
  s.textContent = fmtTime(m.date);
  el.appendChild(s);
  $('msgs').appendChild(el);
}

async function openChat(id) {
  currentChat = id;
  const c = chatsCache.find((x) => x.id === id);
  c.unread = 0;
  renderChats();
  $('head').textContent = c.title;
  $('form').style.display = 'flex';
  const list = await window.api.messages(id);
  $('msgs').textContent = '';
  list.forEach(addMessage);
  $('msgs').scrollTop = $('msgs').scrollHeight;
  $('text').focus();
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text || !currentChat) return;
  $('text').value = '';
  const m = await window.api.send(currentChat, text);
  addMessage(m);
  $('msgs').scrollTop = $('msgs').scrollHeight;
  loadChats();
});

window.api.on('message:new', ({ chatId, msg }) => {
  if (chatId === currentChat) {
    addMessage(msg);
    $('msgs').scrollTop = $('msgs').scrollHeight;
  }
  loadChats();
});

$('logout').addEventListener('click', () => {
  if (confirm('Выйти из аккаунта?')) window.api.logout();
});

// ---------- старт ----------
window.api.getConfig().then(({ hasConfig }) => { if (!hasConfig) showStep('api'); else $('step-title').textContent = 'Подключаюсь…'; });
