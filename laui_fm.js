/**
 * LAUI FM 104.8 — Standalone GitHub Pages Edition
 * Plays MP3 tracks from ./audio/playlist.json with random entry points,
 * WebAudio FM static, and German VeloTopia radio segments via Web Speech API.
 */
(function () {
  'use strict';

  const SEGMENTS = {
    wetter: {
      label: '🌦️ WETTER',
      lines: [
        'Hier ist das Laui FM Inselwetter: Auf dem Col du Mistral herrscht Kaiserwetter bei 22 Grad. Oben auf dem Mont Alpin ziehen ab 130 Metern einzelne Schneeflocken vorbei — also Armlinge einpacken!',
        'Der aktuelle Wetterbericht für VeloTopia: In Port Grand und entlang der Süd-Gravelrunde strahlender Sonnenschein. Am Kap der Stürme frischt der Atlantikwind auf Beaufort 5 auf!',
      ],
    },
    verkehr: {
      label: '🚗 VERKEHR',
      lines: [
        'Laui FM Verkehrsservice: Rund um den Place de l’Étoile in Little Paris herrscht lebhafter Kreiselverkehr — bitte rechts einordnen und den Arc de Triomphe im Blick behalten!',
        'Achtung auf der Abfahrt vom Grand Viaduc Alpin: Seitenwindböen auf den hohen Viadukt-Pfeilern, beide Hände fest an den Unterlenker!',
      ],
    },
    sportnews: {
      label: '🏆 SPORTNEWS',
      lines: [
        'Laui FM Sportnews! Auf den Tremola-Serpentinen zum Mont Alpin wurde heute ein brutales Tempo angeschlagen. Starke Wattwerte in der Schlussrampe!',
        'Sensation in der Arena Sprintdrom: Seit die Steilkurven perfekt geneigt sind, purzeln die Rundenrekorde im Minutentakt.',
      ],
    },
    werbung: {
      label: '📣 WERBUNG',
      lines: [
        'Werbung: Müde Beine nach drei Pässen? Probier jetzt Watt-Booster 3000 mit dreifachem Espresso-Extrakt! Jetzt in jeder Bidon-Flasche.',
        'Besuchen Sie die Bäckerei Croissant d’Or direkt am Place de l’Étoile in Little Paris! Frisch gebackene Kalorien vor dem Mont Alpin.',
      ],
    },
  };
  const CAT_KEYS = Object.keys(SEGMENTS);

  const state = {
    enabled: false,
    playlist: [],
    queue: [],
    queuePos: 0,
    audioEl: null,
    volume: 0.55,
    isAnnouncement: false,
    songsSinceSpot: 0,
    lastCat: null,
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function playStatic(durationSec = 0.25) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSec), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.14 * Math.sin((i / d.length) * Math.PI);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      src.connect(filter);
      filter.connect(ctx.destination);
      src.start();
      setTimeout(() => ctx.close().catch(() => {}), durationSec * 1000 + 120);
    } catch (e) {}
  }

  function updateUI(trackText, badgeText) {
    const btn = document.getElementById('btn-radio');
    const lbl = document.getElementById('radio-track');
    if (btn) {
      btn.classList.toggle('active', state.enabled);
      btn.textContent = state.enabled ? '📻 LAUI FM 104.8: EIN' : '📻 LAUI FM 104.8';
    }
    if (lbl && trackText !== undefined) {
      lbl.textContent = trackText;
    }
    if (badgeText !== undefined) {
      const b = document.getElementById('radio-badge');
      if (b) b.textContent = badgeText;
    }
  }

  function ensureAudio() {
    if (!state.audioEl) {
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.volume = state.volume;
      a.addEventListener('ended', () => {
        if (state.enabled) nextTrack();
      });
      a.addEventListener('error', () => {
        if (state.enabled) setTimeout(nextTrack, 500);
      });
      state.audioEl = a;
    }
    return state.audioEl;
  }

  async function loadPlaylist() {
    if (state.playlist.length) return true;
    try {
      const res = await fetch('./audio/playlist.json', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      state.playlist = data.tracks || [];
      state.queue = shuffle(state.playlist);
      state.queuePos = 0;
      return state.playlist.length > 0;
    } catch (e) {
      return false;
    }
  }

  function playCurrentTrack(randomSeek = true) {
    if (!state.enabled || !state.queue.length) return;
    const track = state.queue[state.queuePos];
    const audio = ensureAudio();
    audio.src = track.url;
    audio.volume = state.isAnnouncement ? state.volume * 0.2 : state.volume;
    updateUI(`🎵 ${track.title}`, 'LAUI FM 104.8');

    const onMeta = () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      if (randomSeek && Number.isFinite(audio.duration) && audio.duration > 40) {
        audio.currentTime = audio.duration * (0.12 + Math.random() * 0.52);
      }
      audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.load();
    audio.play().catch(() => {});
  }

  function triggerSpot() {
    if (!state.enabled || state.isAnnouncement) return;
    const cats = CAT_KEYS.filter((c) => c !== state.lastCat);
    const cat = cats[Math.floor(Math.random() * cats.length)] || 'wetter';
    state.lastCat = cat;
    const seg = SEGMENTS[cat];
    const line = seg.lines[Math.floor(Math.random() * seg.lines.length)];

    state.isAnnouncement = true;
    if (state.audioEl) state.audioEl.volume = Math.max(0.06, state.volume * 0.18);
    playStatic(0.24);
    updateUI(`${seg.label} • Durchsage läuft...`, seg.label);

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(line);
        u.lang = 'de-DE';
        u.rate = 1.05;
        const done = () => {
          state.isAnnouncement = false;
          if (state.audioEl && state.enabled) state.audioEl.volume = state.volume;
          const tr = state.queue[state.queuePos];
          updateUI(tr ? `🎵 ${tr.title}` : 'LAUI FM 104.8', 'LAUI FM 104.8');
        };
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
        return;
      } catch (e) {}
    }
    setTimeout(() => {
      state.isAnnouncement = false;
      if (state.audioEl && state.enabled) state.audioEl.volume = state.volume;
    }, 3000);
  }

  function nextTrack() {
    if (!state.enabled) return;
    playStatic(0.24);
    state.songsSinceSpot += 1;
    state.queuePos += 1;
    if (state.queuePos >= state.queue.length) {
      state.queue = shuffle(state.playlist);
      state.queuePos = 0;
    }
    playCurrentTrack(true);
    if (state.songsSinceSpot >= 2) {
      state.songsSinceSpot = 0;
      setTimeout(triggerSpot, 3500);
    }
  }

  async function toggle() {
    if (state.enabled) {
      state.enabled = false;
      state.isAnnouncement = false;
      if (state.audioEl) state.audioEl.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      updateUI('LAUI FM 104.8 pausiert', 'AUS');
      return;
    }
    const ok = await loadPlaylist();
    if (!ok) {
      updateUI('Keine MP3s in ./audio/ gefunden', 'FEHLER');
      return;
    }
    state.enabled = true;
    playStatic(0.28);
    playCurrentTrack(true);
  }

  window.LauiFM = {
    toggle,
    next: nextTrack,
    spot: triggerSpot,
    setVolume(v) {
      state.volume = Math.max(0.05, Math.min(1.0, Number(v) || 0.55));
      if (state.audioEl) state.audioEl.volume = state.isAnnouncement ? state.volume * 0.2 : state.volume;
    },
  };
})();
