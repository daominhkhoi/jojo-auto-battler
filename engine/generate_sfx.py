import wave
import math
import struct
import random
import os

SAMPLE_RATE = 44100

def create_wave(filename, duration, generator_func):
    num_samples = int(SAMPLE_RATE * duration)
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1) # Mono
        wav.setsampwidth(2) # 16-bit
        wav.setframerate(SAMPLE_RATE)
        
        frames = bytearray()
        for i in range(num_samples):
            t = i / SAMPLE_RATE
            val = generator_func(t, duration)
            # Clamp between -1.0 and 1.0
            val = max(-1.0, min(1.0, val))
            sample = int(val * 32767.0)
            frames.extend(struct.pack('<h', sample))
        wav.writeframes(frames)
    print(f"Generated {filename} ({duration:.2f}s)")

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'sounds')
os.makedirs(out_dir, exist_ok=True)

# 1. BUY: Crisp dual gold chime (B5 + E6)
def gen_buy(t, d):
    env = math.exp(-t * 9.0)
    s1 = math.sin(2 * math.pi * 987.77 * t)
    s2 = math.sin(2 * math.pi * 1318.51 * t) * 0.7
    s3 = math.sin(2 * math.pi * 2637.02 * t) * 0.25 # Metallic bell harmonic
    return (s1 + s2 + s3) * env * 0.65

# 2. SELL: Coin drop clink & pouch jingle
def gen_sell(t, d):
    # Two quick clinks
    t1 = t
    t2 = max(0.0, t - 0.08)
    env1 = math.exp(-t1 * 14.0) if t1 < 0.25 else 0.0
    env2 = math.exp(-t2 * 10.0) if t >= 0.08 else 0.0
    c1 = math.sin(2 * math.pi * 784.0 * t1) * env1
    c2 = math.sin(2 * math.pi * 1046.5 * t2) * env2
    return (c1 + c2) * 0.6

# 3. ROLL: Dice rattle & deck flutter
def gen_roll(t, d):
    # Rapid series of mini clicks + whoosh
    env = math.sin(math.pi * (t / d))
    clicks = 0.0
    for tick_t in [0.02, 0.06, 0.11, 0.17, 0.23]:
        dt = t - tick_t
        if 0 <= dt < 0.04:
            clicks += math.sin(2 * math.pi * 1500 * dt) * math.exp(-dt * 80.0)
    whoosh = (random.random() * 2.0 - 1.0) * env * 0.2
    return (clicks * 0.7 + whoosh) * 0.7

# 4. LEVEL UP: Ascending fanfare arpeggio (C5 -> E5 -> G5 -> C6)
def gen_levelup(t, d):
    notes = [523.25, 659.25, 783.99, 1046.50]
    note_dur = d / 4.0
    idx = min(3, int(t / note_dur))
    freq = notes[idx]
    local_t = t - (idx * note_dur)
    env = math.exp(-local_t * 4.0)
    # Bright brassy synth tone (fundamental + 2nd + 3rd harmonic)
    tone = (math.sin(2 * math.pi * freq * t) * 0.6 +
            math.sin(2 * math.pi * freq * 2 * t) * 0.25 +
            math.sin(2 * math.pi * freq * 3 * t) * 0.15)
    return tone * env * 0.75

# 5. STAR UP: Shimmering power-up chord (C5 + G5 + C6) with vibrato
def gen_starup(t, d):
    env = math.exp(-t * 2.8)
    vib = 1.0 + 0.03 * math.sin(2 * math.pi * 8.0 * t)
    f1 = 523.25 * vib
    f2 = 783.99 * vib
    f3 = 1046.50 * vib
    chord = (math.sin(2 * math.pi * f1 * t) * 0.4 +
             math.sin(2 * math.pi * f2 * t) * 0.35 +
             math.sin(2 * math.pi * f3 * t) * 0.25)
    # Sparkle high overtone
    sparkle = math.sin(2 * math.pi * 2093.0 * t) * math.exp(-t * 5.0) * 0.2
    return (chord + sparkle) * env * 0.8

# 6. BATTLE START: Deep battle horn & resonant gong
def gen_battle_start(t, d):
    env = math.exp(-t * 2.2)
    # Deep horn (130Hz) with slight pitch drop
    freq = 130.0 - 15.0 * (t / d)
    horn = (math.sin(2 * math.pi * freq * t) * 0.5 +
            math.sin(2 * math.pi * freq * 2 * t) * 0.3 +
            math.sin(2 * math.pi * freq * 3 * t) * 0.2)
    gong = math.sin(2 * math.pi * 330.0 * t) * math.exp(-t * 4.0) * 0.3
    impact = (random.random() * 2.0 - 1.0) * math.exp(-t * 30.0) * 0.4
    return (horn + gong + impact) * env * 0.85

