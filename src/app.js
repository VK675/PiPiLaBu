/* ============================================================
   PiPiLabu — app.js
   Frontend interface logic with Ollama AI model integration
   ============================================================ */

'use strict';

// ── GLOBAL VARIABLES & STATE ────────────────────────────────
let stats = {
  total_sessions: 0,
  total_correct: 0,
  total_questions: 0,
  streak: 0,
  last_active_date: '',
  history: []
};

let soundEnabled = true;
let ollamaModel = 'llama3.2:latest';
let ollamaOnline = false;
let exercisesDb = null;

// Practice Session State
let currentConfig = {
  topic: 'simple_past',
  difficulty: 'beginner',
  quantity: 10
};
let sessionExercises = [];
let currentIdx = 0;
let sessionScore = 0;
let userAnswers = [];

// Pronunciation Session State
let currentPhrase = '';
let isListening = false;
let recognition = null;

// ── UTILITIES ───────────────────────────────────────────────
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3200);
}

// Synthesize professional retro-modern sound effects using Web Audio API
function playSynthBeep(isCorrect) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isCorrect) {
      // Harmonic pleasant double beep (D5 -> A5)
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Soft minor tone drop (A3 -> D3)
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(147.14, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (e) {
    console.error("Synthesizer error:", e);
  }
}

// Text to Speech
function playTTS(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast("Síntese de voz não suportada neste sistema.", "error");
  }
}

// ── WINDOW CONTROLS ─────────────────────────────────────────
function initWindowControls() {
  const minBtn = document.getElementById('wc-min');
  const maxBtn = document.getElementById('wc-max');
  const closeBtn = document.getElementById('wc-close');

  if (minBtn) minBtn.onclick = () => window.em.window.minimize();
  if (maxBtn) maxBtn.onclick = () => window.em.window.maximize();
  if (closeBtn) closeBtn.onclick = () => window.em.window.close();
}

// ── NAVIGATION (TABS) ───────────────────────────────────────
function initNavigation() {
  const navBtns = document.querySelectorAll('#main-nav .nav-btn');
  const views = document.querySelectorAll('.view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      navBtns.forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', String(isActive));
      });
      views.forEach(v => v.classList.remove('active'));

      const panel = document.getElementById(`view-${viewId}`);
      if (panel) panel.classList.add('active');

      // Module reloads
      if (viewId === 'home') loadHomeStats();
      if (viewId === 'progress') loadProgressTab();
      if (viewId === 'settings') checkOllamaConnection();
      if (viewId === 'school') renderLessonPath();
    });
  });

  // Start Practicing Home Button
  const startHomeBtn = document.getElementById('btn-start-home');
  if (startHomeBtn) {
    startHomeBtn.onclick = () => {
      const practiceBtn = Array.from(navBtns).find(b => b.getAttribute('data-view') === 'practice');
      if (practiceBtn) practiceBtn.click();
    };
  }
}

// ── DATA STORE INITIALIZATION ──────────────────────────────
async function initDataStore() {
  soundEnabled = await window.em.store.get('sound') !== false;
  ollamaModel = await window.em.store.get('ollama_model') || 'llama3.2:latest';
  const savedTopic = await window.em.store.get('topic');
  const savedDifficulty = await window.em.store.get('difficulty');
  const savedQuantity = Number(await window.em.store.get('quantity'));
  const savedStats = await window.em.store.get('stats');
  if (savedStats) {
    stats = { ...stats, ...savedStats };
  }
  if (savedTopic) currentConfig.topic = savedTopic;
  if (['beginner', 'intermediate', 'advanced'].includes(savedDifficulty)) {
    currentConfig.difficulty = savedDifficulty;
  }
  if (Number.isFinite(savedQuantity)) {
    currentConfig.quantity = Math.max(3, Math.min(20, savedQuantity));
  }

  // Bind settings checkbox initial state
  const soundChk = document.getElementById('settings-sound');
  if (soundChk) soundChk.checked = soundEnabled;
}

// ── EXERCISES DATABASE ──────────────────────────────────────
async function loadExercises() {
  const res = await window.em.exercises.getAll();
  if (res.ok) {
    exercisesDb = res.data.topics;
    if (!exercisesDb[currentConfig.topic]) {
      currentConfig.topic = Object.keys(exercisesDb)[0] || 'simple_past';
    }
    populateHomeTopics();
    populatePracticeConfig();
    updateHomeRecentList();
  } else {
    console.error("Erro ao obter base de dados:", res.error);
    showToast("Erro ao abrir exercises.json local.", "error");
  }
}

// ── MODULE: HOME ────────────────────────────────────────────
function populateHomeTopics() {
  const grid = document.getElementById('topics-grid');
  if (!grid || !exercisesDb) return;
  grid.innerHTML = '';

  Object.keys(exercisesDb).forEach(key => {
    const topic = exercisesDb[key];
    const card = document.createElement('div');
    card.className = 'topic-card';

    let totalExercises = 0;
    ['beginner', 'intermediate', 'advanced'].forEach(lvl => {
      if (topic.exercises && topic.exercises[lvl]) {
        totalExercises += topic.exercises[lvl].length;
      }
    });

    card.innerHTML = `
      <div class="topic-card-icon">${escapeHtml(topic.icon || '📖')}</div>
      <div class="topic-card-name">${escapeHtml(topic.label)}</div>
      <div class="topic-card-desc">${escapeHtml(topic.description)}</div>
      <div class="topic-card-count">${totalExercises} exercícios</div>
    `;

    card.onclick = () => selectPracticeTopic(key);
    grid.appendChild(card);
  });

  loadHomeStats();
}

function selectPracticeTopic(key) {
  currentConfig.topic = key;
  document.querySelectorAll('.topic-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-topic') === key);
  });
  const practiceBtn = Array.from(document.querySelectorAll('#main-nav .nav-btn')).find(b => b.getAttribute('data-view') === 'practice');
  if (practiceBtn) practiceBtn.click();
}

function loadHomeStats() {
  document.getElementById('stat-topics').textContent = exercisesDb ? Object.keys(exercisesDb).length : 0;
  document.getElementById('stat-exercises').textContent = stats.total_questions;
  document.getElementById('stat-streak').textContent = stats.streak;
  updateHomeRecentList();
}

function updateHomeRecentList() {
  const list = document.getElementById('recent-list');
  if (!list) return;
  list.innerHTML = '';

  if (!stats.history || stats.history.length === 0) {
    list.innerHTML = '<p class="empty-state">Ainda não tens sessões registadas. Começa a praticar!</p>';
    return;
  }

  stats.history.slice(0, 3).forEach(session => {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const diffColor = session.difficulty === 'beginner' ? 'var(--green-400)'
                    : session.difficulty === 'intermediate' ? 'var(--amber-400)'
                    : 'var(--red-400)';

    const diffLabel = session.difficulty === 'beginner' ? 'Iniciante'
                    : session.difficulty === 'intermediate' ? 'Intermédio'
                    : 'Avançado';

    item.innerHTML = `
      <span class="recent-item-icon">📝</span>
      <div class="recent-item-info">
        <div class="recent-item-name">${escapeHtml(session.topic)}</div>
        <div class="recent-item-meta">${session.date} • Dificuldade: <span style="color:${diffColor};font-weight:600;">${diffLabel}</span></div>
      </div>
      <span class="recent-item-score">${session.correct} / ${session.total}</span>
    `;
    list.appendChild(item);
  });
}

// ── MODULE: PRACTICE (CONFIG & EXERCISE WORKFLOW) ───────────
function populatePracticeConfig() {
  const pillsWrap = document.getElementById('topic-pills');
  if (!pillsWrap || !exercisesDb) return;
  pillsWrap.innerHTML = '';

  Object.keys(exercisesDb).forEach(key => {
    const topic = exercisesDb[key];
    const pill = document.createElement('button');
    pill.className = 'topic-pill' + (key === currentConfig.topic ? ' active' : '');
    pill.setAttribute('data-topic', key);
    pill.innerHTML = `<span>${escapeHtml(topic.icon || '📖')}</span> ${escapeHtml(topic.label)}`;

    pill.onclick = () => {
      currentConfig.topic = key;
      document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    };
    pillsWrap.appendChild(pill);
  });

  // Bind difficulty pills
  const diffPills = document.querySelectorAll('.diff-pill');
  diffPills.forEach(pill => {
    const isSelected = pill.getAttribute('data-diff') === currentConfig.difficulty;
    pill.classList.toggle('active', isSelected);
    pill.setAttribute('aria-checked', String(isSelected));
    pill.onclick = () => {
      currentConfig.difficulty = pill.getAttribute('data-diff');
      diffPills.forEach(p => {
        const isActive = p === pill;
        p.classList.toggle('active', isActive);
        p.setAttribute('aria-checked', String(isActive));
      });
    };
  });

  // Bind qty slider
  const slider = document.getElementById('qty-slider');
  const display = document.getElementById('qty-display');
  if (slider && display) {
    slider.value = currentConfig.quantity;
    display.textContent = currentConfig.quantity;
    slider.oninput = () => {
      currentConfig.quantity = parseInt(slider.value);
      display.textContent = slider.value;
      slider.setAttribute('aria-valuenow', slider.value);
    };
  }

  // Bind buttons
  const startBtn = document.getElementById('btn-start-session');
  if (startBtn) startBtn.onclick = startPracticeSession;

  const abortBtn = document.getElementById('btn-abort-session');
  if (abortBtn) abortBtn.onclick = abortPracticeSession;
}

