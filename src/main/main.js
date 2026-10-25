'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { pathToFileURL } = require('url');

// ── electron-store (ESM compat shim) ────────────────────────
let Store;
let storeInstance = null;
const storeReady = (async () => {
  try {
    const mod = await import('electron-store');
    Store = mod.default;
  } catch (e) {
    Store = null;
  }
})();

async function getStore() {
  await storeReady;
  if (!Store) return null;
  if (storeInstance) return storeInstance;
  storeInstance = new Store({
    name: 'pipilabu-prefs',
    defaults: {
      topic:      'simple_past',
      difficulty: 'beginner',
      quantity:   10,
      sound:      true,
      theme:      'dark'
    }
  });
  return storeInstance;
}

// ── DEV flag ─────────────────────────────────────────────────
const isDev = process.argv.includes('--dev') ||
              (process.env.NODE_ENV && process.env.NODE_ENV !== 'production');

// ── Main window ──────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1100,
    height: 720,
    minWidth:  860,
    minHeight: 580,
    frame:           false,
    transparent:     false,
    backgroundColor: '#070d1a',
    show:            false,
    titleBarStyle:   'hidden',
    icon:            path.join(__dirname, '..', 'renderer', 'assets', 'images', 'logo.png'),
    webPreferences: {
      preload:             path.join(__dirname, 'preload.js'),
      contextIsolation:    true,
      nodeIntegration:     false,
      sandbox:             false,
      spellcheck:          false,
      webSecurity:         true
    }
  });

  // Allow microphone access for the offline speech-recognition (speaking) module.
  const ses = mainWindow.webContents.session;
  const allowMedia = (permission) =>
    permission === 'media' || permission === 'microphone' || permission === 'audioCapture';
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowMedia(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  if (process.env.PIPI_SMOKE) {
    mainWindow.webContents.on('console-message', (e) => {
      if (e.level === 'warning' || e.level === 'error') console.log('[renderer-error]', e.message);
    });
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 900));
      const script = `(function(){
        const disp = id => getComputedStyle(document.getElementById(id)).display;
        const click = v => document.querySelector('[data-view="'+v+'"]').click();
        const out = {};
        click('authors');
        out.onAuthors = { school: disp('view-school'), authors: disp('view-authors') };
        click('home');
        out.onHome = { school: disp('view-school'), home: disp('view-home') };
        click('school');
        out.onSchool = { school: disp('view-school') };
        return JSON.stringify(out);
      })()`;
      try { console.log('[SMOKE]', await mainWindow.webContents.executeJavaScript(script)); }
      catch (err) { console.log('[SMOKE-FAIL]', err.message); }
      finally { setTimeout(() => app.quit(), 250); }
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC — Window controls ────────────────────────────────────
ipcMain.handle('window:minimize', () => {
  mainWindow && mainWindow.minimize();
});
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => {
  mainWindow && mainWindow.close();
});

// ── IPC — Exercises ──────────────────────────────────────────
ipcMain.handle('exercises:getAll', () => {
  const p = path.join(__dirname, '..', '..', 'data', 'exercises.json');
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC — Store ──────────────────────────────────────────────
ipcMain.handle('store:get', async (_, key) => {
  const store = await getStore();
  if (!store) return null;
  return key ? store.get(key) : store.store;
});

ipcMain.handle('store:set', async (_, key, value) => {
  const store = await getStore();
  if (!store) return false;
  store.set(key, value);
  return true;
});

// ── IPC — Music (pasta de música escolhida pelo utilizador) ──
// A app não traz música: cada pessoa escolhe uma pasta sua e o leitor
// toca os ficheiros de lá.
const MUSIC_EXT = new Set(['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac', '.opus', '.webm']);
const MUSIC_MAX_DEPTH = 3;
const MUSIC_MAX_TRACKS = 1000;

function scanMusicFolder(root) {
  const tracks = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of entries) {
      if (tracks.length >= MUSIC_MAX_TRACKS) return;
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < MUSIC_MAX_DEPTH) walk(full, depth + 1);
      } else if (MUSIC_EXT.has(path.extname(e.name).toLowerCase())) {
        tracks.push({
          title:  path.basename(e.name, path.extname(e.name)),
          folder: path.relative(root, dir),
          url:    pathToFileURL(full).href
        });
      }
    }
  };
  walk(root, 0);
  return tracks;
}

