# PiPiLabu

Aplicação desktop para aprender inglês com exercícios interativos, treino de pronúncia, progresso local e apoio de IA via Ollama.

## Setup

```bash
npm install
npm start
```

## Estrutura

```
data/exercises.json        exercícios e frases de pronúncia (conteúdo, sem código)
src/main/                  processo principal do Electron (Node.js)
  main.js                  janela, IPC, Ollama, gravação de preferências
  preload.js               ponte segura entre o Electron e a página
src/renderer/              a interface (o que corre na janela)
  index.html
  css/                     estilos
  js/                      lógica da app, intro, voz, leitor de música
  vendor/                  bibliotecas de terceiros (Vosk)
  assets/
    images/                mascote, logótipo, fotos dos autores
    audio/                 áudio das frases de pronúncia
    models/                modelo offline de reconhecimento de voz
```

## Build Windows

```bash
npm run build:win
```

## Stack

- Electron 42
- JavaScript
- HTML5
- CSS3
- electron-store
- Ollama
- Web Speech API
- Web Audio API