function startPracticeSession() {
  const topicObj = exercisesDb[currentConfig.topic];
  if (!topicObj) return;

  Promise.all([
    window.em.store.set('topic', currentConfig.topic),
    window.em.store.set('difficulty', currentConfig.difficulty),
    window.em.store.set('quantity', currentConfig.quantity)
  ]).catch(err => console.warn('Não foi possível gravar preferências de treino:', err));

  const pool = topicObj.exercises[currentConfig.difficulty] || [];
  if (pool.length === 0) {
    showToast("Não existem exercícios para esta dificuldade!", "error");
    return;
  }

  // Shuffle and select quantity
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  sessionExercises = shuffled.slice(0, Math.min(currentConfig.quantity, shuffled.length));

  currentIdx = 0;
  sessionScore = 0;
  userAnswers = [];

  document.getElementById('practice-config').classList.add('hidden');
  document.getElementById('practice-results').classList.add('hidden');
  document.getElementById('practice-session').classList.remove('hidden');

  loadNextExercise();
}

function abortPracticeSession() {
  if (confirm("Tens a certeza que queres desistir da sessão de treino?")) {
    document.getElementById('practice-session').classList.add('hidden');
    document.getElementById('practice-config').classList.remove('hidden');
  }
}

function loadNextExercise() {
  if (currentIdx >= sessionExercises.length) {
    finishPracticeSession();
    return;
  }

  const ex = sessionExercises[currentIdx];

  // Update session stats bar
  const progressPct = Math.round((currentIdx / sessionExercises.length) * 100);
  document.getElementById('session-progress-fill').style.width = `${progressPct}%`;
  document.getElementById('session-counter').textContent = `${currentIdx + 1} / ${sessionExercises.length}`;
  document.getElementById('session-score-badge').textContent = `✓ ${sessionScore}`;

  renderExerciseCard(ex);
}

function renderExerciseCard(ex) {
  const wrap = document.getElementById('exercise-card-wrap');
  if (!wrap) return;

  let cardHtml = '';
  let typeLabel = '';

  if (ex.type === 'multiple_choice') {
    typeLabel = 'Escolha Múltipla';
    const optionsHtml = ex.options.map((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      return `
        <button class="mc-option" data-opt-index="${i}">
          <span class="mc-option-letter">${letter}</span>
          <span class="mc-option-text">${escapeHtml(opt)}</span>
        </button>
      `;
    }).join('');

    cardHtml = `<div class="mc-options">${optionsHtml}</div>`;
  } else if (ex.type === 'fill_blank') {
    typeLabel = 'Preencher Espaço';
    cardHtml = `
      <div class="fill-wrap">
        <input type="text" class="fill-input" id="ex-blank-input" placeholder="Escreve a palavra em falta..." autocomplete="off" spellcheck="false">
      </div>
    `;
  } else if (ex.type === 'translation') {
    typeLabel = 'Tradução';
    cardHtml = `
      <div class="fill-wrap">
        <textarea class="translation-input" id="ex-translation-input" placeholder="Traduz a frase para inglês..." autocomplete="off" spellcheck="false"></textarea>
      </div>
    `;
  }

  wrap.innerHTML = `
    <div class="exercise-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <span class="exercise-type-tag">📝 ${typeLabel}</span>
        <button class="btn-ghost btn-sm" id="btn-tts-listen" title="Ouvir" style="display:flex;align-items:center;gap:6px;">🔊 Ouvir</button>
      </div>
      <h3 class="exercise-question">${escapeHtml(ex.question)}</h3>
      ${ex.hint ? `<p class="exercise-hint">💡 Dica: ${escapeHtml(ex.hint)}</p>` : ''}
      
      ${cardHtml}
      
      <div class="exercise-feedback hidden" id="ex-feedback">
        <div class="feedback-label" id="ex-feedback-title"></div>
        <div class="feedback-explanation" id="ex-feedback-text"></div>
        
        <!-- AI Explanation Box -->
        <div class="ai-explanation-box hidden" id="ex-ai-box" style="margin-top:16px; padding-top:16px; border-top:1px dashed var(--border-2);">
          <strong style="color:var(--cyan-400); display:block; font-size:0.8rem; text-transform:uppercase; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
            ✨ Explicação da IA (${ollamaModel})
          </strong>
          <p id="ex-ai-text" style="font-size:0.82rem; color:var(--text-secondary); line-height:1.55; font-family:inherit; user-select:text;"></p>
        </div>
      </div>
      
      <div class="exercise-actions">
        <button class="btn-secondary hidden" id="btn-ai-explain">✨ Explicar com IA</button>
        <button class="btn-primary" id="btn-check-answer">Verificar resposta</button>
      </div>
    </div>
  `;

  // Bind Voice Listen TTS
  document.getElementById('btn-tts-listen').onclick = () => {
    const speakText = ex.type === 'translation' ? ex.question : ex.question.replace('___', 'blank');
    playTTS(speakText);
  };

  // Bind answers trigger
  const checkBtn = document.getElementById('btn-check-answer');

  if (ex.type === 'multiple_choice') {
    const opts = wrap.querySelectorAll('.mc-option');
    let selected = null;

    opts.forEach(opt => {
      opt.onclick = () => {
        opts.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selected = ex.options[Number(opt.getAttribute('data-opt-index'))];
      };
    });

    checkBtn.onclick = () => {
      if (!selected) {
        showToast("Por favor, seleciona uma opção!", "error");
        return;
      }
      verifyAnswer(ex, selected);
    };
  } else if (ex.type === 'fill_blank') {
    const input = document.getElementById('ex-blank-input');
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') checkBtn.click();
    };

    checkBtn.onclick = () => {
      const ans = input.value.trim();
      if (!ans) {
        showToast("Por favor, introduz uma resposta!", "error");
        input.focus();
        return;
      }
      verifyAnswer(ex, ans);
    };
  } else if (ex.type === 'translation') {
    const input = document.getElementById('ex-translation-input');
    input.focus();

    checkBtn.onclick = () => {
      const ans = input.value.trim();
      if (!ans) {
        showToast("Por favor, escreve a tua tradução!", "error");
        input.focus();
        return;
      }
      verifyAnswer(ex, ans);
    };
  }
}

async function verifyAnswer(ex, givenAns) {
  const checkBtn = document.getElementById('btn-check-answer');
  const aiBtn = document.getElementById('btn-ai-explain');
  const feedbackEl = document.getElementById('ex-feedback');
  const titleEl = document.getElementById('ex-feedback-title');
  const textEl = document.getElementById('ex-feedback-text');

  checkBtn.disabled = true;

  let isCorrect = false;
  let explanationText = ex.explanation || '';

  // Lock UI
  if (ex.type === 'multiple_choice') {
    document.querySelectorAll('.mc-option').forEach(o => o.disabled = true);
  } else if (ex.type === 'fill_blank') {
    document.getElementById('ex-blank-input').disabled = true;
  } else if (ex.type === 'translation') {
    document.getElementById('ex-translation-input').disabled = true;
  }

  // Grade Answer (Dynamic Ollama AI vs exact string matching)
  if (ex.type === 'translation' && ollamaOnline) {
    titleEl.textContent = "🧠 A IA está a avaliar a tua tradução...";
    feedbackEl.className = "exercise-feedback correct";
    feedbackEl.classList.remove('hidden');

    const result = await window.em.ollama.checkTranslation({
      model: ollamaModel,
      question: ex.question,
      correctPhrase: ex.answer,
      userPhrase: givenAns
    });

    if (result.ok) {
      isCorrect = result.correct;
      explanationText = result.explanation;
    } else {
      isCorrect = checkStrictMatch(givenAns, ex.answer);
      explanationText = ex.explanation + `\n\n*(Nota: O Ollama falhou a correção inteligente: ${result.error})*`;
    }
  } else {
    // Normal exact comparison (Choices, Blanks, or Offline Translation fallback)
    isCorrect = checkStrictMatch(givenAns, ex.answer);
  }

  playSynthBeep(isCorrect);
  if (isCorrect) sessionScore++;

  // Highlight choices UI
  if (ex.type === 'multiple_choice') {
    document.querySelectorAll('.mc-option').forEach(o => {
      const val = ex.options[Number(o.getAttribute('data-opt-index'))];
      if (val === ex.answer) {
        o.classList.add('correct');
      } else if (val === givenAns && !isCorrect) {
        o.classList.add('wrong');
      }
    });
  } else if (ex.type === 'fill_blank') {
    const input = document.getElementById('ex-blank-input');
    input.classList.add(isCorrect ? 'correct' : 'wrong');
  } else if (ex.type === 'translation') {
    const input = document.getElementById('ex-translation-input');
    input.classList.add(isCorrect ? 'correct' : 'wrong');
  }

  // Show normal feedback screen
  feedbackEl.classList.remove('hidden');
  feedbackEl.className = `exercise-feedback ` + (isCorrect ? 'correct' : 'wrong');
  titleEl.textContent = isCorrect ? '🎉 Resposta Correta!' : '❌ Resposta Incorreta...';

  textEl.innerHTML = `
    <strong>Resposta esperada:</strong> <span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(ex.answer)}</span>
    <p style="margin-top: 8px; color:var(--text-secondary);">${escapeHtml(explanationText)}</p>
  `;

  // Enable Ollama explanation button if local model is connected
  if (ollamaOnline && aiBtn) {
    aiBtn.classList.remove('hidden');
    aiBtn.onclick = () => getAIExplanation(ex, givenAns, isCorrect, explanationText);
  }

  // Setup Next button
  checkBtn.textContent = (currentIdx === sessionExercises.length - 1) ? "Finalizar sessão" : "Seguinte →";
  checkBtn.disabled = false;
  checkBtn.onclick = () => {
    userAnswers.push({
      question: ex.question,
      answer: ex.answer,
      givenAnswer: givenAns,
      isCorrect: isCorrect,
      explanation: explanationText
    });
    currentIdx++;
    loadNextExercise();
  };
}

