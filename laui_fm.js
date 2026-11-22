/**
 * LAUI FM 104.8 & Live Teamfunk — Standalone GitHub Pages Edition
 * Plays MP3 tracks from ./audio/playlist.json with random entry points,
 * WebAudio FM static & walkie-talkie squelch beeps, regular German radio
 * segments (Nachrichten, Werbung, Wetter, Verkehr, Sportnews) and
 * telemetry-aware Teamfunk callouts.
 */
(function () {
  'use strict';

  const SEGMENTS = {
    nachrichten: {
      label: '📰 NACHRICHTEN',
      color: '#a855f7',
      lines: [
        'Laui FM Nachrichten um halb: Der Bürgermeister von Little Paris hat heute die neuen Boulevard-Häuserzeilen offiziell eingeweiht. Anwohner loben besonders die Bäckerei an den Champs-Élysées.',
        'Kurzmeldung aus dem Hochgebirge: Ingenieure bestätigen, dass alle neuen Fels-Tunnels am Mont Alpin komplett freigesprengt und beleuchtet sind. Der Pistenbully auf dem Gipfel bleibt vorerst im Einsatz.',
        'Hafenbehörde Port Grand meldet Rekordbetrieb: Drei neue Holzpiers und zwei Segelyachten beleben die Südwest-Bucht.',
      ],
    },
    werbung: {
      label: '📣 WERBUNG',
      color: '#ec4899',
      lines: [
        'Werbung: Müde Beine nach drei Pässen? Probier jetzt Watt-Booster 3000 mit dreifachem Espresso-Extrakt! Jetzt in jeder Bidon-Flasche.',
        'Dieser Spot wird präsentiert von Carboneum Laufrädern: So leicht, dass selbst dein Bergfloh-Kumpel neidisch wird! Carboneum — rollt auch im Laktat.',
        'Besuchen Sie die Bäckerei Croissant d’Or direkt am Place de l’Étoile in Little Paris! Frisch gebackene Kalorien für den Anstieg zum Mont Alpin.',
      ],
    },
    wetter: {
      label: '🌦️ WETTER',
      color: '#38bdf8',
      lines: [
        'Hier ist das Laui FM Inselwetter: Auf dem Col du Mistral herrscht Kaiserwetter bei 22 Grad. Oben auf dem Mont Alpin ziehen ab 130 Metern einzelne Schneeflocken vorbei!',
        'Wetterbericht für VeloTopia: In Port Grand und entlang der Süd-Gravelrunde strahlender Sonnenschein. Am Kap der Stürme frischt der Atlantikwind auf Beaufort 5 auf!',
      ],
    },
    verkehr: {
      label: '🚗 VERKEHR',
      color: '#f59e0b',
      lines: [
        'Laui FM Verkehrsservice: Rund um den Place de l’Étoile in Little Paris herrscht lebhafter Kreiselverkehr — bitte rechts einordnen!',
        'Achtung auf der Abfahrt vom Grand Viaduc Alpin: Seitenwindböen auf den hohen Viadukt-Pfeilern, beide Hände fest an den Unterlenker!',
      ],
    },
    sportnews: {
      label: '🏆 SPORTNEWS',
      color: '#22c55e',
      lines: [
        'Laui FM Sportnews! Auf den Tremola-Serpentinen zum Mont Alpin wurde heute ein brutales Tempo angeschlagen. Starke Wattwerte in der Schlussrampe!',
        'Sensation in der Arena Sprintdrom: Seit die Steilkurven geneigt und die Stadionwand geschlossen ist, purzeln die Rundenrekorde im Minutentakt.',
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
    volume: 0.52,
    isSpeaking: false,
    lastCat: null,
    spotTimer: null,
    autoTeamfunkTimer: null,
    getTelemetry: null,
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function playStatic(durationSec = 0.24) {
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

  function playRadioBeep(freq = 1350, duration = 0.08) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      setTimeout(() => ctx.close().catch(() => {}), duration * 1000 + 80);
    } catch (e) {}
  }

  function showCalloutBanner(tag, text, accentColor = '#f2f476', durationMs = 8500) {
    const box = document.getElementById('callout-banner');
    const tagEl = document.getElementById('callout-tag');
    const txtEl = document.getElementById('callout-text');
    if (!box || !tagEl || !txtEl) return;
    tagEl.textContent = tag;
    tagEl.style.background = accentColor;
    txtEl.textContent = text;
    box.classList.add('visible');
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => box.classList.remove('visible'), durationMs);
  }

  function updateUI(trackText) {
    const btn = document.getElementById('btn-radio');
    const lbl = document.getElementById('radio-track');
    if (btn) {
      btn.classList.toggle('active', state.enabled);
      btn.textContent = state.enabled ? '📻 LAUI FM: EIN' : '📻 LAUI FM 104.8';
    }
    if (lbl && trackText !== undefined) {
      lbl.textContent = trackText;
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
    audio.volume = state.isSpeaking ? state.volume * 0.18 : state.volume;
    updateUI(`🎵 ${track.title}`);

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

  function speakGerman(text, onDone, rate = 1.06, pitch = 1.0) {
    if (!('speechSynthesis' in window)) {
      setTimeout(onDone, 4500);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = rate;
      u.pitch = pitch;
      const voices = window.speechSynthesis.getVoices();
      const deVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('de'));
      if (deVoice) u.voice = deVoice;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        onDone();
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
      // Safety fallback in case mobile browser never fires onend
      setTimeout(finish, Math.max(4000, text.length * 85));
    } catch (e) {
      setTimeout(onDone, 4000);
    }
  }

  function triggerSpot(forcedCat) {
    if (state.isSpeaking) return;
    const cats = forcedCat ? [forcedCat] : CAT_KEYS.filter((c) => c !== state.lastCat);
    const cat = cats[Math.floor(Math.random() * cats.length)] || 'nachrichten';
    state.lastCat = cat;
    const seg = SEGMENTS[cat];
    const line = seg.lines[Math.floor(Math.random() * seg.lines.length)];

    state.isSpeaking = true;
    if (state.audioEl) state.audioEl.volume = Math.max(0.05, state.volume * 0.16);
    playStatic(0.24);
    showCalloutBanner(seg.label, line, seg.color, 9500);

    speakGerman(line, () => {
      state.isSpeaking = false;
      if (state.audioEl && state.enabled) state.audioEl.volume = state.volume;
    }, cat === 'werbung' ? 1.12 : 1.04, 1.0);
  }

  function buildTeamfunkLine() {
    const t = typeof state.getTelemetry === 'function' ? (state.getTelemetry() || {}) : {};
    const w = Math.round(t.w || 164);
    const spd = (t.spd || 28).toFixed(1);
    const alt = Math.round(t.alt || 40);
    const dist = (t.dist || 5.0).toFixed(1);
    const hr = Math.round(t.hr || 135);

    const pool = [];
    if (w >= 230) {
      pool.push(`Teamwagen an Fahrer: Starke ${w} Watt bei ${alt} Metern Höhe auf VeloTopia! Druck auf dem Pedal lassen und sauber über die Kuppe ziehen. Alleh, alleh, alleh!`);
    }
    if (alt >= 65) {
      pool.push(`Achtung am Anstieg zum Mont Alpin: Du bist auf ${alt} Metern Höhe mit ${w} Watt unterwegs. Trittfrequenz hochhalten bis zur nächsten Kehre! Dai, dai, dai!`);
    }
    pool.push(`Sportlicher Leiter an Fahrer: Kilometer ${dist} auf VeloTopia, aktuelles Tempo ${spd} km/h bei ${w} Watt und Puls ${hr}. Rhythmus halten, wir liegen perfekt im Plan!`);
    pool.push(`Teamfunk-Check: ${w} Watt auf der Kurbel, ${spd} km/h auf dem Tacho. Jetzt kurz aus der Flasche trinken und auf den Windschatten achten. Wamos, wamos!`);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function triggerTeamfunk() {
    if (state.isSpeaking) return;
    const msg = buildTeamfunkLine();
    state.isSpeaking = true;
    if (state.audioEl) state.audioEl.volume = Math.max(0.05, state.volume * 0.15);
    playRadioBeep(1480, 0.08);
    showCalloutBanner('🎙️ TEAMFUNK • SPORTL. LEITER', msg, '#f2f476', 9000);

    setTimeout(() => {
      speakGerman(msg, () => {
        playRadioBeep(1120, 0.07);
        state.isSpeaking = false;
        if (state.audioEl && state.enabled) state.audioEl.volume = state.volume;
      }, 1.08, 0.95);
    }, 140);
  }

  function scheduleSpots() {
    clearInterval(state.spotTimer);
    clearTimeout(state._firstSpotTimeout);
    if (!state.enabled) return;

    // First Nachrichten/Werbung spot quickly (10s) so visitors hear it right away!
    state._firstSpotTimeout = setTimeout(() => {
      if (state.enabled && !state.isSpeaking) {
        triggerSpot(Math.random() < 0.5 ? 'nachrichten' : 'werbung');
      }
    }, 10000);

    // Then alternate radio spots (incl. Nachrichten & Werbung) & Teamfunk every 42s
    let tick = 0;
    state.spotTimer = setInterval(() => {
      if (!state.enabled || state.isSpeaking) return;
      tick += 1;
      if (tick % 3 === 0) {
        triggerTeamfunk();
      } else {
        triggerSpot();
      }
    }, 42000);
  }

  function nextTrack() {
    if (!state.enabled) return;
    playStatic(0.24);
    state.queuePos += 1;
    if (state.queuePos >= state.queue.length) {
      state.queue = shuffle(state.playlist);
      state.queuePos = 0;
    }
    playCurrentTrack(true);
  }

  async function toggle() {
    if (state.enabled) {
      state.enabled = false;
      state.isSpeaking = false;
      clearInterval(state.spotTimer);
      clearTimeout(state._firstSpotTimeout);
      if (state.audioEl) state.audioEl.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      updateUI('LAUI FM 104.8 pausiert');
      return;
    }
    const ok = await loadPlaylist();
    if (!ok) {
      updateUI('Keine MP3s in ./audio/ gefunden');
      return;
    }
    state.enabled = true;
    playStatic(0.26);
    playCurrentTrack(true);
    scheduleSpots();
  }

  window.LauiFM = {
    toggle,
    next: nextTrack,
    spot: triggerSpot,
    teamfunk: triggerTeamfunk,
    setTelemetryProvider(fn) {
      state.getTelemetry = fn;
    },
    setVolume(v) {
      state.volume = Math.max(0.05, Math.min(1.0, Number(v) || 0.52));
      if (state.audioEl) state.audioEl.volume = state.isSpeaking ? state.volume * 0.18 : state.volume;
    },
  };
})();
