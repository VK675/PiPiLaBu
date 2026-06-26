'use strict';

/* ── Good Kid Music Player (ficheiros locais) ───────────────── */
(function () {
  const playlist = (window.MUSIC_PLAYLIST || []).filter(t => t && t.full);
  if (!playlist.length) return;

  // ── State ────────────────────────────────────────────────────
  const state = {
    trackIndex: 0,
    mode: 'instrumental', // 'full' | 'instrumental'
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

  // True if the current track has a usable instrumental file.
  function hasInstrumental(track) {
    return !!(track && track.instrumental);
  }
  // Pick a URL respecting the chosen mode, falling back to full.
  function urlFor(track) {
    if (state.mode === 'instrumental' && hasInstrumental(track)) return track.instrumental;
    return track.full;
  }

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
            <span class="mp-title" id="mp-title">Good Kid</span>
            <span class="mp-mode-badge" id="mp-mode-badge">Instrumental</span>
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

        <div class="mp-mode-toggle">
          <button class="mp-mode-btn" id="mp-mode-full" title="Com voz">🎤</button>
          <button class="mp-mode-btn mp-mode-active" id="mp-mode-inst" title="Instrumental">🎵</button>
        </div>

        <div class="mp-volume-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6">
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
          <span>Good Kid — Creators Music</span>
          <a class="mp-site-link" href="#" id="mp-site-link" title="Abrir goodkidofficial.com">↗ Site</a>
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
      modeBadge:   document.getElementById('mp-mode-badge'),
      play:        document.getElementById('mp-play'),
      prev:        document.getElementById('mp-prev'),
      next:        document.getElementById('mp-next'),
      modeFull:    document.getElementById('mp-mode-full'),
      modeInst:    document.getElementById('mp-mode-inst'),
      volume:      document.getElementById('mp-volume'),
      progress:    document.getElementById('mp-progress-fill'),
      progressBar: document.getElementById('mp-progress-bar'),
      list:        document.getElementById('mp-list'),
      listItems:   document.getElementById('mp-list-items'),
      toggleList:  document.getElementById('mp-toggle-list'),
      hide:        document.getElementById('mp-hide'),
      showPill:    document.getElementById('mp-show-pill'),
      siteLink:    document.getElementById('mp-site-link')
    };

    buildPlaylist();
    bindEvents();
    updateTrackUI();
  }

  function buildPlaylist() {
    els.listItems.innerHTML = '';
    playlist.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = 'mp-list-item' + (i === state.trackIndex ? ' mp-list-active' : '');
      item.dataset.idx = i;
      item.innerHTML = `
        <span class="mp-list-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="mp-list-title">${track.title || 'Sem título'}</span>
        <span class="mp-list-artist">Good Kid</span>
      `;
      item.addEventListener('click', () => { state.trackIndex = i; loadAndPlay(); });
      els.listItems.appendChild(item);
    });
  }

  function bindEvents() {
    els.play.addEventListener('click', togglePlay);
    els.prev.addEventListener('click', prevTrack);
    els.next.addEventListener('click', nextTrack);
    els.modeFull.addEventListener('click', () => setMode('full'));
    els.modeInst.addEventListener('click', () => setMode('instrumental'));
    els.volume.addEventListener('input', e => {
      state.volume = parseFloat(e.target.value);
      audio.volume = state.volume;
    });
    els.progressBar.addEventListener('click', e => {
      if (!audio.duration) return;
      const rect = els.progressBar.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
    els.toggleList.addEventListener('click', () => {
      state.showList = !state.showList;
      els.list.classList.toggle('hidden', !state.showList);
      els.toggleList.classList.toggle('mp-btn-active', state.showList);
    });
    els.hide.addEventListener('click', () => {
      els.player.classList.add('mp-hidden');
      els.showPill.classList.remove('hidden');
    });
    els.showPill.addEventListener('click', () => {
      els.player.classList.remove('mp-hidden');
      els.showPill.classList.add('hidden');
    });
    els.siteLink.addEventListener('click', e => {
      e.preventDefault();
      if (window.em && window.em.shell) {
        window.em.shell.openExternal('https://goodkidofficial.com/creators/');
      } else {
        window.open('https://goodkidofficial.com/creators/', '_blank');
      }
    });
  }

  // ── Playback ─────────────────────────────────────────────────
  function loadAndPlay() {
    const track = playlist[state.trackIndex];
    updateTrackUI();
    audio.src = urlFor(track);
    audio.currentTime = 0;
    audio.play()
      .then(() => { state.playing = true; updatePlayBtn(); })
      .catch(() => { state.playing = false; updatePlayBtn(); });
    updatePlayBtn();
    updateListHighlight();
  }

  function togglePlay() {
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
    state.trackIndex = (state.trackIndex - 1 + playlist.length) % playlist.length;
    loadAndPlay();
  }
  function nextTrack() {
    state.trackIndex = (state.trackIndex + 1) % playlist.length;
    loadAndPlay();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    // Block switching to instrumental when the current track has none.
    if (mode === 'instrumental' && !hasInstrumental(playlist[state.trackIndex])) return;
    state.mode = mode;
    els.modeFull.classList.toggle('mp-mode-active', mode === 'full');
    els.modeInst.classList.toggle('mp-mode-active', mode === 'instrumental');
    updateTrackUI();
    if (audio.src) loadAndPlay();
  }

  function onAudioError() {
    // File missing / unreadable — surface it instead of failing silently.
    state.playing = false;
    updatePlayBtn();
    els.title.textContent = '⚠ Ficheiro não encontrado';
    console.warn('[MusicPlayer] Não foi possível carregar:', audio.src,
      '\nVerifica se o ficheiro existe em src/music/ e se o nome bate certo com music-manifest.js');
  }

  // ── UI helpers ───────────────────────────────────────────────
  function updateTrackUI() {
    const track = playlist[state.trackIndex];
    els.title.textContent = track.title || 'Sem título';

    const instAvailable = hasInstrumental(track);
    // If instrumental missing, force 'full' display & disable the 🎵 button.
    const effectiveMode = (state.mode === 'instrumental' && !instAvailable) ? 'full' : state.mode;
    els.modeBadge.textContent = effectiveMode === 'full' ? 'Com voz' : 'Instrumental';
    els.modeBadge.classList.toggle('mp-badge-full', effectiveMode === 'full');

    els.modeInst.disabled = !instAvailable;
    els.modeInst.classList.toggle('mp-mode-disabled', !instAvailable);
    els.modeInst.title = instAvailable ? 'Instrumental' : 'Sem versão instrumental para esta faixa';
    els.modeFull.classList.toggle('mp-mode-active', effectiveMode === 'full');
    els.modeInst.classList.toggle('mp-mode-active', effectiveMode === 'instrumental');
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
    document.querySelectorAll('.mp-list-item').forEach((el, i) => {
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