function checkStrictMatch(str1, str2) {
  const norm = (s) => s.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .replace(/\s+/g, ' ')
    .trim();
  return norm(str1) === norm(str2);
}

function formatAIExplanation(rawText) {
  if (!rawText) return '';

  // Clean up potential markdown formatting of sections
  const cleanText = rawText.replace(/\*\*/g, '');

  const correctMatch = cleanText.match(/Correct\s+answer:([\s\S]*?)(?=Short\s+explanation:|$)/i);
  const explanationMatch = cleanText.match(/Short\s+explanation:([\s\S]*)/i);

  if (correctMatch || explanationMatch) {
    let html = '';
    if (correctMatch) {
      const correctVal = correctMatch[1].trim();
      if (correctVal) {
        html += `
          <div style="margin-bottom:14px; padding:12px 16px; background:var(--glass-2); border-left:4px solid var(--cyan-400); border-radius:var(--radius-sm); font-family:inherit;">
            <strong style="color:var(--cyan-400); font-size:0.8rem; display:block; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">Resposta Correta Recomendada</strong>
            <span style="font-size:0.9rem; color:var(--text-primary); font-weight:600; font-family:'JetBrains Mono', monospace;">${escapeHtml(correctVal)}</span>
          </div>
        `;
      }
    }
    if (explanationMatch) {
      const explanationVal = explanationMatch[1].trim();
      if (explanationVal) {
        html += `
          <div style="line-height:1.6; font-size:0.86rem; color:var(--text-secondary); padding:4px 0;">
            <strong style="color:var(--violet-400); font-size:0.8rem; display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Explicação Pedagógica da IA</strong>
            <p style="margin:0;">${escapeHtml(explanationVal).replace(/\n/g, '<br>')}</p>
          </div>
        `;
      }
    }
    return html;
  }

  // Fallback: If it's not structured, just display it with linebreaks
  return `
    <div style="line-height:1.6; font-size:0.86rem; color:var(--text-secondary); padding:4px 0;">
      <p style="margin:0;">${escapeHtml(cleanText).replace(/\n/g, '<br>')}</p>
    </div>
  `;
}

async function getAIExplanation(ex, givenAns, isCorrect, origEx) {
  const aiBtn = document.getElementById('btn-ai-explain');
  const aiBox = document.getElementById('ex-ai-box');
  const aiText = document.getElementById('ex-ai-text');

  if (!aiBtn || !aiBox || !aiText) return;

  aiBtn.disabled = true;
  aiBtn.textContent = "✨ A obter explicação pedagógica...";

  // Show the AI Box immediately with a shimmering loader
  aiText.innerHTML = `
    <div class="ai-shimmer-loader" aria-label="A carregar explicação da inteligência artificial">
      <div class="ai-shimmer-line long"></div>
      <div class="ai-shimmer-line medium"></div>
      <div class="ai-shimmer-line short"></div>
    </div>
  `;
  aiBox.classList.remove('hidden');

  const res = await window.em.ollama.explain({
    model: ollamaModel,
    question: ex.question,
    topic: currentConfig.topic,
    difficulty: currentConfig.difficulty,
    correct: ex.answer,
    explanation: origEx,
    givenAnswer: givenAns,
    isCorrect: isCorrect
  });

  if (res.ok) {
    aiText.innerHTML = formatAIExplanation(res.explanation);
    aiBtn.classList.add('hidden');
  } else {
    aiBox.classList.add('hidden'); // Hide the box since we encountered an error
    aiBtn.disabled = false;
    aiBtn.textContent = "✨ Explicar com IA";
    showToast(`Ollama falhou: ${res.error}`, "error");
  }
}

// ── MODULE: RESULTS ─────────────────────────────────────────
function finishPracticeSession() {
  document.getElementById('practice-session').classList.add('hidden');
  document.getElementById('practice-results').classList.remove('hidden');

  const total = sessionExercises.length;
  const score = sessionScore;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  document.getElementById('results-big').textContent = score;
  document.getElementById('results-total').textContent = `/ ${total}`;

  const msgEl = document.getElementById('results-msg');
  let icon = '🏆';
  if (pct === 100) {
    msgEl.textContent = "Incrível! Excelente precisão de 100%!";
    icon = '🔥';
  } else if (pct >= 75) {
    msgEl.textContent = "Excelente! Tens um ótimo domínio do tópico.";
    icon = '🏆';
  } else if (pct >= 50) {
    msgEl.textContent = "Bom esforço. Continua assim para evoluíres!";
    icon = '⭐';
  } else {
    msgEl.textContent = "Não desistas. Tenta rever as tuas respostas.";
    icon = '💪';
  }
  document.getElementById('results-icon').textContent = icon;

  // Breakdown metrics
  document.getElementById('results-breakdown').innerHTML = `
    <div class="breakdown-item">
      <span class="breakdown-value" style="color:var(--cyan-400);">${pct}%</span>
      <span class="breakdown-label">Precisão</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-value" style="color:var(--green-400);">${score}</span>
      <span class="breakdown-label">Corretas</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-value" style="color:var(--red-400);">${total - score}</span>
      <span class="breakdown-label">Erradas</span>
    </div>
  `;

  // Review List
  const reviewList = document.getElementById('review-list');
  const reviewPanel = document.getElementById('review-panel');
  reviewPanel.classList.add('hidden');

  if (reviewList) {
    reviewList.innerHTML = '';
    userAnswers.forEach((ans, i) => {
      const item = document.createElement('div');
      item.className = 'review-item ' + (ans.isCorrect ? 'correct-item' : 'wrong-item');
      item.innerHTML = `
        <div class="review-item-q"><strong>${i + 1}.</strong> ${escapeHtml(ans.question)}</div>
        <div class="review-item-ans">
          ${ans.isCorrect
            ? `<span class="ans-correct">✓ A tua resposta: "${escapeHtml(ans.givenAnswer)}"</span>`
            : `<span class="ans-given-wrong">✗ A tua resposta: "${escapeHtml(ans.givenAnswer)}"</span> | <span class="ans-correct">Esperado: "${escapeHtml(ans.answer)}"</span>`
          }
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:6px;line-height:1.45;">${escapeHtml(ans.explanation)}</div>
        </div>
      `;
      reviewList.appendChild(item);
    });
  }

  // Bind Results page buttons
  document.getElementById('btn-results-review').onclick = () => {
    reviewPanel.classList.toggle('hidden');
  };
  document.getElementById('btn-results-again').onclick = startPracticeSession;
  document.getElementById('btn-results-home').onclick = () => {
    const homeBtn = Array.from(document.querySelectorAll('#main-nav .nav-btn')).find(b => b.getAttribute('data-view') === 'home');
    if (homeBtn) homeBtn.click();
  };

  saveCompletedSession(score, total);
}

async function saveCompletedSession(score, total, topicLabel, difficulty) {
  if (topicLabel == null) topicLabel = exercisesDb[currentConfig.topic].label;
  if (difficulty == null) difficulty = currentConfig.difficulty;
  stats.total_sessions++;
  stats.total_correct += score;
  stats.total_questions += total;

  // Calculate Streak
  const todayStr = new Date().toISOString().split('T')[0];
  if (stats.last_active_date) {
    const lastDate = new Date(stats.last_active_date);
    const today = new Date(todayStr);
    const diffTime = Math.abs(today - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      stats.streak++;
    } else if (diffDays > 1) {
      stats.streak = 1;
    }
  } else {
    stats.streak = 1;
  }
  stats.last_active_date = todayStr;

  // Add history
  stats.history.unshift({
    date: new Date().toLocaleDateString('pt-PT'),
    topic: topicLabel,
    difficulty: difficulty,
    correct: score,
    total: total
  });

  if (stats.history.length > 50) stats.history.pop();

  await window.em.store.set('stats', stats);
  loadHomeStats();
}

// ── MODULE: PRONUNCIATION (VOICE & CAPTURE) ──────────────────
function initPronunciationModule() {
  const btnNew = document.getElementById('btn-new-phrase');
  const btnMic = document.getElementById('btn-mic');
  const btnListen = document.getElementById('btn-listen');

  if (!btnNew || !btnMic || !btnListen) return;

  btnNew.onclick = loadNewPronunciationPhrase;
  btnListen.onclick = () => playTTS(currentPhrase);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('no-speech-notice').classList.remove('hidden');
    btnMic.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    btnMic.classList.add('active');
    document.getElementById('mic-status').classList.remove('hidden');
    document.getElementById('pronunciation-result').classList.add('hidden');
  };

  recognition.onend = () => {
    isListening = false;
    btnMic.classList.remove('active');
    document.getElementById('mic-status').classList.add('hidden');
  };

  recognition.onerror = (e) => {
    console.error("Erro no reconhecimento de voz:", e);
    showToast("Não consegui ouvir bem, tenta de novo.", "error");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    evaluateSpeechPronunciation(transcript);
  };

  btnMic.onclick = () => {
    if (isListening) {
      recognition.stop();
    } else {
      if (!currentPhrase) {
        showToast("Por favor, escolhe primeiro uma frase!", "error");
        return;
      }
      recognition.start();
    }
  };

  loadNewPronunciationPhrase();
}

