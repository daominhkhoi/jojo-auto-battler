import wave
import math
import struct
import random
import os

SAMPLE_RATE = 44100

def create_wave(filepath, duration, generator_func):
    num_samples = int(SAMPLE_RATE * duration)
    with wave.open(filepath, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        
        frames = bytearray()
        for i in range(num_samples):
            t = i / SAMPLE_RATE
            val = generator_func(t, duration)
            val = max(-1.0, min(1.0, val))
            sample = int(val * 32767.0)
            frames.extend(struct.pack('<h', sample))
        wav.writeframes(frames)
    print(f"Generated Stand SFX: {os.path.basename(filepath)} ({duration:.2f}s)")

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'sounds', 'stands')
os.makedirs(out_dir, exist_ok=True)

# 1. The World: Za Warudo Bass Drop & Clock Stop
def gen_the_world(t, d):
    if t < 0.35:
        progress = t / 0.35
        f = 350.0 + 1400.0 * (progress ** 2)
        vib = math.sin(2 * math.pi * 18.0 * t) * 0.2
        return math.sin(2 * math.pi * f * t) * (progress * 0.6) * (1.0 + vib)
    else:
        t_sub = t - 0.35
        env = math.exp(-t_sub * 2.2)
        freq = 95.0 - 55.0 * (t_sub / (d - 0.35))
        sub = (math.sin(2 * math.pi * freq * t_sub) * 0.75 +
               math.sin(2 * math.pi * (freq * 0.5) * t_sub) * 0.5)
        # 3 Clock ticks
        tick = 0.0
        for tick_t in [0.2, 0.6, 1.0]:
            dt = t_sub - tick_t
            if 0 <= dt < 0.02:
                tick += math.sin(2 * math.pi * 2400.0 * dt) * math.exp(-dt * 200.0) * 0.4
        return (sub + tick) * env * 0.95

# 2. Star Platinum: Ora Ora Barrage & Time Stop Shimmer
def gen_star_platinum(t, d):
    # 7 rapid punch impacts + high shimmer
    punches = 0.0
    for idx, pt in enumerate([0.02, 0.08, 0.14, 0.20, 0.27, 0.34, 0.42]):
        dt = t - pt
        if 0 <= dt < 0.08:
            pf = 180.0 - 90.0 * (dt / 0.08)
            env_p = math.exp(-dt * 30.0)
            snap = (random.random() * 2.0 - 1.0) * 0.3
            punches += (math.sin(2 * math.pi * pf * dt) * 0.7 + snap) * env_p
    # Final heavy impact + metallic ring
    if t >= 0.45:
        dt2 = t - 0.45
        env2 = math.exp(-dt2 * 3.5)
        heavy = math.sin(2 * math.pi * 110.0 * dt2) * 0.6
        ring = math.sin(2 * math.pi * 1800.0 * dt2) * 0.35
        punches += (heavy + ring) * env2
    return punches * 0.85

# 3. Killer Queen: Detonator Click + Explosive Blast
def gen_killer_queen(t, d):
    if t < 0.15:
        # Metallic thumb click
        env_c = math.exp(-t * 80.0)
        click = (math.sin(2 * math.pi * 3200.0 * t) * 0.7 +
                 (random.random() * 2.0 - 1.0) * 0.5) * env_c
        return click * 0.9
    elif t < 0.28:
        return 0.0 # Tension silence
    else:
        # Massive explosion
        t_exp = t - 0.28
        env_exp = math.exp(-t_exp * 2.8)
        f_exp = 90.0 - 50.0 * (t_exp / (d - 0.28))
        boom = math.sin(2 * math.pi * f_exp * t_exp) * 0.75
        noise = (random.random() * 2.0 - 1.0) * math.exp(-t_exp * 6.0) * 0.5
        return (boom + noise) * env_exp * 0.95

# 4. King Crimson: Time Erase Void Sweep & Heartbeat
def gen_king_crimson(t, d):
    # Phase 1: Sudden reverse vacuum suction
    if t < 0.4:
        env1 = t / 0.4
        f1 = 400.0 - 300.0 * env1
        wobble = math.sin(2 * math.pi * 15.0 * t) * 0.3
        return math.sin(2 * math.pi * f1 * t) * env1 * (1.0 + wobble) * 0.6
    else:
        # Two deep thumping heartbeats
        t_hb = t - 0.4
        hb = 0.0
        for hbt in [0.05, 0.45]:
            dt = t_hb - hbt
            if 0 <= dt < 0.25:
                env_h = math.sin(math.pi * (dt / 0.25)) ** 2
                hb += math.sin(2 * math.pi * 55.0 * dt) * env_h * 0.8
        sub = math.sin(2 * math.pi * 40.0 * t_hb) * math.exp(-t_hb * 1.5) * 0.4
        return (hb + sub) * 0.9