async function musicLibrary() {
  const store = await getStore();
  const folder = store && store.get('music_folder');
  if (!folder || !fs.existsSync(folder)) return { ok: true, folder: null, tracks: [] };
  return { ok: true, folder, name: path.basename(folder), tracks: scanMusicFolder(folder) };
}

ipcMain.handle('music:getLibrary', () => musicLibrary());

ipcMain.handle('music:chooseFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolhe a pasta com a tua música',
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  const store = await getStore();
  if (store) store.set('music_folder', res.filePaths[0]);
  return musicLibrary();
});

ipcMain.handle('music:forgetFolder', async () => {
  const store = await getStore();
  if (store) store.delete('music_folder');
  return { ok: true };
});

// ── IPC — Ollama Integration ──────────────────────────────────
async function queryOllama(endpoint, body) {
  try {
    const res = await fetch(`http://127.0.0.1:11434${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Ollama HTTP Error: ${res.status}`);
    return await res.json();
  } catch (e) {
    throw new Error(`Erro ao contactar o Ollama: ${e.message}`);
  }
}

ipcMain.handle('ollama:isOnline', async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/', { method: 'GET' });
    return res.ok;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('ollama:getModels', async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    if (!res.ok) return { ok: false, error: 'Ollama returned error status' };
    const data = await res.json();
    return { ok: true, models: data.models || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ollama:explain', async (_, { model, question, topic, difficulty, correct, explanation, givenAnswer, isCorrect }) => {
  const systemPrompt = `És um professor de inglês profissional e empático que fala português de Portugal.
Fornece explicações extremamente curtas, diretas e pedagógicas para alunos de nível principiante ou intermédio.
Deves seguir RIGOROSAMENTE o formato abaixo na tua resposta, sem qualquer introdução, cumprimentos, saudações ou parágrafos adicionais:

Correct answer:
[Indica a resposta correta exata de forma simples]

Short explanation:
[Fornece uma explicação amigável em português de Portugal com um máximo absoluto de 2 a 4 frases curtas, justificando o porquê de estar correto e, se aplicável, indicando o erro da resposta do aluno.]`;

  const prompt = `Tópico do exercício: ${topic}
Dificuldade: ${difficulty}
Questão de inglês: ${question}
Resposta correta esperada: ${correct}
Resposta dada pelo aluno: ${givenAnswer || '(sem resposta)'}
O aluno acertou? ${isCorrect ? 'Sim' : 'Não'}
Explicação base original: ${explanation}`;

  try {
    const data = await queryOllama('/api/generate', {
      model: model || 'llama3.2:latest',
      system: systemPrompt,
      prompt: prompt,
      stream: false,
      options: {
        num_predict: 150,
        temperature: 0.3,
        top_k: 20,
        top_p: 0.9
      }
    });
    
    return { ok: true, explanation: (data.response || '').trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ollama:checkTranslation', async (_, { model, question, correctPhrase, userPhrase }) => {
  const systemPrompt = `És um avaliador de tradução de inglês avançado que fala português de Portugal.
Um aluno traduziu uma frase de português para inglês.
Avalia a tradução de forma justa e flexível, aceitando variações naturais de vocabulário, contrações ou ordem das palavras.
Deves responder ESTRITAMENTE em formato JSON válido com a seguinte estrutura, sem blocos de markdown e sem qualquer texto adicional antes ou depois:
{
  "correct": true ou false,
  "explanation": "Uma explicação extremamente curta e encorajadora em português de Portugal (máximo 2 a 3 frases curtas), justificando o veredito de forma simples."
}`;

  const prompt = `Frase original em português: "${question}"
Traduções de referência aceites em inglês (separadas por |): "${correctPhrase}"
Tradução fornecida pelo aluno em inglês: "${userPhrase}"`;

  try {
    const data = await queryOllama('/api/generate', {
      model: model || 'llama3.2:latest',
      system: systemPrompt,
      prompt: prompt,
      stream: false,
      format: 'json',
      options: {
        num_predict: 250,
        temperature: 0.2
      }
    });
    
    // Os modelos pequenos às vezes juntam texto ou ``` à volta do JSON:
    // extrai o primeiro objeto { ... } da resposta.
    const text = (data.response || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = match ? JSON.parse(match[0]) : null; } catch (_) { parsed = null; }

    if (!parsed || typeof parsed.correct !== 'boolean') {
      // Sem um veredito claro não adivinhamos: a app usa a correção local.
      return { ok: false, error: 'resposta da IA em formato inválido' };
    }
    return { ok: true, correct: parsed.correct, explanation: parsed.explanation || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