async function loadNewPronunciationPhrase() {
  const res = await window.em.exercises.getAll();
  if (res.ok && res.data.pronunciation_sentences) {
    const sentences = res.data.pronunciation_sentences[currentConfig.difficulty] || [];
    if (sentences.length === 0) return;

    const randStr = sentences[Math.floor(Math.random() * sentences.length)];
    currentPhrase = randStr;

    document.getElementById('phrase-category').textContent =
      currentConfig.difficulty === 'beginner' ? 'Iniciante 🟢'
      : currentConfig.difficulty === 'intermediate' ? 'Intermédio 🟡'
      : 'Avançado 🔴';

    document.getElementById('phrase-text').textContent = currentPhrase;
    document.getElementById('phrase-phonetic').textContent = `[ ${getPhoneticMock(currentPhrase)} ]`;

    // Clear previous results
    document.getElementById('pronunciation-result').classList.add('hidden');
  }
}

function getPhoneticMock(phrase) {
  // Premium simulated phonetic transcription dictionary
  return phrase.toLowerCase()
    .replace(/the/g, 'ðə')
    .replace(/cat/g, 'kæt')
    .replace(/sat/g, 'sæt')
    .replace(/on/g, 'ɒn')
    .replace(/mat/g, 'mæt')
    .replace(/she/g, 'ʃiː')
    .replace(/sells/g, 'selz')
    .replace(/seashells/g, 'ˈsiːʃelz')
    .replace(/seashore/g, 'ˈsiːʃɔː')
    .replace(/morning/g, 'ˈmɔːnɪŋ')
    .replace(/weather/g, 'ˈweðə')
    .replace(/beautiful/g, 'ˈbjuːtɪfl')
    .replace(/philosophical/g, 'ˌfɪləˈsɒfɪkl')
    .replace(/implications/g, 'ˌɪmplɪˈkeɪʃnz')
    .replace(/intelligence/g, 'ɪnˈtelɪdʒəns')
    .replace(/artificial/g, 'ˌɑːtɪˈfɪʃl')
    .replace(/unprecedented/g, 'ʌnˈpresɪdentɪd')
    .replace(/skepticism/g, 'ˈskeptɪsɪzəm')
    .replace(/geopolitical/g, 'ˌdʒiːəʊpəˈlɪtɪkl');
}

function evaluateSpeechPronunciation(transcript) {
  const score = calculateSimilarity(transcript, currentPhrase);
  const resultEl = document.getElementById('pronunciation-result');
  const heardText = document.getElementById('pron-heard-text');
  const scoreFill = document.getElementById('pron-score-fill');
  const icon = document.getElementById('pron-result-icon');
  const msg = document.getElementById('pron-result-msg');

  if (!resultEl || !heardText || !scoreFill) return;

  heardText.textContent = transcript;
  scoreFill.style.width = `${score}%`;
  resultEl.classList.remove('hidden');

  if (score >= 80) {
    icon.textContent = '✓';
    icon.style.background = 'rgba(74,222,128,.15)';
    icon.style.color = 'var(--green-400)';
    msg.textContent = `Excelente pronúncia! (${score}% de precisão)`;
    playSynthBeep(true);
  } else if (score >= 50) {
    icon.textContent = '⚡';
    icon.style.background = 'rgba(251,191,36,.15)';
    icon.style.color = 'var(--amber-400)';
    msg.textContent = `Boa pronúncia, mas podes polir melhor. (${score}% de precisão)`;
    playSynthBeep(true);
  } else {
    icon.textContent = '✗';
    icon.style.background = 'rgba(239,68,68,.15)';
    icon.style.color = 'var(--red-400)';
    msg.textContent = `Tenta falar mais claro e ao ritmo certo. (${score}% de precisão)`;
    playSynthBeep(false);
  }

  // Update Pronunciation List log in current session
  const histList = document.getElementById('pron-history-list');
  if (histList) {
    const empty = histList.querySelector('.empty-state');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'recent-item';
    item.style.padding = '10px 14px';
    item.style.fontSize = '0.82rem';

    const scoreColor = score >= 80 ? 'var(--green-400)' : score >= 50 ? 'var(--amber-400)' : 'var(--red-400)';

    item.innerHTML = `
      <span style="font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">"${escapeHtml(currentPhrase)}"</span>
      <span style="color:var(--text-muted); margin:0 12px; font-style:italic;">Ouviu: "${escapeHtml(transcript)}"</span>
      <span style="color:${scoreColor}; font-weight:700; flex-shrink:0;">${score}%</span>
    `;

    histList.insertBefore(item, histList.firstChild);
  }
}

// ── ADVANCED STRING SIMILARITY (Levenshtein Distance) ────────
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
  const s2 = str2.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();

  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  // Word token overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  let matches = 0;
  words1.forEach(w => {
    if (words2.includes(w)) matches++;
  });

  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const charScore = Math.round(((maxLen - dist) / maxLen) * 100);
  const wordScore = Math.round((matches / Math.max(words1.length, words2.length)) * 100);

  return Math.max(0, Math.min(100, Math.round((charScore + wordScore) / 2)));
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ── MODULE: PROGRESS (HISTORIC AND GRAPHS) ──────────────────
function loadProgressTab() {
  document.getElementById('prog-total-sessions').textContent = stats.total_sessions;
  document.getElementById('prog-total-correct').textContent = stats.total_correct;

  const acc = stats.total_questions > 0 ? Math.round((stats.total_correct / stats.total_questions) * 100) : 0;
  document.getElementById('prog-accuracy').textContent = `${acc}%`;
  document.getElementById('prog-streak').textContent = stats.streak;

  // Topic Bars
  const barsWrap = document.getElementById('topic-bars');
  if (barsWrap && exercisesDb) {
    barsWrap.innerHTML = '';

    Object.keys(exercisesDb).forEach(key => {
      const topic = exercisesDb[key];

      let completed = 0;
      let correct = 0;

      stats.history.forEach(s => {
        if (s.topic === topic.label) {
          completed += s.total;
          correct += s.correct;
        }
      });

      const accuracy = completed > 0 ? Math.round((correct / completed) * 100) : 0;

      const barHtml = `
          <div style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; font-size:0.84rem; margin-bottom:5px; font-weight:500;">
            <span>${escapeHtml(topic.icon || '📖')} ${escapeHtml(topic.label)}</span>
            <span style="color:var(--cyan-400);">${accuracy}% (${completed} Qs)</span>
          </div>
          <div style="height:6px; background:var(--glass-2); border-radius:99px; overflow:hidden;">
            <div style="height:100%; width:${accuracy}%; background:linear-gradient(90deg, var(--cyan-500), var(--blue-400)); border-radius:99px;"></div>
          </div>
        </div>
      `;
      barsWrap.insertAdjacentHTML('beforeend', barHtml);
    });
  }

  // Sessions log
  const list = document.getElementById('session-history-list');
  if (list) {
    list.innerHTML = '';
    if (stats.history.length === 0) {
      list.innerHTML = '<p class="empty-state">Ainda sem sessões. Começa a praticar!</p>';
      return;
    }

    stats.history.forEach(session => {
      const item = document.createElement('div');
      item.className = 'recent-item';

      const diffColor = session.difficulty === 'beginner' ? 'var(--green-400)'
                      : session.difficulty === 'intermediate' ? 'var(--amber-400)'
                      : 'var(--red-400)';

      const diffLabel = session.difficulty === 'beginner' ? 'Iniciante'
                      : session.difficulty === 'intermediate' ? 'Intermédio'
                      : 'Avançado';

      item.innerHTML = `
        <span class="recent-item-icon">🏆</span>
        <div class="recent-item-info">
          <div class="recent-item-name">${escapeHtml(session.topic)}</div>
          <div class="recent-item-meta">${session.date} • Dificuldade: <span style="color:${diffColor};font-weight:600;">${diffLabel}</span></div>
        </div>
        <span class="recent-item-score" style="font-weight:700;">${session.correct} / ${session.total}</span>
      `;
      list.appendChild(item);
    });
  }

  // Bind Reset progress button
  document.getElementById('btn-reset-progress').onclick = async () => {
    if (confirm("Tens a certeza absoluta que queres limpar todo o teu progresso e histórico de sessões?")) {
      stats = {
        total_sessions: 0,
        total_correct: 0,
        total_questions: 0,
        streak: 0,
        last_active_date: '',
        history: []
      };
      await window.em.store.set('stats', stats);
      showToast("Histórico eliminado com sucesso!", "success");
      loadProgressTab();
      loadHomeStats();
    }
  };
}

// ── MODULE: SETTINGS (OLLAMA CONNECTION MANAGER) ───────────
async function checkOllamaConnection() {
  const dot = document.getElementById('ollama-status-dot');
  const text = document.getElementById('ollama-status-text');
  const select = document.getElementById('ollama-model-select');

  if (!dot || !text || !select) return;

  dot.className = "diff-dot diff-amber";
  text.textContent = "A estabelecer ligação com o Ollama...";

  ollamaOnline = await window.em.ollama.isOnline();

  if (ollamaOnline) {
    dot.className = "diff-dot diff-green";
    text.textContent = "Ollama Conectado Localmente";

    const res = await window.em.ollama.getModels();
    select.innerHTML = '';

    if (res.ok && res.models.length > 0) {
      res.models.forEach(model => {
        const o = document.createElement('option');
        o.value = model.name;
        o.textContent = `${model.name} (${(model.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`;
        if (model.name === ollamaModel) o.selected = true;
        select.appendChild(o);
      });

      if (!res.models.some(m => m.name === ollamaModel)) {
        ollamaModel = res.models[0].name;
        select.value = ollamaModel;
        await window.em.store.set('ollama_model', ollamaModel);
      }
    } else {
      const o = document.createElement('option');
      o.value = ollamaModel;
      o.textContent = `${ollamaModel} (Modelo ativo configurado)`;
      select.appendChild(o);
    }
  } else {
    dot.className = "diff-dot diff-red";
    text.textContent = "Ollama Desconectado (Inicia o Ollama no teu PC)";

    select.innerHTML = '';
    const o = document.createElement('option');
    o.value = ollamaModel;
    o.textContent = `${ollamaModel} (Servidor offline)`;
    select.appendChild(o);

    showToast("Não consegui ligar ao Ollama. Inicia o Ollama no teu computador!", "error");
  }
}