# 5. Gold Experience Requiem: Return to Zero Reverse Chime
def gen_ger(t, d):
    # Reverse swell + golden chord
    env = math.sin(math.pi * (t / d))
    chords = [523.25, 659.25, 783.99, 987.77, 1046.50]
    tone = sum(math.sin(2 * math.pi * f * t) for f in chords) / len(chords)
    sparkle = math.sin(2 * math.pi * 2093.0 * t) * 0.3
    wobble = 1.0 + 0.1 * math.sin(2 * math.pi * 6.0 * t)
    return (tone + sparkle) * env * wobble * 0.85

# 6. Crazy Diamond: Glass Shatter & Reversal Chime
def gen_crazy_diamond(t, d):
    # Shatter
    shatter = (random.random() * 2.0 - 1.0) * math.exp(-t * 25.0) * 0.6
    ping = math.sin(2 * math.pi * 2600.0 * t) * math.exp(-t * 20.0) * 0.5
    # Restorative harmonic tone
    t2 = max(0.0, t - 0.15)
    env2 = math.exp(-t2 * 3.5) if t >= 0.15 else 0.0
    heal_f = [440.0, 554.37, 659.25, 880.0]
    heal = sum(math.sin(2 * math.pi * f * t2) for f in heal_f) / len(heal_f)
    return (shatter + ping + heal * env2) * 0.8

# 7. The Hand: Space Erasure Scrape & Vacuum
def gen_the_hand(t, d):
    # Screeching scrape
    env = math.exp(-t * 2.5)
    f = 1200.0 - 950.0 * (t / d)
    glitch = math.sin(2 * math.pi * f * t + math.sin(2 * math.pi * 40.0 * t) * 4.0)
    sub = math.sin(2 * math.pi * 70.0 * t) * 0.6
    return (glitch * 0.6 + sub) * env * 0.9

# 8. Sticky Fingers: Zipper Opening & Closing
def gen_sticky_fingers(t, d):
    # Rapid teeth zipping rattle
    teeth = 0.0
    for z in range(16):
        zt = z * 0.02
        dt = t - zt
        if 0 <= dt < 0.015:
            zf = 1600.0 - z * 40.0
            teeth += math.sin(2 * math.pi * zf * dt) * math.exp(-dt * 120.0)
    # Final heavy punch at 0.35s
    punch = 0.0
    if t >= 0.32:
        dt2 = t - 0.32
        punch = math.sin(2 * math.pi * 140.0 * dt2) * math.exp(-dt2 * 18.0) * 0.8
    return (teeth * 0.7 + punch) * 0.85

# 9. Aerosmith: Propeller Engine & Twin Machine Guns
def gen_aerosmith(t, d):
    # Propeller hum
    prop = math.sin(2 * math.pi * 95.0 * t) * (1.0 + 0.5 * math.sin(2 * math.pi * 30.0 * t))
    # Rapid gunshots (8 rounds)
    shots = 0.0
    for s in range(8):
        st = s * 0.05
        dt = t - st
        if 0 <= dt < 0.035:
            shots += (math.sin(2 * math.pi * 800.0 * dt) * 0.5 + (random.random() * 2.0 - 1.0) * 0.5) * math.exp(-dt * 90.0)
    return (prop * 0.3 + shots * 0.8) * 0.85

# 10. Hierophant Green: Emerald Splash
def gen_hierophant(t, d):
    # Rapid spray of crystal emerald pings
    crystals = 0.0
    freqs = [1800.0, 2100.0, 2400.0, 1950.0, 2250.0, 2600.0, 2050.0, 2350.0]
    for idx, cf in enumerate(freqs):
        ct = idx * 0.055
        dt = t - ct
        if 0 <= dt < 0.1:
            crystals += math.sin(2 * math.pi * cf * dt) * math.exp(-dt * 25.0) * 0.4
    splash = (random.random() * 2.0 - 1.0) * math.exp(-t * 6.0) * 0.25
    return (crystals + splash) * 0.85

# 11. Magician's Red: Flame Roar & Fire Explosion
def gen_magicians_red(t, d):
    env = math.exp(-t * 2.4)
    rumble = math.sin(2 * math.pi * 85.0 * t) * 0.6
    flame = (random.random() * 2.0 - 1.0) * (0.6 + 0.3 * math.sin(2 * math.pi * 8.0 * t))
    return (rumble + flame * 0.7) * env * 0.85