# 7. ROUND WIN: Triumphant fanfare
def gen_round_win(t, d):
    # Progression: G5 -> C6 -> E6
    if t < 0.3:
        f = 783.99
        lt = t
    elif t < 0.65:
        f = 1046.50
        lt = t - 0.3
    else:
        f = 1318.51
        lt = t - 0.65
    env = math.exp(-lt * 2.5)
    tone = (math.sin(2 * math.pi * f * t) * 0.6 +
            math.sin(2 * math.pi * f * 2 * t) * 0.25 +
            math.sin(2 * math.pi * f * 3 * t) * 0.15)
    return tone * env * 0.75

# 8. ROUND LOSE: Low dramatic defeat tone
def gen_round_lose(t, d):
    # Descending gloomy chord: D4 -> Bb3 -> G3
    env = math.exp(-t * 1.8)
    f = 293.66 - 100.0 * (t / d)
    tone = (math.sin(2 * math.pi * f * t) * 0.6 +
            math.sin(2 * math.pi * (f * 1.2) * t) * 0.3 +
            math.sin(2 * math.pi * (f * 0.5) * t) * 0.4)
    thud = (random.random() * 2.0 - 1.0) * math.exp(-t * 25.0) * 0.3
    return (tone + thud) * env * 0.7

# 9. HIT NORMAL: Punch impact
def gen_hit_normal(t, d):
    env = math.exp(-t * 22.0)
    freq = 160.0 - 100.0 * (t / d)
    sub = math.sin(2 * math.pi * freq * t) * 0.6
    snap = (random.random() * 2.0 - 1.0) * 0.4
    return (sub + snap) * env * 0.8

# 10. HIT CRIT: Heavy critical hit with sharp impact
def gen_hit_crit(t, d):
    env = math.exp(-t * 16.0)
    freq = 240.0 - 180.0 * (t / d)
    thud = math.sin(2 * math.pi * freq * t) * 0.7
    metal = math.sin(2 * math.pi * 1250.0 * t) * math.exp(-t * 25.0) * 0.4
    noise = (random.random() * 2.0 - 1.0) * math.exp(-t * 35.0) * 0.5
    return (thud + metal + noise) * env * 0.85

# 11. SKILL CAST: Stand aura energy surge
def gen_skill_cast(t, d):
    env = math.sin(math.pi * (t / d))
    # Upward sweep 250Hz -> 1100Hz with phase modulation
    progress = t / d
    freq = 250.0 + 850.0 * (progress ** 1.5)
    mod = math.sin(2 * math.pi * 12.0 * t) * 30.0
    tone = math.sin(2 * math.pi * (freq + mod) * t)
    sheen = math.sin(2 * math.pi * (freq * 2) * t) * 0.3
    return (tone * 0.7 + sheen) * env * 0.75

# 12. DEATH: Vanishing swoosh
def gen_death(t, d):
    env = math.exp(-t * 6.0)
    freq = 500.0 - 420.0 * (t / d)
    tone = math.sin(2 * math.pi * freq * t) * 0.5
    noise = (random.random() * 2.0 - 1.0) * math.exp(-t * 8.0) * 0.35
    return (tone + noise) * env * 0.65

# 13. TIME STOP: JoJo Za Warudo Bass Drop & Clock Freeze
def gen_time_stop(t, d):
    # Phase 1: High frequency sucking / clock tick
    # Phase 2: Ultra heavy sub-bass drop & ringing silence
    if t < 0.35:
        # Rising suction
        env = t / 0.35
        f = 300.0 + 1200.0 * (t / 0.35)
        return math.sin(2 * math.pi * f * t) * env * 0.5
    else:
        # Massive bass drop
        t_sub = t - 0.35
        env = math.exp(-t_sub * 2.2)
        freq = 110.0 - 65.0 * (t_sub / (d - 0.35))
        bass = (math.sin(2 * math.pi * freq * t_sub) * 0.7 +
                math.sin(2 * math.pi * (freq * 0.5) * t_sub) * 0.5)
        # Clock tick in background
        tick = 0.0
        for tick_t in [0.2, 0.5, 0.8, 1.1]:
            dt = t_sub - tick_t
            if 0 <= dt < 0.02:
                tick += math.sin(2 * math.pi * 2000.0 * dt) * math.exp(-dt * 150.0) * 0.3
        return (bass + tick) * env * 0.85

sfx_definitions = [
    ('buy.wav', 0.35, gen_buy),
    ('sell.wav', 0.4, gen_sell),
    ('roll.wav', 0.3, gen_roll),
    ('levelup.wav', 0.8, gen_levelup),
    ('starup.wav', 0.9, gen_starup),
    ('battle_start.wav', 1.2, gen_battle_start),
    ('round_win.wav', 1.4, gen_round_win),
    ('round_lose.wav', 1.5, gen_round_lose),
    ('hit_normal.wav', 0.18, gen_hit_normal),
    ('hit_crit.wav', 0.28, gen_hit_crit),
    ('skill_cast.wav', 0.5, gen_skill_cast),
    ('death.wav', 0.45, gen_death),
    ('time_stop.wav', 1.8, gen_time_stop),
]

for filename, dur, func in sfx_definitions:
    filepath = os.path.join(out_dir, filename)
    create_wave(filepath, dur, func)

print(f"Successfully generated all {len(sfx_definitions)} sound effects into {out_dir}!")