async function saveSettingsPanel() {
  const soundChk = document.getElementById('settings-sound');
  const select = document.getElementById('ollama-model-select');

  if (soundChk) soundEnabled = soundChk.checked;
  if (select) ollamaModel = select.value;

  await Promise.all([
    window.em.store.set('sound', soundEnabled),
    window.em.store.set('ollama_model', ollamaModel)
  ]);

  showToast("Configurações atualizadas com sucesso!", "success");
}

// ── INITIALIZATION ON PAGE LOAD ─────────────────────────────
async function initThemeSystem() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = await window.em.store.get('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.onclick = async () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      await window.em.store.set('theme', newTheme);
      showToast(`Tema alterado para modo ${newTheme === 'dark' ? 'escuro' : 'claro'}!`, "success");
    };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initThemeSystem();
  initWindowControls();
  await initDataStore();
  initNavigation();
  await loadExercises();
  await loadLessonPath();
  initPronunciationModule();

  // Settings Save Button bind
  const saveBtn = document.getElementById('btn-save-settings');
  if (saveBtn) saveBtn.onclick = saveSettingsPanel;

  // Settings Retry Connection bind
  const retryBtn = document.getElementById('btn-ollama-retry');
  if (retryBtn) retryBtn.onclick = checkOllamaConnection;

  // Initial silent verification of Ollama connection status
  ollamaOnline = await window.em.ollama.isOnline();
  if (ollamaOnline) {
    console.log("Ollama detectado localmente com sucesso.");
  }
});

// ============================================================
//  SCHOOL WORLD MODULE
// ============================================================

