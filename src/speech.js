/* ============================================================
   PiPiLabu — speech.js
   Offline speech recognition (the "speaking" practice) via Vosk WASM.
   Works inside Electron, where the browser's webkitSpeechRecognition
   fails (no Google API key). Exposes a small window.PronSpeech API.
   ============================================================ */
(function () {
  'use strict';

  const MODEL_URL = './models/vosk-model-small-en-us-0.15.tar.gz';
  const SAMPLE_RATE = 16000;

  let model = null;
  let modelLoading = null;
  let recognizer = null;
  let audioContext = null;
  let mediaStream = null;
  let source = null;
  let processor = null;
  let active = false;

  const handlers = { result: null, partial: null, status: null, error: null };
  const emit = (type, payload) => { if (handlers[type]) handlers[type](payload); };

  // Download + unpack the ~40MB model once (lazy: only on first mic use).
  function ensureModel() {
    if (model) return Promise.resolve(model);
    if (!window.Vosk) return Promise.reject(new Error('Vosk engine not loaded'));
    if (!modelLoading) {
      emit('status', 'loading-model');
      modelLoading = window.Vosk.createModel(MODEL_URL)
        .then((m) => { model = m; return m; })
        .catch((e) => { modelLoading = null; throw e; });
    }
    return modelLoading;
  }

  async function start() {
    if (active) return;
    const m = await ensureModel();

    recognizer = new m.KaldiRecognizer(SAMPLE_RATE);
    recognizer.setWords(true);
    recognizer.on('result', (msg) => {
      const text = msg && msg.result ? msg.result.text : '';
      if (text) emit('result', text);
    });
    recognizer.on('partialresult', (msg) => {
      const p = msg && msg.result ? msg.result.partial : '';
      emit('partial', p || '');
    });

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: SAMPLE_RATE
      }
    });

    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    source = audioContext.createMediaStreamSource(mediaStream);
    // ScriptProcessor is deprecated but needs no external worklet file
    // (simpler under CSP) and is fine for this short-phrase use case.
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!recognizer) return;
      try { recognizer.acceptWaveform(e.inputBuffer); } catch (_) { /* ignore */ }
    };
    source.connect(processor);
    processor.connect(audioContext.destination);

    active = true;
    emit('status', 'listening');
  }

  function stop() {
    if (!active) return;
    active = false;
    try { if (processor) { processor.disconnect(); processor.onaudioprocess = null; } } catch (_) {}
    try { if (source) source.disconnect(); } catch (_) {}
    try { if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { if (audioContext) audioContext.close(); } catch (_) {}
    try { if (recognizer && recognizer.remove) recognizer.remove(); } catch (_) {}
    processor = source = mediaStream = audioContext = recognizer = null;
    emit('status', 'stopped');
  }

  window.PronSpeech = {
    on(type, fn) { if (type in handlers) handlers[type] = fn; },
    preload: ensureModel,
    start,
    stop,
    isActive: () => active,
    isAvailable: () => !!window.Vosk
  };
})();
