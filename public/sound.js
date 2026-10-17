// public/sound.js - Efeitos sonoros sintetizados via Web Audio API (Zero dependências externas)
const SoundEffects = (() => {
  let ctx = null;

  function getContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  return {
    // Som de fichas batendo
    playChip: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      for (let i = 0; i < 3; i++) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const filter = c.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400 + Math.random() * 800, now + i * 0.04);
        
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200, now + i * 0.04);
        filter.Q.setValueAtTime(3, now + i * 0.04);

        gain.gain.setValueAtTime(0.15, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.08);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);

        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.09);
      }
    },

    // Batida na mesa (Check / Mesa)
    playCheck: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      [0, 0.08].forEach(offset => {
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now + offset);
        osc.frequency.exponentialRampToValueAtTime(40, now + offset + 0.06);

        gain.gain.setValueAtTime(0.4, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

        osc.connect(gain);
        gain.connect(c.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.07);
      });
    },

    // Fold (desistência / carta deslizando)
    playFold: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      const bufferSize = c.sampleRate * 0.15;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = c.createBufferSource();
      noise.buffer = buffer;

      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      noise.start(now);
    },

    // Notificação: é a sua vez!
    playYourTurn: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(c.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    },

    // Vitória / Pote ganho
    playWin: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.25, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(c.destination);

        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.45);
      });
    },

    // All-in dramático
    playAllIn: () => {
      const c = getContext();
      if (!c) return;
      const now = c.currentTime;

      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    }
  };
})();
