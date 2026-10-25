'use strict';

/* ── Music Player (pasta de música do utilizador) ───────────── */
// A app não inclui música: o utilizador escolhe uma pasta no seu
// computador e o leitor toca os ficheiros de lá.
(function () {
  if (!window.em || !window.em.music) return;

  // ── State ────────────────────────────────────────────────────
  const state = {
    playlist: [],
    folderName: '',
    trackIndex: 0,
    playing: false,
    volume: 0.35,
    showList: false
  };

  const audio = new Audio();
  audio.volume = state.volume;
  audio.loop = false;
  audio.addEventListener('ended', () => nextTrack());
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('error', onAudioError);

  let els = {};

  function buildUI() {
    const html = `
    <div id="music-player" class="music-player" aria-label="Leitor de Música">

      <div class="mp-bar">
        <button class="mp-btn mp-toggle-btn" id="mp-toggle-list" title="Ver playlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>

        <div class="mp-track-info">
          <span class="mp-note-icon">♪</span>
          <div class="mp-text-wrap">
            <span class="mp-title" id="mp-title">A tua música</span>
            <span class="mp-mode-badge" id="mp-badge">Sem pasta</span>
          </div>
        </div>

        <div class="mp-progress-wrap">
          <div class="mp-progress-bar" id="mp-progress-bar">
            <div class="mp-progress-fill" id="mp-progress-fill"></div>
          </div>
        </div>

        <div class="mp-controls">
          <button class="mp-btn" id="mp-prev" title="Anterior">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>

          <button class="mp-btn mp-play-btn" id="mp-play" title="Play/Pause">
            <svg class="mp-icon-play" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <svg class="mp-icon-pause hidden" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>

          <button class="mp-btn" id="mp-next" title="Próxima">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>

        <div class="mp-volume-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mp-volume-icon">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          <input type="range" class="mp-volume" id="mp-volume" min="0" max="1" step="0.02" value="0.35">
        </div>

        <button class="mp-btn mp-hide-btn" id="mp-hide" title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      </div>

      <div class="mp-list hidden" id="mp-list">
        <div class="mp-list-header">
          <span id="mp-list-heading">A tua música</span>
          <span class="mp-folder-actions">
            <button class="mp-folder-btn" id="mp-choose" title="Escolher a pasta com a tua música">📁 Escolher pasta</button>
            <button class="mp-folder-btn hidden" id="mp-forget" title="Deixar de usar esta pasta">✕</button>
          </span>
        </div>
        <div class="mp-list-items" id="mp-list-items"></div>
      </div>

    </div>

    <button class="mp-show-pill hidden" id="mp-show-pill" title="Mostrar leitor de música">
      <span class="mp-note-icon">♪</span>
    </button>
    `;

    const container = document.createElement('div');
    container.innerHTML = html.trim();
    document.body.appendChild(container.firstChild);
    document.body.appendChild(container.lastChild);

    els = {
      player:      document.getElementById('music-player'),
      title:       document.getElementById('mp-title'),
      badge:       document.getElementById('mp-badge'),
      play:        document.getElementById('mp-play'),
      prev:        document.getElementById('mp-prev'),
      next:        document.getElementById('mp-next'),
      volume:      document.getElementById('mp-volume'),
      progress:    document.getElementById('mp-progress-fill'),
      progressBar: document.getElementById('mp-progress-bar'),
      list:        document.getElementById('mp-list'),
      listHeading: document.getElementById('mp-list-heading'),
      listItems:   document.getElementById('mp-list-items'),
      toggleList:  document.getElementById('mp-toggle-list'),
      choose:      document.getElementById('mp-choose'),
      forget:      document.getElementById('mp-forget'),
      hide:        document.getElementById('mp-hide'),
      showPill:    document.getElementById('mp-show-pill')
    };

    bindEvents();
    restore();
  }

  // ── Library ──────────────────────────────────────────────────
  async function restore() {
    const savedVolume = Number(await window.em.store.get('music_volume'));
    if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
      state.volume = savedVolume;
      audio.volume = savedVolume;
      els.volume.value = savedVolume;
    }
    if (await window.em.store.get('music_hidden')) setHidden(true);
    applyLibrary(await window.em.music.getLibrary());
  }

  async function chooseFolder() {
    const lib = await window.em.music.chooseFolder();
    if (lib.canceled) return;
    stopPlayback();
    applyLibrary(lib);
    if (!state.playlist.length) setList(true);
  }

  async function forgetFolder() {
    await window.em.music.forgetFolder();
    stopPlayback();
    applyLibrary({ folder: null, tracks: [] });
  }

  function applyLibrary(lib) {
    state.playlist = (lib && lib.tracks) || [];
    state.folderName = (lib && lib.name) || '';
    state.trackIndex = 0;

    const hasFolder = !!(lib && lib.folder);
    els.listHeading.textContent = hasFolder ? `📁 ${state.folderName}` : 'A tua música';
    els.choose.textContent = hasFolder ? 'Mudar pasta' : '📁 Escolher pasta';
    els.forget.classList.toggle('hidden', !hasFolder);

    buildPlaylist(hasFolder);
    updateTrackUI();
  }

  function buildPlaylist(hasFolder) {
    els.listItems.innerHTML = '';

    if (!state.playlist.length) {
      const empty = document.createElement('p');
      empty.className = 'mp-list-empty';
      empty.textContent = hasFolder
        ? 'Não encontrei músicas nesta pasta (mp3, wav, ogg, flac, m4a…).'
        : 'Escolhe uma pasta do teu computador com música para ouvires enquanto estudas.';
      els.listItems.appendChild(empty);
      return;
    }

    state.playlist.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = 'mp-list-item' + (i === state.trackIndex ? ' mp-list-active' : '');

      const num = document.createElement('span');
      num.className = 'mp-list-num';
      num.textContent = String(i + 1).padStart(2, '0');

      // Os nomes vêm de ficheiros do utilizador: textContent, nunca innerHTML.
      const title = document.createElement('span');
      title.className = 'mp-list-title';
      title.textContent = track.title;

      const folder = document.createElement('span');
      folder.className = 'mp-list-artist';
      folder.textContent = track.folder;

      item.append(num, title, folder);
      item.addEventListener('click', () => { state.trackIndex = i; loadAndPlay(); });
      els.listItems.appendChild(item);
    });
  }

  // ── Events ───────────────────────────────────────────────────
  function bindEvents() {
    els.play.addEventListener('click', togglePlay);
    els.prev.addEventListener('click', prevTrack);
    els.next.addEventListener('click', nextTrack);
    els.choose.addEventListener('click', chooseFolder);
    els.forget.addEventListener('click', forgetFolder);
    els.volume.addEventListener('input', e => {
      state.volume = parseFloat(e.target.value);
      audio.volume = state.volume;
    });
    els.volume.addEventListener('change', () => window.em.store.set('music_volume', state.volume));
    els.progressBar.addEventListener('click', e => {
      if (!audio.duration) return;
      const rect = els.progressBar.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
    els.toggleList.addEventListener('click', () => setList(!state.showList));
    els.hide.addEventListener('click', () => setHidden(true));
    els.showPill.addEventListener('click', () => setHidden(false));
  }

  function setList(show) {
    state.showList = show;
    els.list.classList.toggle('hidden', !show);
    els.toggleList.classList.toggle('mp-btn-active', show);
  }

  function setHidden(hidden) {
    els.player.classList.toggle('mp-hidden', hidden);
    els.showPill.classList.toggle('hidden', !hidden);
    window.em.store.set('music_hidden', hidden);
  }

  // ── Playback ─────────────────────────────────────────────────
  function loadAndPlay() {
    const track = state.playlist[state.trackIndex];
    if (!track) return;
    updateTrackUI();
    audio.src = track.url;
    audio.currentTime = 0;
    audio.play()
      .then(() => { state.playing = true; updatePlayBtn(); })
      .catch(() => { state.playing = false; updatePlayBtn(); });
    updatePlayBtn();
    updateListHighlight();
  }

  function stopPlayback() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.playing = false;
    els.progress.style.width = '0%';
    updatePlayBtn();
  }

  function togglePlay() {
    // Sem músicas, o botão play abre a escolha da pasta.
    if (!state.playlist.length) { chooseFolder(); return; }
    if (!audio.src) { loadAndPlay(); return; }
    if (state.playing) {
      audio.pause();
      state.playing = false;
    } else {
      audio.play().then(() => { state.playing = true; updatePlayBtn(); }).catch(() => {});
    }
    updatePlayBtn();
  }

  function prevTrack() {
    if (!state.playlist.length) return;
    state.trackIndex = (state.trackIndex - 1 + state.playlist.length) % state.playlist.length;
    loadAndPlay();
  }
  function nextTrack() {
    if (!state.playlist.length) return;
    state.trackIndex = (state.trackIndex + 1) % state.playlist.length;
    loadAndPlay();
  }

  function onAudioError() {
    if (!audio.getAttribute('src')) return;   // stopPlayback() limpa o src
    // Ficheiro apagado/movido ou formato não suportado.
    state.playing = false;
    updatePlayBtn();
    els.title.textContent = '⚠ Não foi possível tocar este ficheiro';
    console.warn('[MusicPlayer] Não foi possível carregar:', audio.src);
  }

  // ── UI helpers ───────────────────────────────────────────────
  function updateTrackUI() {
    const track = state.playlist[state.trackIndex];
    if (track) {
      els.title.textContent = track.title;
      els.badge.textContent = `${state.trackIndex + 1} / ${state.playlist.length}`;
      els.play.title = 'Play/Pause';
    } else {
      els.title.textContent = 'A tua música';
      els.badge.textContent = state.folderName ? 'Pasta vazia' : 'Escolher pasta';
      els.play.title = 'Escolher a pasta com a tua música';
    }
  }

  function updatePlayBtn() {
    els.play.querySelector('.mp-icon-play').classList.toggle('hidden', state.playing);
    els.play.querySelector('.mp-icon-pause').classList.toggle('hidden', !state.playing);
  }

  function updateProgress() {
    if (!audio.duration) return;
    els.progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  }

  function updateListHighlight() {
    els.listItems.querySelectorAll('.mp-list-item').forEach((el, i) => {
      el.classList.toggle('mp-list-active', i === state.trackIndex);
    });
  }

  // ── Init ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