// ── BOOK CONTENT (library) ──────────────────────────────────
const LIBRARY_BOOKS = {
  simple_past: {
    title: 'Simple Past Tense', icon: '📖',
    description: 'Ações concluídas no passado',
    pages: [
      {
        title: 'Quando usar o Simple Past',
        html: `
          <p>O <strong>Simple Past</strong> descreve ações que aconteceram e <strong>terminaram</strong> no passado.</p>
          <div class="book-example">
            <p>✅ She <strong>walked</strong> to school yesterday.</p>
            <p>✅ They <strong>played</strong> football last Sunday.</p>
            <p>✅ I <strong>went</strong> to London in 2019.</p>
          </div>
          <div class="book-rule">
            <strong>Marcadores temporais comuns:</strong>
            <ul>
              <li><em>yesterday</em> — ontem</li>
              <li><em>last week / month / year</em> — semana/mês/ano passado</li>
              <li><em>ago</em> — há (2 days ago = há 2 dias)</li>
              <li><em>in 2020</em> — em 2020</li>
            </ul>
          </div>`
      },
      {
        title: 'Verbos Regulares vs Irregulares',
        html: `
          <p><strong>Verbos regulares</strong> — adiciona <span style="color:var(--cyan-400);">-ed</span>:</p>
          <table class="book-table">
            <tr><th>Infinitivo</th><th>Simple Past</th><th>Regra</th></tr>
            <tr><td>walk</td><td>walked</td><td>+ ed</td></tr>
            <tr><td>dance</td><td>danced</td><td>+ d (termina em e)</td></tr>
            <tr><td>study</td><td>studied</td><td>y → ied</td></tr>
            <tr><td>stop</td><td>stopped</td><td>dobra consoante</td></tr>
          </table>
          <p style="margin-top:14px;"><strong>Verbos irregulares</strong> — formas próprias:</p>
          <table class="book-table">
            <tr><th>Infinitivo</th><th>Simple Past</th></tr>
            <tr><td>go</td><td>went</td></tr>
            <tr><td>have</td><td>had</td></tr>
            <tr><td>see</td><td>saw</td></tr>
            <tr><td>take</td><td>took</td></tr>
            <tr><td>make</td><td>made</td></tr>
          </table>`
      },
      {
        title: 'Negativa e Interrogativa',
        html: `
          <div class="book-rule">
            <strong>Negativa:</strong> Subject + <em>did not / didn't</em> + infinitivo
          </div>
          <div class="book-example">
            <p>✅ She <strong>didn't go</strong> to the party.</p>
            <p>✅ I <strong>didn't see</strong> him yesterday.</p>
            <p>❌ ~~She didn't went~~ (errado!)</p>
          </div>
          <div class="book-rule" style="margin-top:14px;">
            <strong>Interrogativa:</strong> <em>Did</em> + subject + infinitivo?
          </div>
          <div class="book-example">
            <p>✅ <strong>Did</strong> you see the film?</p>
            <p>✅ <strong>Did</strong> she call you?</p>
            <p>✅ What <strong>did</strong> you do yesterday?</p>
          </div>`
      }
    ]
  },
  present_perfect: {
    title: 'Present Perfect', icon: '⏱️',
    description: 'Passado com ligação ao presente',
    pages: [
      {
        title: 'Estrutura do Present Perfect',
        html: `
          <p>Formação: <strong>Subject + have/has + past participle</strong></p>
          <div class="book-example">
            <p>✅ I <strong>have seen</strong> that film.</p>
            <p>✅ She <strong>has visited</strong> Paris.</p>
            <p>✅ We <strong>have lived</strong> here for 5 years.</p>
          </div>
          <div class="book-rule">
            <strong>Quando usar:</strong>
            <ul>
              <li>Ações passadas com resultado no presente</li>
              <li>Experiências de vida sem tempo específico</li>
              <li>Ações que continuam até hoje</li>
              <li>Notícias recentes</li>
            </ul>
          </div>`
      },
      {
        title: 'Expressões Temporais',
        html: `
          <table class="book-table">
            <tr><th>Palavra</th><th>Uso</th><th>Exemplo</th></tr>
            <tr><td><strong>just</strong></td><td>acabou de acontecer</td><td>I've just eaten.</td></tr>
            <tr><td><strong>already</strong></td><td>mais cedo que esperado</td><td>She's already left.</td></tr>
            <tr><td><strong>yet</strong></td><td>neg. / interrogativa</td><td>Has he arrived yet?</td></tr>
            <tr><td><strong>ever</strong></td><td>em algum momento</td><td>Have you ever been to Japan?</td></tr>
            <tr><td><strong>never</strong></td><td>nunca</td><td>I've never tried sushi.</td></tr>
            <tr><td><strong>for</strong></td><td>período de tempo</td><td>for 3 years</td></tr>
            <tr><td><strong>since</strong></td><td>ponto de início</td><td>since 2020</td></tr>
          </table>`
      },
      {
        title: 'Present Perfect vs Simple Past',
        html: `
          <div class="book-rule"><strong>Simple Past</strong> — tempo específico no passado</div>
          <div class="book-example">
            <p>✅ I <strong>saw</strong> him <em>yesterday</em>.</p>
            <p>✅ She <strong>visited</strong> Paris <em>in 2018</em>.</p>
          </div>
          <div class="book-rule" style="margin-top:14px;"><strong>Present Perfect</strong> — sem tempo específico ou resultado no presente</div>
          <div class="book-example">
            <p>✅ I <strong>have seen</strong> him recently.</p>
            <p>✅ She <strong>has visited</strong> Paris. (experiência de vida)</p>
          </div>
          <p style="margin-top:12px; color:var(--amber-400); font-size:0.88rem;">
            💡 Se o tempo é específico → Simple Past. Se é vago ou ligado ao presente → Present Perfect.
          </p>`
      }
    ]
  },
  phrasal_verbs: {
    title: 'Phrasal Verbs', icon: '🔤',
    description: 'Verbos compostos essenciais',
    pages: [
      {
        title: 'O que são Phrasal Verbs?',
        html: `
          <p>Um <strong>Phrasal Verb</strong> é um verbo + preposição/advérbio que forma um significado novo.</p>
          <div class="book-example">
            <p><strong>give</strong> + <strong>up</strong> = <em>give up</em> (desistir)</p>
            <p><strong>look</strong> + <strong>up</strong> = <em>look up</em> (pesquisar)</p>
            <p><strong>turn</strong> + <strong>off</strong> = <em>turn off</em> (desligar)</p>
          </div>
          <div class="book-rule">
            <strong>Dois tipos:</strong>
            <ul>
              <li><em>Separáveis:</em> Turn the TV <strong>off</strong> = Turn <strong>off</strong> the TV</li>
              <li><em>Inseparáveis:</em> Look <strong>after</strong> the baby (não separa)</li>
            </ul>
          </div>`
      },
      {
        title: 'Phrasal Verbs Essenciais',
        html: `
          <table class="book-table">
            <tr><th>Phrasal Verb</th><th>Significado</th></tr>
            <tr><td>give up</td><td>desistir</td></tr>
            <tr><td>look up</td><td>pesquisar / procurar</td></tr>
            <tr><td>turn on / off</td><td>ligar / desligar</td></tr>
            <tr><td>put off</td><td>adiar</td></tr>
            <tr><td>find out</td><td>descobrir</td></tr>
            <tr><td>carry on</td><td>continuar</td></tr>
            <tr><td>get on with</td><td>dar-se bem com</td></tr>
            <tr><td>break down</td><td>avariar / colapsar</td></tr>
            <tr><td>set up</td><td>criar / montar</td></tr>
            <tr><td>run out of</td><td>ficar sem</td></tr>
          </table>`
      },
      {
        title: 'Exemplos em Contexto',
        html: `
          <div class="book-example">
            <p>✅ Don't <strong>give up</strong> — you're almost there!</p>
            <p>✅ I need to <strong>look up</strong> this word in the dictionary.</p>
            <p>✅ Please <strong>turn off</strong> the lights when you leave.</p>
            <p>✅ They <strong>put off</strong> the meeting until next week.</p>
            <p>✅ We <strong>ran out of</strong> milk this morning.</p>
          </div>
          <div class="book-rule">
            💡 Aprende phrasal verbs em contexto de frases. Memorizar listas isoladas é menos eficaz.
          </div>`
      }
    ]
  },
  business_english: {
    title: 'Business English', icon: '💼',
    description: 'Inglês profissional e corporativo',
    pages: [
      {
        title: 'Emails Profissionais',
        html: `
          <table class="book-table">
            <tr><th>Secção</th><th>Expressão</th></tr>
            <tr><td>Abertura formal</td><td>Dear Mr/Ms [Name],</td></tr>
            <tr><td>Abertura informal</td><td>Hi [Name], / Hello [Name],</td></tr>
            <tr><td>Motivo</td><td>I'm writing regarding...</td></tr>
            <tr><td>Anexo</td><td>Please find attached...</td></tr>
            <tr><td>Pedido</td><td>Could you please...?</td></tr>
            <tr><td>Prazo</td><td>by end of day / by Friday</td></tr>
            <tr><td>Encerramento formal</td><td>Yours sincerely, / Best regards,</td></tr>
            <tr><td>Encerramento informal</td><td>Best, / Thanks,</td></tr>
          </table>`
      },
      {
        title: 'Linguagem de Reuniões',
        html: `
          <table class="book-table">
            <tr><th>Situação</th><th>Expressão</th></tr>
            <tr><td>Começar</td><td>Let's get started. / Shall we begin?</td></tr>
            <tr><td>Dar a palavra</td><td>I'd like to hand it over to...</td></tr>
            <tr><td>Pedir opinião</td><td>What's your take on this?</td></tr>
            <tr><td>Concordar</td><td>I completely agree. / That's a good point.</td></tr>
            <tr><td>Discordar educado</td><td>I see your point, however...</td></tr>
            <tr><td>Interromper</td><td>Sorry to interrupt, but...</td></tr>
            <tr><td>Resumir</td><td>To sum up... / In summary...</td></tr>
            <tr><td>Próximos passos</td><td>Going forward... / Action points:</td></tr>
          </table>`
      },
      {
        title: 'Apresentações Profissionais',
        html: `
          <div class="book-rule">
            <strong>Estrutura de uma apresentação:</strong>
            <ul>
              <li><em>Introdução:</em> "Today I'm going to talk about..."</li>
              <li><em>Agenda:</em> "I'll cover three main points..."</li>
              <li><em>Transição:</em> "Moving on to... / Now let's look at..."</li>
              <li><em>Destaque:</em> "The key point here is..."</li>
              <li><em>Conclusão:</em> "To wrap up... / In conclusion..."</li>
              <li><em>Q&A:</em> "I'm happy to take questions now."</li>
            </ul>
          </div>
          <div class="book-example">
            <p>✅ "Today I'm going to present our Q3 results."</p>
            <p>✅ "As you can see from this chart..."</p>
            <p>✅ "This brings me to my final point..."</p>
          </div>`
      }
    ]
  },
  conditionals: {
    title: 'Conditionals', icon: '🔀',
    description: 'Frases condicionais (if clauses)',
    pages: [
      {
        title: 'Zero & First Conditional',
        html: `
          <div class="book-rule">
            <strong>Zero Conditional</strong> — verdades gerais/científicas<br>
            <em>If + present simple, present simple</em>
          </div>
          <div class="book-example">
            <p>✅ If you heat water to 100°C, it <strong>boils</strong>.</p>
            <p>✅ If it rains, the ground <strong>gets</strong> wet.</p>
          </div>
          <div class="book-rule" style="margin-top:14px;">
            <strong>First Conditional</strong> — situações reais/prováveis<br>
            <em>If + present simple, will + infinitive</em>
          </div>
          <div class="book-example">
            <p>✅ If it rains tomorrow, I <strong>will stay</strong> home.</p>
            <p>✅ If she studies hard, she <strong>will pass</strong>.</p>
          </div>`
      },
      {
        title: 'Second Conditional',
        html: `
          <div class="book-rule">
            <strong>Second Conditional</strong> — hipotético/improvável no presente/futuro<br>
            <em>If + past simple, would + infinitive</em>
          </div>
          <div class="book-example">
            <p>✅ If I <strong>had</strong> a million euros, I <strong>would travel</strong> the world.</p>
            <p>✅ If she <strong>knew</strong> his number, she <strong>would call</strong> him.</p>
            <p>✅ If I <strong>were</strong> you, I <strong>would accept</strong> the offer.</p>
          </div>
          <div class="book-rule" style="margin-top:14px;">
            💡 "If I <strong>were</strong>" (não "was") é o subjuntivo formal correto.
          </div>`
      },
      {
        title: 'Third Conditional + Resumo',
        html: `
          <div class="book-rule">
            <strong>Third Conditional</strong> — hipotético no passado (não aconteceu)<br>
            <em>If + past perfect, would have + past participle</em>
          </div>
          <div class="book-example">
            <p>✅ If I <strong>had studied</strong> more, I <strong>would have passed</strong>.</p>
            <p>✅ If she <strong>had left</strong> earlier, she <strong>wouldn't have missed</strong> the train.</p>
          </div>
          <div class="book-rule" style="margin-top:14px;">
            <strong>Resumo:</strong>
            <ul>
              <li>Zero: if + present → present</li>
              <li>First: if + present → will</li>
              <li>Second: if + past → would</li>
              <li>Third: if + past perfect → would have</li>
            </ul>
          </div>`
      }
    ]
  },
  vocabulary: {
    title: 'Vocabulary', icon: '📝',
    description: 'Vocabulário e expressões essenciais',
    pages: [
      {
        title: 'Palavras Académicas',
        html: `
          <table class="book-table">
            <tr><th>Palavra</th><th>Significado</th><th>Exemplo</th></tr>
            <tr><td>analyze</td><td>analisar</td><td>We need to analyze the data.</td></tr>
            <tr><td>demonstrate</td><td>demonstrar</td><td>The results demonstrate...</td></tr>
            <tr><td>significant</td><td>significativo</td><td>A significant improvement.</td></tr>
            <tr><td>approach</td><td>abordagem</td><td>A new approach to learning.</td></tr>
            <tr><td>evaluate</td><td>avaliar</td><td>Evaluate each option carefully.</td></tr>
            <tr><td>establish</td><td>estabelecer</td><td>Establish a clear goal.</td></tr>
          </table>`
      },
      {
        title: 'Idioms & Expressões',
        html: `
          <table class="book-table">
            <tr><th>Idiom</th><th>Significado</th></tr>
            <tr><td>break a leg</td><td>boa sorte!</td></tr>
            <tr><td>hit the nail on the head</td><td>acertar em cheio</td></tr>
            <tr><td>bite the bullet</td><td>aguentar / encarar</td></tr>
            <tr><td>under the weather</td><td>sentir-se mal</td></tr>
            <tr><td>the ball is in your court</td><td>a decisão é tua</td></tr>
            <tr><td>once in a blue moon</td><td>raramente</td></tr>
            <tr><td>let the cat out of the bag</td><td>revelar um segredo</td></tr>
          </table>`
      },
      {
        title: 'Collocations',
        html: `
          <p><strong>Collocations</strong> — combinações naturais de palavras:</p>
          <table class="book-table">
            <tr><th>Verbo</th><th>+ Substantivo</th></tr>
            <tr><td>make</td><td>a decision, a mistake, progress, friends</td></tr>
            <tr><td>do</td><td>homework, research, exercise, damage</td></tr>
            <tr><td>take</td><td>a break, a risk, an exam, notes</td></tr>
            <tr><td>get</td><td>permission, experience, feedback, lost</td></tr>
            <tr><td>have</td><td>a meeting, a chat, difficulty, fun</td></tr>
          </table>
          <div class="book-rule" style="margin-top:12px;">
            💡 Não se diz "do a decision" — diz-se "make a decision". Aprende sempre em par.
          </div>`
      }
    ]
  }
};

// ============================================================
//  LESSON PATH MODULE  (Escola)
//  Caminho de lições ao estilo Duolingo: 18 lições
//  (6 tópicos × 3 níveis), uma por dia.
//   - Bloqueio diário rígido: a próxima lição só abre no dia seguinte.
//   - Cada lição = apenas exercícios, mas fica bloqueada até a teoria
//     desse tópico ter sido lida (gate de teoria, reutiliza LIBRARY_BOOKS).
// ============================================================