# 12. Silver Chariot: Steel Rapier Slashes
def gen_silver_chariot(t, d):
    slashes = 0.0
    for s in range(4):
        st = s * 0.09
        dt = t - st
        if 0 <= dt < 0.07:
            sf = 2200.0 - dt * 10000.0
            steel = math.sin(2 * math.pi * sf * dt) * 0.6
            noise = (random.random() * 2.0 - 1.0) * 0.4
            slashes += (steel + noise) * math.exp(-dt * 45.0)
    return slashes * 0.85

# 13. Sex Pistols: Ricochet Bullet Ping & Whistle
def gen_sex_pistols(t, d):
    # Crack shot + 3 ricochets
    shots = (random.random() * 2.0 - 1.0) * math.exp(-t * 50.0) * 0.7
    for rt, rf in [(0.06, 2800.0), (0.16, 3400.0), (0.28, 2200.0)]:
        dt = t - rt
        if 0 <= dt < 0.12:
            shots += math.sin(2 * math.pi * (rf + dt * 1500.0) * dt) * math.exp(-dt * 30.0) * 0.6
    return shots * 0.85

# 14. Purple Haze: Capsule Crack & Toxic Hiss
def gen_purple_haze(t, d):
    pop = (random.random() * 2.0 - 1.0) * math.exp(-t * 70.0) * 0.8
    hiss_env = math.exp(-t * 3.5)
    hiss = (random.random() * 2.0 - 1.0) * hiss_env * 0.6
    bubble = math.sin(2 * math.pi * (400.0 + 300.0 * math.sin(2 * math.pi * 15.0 * t)) * t) * hiss_env * 0.3
    return (pop + hiss + bubble) * 0.85

# 15. White Album: Gently Weeps Ice Freeze Crack
def gen_white_album(t, d):
    freeze = (random.random() * 2.0 - 1.0) * math.exp(-t * 4.0) * 0.4
    cracks = 0.0
    for ct in [0.03, 0.12, 0.22, 0.35]:
        dt = t - ct
        if 0 <= dt < 0.05:
            cracks += math.sin(2 * math.pi * 3500.0 * dt) * math.exp(-dt * 70.0) * 0.6
    sub = math.sin(2 * math.pi * 70.0 * t) * math.exp(-t * 3.0) * 0.4
    return (freeze + cracks + sub) * 0.85

# 16. Red Hot Chili Pepper: High-Voltage Electric Arc
def gen_chili_pepper(t, d):
    env = math.exp(-t * 3.0)
    zap = (math.sin(2 * math.pi * 120.0 * t) * 0.5 +
           math.sin(2 * math.pi * 240.0 * t) * 0.3)
    spark = (random.random() * 2.0 - 1.0) * (1.0 if (int(t * 100) % 3 == 0) else 0.1) * 0.6
    return (zap + spark) * env * 0.85

# 17. Bad Company: Military Volley & Artillery
def gen_bad_company(t, d):
    cadence = 0.0
    for s in range(6):
        st = s * 0.06
        dt = t - st
        if 0 <= dt < 0.04:
            cadence += (random.random() * 2.0 - 1.0) * math.exp(-dt * 60.0) * 0.6
    cannon = 0.0
    if t >= 0.35:
        dt2 = t - 0.35
        cannon = math.sin(2 * math.pi * 80.0 * dt2) * math.exp(-dt2 * 4.0) * 0.8
    return (cadence + cannon) * 0.85

# 18. Weather Report: Thunderclap & Rain
def gen_weather_report(t, d):
    clap = (random.random() * 2.0 - 1.0) * math.exp(-t * 4.5) * 0.7
    thunder = math.sin(2 * math.pi * 65.0 * t) * math.exp(-t * 2.0) * 0.6
    return (clap + thunder) * 0.85

# 19. Cream: Void Sphere Matter Consumption
def gen_cream(t, d):
    env = math.exp(-t * 2.0)
    f = 180.0 - 120.0 * (t / d)
    void = math.sin(2 * math.pi * f * t) * 0.7
    suck = (random.random() * 2.0 - 1.0) * math.sin(math.pi * (t / d)) * 0.4
    return (void + suck) * env * 0.85

# 20. Whitesnake: Stand DISC Ejection
def gen_whitesnake(t, d):
    disc = math.sin(2 * math.pi * 1800.0 * t) * math.exp(-t * 45.0) * 0.8
    acid = (random.random() * 2.0 - 1.0) * math.exp(-t * 5.0) * 0.4
    return (disc + acid) * 0.85

# 21. C-MOON: Gravity Shift Inversion
def gen_c_moon(t, d):
    env = math.exp(-t * 2.0)
    f = 60.0 + 180.0 * math.sin(math.pi * (t / d))
    grav = math.sin(2 * math.pi * f * t) * 0.8
    return grav * env * 0.9

