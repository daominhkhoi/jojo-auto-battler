"""
Cinematic / anime-style sound kit, fully synthesized (no sampled audio).

Run:  python engine/generate_anime_sfx.py
Writes WAV files into static/sounds/ and static/sounds/stands/ (overwrites the
older generated files with the same names, adds a few new ones).

Design notes
- Impacts are layered: a pitch-dropping sub "thump", a band-passed noise
  "crack" transient and a mid "body", then soft-clipped for punch.
- Big moments use a reversed swell into the hit, plus convolution reverb.
- Everything is mono 44.1 kHz / 16-bit.
"""
import os
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(1987)  # JoJo Part 1 :)

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'sounds')
STANDS = os.path.join(BASE, 'stands')


# =====================================================================
# DSP TOOLKIT
# =====================================================================
def n_samples(d):
    return int(SR * d)


def tt(d):
    return np.arange(n_samples(d)) / SR


def noise(d):
    return rng.uniform(-1.0, 1.0, n_samples(d))


def silence(d):
    return np.zeros(n_samples(d))


def expenv(d, k, attack=0.002):
    t = tt(d)
    a = np.minimum(1.0, t / attack) if attack > 0 else 1.0
    return a * np.exp(-t * k)


def osc(freq, d, shape='sine', phase0=0.0):
    """Oscillator with a scalar or per-sample frequency array."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n_samples(d),))
    ph = phase0 + np.cumsum(f) / SR
    if shape == 'sine':
        return np.sin(2 * np.pi * ph)
    if shape == 'saw':
        return 2.0 * (ph % 1.0) - 1.0
    if shape == 'square':
        return np.sign(np.sin(2 * np.pi * ph))
    if shape == 'tri':
        return 2.0 * np.abs(2.0 * (ph % 1.0) - 1.0) - 1.0
    raise ValueError(shape)


def glide(f0, f1, d, curve='exp'):
    t = tt(d) / max(d, 1e-9)
    if curve == 'exp':
        return f0 * (f1 / f0) ** t
    return f0 + (f1 - f0) * t


def _fft_filter(x, mask_fn):
    n = len(x)
    # generous zero padding so the (zero-phase) filter can't wrap the start onto the end
    size = 1 << (n + 8192 - 1).bit_length()
    X = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    y = np.fft.irfft(X * mask_fn(f), size)[:n]
    return y


def lowpass(x, fc, slope=4):
    return _fft_filter(x, lambda f: 1.0 / (1.0 + (f / fc) ** slope))


def highpass(x, fc, slope=4):
    return _fft_filter(x, lambda f: 1.0 - 1.0 / (1.0 + (np.maximum(f, 1e-6) / fc) ** slope))


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def tv_bandpass(x, fc_of_t, rel_bw=0.5, frame=1024, hop=256):
    """Time-varying band-pass (STFT mask), fc_of_t(t_seconds) -> center Hz."""
    n = len(x)
    win = np.hanning(frame)
    pad = np.concatenate([np.zeros(frame), x, np.zeros(frame)])
    out = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    freqs = np.fft.rfftfreq(frame, 1 / SR)
    for start in range(0, len(pad) - frame, hop):
        seg = pad[start:start + frame] * win
        center_t = (start + frame / 2 - frame) / SR
        fc = max(20.0, fc_of_t(max(0.0, center_t)))
        bw = fc * rel_bw
        mask = np.exp(-0.5 * ((freqs - fc) / (bw / 2.0)) ** 2)
        y = np.fft.irfft(np.fft.rfft(seg) * mask, frame) * win
        out[start:start + frame] += y
        norm[start:start + frame] += win ** 2
    out = out / np.maximum(norm, 1e-6)
    return out[frame:frame + n]


def conv(x, ir):
    n = len(x) + len(ir) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]


def reverb(x, decay=1.2, mix=0.25, tone=5000, pre=0.012):
    """Convolution reverb with an exponentially decaying noise impulse."""
    ir = noise(decay) * np.exp(-tt(decay) * 6.9 / decay)
    ir = lowpass(ir, tone)
    ir = np.concatenate([np.zeros(n_samples(pre)), ir])
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = conv(x, ir)
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry * (1 - mix * 0.5) + wet * mix


def softclip(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def fade(x, fin=0.003, fout=0.03):
    x = x.copy()
    a, b = n_samples(fin), n_samples(fout)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b and b < len(x):
        x[-b:] *= np.linspace(1, 0, b)
    return x


def mix_at(out, x, at, gain=1.0):
    """Add x into out starting at `at` seconds, growing out if needed."""
    x = _edge_fade(np.asarray(x, dtype=float))
    s = n_samples(at)
    end = s + len(x)
    if end > len(out):
        out = np.concatenate([out, np.zeros(end - len(out))])
    out[s:end] += x * gain
    return out


def _edge_fade(x, fin=0.0008, fout=0.006):
    """Tiny fades so layers never start/stop with a click."""
    x = x.copy()
    a, b = min(len(x), n_samples(fin)), min(len(x), n_samples(fout))
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def fit(x, d):
    n = n_samples(d)
    if len(x) >= n:
        return _edge_fade(x[:n], fin=0)
    return np.concatenate([x, np.zeros(n - len(x))])


def reverse_swell(d, bright=4000):
    """Reversed reverb-like whoosh that crescendos into a hit."""
    body = lowpass(noise(d), bright) * np.exp(-tt(d) * 3.0)
    body = reverb(body, decay=0.8, mix=0.6)[:n_samples(d)]
    return body[::-1] * np.linspace(0.2, 1.0, n_samples(d)) ** 2


def normalize(x, peak=0.92):
    m = np.max(np.abs(x)) + 1e-9
    return x * (peak / m)


def trim_tail(x, floor_db=-54):
    """Cut the inaudible end of reverb tails."""
    thresh = np.max(np.abs(x)) * 10 ** (floor_db / 20)
    loud = np.nonzero(np.abs(x) > thresh)[0]
    return x[:loud[-1] + n_samples(0.02)] if len(loud) else x


def write(folder, name, x, peak=0.92):
    os.makedirs(folder, exist_ok=True)
    x = normalize(fade(trim_tail(x)), peak)
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    path = os.path.join(folder, f'{name}.wav')
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print(f'  {os.path.relpath(path, BASE):40s} {len(x) / SR:5.2f}s')


# =====================================================================
# BUILDING BLOCKS
# =====================================================================
def punch(power=1.0, pitch=1.0, d=0.3):
    t = tt(d)
    f = 42 * pitch + 150 * pitch * np.exp(-t * 38)
    thump = osc(f, d) * np.exp(-t * 16)
    crack = bandpass(noise(d), 1400, 6500) * np.exp(-t * 130)
    body = bandpass(noise(d), 150, 900) * np.exp(-t * 32)
    return softclip((thump + crack * 0.7 * power + body * 0.55) * 1.2 * power, 2.2)


def whoosh(d, f0, f1, rel_bw=0.7, shape=1.6):
    x = tv_bandpass(noise(d), lambda s: f0 * (f1 / f0) ** min(1.0, s / d), rel_bw)
    env = np.sin(np.pi * np.clip(tt(d) / d, 0, 1)) ** shape
    return x * env


def ping(freq, d, k=18.0, bend=0.0):
    f = glide(freq, freq * (1 + bend), d) if bend else freq
    return osc(f, d) * expenv(d, k, 0.001)


def metal_ring(partials, d, k=6.0):
    x = silence(d)
    for i, fr in enumerate(partials):
        x += osc(fr, d) * np.exp(-tt(d) * k * (1 + i * 0.35)) / (1 + i * 0.4)
    return x


def gunshot(d=0.45, size=1.0):
    t = tt(d)
    transient = highpass(noise(d), 900) * np.exp(-t * 90)
    boom = osc(glide(130 * size, 45, d), d) * np.exp(-t * 22)
    tail = lowpass(noise(d), 2500) * np.exp(-t * 11) * 0.5
    x = softclip(transient * 1.1 + boom * 1.2 + tail, 2.5)
    return reverb(x, decay=0.5, mix=0.2)


def brass_chord(freqs, d, cutoff=(400, 3200), k=2.5):
    x = silence(d)
    for f in freqs:
        for det in (-0.006, 0.0, 0.007):
            x += osc(f * (1 + det), d, 'saw')
    # Filter "blat": bright attack that darkens as the note decays
    y = tv_bandpass(x, lambda s: cutoff[0] + (cutoff[1] - cutoff[0]) * np.exp(-s * 3), rel_bw=1.8)
    return y * expenv(d, k, 0.015)


def taiko(d=0.9, pitch=1.0):
    t = tt(d)
    body = osc(glide(95 * pitch, 48 * pitch, d), d) * np.exp(-t * 5)
    skin = bandpass(noise(d), 200, 1800) * np.exp(-t * 40)
    return softclip(body * 1.2 + skin * 0.6, 1.8)


def crash(d=1.6):
    return highpass(noise(d), 3500) * expenv(d, 2.6, 0.003) * 0.6


def clock_tick(d=0.12, pitch=1.0):
    t = tt(d)
    click = bandpass(noise(d), 2500 * pitch, 7000 * pitch) * np.exp(-t * 220)
    reso = osc(1850 * pitch, d) * np.exp(-t * 60) * 0.35
    return click + reso


def sparkle(d, count=14, lo=3000, hi=9000):
    x = silence(d)
    for _ in range(count):
        at = rng.uniform(0, d * 0.8)
        x = mix_at(x, ping(rng.uniform(lo, hi), 0.12, k=35), at, rng.uniform(0.2, 0.5))
    return fit(x, d)


def explosion(d=1.4, size=1.0):
    t = tt(d)
    sub = osc(glide(70 * size, 28, d), d) * np.exp(-t * 3.2)
    blast = lowpass(noise(d), 1800) * np.exp(-t * 4.5)
    crackle = silence(d)
    for _ in range(40):
        at = rng.uniform(0.02, d * 0.7)
        crackle = mix_at(crackle, highpass(noise(0.01), 2000) * np.exp(-tt(0.01) * 400), at, rng.uniform(0.1, 0.4))
    x = softclip(sub * 1.4 + blast * 1.1 + fit(crackle, d) * 0.6, 2.4)
    return reverb(x, decay=1.4, mix=0.3, tone=3000)


# =====================================================================
# CORE GAME SOUNDS
# =====================================================================
def s_buy():
    x = silence(0.5)
    x = mix_at(x, metal_ring([2794, 4190, 6120], 0.35, k=14), 0.0, 0.8)
    x = mix_at(x, metal_ring([3520, 5280, 7400], 0.35, k=16), 0.06, 0.7)
    return reverb(fit(x, 0.5), decay=0.4, mix=0.18)


def s_sell():
    x = lowpass(noise(0.15), 400) * expenv(0.15, 30) * 0.8
    for i in range(6):
        x = mix_at(x, metal_ring([3200 - i * 180, 4800 - i * 250], 0.2, k=22), 0.02 + i * 0.045 + rng.uniform(0, 0.02), 0.6)
    return reverb(fit(x, 0.6), decay=0.4, mix=0.18)


def s_roll():
    x = whoosh(0.35, 800, 4000) * 0.35
    at = 0.0
    for i in range(11):
        flick = bandpass(noise(0.012), 1800, 6500) * expenv(0.012, 250)
        x = mix_at(x, flick, at, 0.9)
        at += 0.034 - i * 0.0016
    return fit(x, 0.45)


def s_levelup():
    x = whoosh(0.5, 300, 3000) * 0.35
    notes = [392.0, 523.25, 659.25, 783.99, 1046.5]
    for i, f in enumerate(notes):
        tone = (osc(f, 0.5, 'saw') * 0.5 + osc(f * 2, 0.5) * 0.3)
        tone = lowpass(tone, 3500) * expenv(0.5, 6, 0.004)
        x = mix_at(x, tone, 0.06 * i, 0.55)
    x = mix_at(x, sparkle(0.6, 10), 0.25, 0.5)
    return reverb(fit(x, 1.0), decay=0.9, mix=0.3)


def s_starup():
    x = whoosh(0.45, 200, 5000) * 0.5
    chord = brass_chord([523.25, 659.25, 783.99, 1046.5], 1.1, cutoff=(800, 5000), k=2.2)
    x = mix_at(x, chord, 0.4, 0.6)
    x = mix_at(x, sparkle(0.9, 22, 4000, 10000), 0.42, 0.7)
    x = mix_at(x, punch(0.8, 0.7), 0.4, 0.5)
    return reverb(fit(x, 1.6), decay=1.3, mix=0.32)


def s_battle_start():
    x = silence(2.0)
    x = mix_at(x, whoosh(0.3, 300, 2500) * 0.5, 0.0)
    x = mix_at(x, taiko(0.9, 1.0), 0.22, 1.0)
    x = mix_at(x, taiko(0.9, 0.85), 0.46, 1.0)
    x = mix_at(x, brass_chord([130.8, 196.0, 261.6, 392.0], 1.2, cutoff=(300, 2600), k=2.0), 0.46, 0.8)
    x = mix_at(x, crash(1.4), 0.46, 0.6)
    return reverb(fit(x, 2.0), decay=1.4, mix=0.25)


def s_round_win():
    x = silence(2.2)
    x = mix_at(x, brass_chord([174.6, 220.0, 261.6, 349.2], 0.35, cutoff=(400, 3000), k=5), 0.0, 0.8)
    x = mix_at(x, brass_chord([196.0, 246.9, 293.7, 392.0], 0.35, cutoff=(400, 3000), k=5), 0.18, 0.8)
    x = mix_at(x, brass_chord([261.6, 329.6, 392.0, 523.25], 1.5, cutoff=(500, 4200), k=1.6), 0.36, 0.95)
    x = mix_at(x, taiko(0.8, 1.1), 0.36, 0.7)
    x = mix_at(x, crash(1.6), 0.36, 0.55)
    x = mix_at(x, sparkle(1.0, 18, 3500, 9000), 0.4, 0.45)
    return reverb(fit(x, 2.2), decay=1.5, mix=0.28)


def s_round_lose():
    x = silence(2.4)
    for i, chord in enumerate([[233.1, 293.7, 349.2], [207.7, 261.6, 311.1], [174.6, 207.7, 261.6]]):
        x = mix_at(x, brass_chord(chord, 0.9 if i < 2 else 1.8, cutoff=(250, 1400), k=2.5), 0.35 * i, 0.75)
    gong = metal_ring([98, 157, 231, 318, 427], 2.0, k=1.4)
    x = mix_at(x, gong, 0.7, 0.5)
    return reverb(fit(x, 2.4), decay=1.8, mix=0.3, tone=2500)


def s_hit_normal():
    return reverb(fit(punch(0.85, 1.0, 0.25), 0.3), decay=0.3, mix=0.12)


def s_hit_crit():
    x = silence(0.8)
    x = mix_at(x, reverse_swell(0.08, 6000) * 0.4, 0.0)
    x = mix_at(x, punch(1.35, 0.8, 0.5), 0.07, 1.0)
    x = mix_at(x, osc(glide(80, 30, 0.6), 0.6) * expenv(0.6, 6), 0.07, 0.7)
    x = mix_at(x, sparkle(0.3, 8, 5000, 11000), 0.08, 0.4)
    return reverb(softclip(fit(x, 0.8), 1.6), decay=0.7, mix=0.2)


def s_skill_cast():
    d = 0.7
    charge = lowpass(osc(glide(110, 440, 0.4), 0.4, 'saw'), 2400) * np.linspace(0.1, 1, n_samples(0.4)) ** 2
    x = mix_at(silence(d), charge, 0.0, 0.5)
    x = mix_at(x, whoosh(0.4, 400, 4500) * 0.6, 0.0)
    x = mix_at(x, metal_ring([2600, 3900, 5600], 0.35, k=10), 0.38, 0.6)
    x = mix_at(x, punch(0.7, 1.2, 0.25), 0.38, 0.5)
    return reverb(fit(x, d), decay=0.8, mix=0.25)


def s_death():
    x = lowpass(noise(0.3), 300) * expenv(0.3, 12) * 0.9
    x = mix_at(x, highpass(noise(0.05), 2500) * expenv(0.05, 60), 0.0, 0.9)
    for _ in range(28):
        f = rng.uniform(3000, 9500)
        x = mix_at(x, ping(f, 0.09, k=45, bend=-0.05), rng.uniform(0.0, 0.35), rng.uniform(0.15, 0.4))
    return reverb(fit(x, 0.9), decay=0.9, mix=0.3)


def s_time_stop(deep=True):
    """ZA WARUDO: reversed swell -> massive impact -> falling ring -> slow clock ticks."""
    d = 2.8
    x = silence(d)
    swell = reverse_swell(0.65, 5000)
    rise = osc(glide(180, 1400, 0.65), 0.65) * np.linspace(0, 1, n_samples(0.65)) ** 3 * 0.35
    x = mix_at(x, swell + rise, 0.0, 0.9)

    hit_at = 0.65
    sub = osc(glide(62 if deep else 75, 26, 1.6), 1.6) * expenv(1.6, 2.2, 0.004)
    boom = fit(lowpass(noise(0.6), 900) * expenv(0.6, 7), 1.6)
    x = mix_at(x, softclip(sub * 1.5 + boom, 2.0), hit_at, 1.0)
    x = mix_at(x, crash(1.8), hit_at, 0.35)

    # The frozen-world ring: detuned tones sliding down (the "wobble")
    ring_d = 2.0
    base = 880 if deep else 1175
    ring = silence(ring_d)
    for det in (-0.012, 0.0, 0.013):
        ring += osc(glide(base * (1 + det), base * 0.25, ring_d), ring_d)
    ring *= expenv(ring_d, 1.3, 0.01) * (1 + 0.25 * np.sin(2 * np.pi * 5.5 * tt(ring_d)))
    x = mix_at(x, ring * 0.35, hit_at + 0.02)

    for i, at in enumerate([1.25, 1.75, 2.25]):
        x = mix_at(x, clock_tick(0.12, 1.0 if i % 2 == 0 else 0.8), at, 0.7)
    return reverb(fit(x, d), decay=2.2, mix=0.38, tone=4500)


def s_time_resume():
    d = 1.1
    x = mix_at(silence(d), reverse_swell(0.5, 6000), 0.0, 0.8)
    x = mix_at(x, whoosh(0.5, 150, 3000) * 0.6, 0.3)
    x = mix_at(x, clock_tick(0.12, 1.2), 0.5, 0.8)
    x = mix_at(x, osc(glide(40, 90, 0.4), 0.4) * expenv(0.4, 5), 0.5, 0.7)
    return reverb(fit(x, d), decay=1.0, mix=0.3)


def s_menacing():
    """ゴゴゴ rumble: low filtered noise with a slow pulse, swelling in and out."""
    d = 2.6
    t = tt(d)
    rumble = lowpass(noise(d), 140, slope=6)
    pulse = 0.65 + 0.35 * np.sin(2 * np.pi * 6.5 * t)
    sub = osc(glide(38, 46, d), d) * 0.5
    env = np.sin(np.pi * t / d) ** 0.8
    return reverb((rumble * 3.0 + sub) * pulse * env, decay=1.2, mix=0.25, tone=800)


# --- attack styles (must match attackfx.js: rush / blade / bullet / orb / strike) ---
def s_attack_rush():
    d = 0.45
    x = whoosh(d, 500, 2500) * 0.25
    at = 0.0
    for i in range(6):
        x = mix_at(x, punch(0.75, rng.uniform(0.9, 1.25), 0.18), at, 0.8)
        at += 0.07 - i * 0.006
    return reverb(fit(x, d), decay=0.35, mix=0.12)


def s_attack_blade():
    d = 0.55
    x = whoosh(0.14, 2500, 8000) * 0.6
    x = mix_at(x, metal_ring([3150, 4720, 6930, 9240], 0.5, k=9) * 0.55, 0.05)
    x = mix_at(x, highpass(noise(0.03), 4000) * expenv(0.03, 120), 0.05, 0.7)
    return reverb(fit(x, d), decay=0.5, mix=0.2)


def s_attack_bullet():
    return fit(gunshot(0.45), 0.45)


def s_attack_orb():
    d = 0.45
    zap = osc(glide(1900, 260, 0.2), 0.2) * expenv(0.2, 12)
    buzz = lowpass(osc(glide(220, 90, 0.3), 0.3, 'saw'), 1500) * expenv(0.3, 10) * 0.5
    sizzle = bandpass(noise(0.35), 3000, 9000) * expenv(0.35, 9) * 0.35
    x = mix_at(silence(d), zap, 0.0, 0.8)
    x = mix_at(x, buzz, 0.0)
    x = mix_at(x, sizzle, 0.03)
    return reverb(fit(x, d), decay=0.4, mix=0.18)


def s_attack_strike():
    d = 0.35
    x = whoosh(0.12, 700, 4000) * 0.6
    x = mix_at(x, punch(0.9, 1.15, 0.25), 0.07, 0.9)
    return fit(x, d)


# =====================================================================
# STAND SIGNATURES
# =====================================================================
def st_killer_queen():
    x = silence(1.9)
    for at in (0.0, 0.035):
        x = mix_at(x, bandpass(noise(0.01), 2000, 8000) * expenv(0.01, 400) + ping(3100, 0.01, 90) * 0.4, at, 0.9)
    x = mix_at(x, reverse_swell(0.18, 3000) * 0.5, 0.2)
    x = mix_at(x, explosion(1.5, 1.0), 0.36, 1.0)
    return fit(x, 1.9)


def st_king_crimson():
    d = 1.4
    phrase = mix_at(whoosh(0.4, 300, 3000), brass_chord([220, 261.6, 329.6], 0.4, cutoff=(300, 2500)), 0.0, 0.6)
    rev = phrase[::-1]
    x = mix_at(silence(d), rev, 0.0, 0.9)
    # Time-skip stutter
    grain = rev[-n_samples(0.05):]
    for i in range(5):
        x = mix_at(x, grain * (1 - i * 0.15), 0.42 + i * 0.05)
    x = mix_at(x, osc(glide(120, 30, 0.8), 0.8) * expenv(0.8, 3), 0.7, 0.9)
    x = mix_at(x, punch(1.2, 0.8, 0.4), 0.7, 0.8)
    return reverb(fit(x, d), decay=1.3, mix=0.35)


def st_ger():
    d = 2.4
    x = mix_at(silence(d), reverse_swell(0.8, 7000), 0.0, 0.8)
    pad = silence(1.6)
    for f in (220.0, 277.2, 329.6, 440.0, 554.4):
        for det in (-0.004, 0.004):
            pad += osc(f * (1 + det) * (1 + 0.003 * np.sin(2 * np.pi * 4.5 * tt(1.6))), 1.6)
    pad = lowpass(pad, 2500) * expenv(1.6, 1.4, 0.2)
    x = mix_at(x, pad * 0.3, 0.8)
    x = mix_at(x, metal_ring([1318, 1975, 2637, 3951], 1.4, k=2.5) * 0.5, 0.8)
    x = mix_at(x, osc(glide(55, 28, 1.2), 1.2) * expenv(1.2, 2.5), 0.8, 0.9)
    return reverb(fit(x, d), decay=2.0, mix=0.4)


def st_gold_experience():
    d = 1.2
    x = mix_at(silence(d), s_attack_rush()[:n_samples(0.4)], 0.0, 0.8)
    bloom = silence(0.8)
    for f in (523.25, 659.25, 783.99):
        bloom += osc(f * (1 + 0.004 * np.sin(2 * np.pi * 6 * tt(0.8))), 0.8)
    x = mix_at(x, bloom * expenv(0.8, 3, 0.05) * 0.25, 0.35)
    x = mix_at(x, sparkle(0.7, 16, 2500, 8000), 0.35, 0.6)
    return reverb(fit(x, d), decay=1.0, mix=0.3)


def st_crazy_diamond():
    d = 1.2
    x = silence(d)
    at = 0.0
    for i in range(9):
        x = mix_at(x, punch(0.8, rng.uniform(0.95, 1.3), 0.16), at, 0.8)
        at += 0.055
    crystal = sparkle(0.5, 14, 3000, 8000)[::-1]
    x = mix_at(x, crystal, 0.55, 0.7)
    x = mix_at(x, metal_ring([2093, 3136], 0.5, k=6), 1.0 - 0.05, 0.4)
    return reverb(fit(x, d), decay=0.9, mix=0.28)


def st_the_hand():
    d = 1.1
    scrape = tv_bandpass(noise(0.2), lambda s: 7000 * (800 / 7000) ** min(1, s / 0.2), 0.6) * expenv(0.2, 8, 0.002)
    x = mix_at(silence(d), scrape, 0.0, 1.0)
    x = mix_at(x, whoosh(0.4, 2000, 120) * 0.8, 0.12)
    x = mix_at(x, osc(glide(300, 60, 0.12), 0.12) * expenv(0.12, 25), 0.5, 1.0)
    x = mix_at(x, punch(1.1, 0.9, 0.3), 0.5, 0.7)
    return reverb(fit(x, d), decay=0.8, mix=0.3)


def st_sticky_fingers():
    d = 0.9
    x = silence(d)
    at, rate = 0.0, 25.0
    while at < 0.5:
        tooth = bandpass(noise(0.004), 2000, 5500) * expenv(0.004, 900) + ping(2600, 0.004, 500) * 0.3
        x = mix_at(x, tooth, at, 0.9)
        at += 1.0 / rate
        rate = min(140.0, rate * 1.12)
    x = mix_at(x, whoosh(0.5, 1000, 6000) * 0.3, 0.0)
    x = mix_at(x, punch(1.0, 1.1, 0.3), 0.52, 0.8)
    return reverb(fit(x, d), decay=0.5, mix=0.2)


def st_aerosmith():
    d = 1.1
    t = tt(d)
    prop = lowpass(osc(72, d, 'saw'), 900) * (0.55 + 0.45 * np.sin(2 * np.pi * 28 * t)) * 0.35
    x = prop * np.minimum(1, t / 0.15)
    for i in range(8):
        x = mix_at(x, gunshot(0.25, 0.8) * 0.55, 0.2 + i * 0.075)
    return fit(x, d)


def st_hierophant_green():
    d = 1.2
    x = whoosh(0.35, 600, 3000) * 0.4
    for _ in range(20):
        x = mix_at(x, ping(rng.uniform(1400, 4200), 0.15, k=26, bend=-0.12), rng.uniform(0.1, 0.65), rng.uniform(0.25, 0.55))
    x = mix_at(x, bandpass(noise(0.3), 800, 4000) * expenv(0.3, 9) * 0.4, 0.12)
    return reverb(fit(x, d), decay=1.0, mix=0.35)


def st_magicians_red():
    d = 1.3
    t = tt(d)
    roar = lowpass(noise(d), 1200) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7
    crack = silence(d)
    for _ in range(35):
        crack = mix_at(crack, highpass(noise(0.006), 2500) * expenv(0.006, 600), rng.uniform(0, d * 0.9), rng.uniform(0.2, 0.6))
    x = roar * 1.3 + fit(crack, d) * 0.5 + whoosh(d, 200, 1500) * 0.5
    return reverb(softclip(x, 1.4), decay=0.9, mix=0.25)


def st_silver_chariot():
    d = 0.9
    x = silence(d)
    for i in range(6):
        x = mix_at(x, s_attack_blade() * 0.7, i * 0.085)
    return fit(x, d)


def st_sex_pistols():
    d = 0.9
    x = mix_at(silence(d), gunshot(0.45), 0.0)
    for i in range(3):
        chirp = osc(glide(3200 - i * 300, 1500, 0.12), 0.12) * expenv(0.12, 22)
        x = mix_at(x, chirp, 0.12 + i * 0.13, 0.45)
    return reverb(fit(x, d), decay=0.5, mix=0.2)


def st_purple_haze():
    d = 1.2
    t = tt(d)
    hiss = bandpass(noise(d), 2500, 7000) * np.sin(np.pi * t / d) * 0.22
    growl = lowpass(osc(58, d, 'saw') * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)), 600) * np.sin(np.pi * t / d)
    x = hiss + growl * 0.8
    for _ in range(14):
        x = mix_at(x, ping(rng.uniform(150, 400), 0.06, k=40, bend=0.6), rng.uniform(0.1, 1.0), 0.35)
    return reverb(fit(x, d), decay=0.8, mix=0.25)


def st_white_album():
    d = 1.2
    x = whoosh(d, 3000, 700, rel_bw=0.9) * 0.5
    for _ in range(45):
        x = mix_at(x, highpass(noise(0.004), 5000) * expenv(0.004, 900), rng.uniform(0, 0.8), rng.uniform(0.2, 0.6))
    x = mix_at(x, metal_ring([2349, 3520, 4699], 0.8, k=3) * 0.35, 0.2)
    return reverb(fit(x, d), decay=1.2, mix=0.35)


def st_red_hot_chili_pepper():
    d = 1.0
    x = silence(d)
    for _ in range(9):
        dur = rng.uniform(0.03, 0.09)
        zap = (osc(rng.uniform(90, 160), dur, 'square') * 0.6 + bandpass(noise(dur), 1200, 5000) * 0.6) * expenv(dur, 25)
        x = mix_at(x, zap, rng.uniform(0, 0.8), rng.uniform(0.4, 0.8))
    x = mix_at(x, osc(glide(2000, 400, 0.2), 0.2) * expenv(0.2, 10) * 0.5, 0.0)
    return reverb(fit(x, d), decay=0.6, mix=0.2)


def st_bad_company():
    d = 1.3
    x = silence(d)
    for i in range(10):
        x = mix_at(x, bandpass(noise(0.03), 300, 4000) * expenv(0.03, 60), i * 0.04, 0.5)
    for i in range(5):
        x = mix_at(x, gunshot(0.3, 0.9) * 0.6, 0.35 + i * 0.07 + rng.uniform(0, 0.03))
    whistle = osc(glide(1800, 600, 0.3), 0.3) * 0.25
    x = mix_at(x, whistle, 0.6)
    x = mix_at(x, explosion(0.7, 1.2) * 0.8, 0.88)
    return fit(x, d)


def st_weather_report():
    d = 1.5
    t = tt(d)
    rain = bandpass(noise(d), 2000, 7000) * 0.25 * np.minimum(1, t / 0.3)
    thunder = lowpass(noise(1.2), 400) * expenv(1.2, 2.5, 0.05) * 1.4
    crack = highpass(noise(0.08), 1500) * expenv(0.08, 40)
    x = rain + whoosh(d, 300, 900) * 0.4
    x = mix_at(x, crack, 0.2, 0.9)
    x = mix_at(x, thunder, 0.22)
    return reverb(fit(x, d), decay=1.5, mix=0.35, tone=2500)


def st_cream():
    d = 1.3
    x = mix_at(silence(d), whoosh(0.5, 3000, 90) * 0.9, 0.0)
    x = mix_at(x, osc(glide(320, 55, 0.25), 0.25) * expenv(0.25, 9), 0.45, 1.0)
    drone = lowpass(noise(0.8), 120) * expenv(0.8, 3, 0.05) * 2.0
    x = mix_at(x, drone, 0.45, 0.7)
    return reverb(fit(x, d), decay=1.0, mix=0.3, tone=1500)


def st_whitesnake():
    d = 1.0
    x = mix_at(silence(d), tv_bandpass(noise(0.18), lambda s: 1500 + s * 25000, 0.5) * expenv(0.18, 10), 0.0)
    x = mix_at(x, bandpass(noise(0.01), 2000, 6000) * expenv(0.01, 300), 0.18, 0.8)
    eerie = (osc(466.2, 0.8) + osc(470.0, 0.8) + osc(698.5, 0.8) * 0.5) * expenv(0.8, 2.5, 0.1) * 0.25
    x = mix_at(x, eerie, 0.2)
    return reverb(fit(x, d), decay=1.2, mix=0.4)


def st_c_moon():
    d = 1.3
    t = tt(1.0)
    wobble = osc(420 * (1 + (0.02 + 0.12 * t) * np.sin(2 * np.pi * 6 * t)), 1.0) * expenv(1.0, 1.5, 0.05) * 0.4
    x = mix_at(silence(d), reverse_swell(0.5, 4000) * 0.6, 0.0)
    x = mix_at(x, wobble, 0.3)
    x = mix_at(x, punch(1.1, 0.7, 0.4), 0.5, 0.7)
    return reverb(fit(x, d), decay=1.0, mix=0.3)


def st_made_in_heaven():
    d = 1.7
    x = silence(d)
    at, gap = 0.0, 0.3
    while at < 1.25:
        x = mix_at(x, clock_tick(0.08, 1.0 + at * 0.4), at, 0.7)
        at += gap
        gap = max(0.018, gap * 0.8)
    rise = osc(glide(200, 2400, 1.3), 1.3) * np.linspace(0, 1, n_samples(1.3)) ** 2 * 0.3
    x = mix_at(x, rise, 0.0)
    x = mix_at(x, sparkle(0.4, 18, 4000, 11000), 1.25, 0.7)
    return reverb(fit(x, d), decay=1.2, mix=0.3)


# --- archetypes (skills without a signature sound) ---
def ar_shield():
    d = 1.0
    x = metal_ring([420, 1130, 1870, 2610, 3480], 0.9, k=3.5) * 0.7
    x = mix_at(x, punch(0.7, 0.8, 0.2), 0.0, 0.6)
    hum = osc(glide(180, 360, 0.8), 0.8) * expenv(0.8, 2, 0.15) * 0.2
    x = mix_at(x, hum, 0.05)
    return reverb(fit(x, d), decay=0.9, mix=0.3)


def ar_heal():
    d = 1.1
    x = silence(d)
    for i, f in enumerate([783.99, 987.77, 1174.66, 1567.98]):
        x = mix_at(x, ping(f, 0.6, k=5) * 0.5 + ping(f * 2, 0.6, k=9) * 0.2, i * 0.07)
    x = mix_at(x, sparkle(0.7, 12, 3000, 8000), 0.2, 0.5)
    return reverb(fit(x, d), decay=1.2, mix=0.4)


def ar_mind():
    d = 1.1
    t = tt(0.9)
    bell = (osc(660, 0.9) + osc(667, 0.9) + osc(990, 0.9) * 0.4) * expenv(0.9, 2.5, 0.01) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))
    x = mix_at(silence(d), reverse_swell(0.3, 4000) * 0.5, 0.0)
    x = mix_at(x, bell * 0.4, 0.25)
    return reverb(fit(x, d), decay=1.2, mix=0.4)


def ar_submerge():
    d = 1.0
    x = mix_at(silence(d), osc(glide(320, 70, 0.3), 0.3) * expenv(0.3, 8), 0.0)
    x = mix_at(x, lowpass(noise(0.5), 900) * expenv(0.5, 6), 0.0, 0.5)
    for _ in range(12):
        x = mix_at(x, ping(rng.uniform(250, 700), 0.05, k=50, bend=0.8), rng.uniform(0.15, 0.8), 0.3)
    return reverb(fit(x, d), decay=0.8, mix=0.35, tone=2000)


def ar_clone():
    d = 0.9
    x = lowpass(noise(0.25), 1500) * expenv(0.25, 14) * 0.9
    x = mix_at(x, sparkle(0.5, 10, 3000, 8000)[::-1], 0.15, 0.6)
    x = mix_at(x, osc(glide(300, 900, 0.3), 0.3) * expenv(0.3, 8) * 0.3, 0.1)
    return reverb(fit(x, d), decay=0.8, mix=0.3)


# =====================================================================
def main():
    print('Core sounds -> static/sounds')
    core = {
        'buy': s_buy, 'sell': s_sell, 'roll': s_roll, 'levelup': s_levelup, 'starup': s_starup,
        'battle_start': s_battle_start, 'round_win': s_round_win, 'round_lose': s_round_lose,
        'hit_normal': s_hit_normal, 'hit_crit': s_hit_crit, 'skill_cast': s_skill_cast,
        'death': s_death, 'time_stop': lambda: s_time_stop(True), 'time_resume': s_time_resume,
        'menacing': s_menacing,
        'attack_rush': s_attack_rush, 'attack_blade': s_attack_blade, 'attack_bullet': s_attack_bullet,
        'attack_orb': s_attack_orb, 'attack_strike': s_attack_strike,
    }
    for name, fn in core.items():
        write(BASE, name, fn())

    print('Stand signatures -> static/sounds/stands')
    stands = {
        'The World': lambda: s_time_stop(True),
        'Star Platinum': lambda: s_time_stop(False),
        'Killer Queen': st_killer_queen,
        'King Crimson': st_king_crimson,
        'Gold Experience Requiem': st_ger,
        'Gold Experience': st_gold_experience,
        'Crazy Diamond': st_crazy_diamond,
        'The Hand': st_the_hand,
        'Sticky Fingers': st_sticky_fingers,
        'Aerosmith': st_aerosmith,
        'Hierophant Green': st_hierophant_green,
        "Magician's Red": st_magicians_red,
        'Silver Chariot': st_silver_chariot,
        'Sex Pistols': st_sex_pistols,
        'Purple Haze': st_purple_haze,
        'White Album': st_white_album,
        'Red Hot Chili Pepper': st_red_hot_chili_pepper,
        'Bad Company': st_bad_company,
        'Weather Report': st_weather_report,
        'Cream': st_cream,
        'Whitesnake': st_whitesnake,
        'C-MOON': st_c_moon,
        'Made in Heaven': st_made_in_heaven,
        'archetype_slash': s_attack_blade,
        'archetype_bullet': lambda: gunshot(0.5),
        'archetype_shield': ar_shield,
        'archetype_heal': ar_heal,
        'archetype_mind': ar_mind,
        'archetype_submerge': ar_submerge,
        'archetype_clone': ar_clone,
    }
    for name, fn in stands.items():
        write(STANDS, name, fn())


if __name__ == '__main__':
    main()