const LESSON_TOPIC_ORDER = ['simple_past', 'present_perfect', 'conditionals', 'phrasal_verbs', 'vocabulary', 'business_english'];
const LESSON_LEVELS = ['beginner', 'intermediate', 'advanced'];
const LEVEL_LABEL = { beginner: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado' };
const LEVEL_DOT   = { beginner: 'diff-green', intermediate: 'diff-amber', advanced: 'diff-red' };
const LESSON_SIZE = 6;

// Lista ordenada das 18 lições
const LESSONS = [];
LESSON_TOPIC_ORDER.forEach(topic => {
  LESSON_LEVELS.forEach(level => LESSONS.push({ topic, level }));
});

// Zig-zag horizontal offsets (px) para desenhar o caminho sinuoso
const PATH_OFFSETS = [0, 66, 96, 66, 0, -66, -96, -66];

// Estado persistido
let lessonPath = {
  done: 0,       // nº de lições concluídas (índice da atual = done)
  theory: {},    // { topicKey: true }
  lastDate: '',  // YYYY-MM-DD da última lição concluída (bloqueio diário)
  streak: 0      // dias seguidos
};

let activeLesson = null;                       // { index, topic, level }
const lessonQuiz = { exercises: [], idx: 0, score: 0 };

function todayStr() { return new Date().toISOString().split('T')[0]; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

async function loadLessonPath() {
  const saved = await window.em.store.get('school_path');
  if (saved && typeof saved === 'object') {
    lessonPath = { done: 0, theory: {}, lastDate: '', streak: 0, ...saved };
    if (!lessonPath.theory || typeof lessonPath.theory !== 'object') lessonPath.theory = {};
  }
}

async function saveLessonPath() {
  await window.em.store.set('school_path', lessonPath);
}

// A lição atual está bloqueada se já foi concluída uma lição hoje
function isDailyLocked() {
  return lessonPath.lastDate === todayStr();
}

// Estado de um nó: 'done' | 'ready' | 'theory' | 'today' | 'locked'
function lessonNodeState(i) {
  if (i < lessonPath.done) return 'done';
  if (i > lessonPath.done) return 'locked';
  if (lessonPath.done >= LESSONS.length) return 'done';
  if (isDailyLocked()) return 'today';
  if (!lessonPath.theory[LESSONS[i].topic]) return 'theory';
  return 'ready';
}

function topicLabelOf(topic) {
  const t = exercisesDb && exercisesDb[topic];
  return t ? t.label : (LIBRARY_BOOKS[topic] ? LIBRARY_BOOKS[topic].title : topic);
}
function topicIconOf(topic) {
  const t = exercisesDb && exercisesDb[topic];
  return (t && t.icon) || (LIBRARY_BOOKS[topic] && LIBRARY_BOOKS[topic].icon) || '📖';
}

// ── RENDER DO CAMINHO ────────────────────────────────────────
function renderLessonPath() {
  const path = document.getElementById('lesson-path');
  if (!path) return;

  setText('lp-done-count', lessonPath.done);
  setText('lp-day-streak', lessonPath.streak);

  path.innerHTML = '';

  LESSONS.forEach((lesson, i) => {
    const state = lessonNodeState(i);
    const offset = PATH_OFFSETS[i % PATH_OFFSETS.length];

    const row = document.createElement('div');
    row.className = 'lesson-node-row';

    const node = document.createElement('button');
    node.className = `lesson-node state-${state} ${LEVEL_DOT[lesson.level]}`;
    node.style.transform = `translateX(${offset}px)`;
    node.setAttribute('data-index', i);

    let glyph;
    if (state === 'done')        glyph = '<span class="ln-glyph">✓</span>';
    else if (state === 'theory') glyph = '<span class="ln-glyph">📖</span>';
    else if (state === 'today')  glyph = '<span class="ln-glyph">🔒</span>';
    else if (state === 'locked') glyph = '<span class="ln-glyph">🔒</span>';
    else                         glyph = `<span class="ln-num">${i + 1}</span>`;
    node.innerHTML = glyph;
    node.onclick = () => onLessonNodeClick(i);

    const cap = document.createElement('div');
    cap.className = 'lesson-node-caption';
    cap.style.transform = `translateX(${offset}px)`;
    cap.innerHTML =
      `<span class="lncap-n">${i + 1}.</span> ${escapeHtml(topicIconOf(lesson.topic))} ${escapeHtml(topicLabelOf(lesson.topic))}` +
      ` · <span class="lncap-lvl">${LEVEL_LABEL[lesson.level]}</span>`;

    row.appendChild(node);
    row.appendChild(cap);
    path.appendChild(row);
  });

  if (lessonPath.done >= LESSONS.length) {
    const fin = document.createElement('div');
    fin.className = 'lesson-path-complete';
    fin.innerHTML =
      `<div class="exit-icon-big">🎓</div>` +
      `<h3>Concluíste todas as ${LESSONS.length} lições!</h3>` +
      `<p>Parabéns! Continua a praticar no separador “Praticar”.</p>`;
    path.appendChild(fin);
  }

  updateLessonCTA();

  // Centra a lição atual
  const cur = path.querySelector('.lesson-node.state-ready, .lesson-node.state-theory, .lesson-node.state-today');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function updateLessonCTA() {
  const btn = document.getElementById('lp-continue-btn');
  const hint = document.getElementById('lp-cta-hint');
  if (!btn || !hint) return;

  if (lessonPath.done >= LESSONS.length) {
    btn.disabled = true;
    btn.textContent = '🎓 Caminho concluído';
    hint.textContent = 'Completaste todas as lições. Excelente trabalho!';
    return;
  }

  const i = lessonPath.done;
  const lesson = LESSONS[i];
  const label = topicLabelOf(lesson.topic);
  const state = lessonNodeState(i);

  btn.disabled = false;
  btn.onclick = () => onLessonNodeClick(i);

  if (state === 'today') {
    btn.disabled = true;
    btn.textContent = '🔒 Volta amanhã';
    hint.textContent = 'Já completaste a lição de hoje. Volta amanhã para a próxima!';
  } else if (state === 'theory') {
    btn.textContent = '📖 Ler teoria';
    hint.textContent = `Lição ${i + 1}: ${label} (${LEVEL_LABEL[lesson.level]}) — lê a teoria primeiro.`;
  } else {
    btn.textContent = '▶ Iniciar Lição ' + (i + 1);
    hint.textContent = `Lição ${i + 1}: ${label} (${LEVEL_LABEL[lesson.level]}).`;
  }
}

function onLessonNodeClick(i) {
  const state = lessonNodeState(i);
  if (state === 'done')   { showToast('✅ Lição já concluída.', 'info'); return; }
  if (state === 'locked') { showToast('🔒 Completa as lições anteriores primeiro.', 'error'); return; }
  if (state === 'today')  { showToast('🔒 Já fizeste a lição de hoje. Volta amanhã!', 'info'); return; }
  if (state === 'theory') { openTheory(i); return; }
  startLessonQuiz(i); // ready
}

// ── TEORIA (gate) — reutiliza a leitura de LIBRARY_BOOKS ─────
let theoryTopic = null;
let theoryPageIdx = 0;

function openTheory(lessonIndex) {
  const lesson = LESSONS[lessonIndex];
  theoryTopic = lesson.topic;
  theoryPageIdx = 0;

  const book = LIBRARY_BOOKS[theoryTopic];
  if (!book) { showToast('Teoria indisponível para este tópico.', 'error'); startLessonQuiz(lessonIndex); return; }

  document.getElementById('overlay-theory').classList.remove('hidden');
  setText('theory-overlay-title', (book.icon || '📖') + ' Teoria: ' + book.title);
  renderTheoryPage();

  document.getElementById('close-theory').onclick = closeTheory;
  document.getElementById('btn-prev-page').onclick = () => {
    if (theoryPageIdx > 0) { theoryPageIdx--; renderTheoryPage(); }
  };
  document.getElementById('btn-next-page').onclick = advanceTheoryPage;
}

function renderTheoryPage() {
  const book = LIBRARY_BOOKS[theoryTopic];
  const page = book.pages[theoryPageIdx];
  const total = book.pages.length;

  setText('reader-title', book.icon + ' ' + page.title);
  document.getElementById('reader-content').innerHTML = page.html;
  setText('reader-page-counter', (theoryPageIdx + 1) + ' / ' + total);

  document.getElementById('reader-dots').innerHTML =
    book.pages.map((_, idx) => `<div class="reader-dot ${idx === theoryPageIdx ? 'active' : ''}"></div>`).join('');

  const prev = document.getElementById('btn-prev-page');
  const next = document.getElementById('btn-next-page');
  if (prev) prev.disabled = theoryPageIdx === 0;
  if (next) next.textContent = (theoryPageIdx === total - 1) ? '✅ Concluir e praticar' : 'Próximo →';
}

function advanceTheoryPage() {
  const book = LIBRARY_BOOKS[theoryTopic];
  if (theoryPageIdx < book.pages.length - 1) {
    theoryPageIdx++;
    renderTheoryPage();
    return;
  }
  // Última página: marca teoria como lida e arranca os exercícios
  lessonPath.theory[theoryTopic] = true;
  saveLessonPath();
  document.getElementById('overlay-theory').classList.add('hidden');
  showToast('📖 Teoria concluída! Agora os exercícios.', 'success');

  const i = lessonPath.done;
  if (lessonNodeState(i) === 'ready') startLessonQuiz(i);
  else renderLessonPath();
}

function closeTheory() {
  document.getElementById('overlay-theory').classList.add('hidden');
  renderLessonPath();
}

// ── LIÇÃO (quiz de exercícios) ──────────────────────────────
function startLessonQuiz(lessonIndex) {
  const lesson = LESSONS[lessonIndex];
  const topicObj = exercisesDb && exercisesDb[lesson.topic];
  if (!topicObj) { showToast('Tópico indisponível.', 'error'); return; }
  const pool = (topicObj.exercises && topicObj.exercises[lesson.level]) || [];
  if (!pool.length) { showToast('Sem exercícios para esta lição.', 'error'); return; }

  activeLesson = { index: lessonIndex, topic: lesson.topic, level: lesson.level };
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  lessonQuiz.exercises = shuffled.slice(0, Math.min(LESSON_SIZE, shuffled.length));
  lessonQuiz.idx = 0;
  lessonQuiz.score = 0;

  document.getElementById('overlay-lesson').classList.remove('hidden');
  setText('lesson-overlay-title', 'Lição ' + (lessonIndex + 1) + ': ' + topicObj.label);
  setText('lesson-overlay-sub', 'Nível ' + LEVEL_LABEL[lesson.level] + ' — responde a todas as questões.');
  document.getElementById('lesson-exercise-area').classList.remove('hidden');
  document.getElementById('lesson-results').classList.add('hidden');

  document.getElementById('lesson-abort-btn').onclick = abortLesson;
  document.getElementById('close-lesson').onclick = abortLesson;

  renderLessonExercise();
}

function abortLesson() {
  document.getElementById('overlay-lesson').classList.add('hidden');
  renderLessonPath();
}

function renderLessonExercise() {
  if (lessonQuiz.idx >= lessonQuiz.exercises.length) { showLessonResults(); return; }
  const ex = lessonQuiz.exercises[lessonQuiz.idx];
  const total = lessonQuiz.exercises.length;

  document.getElementById('lesson-progress-fill').style.width = Math.round((lessonQuiz.idx / total) * 100) + '%';
  setText('lesson-counter', (lessonQuiz.idx + 1) + ' / ' + total);
  setText('lesson-score-badge', '✓ ' + lessonQuiz.score);

  let typeLabel = '', cardHtml = '';
  if (ex.type === 'multiple_choice') {
    typeLabel = 'Escolha Múltipla';
    cardHtml = '<div class="mc-options">' + ex.options.map((opt, idx) => `
        <button class="mc-option" data-opt-index="${idx}">
          <span class="mc-option-letter">${String.fromCharCode(65 + idx)}</span>
          <span class="mc-option-text">${escapeHtml(opt)}</span>
        </button>`).join('') + '</div>';
  } else if (ex.type === 'fill_blank') {
    typeLabel = 'Preencher Espaço';
    cardHtml = `<div class="fill-wrap"><input type="text" class="fill-input" id="ln-blank" placeholder="Escreve a palavra em falta..." autocomplete="off" spellcheck="false"></div>`;
  } else {
    typeLabel = 'Tradução';
    cardHtml = `<div class="fill-wrap"><textarea class="translation-input" id="ln-translation" placeholder="Traduz a frase para inglês..." autocomplete="off" spellcheck="false"></textarea></div>`;
  }

  document.getElementById('lesson-exercise-card').innerHTML = `
    <div class="exercise-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <span class="exercise-type-tag">📝 ${typeLabel}</span>
        <button class="btn-ghost btn-sm" id="ln-tts">🔊 Ouvir</button>
      </div>
      <h3 class="exercise-question">${escapeHtml(ex.question)}</h3>
      ${ex.hint ? `<p class="exercise-hint">💡 Dica: ${escapeHtml(ex.hint)}</p>` : ''}
      ${cardHtml}
      <div class="exercise-feedback hidden" id="ln-feedback">
        <div class="feedback-label" id="ln-feedback-title"></div>
        <div class="feedback-explanation" id="ln-feedback-text"></div>
      </div>
      <div class="exercise-actions">
        <button class="btn-primary" id="ln-check">Verificar resposta</button>
      </div>
    </div>`;

  document.getElementById('ln-tts').onclick = () =>
    playTTS(ex.type === 'translation' ? ex.question : ex.question.replace('___', 'blank'));

  const checkBtn = document.getElementById('ln-check');

  if (ex.type === 'multiple_choice') {
    let selected = null;
    document.querySelectorAll('#lesson-exercise-card .mc-option').forEach(opt => {
      opt.onclick = () => {
        document.querySelectorAll('#lesson-exercise-card .mc-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selected = ex.options[Number(opt.getAttribute('data-opt-index'))];
      };
    });
    checkBtn.onclick = () => { if (!selected) { showToast('Seleciona uma opção!', 'error'); return; } verifyLessonAnswer(ex, selected); };
  } else if (ex.type === 'fill_blank') {
    const inp = document.getElementById('ln-blank');
    inp.focus();
    inp.onkeydown = e => { if (e.key === 'Enter') checkBtn.click(); };
    checkBtn.onclick = () => { const a = inp.value.trim(); if (!a) { showToast('Escreve uma resposta!', 'error'); return; } verifyLessonAnswer(ex, a); };
  } else {
    const inp = document.getElementById('ln-translation');
    inp.focus();
    checkBtn.onclick = () => { const a = inp.value.trim(); if (!a) { showToast('Escreve a tradução!', 'error'); return; } verifyLessonAnswer(ex, a); };
  }
}

function verifyLessonAnswer(ex, given) {
  const checkBtn = document.getElementById('ln-check');
  checkBtn.disabled = true;

  const isCorrect = checkStrictMatch(given, ex.answer);
  playSynthBeep(isCorrect);
  if (isCorrect) lessonQuiz.score++;

  if (ex.type === 'multiple_choice') {
    document.querySelectorAll('#lesson-exercise-card .mc-option').forEach(o => {
      o.disabled = true;
      const val = ex.options[Number(o.getAttribute('data-opt-index'))];
      if (val === ex.answer) o.classList.add('correct');
      else if (val === given && !isCorrect) o.classList.add('wrong');
    });
  } else {
    const inp = document.getElementById('ln-blank') || document.getElementById('ln-translation');
    if (inp) { inp.disabled = true; inp.classList.add(isCorrect ? 'correct' : 'wrong'); }
  }

  const feedback = document.getElementById('ln-feedback');
  feedback.classList.remove('hidden');
  feedback.className = 'exercise-feedback ' + (isCorrect ? 'correct' : 'wrong');
  setText('ln-feedback-title', isCorrect ? '🎉 Correto!' : '❌ Incorreto');
  document.getElementById('ln-feedback-text').innerHTML =
    `<strong>Resposta:</strong> <span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(ex.answer)}</span>` +
    (ex.explanation ? `<p style="margin-top:8px;color:var(--text-secondary);font-size:0.82rem;">${escapeHtml(ex.explanation)}</p>` : '');

  setText('lesson-score-badge', '✓ ' + lessonQuiz.score);

  const isLast = lessonQuiz.idx === lessonQuiz.exercises.length - 1;
  checkBtn.textContent = isLast ? 'Ver Resultado →' : 'Seguinte →';
  checkBtn.disabled = false;
  checkBtn.onclick = () => { lessonQuiz.idx++; renderLessonExercise(); };
}

async function showLessonResults() {
  document.getElementById('lesson-exercise-area').classList.add('hidden');
  document.getElementById('lesson-results').classList.remove('hidden');

  const total = lessonQuiz.exercises.length;
  const score = lessonQuiz.score;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const icon = pct === 100 ? '🔥' : pct >= 75 ? '🏆' : pct >= 50 ? '⭐' : '💪';
  const msg = pct === 100 ? 'Perfeito! 100% de precisão!'
            : pct >= 75 ? 'Excelente trabalho!'
            : pct >= 50 ? 'Bom esforço, continua!'
            : 'Lição concluída — revê a teoria se precisares.';

  setText('lesson-results-icon', icon);
  setText('lesson-results-big', score);
  setText('lesson-results-total', '/ ' + total);
  setText('lesson-results-msg', pct + '% de precisão — ' + msg);

  // Avança o progresso do caminho (só na 1ª vez para este índice)
  const i = activeLesson ? activeLesson.index : lessonPath.done;
  let advanced = false;
  if (i === lessonPath.done && lessonPath.done < LESSONS.length) {
    bumpLessonStreak();
    lessonPath.done++;
    lessonPath.lastDate = todayStr();
    await saveLessonPath();
    advanced = true;
  }

  // Alimenta as estatísticas globais de Progresso
  saveCompletedSession(score, total, topicLabelOf(activeLesson.topic), activeLesson.level);

  const actions = document.getElementById('lesson-results-actions');
  actions.innerHTML = '';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-primary';
  doneBtn.textContent = '✅ Concluir';
  doneBtn.onclick = () => {
    document.getElementById('overlay-lesson').classList.add('hidden');
    renderLessonPath();
    if (advanced) {
      if (lessonPath.done >= LESSONS.length) showToast('🎓 Concluíste todas as lições!', 'success');
      else showToast('🌅 Lição concluída! A próxima abre amanhã.', 'success');
    }
  };

  const repeatBtn = document.createElement('button');
  repeatBtn.className = 'btn-secondary';
  repeatBtn.textContent = '🔄 Repetir';
  repeatBtn.onclick = () => startLessonQuiz(activeLesson.index);

  actions.appendChild(doneBtn);
  actions.appendChild(repeatBtn);
}

function bumpLessonStreak() {
  const today = todayStr();
  if (!lessonPath.lastDate) { lessonPath.streak = 1; return; }
  const diffDays = Math.round((new Date(today) - new Date(lessonPath.lastDate)) / 86400000);
  if (diffDays === 1) lessonPath.streak++;
  else if (diffDays > 1) lessonPath.streak = 1;
  if (!lessonPath.streak) lessonPath.streak = 1;
}