# 22. Made in Heaven: Infinite Speed Acceleration
def gen_made_in_heaven(t, d):
    progress = t / d
    f = 120.0 * (1.8 ** (progress * 5.0))
    sonic = math.sin(2 * math.pi * f * t) * math.exp(-t * 1.8) * 0.8
    return sonic * 0.85

# Archetype Generics
def gen_archetype_slash(t, d):
    f = 1600.0 - dt_f * 5000.0 if (dt_f := t) else 1600.0
    blade = math.sin(2 * math.pi * f * t) * 0.6 + (random.random() * 2.0 - 1.0) * 0.4
    return blade * math.exp(-t * 18.0) * 0.8

def gen_archetype_bullet(t, d):
    shot = (random.random() * 2.0 - 1.0) * math.exp(-t * 35.0) * 0.7
    whistle = math.sin(2 * math.pi * 2200.0 * t) * math.exp(-t * 15.0) * 0.4
    return (shot + whistle) * 0.85

def gen_archetype_shield(t, d):
    f = 350.0 + 200.0 * math.sin(math.pi * (t / d))
    hum = math.sin(2 * math.pi * f * t) * math.exp(-t * 3.5) * 0.7
    ping = math.sin(2 * math.pi * 1400.0 * t) * math.exp(-t * 20.0) * 0.4
    return (hum + ping) * 0.85

def gen_archetype_heal(t, d):
    notes = [440.0, 554.37, 659.25]
    tone = sum(math.sin(2 * math.pi * f * t) for f in notes) / len(notes)
    return tone * math.exp(-t * 2.5) * 0.75

def gen_archetype_mind(t, d):
    f = 450.0 + 80.0 * math.sin(2 * math.pi * 7.0 * t)
    return math.sin(2 * math.pi * f * t) * math.exp(-t * 2.2) * 0.7

def gen_archetype_submerge(t, d):
    splash = (random.random() * 2.0 - 1.0) * math.exp(-t * 15.0) * 0.5
    bubble = math.sin(2 * math.pi * 180.0 * t) * math.exp(-t * 4.0) * 0.6
    return (splash + bubble) * 0.8

def gen_archetype_clone(t, d):
    env = math.sin(math.pi * (t / d))
    tone1 = math.sin(2 * math.pi * 500.0 * t)
    tone2 = math.sin(2 * math.pi * 750.0 * t) * 0.7
    return (tone1 + tone2) * env * 0.75

stand_sfx = [
    ('The World.wav', 1.8, gen_the_world),
    ('Star Platinum.wav', 1.2, gen_star_platinum),
    ('Killer Queen.wav', 1.2, gen_killer_queen),
    ('King Crimson.wav', 1.4, gen_king_crimson),
    ('Gold Experience Requiem.wav', 1.5, gen_ger),
    ('Gold Experience.wav', 1.1, gen_ger),
    ('Crazy Diamond.wav', 0.9, gen_crazy_diamond),
    ('The Hand.wav', 1.0, gen_the_hand),
    ('Sticky Fingers.wav', 0.75, gen_sticky_fingers),
    ('Aerosmith.wav', 0.75, gen_aerosmith),
    ('Hierophant Green.wav', 0.85, gen_hierophant),
    ('Magician\'s Red.wav', 1.0, gen_magicians_red),
    ('Silver Chariot.wav', 0.65, gen_silver_chariot),
    ('Sex Pistols.wav', 0.65, gen_sex_pistols),
    ('Purple Haze.wav', 0.9, gen_purple_haze),
    ('White Album.wav', 0.9, gen_white_album),
    ('Red Hot Chili Pepper.wav', 0.8, gen_chili_pepper),
    ('Bad Company.wav', 0.9, gen_bad_company),
    ('Weather Report.wav', 1.1, gen_weather_report),
    ('Cream.wav', 1.0, gen_cream),
    ('Whitesnake.wav', 0.8, gen_whitesnake),
    ('C-MOON.wav', 1.2, gen_c_moon),
    ('Made in Heaven.wav', 1.2, gen_made_in_heaven),
    
    # Archetype SFX
    ('archetype_slash.wav', 0.35, gen_archetype_slash),
    ('archetype_bullet.wav', 0.35, gen_archetype_bullet),
    ('archetype_shield.wav', 0.6, gen_archetype_shield),
    ('archetype_heal.wav', 0.7, gen_archetype_heal),
    ('archetype_mind.wav', 0.7, gen_archetype_mind),
    ('archetype_submerge.wav', 0.6, gen_archetype_submerge),
    ('archetype_clone.wav', 0.6, gen_archetype_clone),
]

for filename, dur, func in stand_sfx:
    filepath = os.path.join(out_dir, filename)
    create_wave(filepath, dur, func)

print(f"Generated all {len(stand_sfx)} Stand SFX into {out_dir}!")
