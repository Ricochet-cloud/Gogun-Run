import wave
import struct
import math
import random
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
SAMPLE_RATE = 22050

def save_wav(filename, samples, sample_rate=SAMPLE_RATE):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with wave.open(filepath, 'w') as wav_file:
        wav_file.setnchannels(1) # mono
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        # Clamp samples to 16-bit signed int
        packed = bytearray()
        for s in samples:
            val = max(-1.0, min(1.0, s))
            int_val = int(val * 32767)
            packed.extend(struct.pack('<h', int_val))
        wav_file.writeframes(packed)
    print(f"Generated {filepath} ({len(samples)/sample_rate:.2f}s)")

def make_jump():
    duration = 0.16
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        freq = 180 + 480 * (progress ** 0.8)
        phase = 2 * math.pi * freq * t
        # Square wave with envelope
        wave_val = 1.0 if math.sin(phase) > 0 else -1.0
        env = (1.0 - progress) ** 0.5
        samples.append(wave_val * env * 0.45)
    return samples

def make_land():
    duration = 0.10
    n = int(SAMPLE_RATE * duration)
    samples = []
    random.seed(42)
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        freq = 130 * (1.0 - progress * 0.6)
        sine = math.sin(2 * math.pi * freq * t)
        noise = (random.random() * 2.0 - 1.0) * 0.3
        env = (1.0 - progress) ** 2
        samples.append((sine * 0.7 + noise * 0.3) * env * 0.5)
    return samples

def make_hit():
    duration = 0.28
    n = int(SAMPLE_RATE * duration)
    samples = []
    random.seed(99)
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        noise = random.random() * 2.0 - 1.0
        tone = math.sin(2 * math.pi * (160 * (1.0 - progress * 0.5)) * t)
        env = (1.0 - progress) ** 1.8
        samples.append((noise * 0.65 + tone * 0.35) * env * 0.6)
    return samples

def make_game_over():
    duration = 1.1
    n = int(SAMPLE_RATE * duration)
    samples = []
    # Descending notes: A3 (220), F3 (174.6), D3 (146.8), Bb2 (116.5)
    notes = [220.0, 174.6, 146.8, 116.5]
    note_dur = duration / len(notes)
    for i in range(n):
        t = i / SAMPLE_RATE
        note_idx = min(int(t / note_dur), len(notes) - 1)
        freq = notes[note_idx]
        local_t = t - (note_idx * note_dur)
        local_prog = local_t / note_dur
        # Triangle wave
        phase = (freq * t) % 1.0
        tri = 4.0 * abs(phase - 0.5) - 1.0
        env = max(0.0, 1.0 - local_prog * 0.9)
        samples.append(tri * env * 0.5)
    return samples

def make_click():
    duration = 0.04
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        freq = 800 + 400 * progress
        sine = math.sin(2 * math.pi * freq * t)
        env = 1.0 - progress
        samples.append(sine * env * 0.4)
    return samples

def make_hook_connect():
    duration = 0.14
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        # Metallic ping + wire latch sound
        freq1 = 1100 + 300 * (1.0 - progress)
        freq2 = 1850 * (1.0 - progress * 0.3)
        sine = math.sin(2 * math.pi * freq1 * t) * 0.6 + math.sin(2 * math.pi * freq2 * t) * 0.4
        env = math.exp(-progress * 18.0)
        samples.append(sine * env * 0.55)
    return samples

def make_hook_release():
    duration = 0.18
    n = int(SAMPLE_RATE * duration)
    samples = []
    random.seed(77)
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        # Whoosh + snap sound
        freq = 300 + 600 * progress
        sine = math.sin(2 * math.pi * freq * t)
        noise = (random.random() * 2.0 - 1.0) * 0.4
        env = math.sin(math.pi * progress)
        samples.append((sine * 0.6 + noise * 0.4) * env * 0.5)
    return samples

def make_bgm():
    # 8-bar looping Demon Slayer In-sen pentatonic retro chiptune
    # Scale: D, Eb, G, A, C (or D, F, G, A, C)
    # 130 BPM, 4 beats per bar, 8 bars = 32 beats = ~14.77s
    bpm = 135
    beat_dur = 60.0 / bpm
    total_beats = 32
    duration = total_beats * beat_dur
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n

    # Melody notes (freq in Hz)
    D4, F4, G4, A4, C5, D5 = 293.66, 349.23, 392.00, 440.00, 523.25, 587.33
    REST = 0

    melody = [
        # Bar 1-2
        (D4, 1.0), (F4, 1.0), (G4, 1.5), (A4, 0.5),
        (C5, 1.0), (A4, 1.0), (G4, 2.0),
        # Bar 3-4
        (A4, 1.0), (C5, 1.0), (D5, 1.5), (C5, 0.5),
        (A4, 1.0), (G4, 0.5), (F4, 0.5), (D4, 2.0),
        # Bar 5-6
        (F4, 1.0), (G4, 1.0), (A4, 1.0), (C5, 1.0),
        (D5, 1.5), (C5, 0.5), (A4, 2.0),
        # Bar 7-8
        (G4, 1.0), (F4, 1.0), (G4, 1.0), (A4, 1.0),
        (F4, 1.0), (E4 := 329.63, 1.0), (D4, 2.0)
    ]

    # Bassline notes
    bass_notes = [D4/2, D4/2, G4/2, G4/2, A4/2, A4/2, D4/2, D4/2] # 1 per bar (4 beats each)

    # Render Melody
    cur_beat = 0.0
    for note, beats in melody:
        start_sample = int(cur_beat * beat_dur * SAMPLE_RATE)
        note_len = int(beats * beat_dur * SAMPLE_RATE)
        for i in range(note_len):
            idx = start_sample + i
            if idx >= n: break
            t = i / SAMPLE_RATE
            prog = i / note_len
            if note > 0:
                # 8-bit pulse wave (duty cycle 25%)
                phase = (note * t) % 1.0
                wave_val = 0.8 if phase < 0.25 else -0.8
                env = math.exp(-prog * 2.5) # plucked decay
                samples[idx] += wave_val * env * 0.22
        cur_beat += beats

    # Render Bass
    for bar in range(8):
        root_freq = bass_notes[bar % len(bass_notes)]
        for b in range(4): # 4 beats per bar
            start_sample = int((bar * 4 + b) * beat_dur * SAMPLE_RATE)
            beat_len = int(beat_dur * SAMPLE_RATE)
            for i in range(beat_len):
                idx = start_sample + i
                if idx >= n: break
                t = i / SAMPLE_RATE
                prog = i / beat_len
                # Triangle bass
                phase = (root_freq * t) % 1.0
                tri = 4.0 * abs(phase - 0.5) - 1.0
                env = (1.0 - prog) ** 1.5
                samples[idx] += tri * env * 0.25

    # Render Drum / Percussion (Hi-hat / Kick ticks)
    random.seed(12345)
    for b in range(total_beats):
        start_sample = int(b * beat_dur * SAMPLE_RATE)
        # Kick on 0, 2
        is_kick = (b % 2 == 0)
        drum_len = int((0.15 if is_kick else 0.06) * SAMPLE_RATE)
        for i in range(drum_len):
            idx = start_sample + i
            if idx >= n: break
            t = i / SAMPLE_RATE
            prog = i / drum_len
            if is_kick:
                # Sine pitch drop
                freq = 110 * (1.0 - prog * 0.7)
                drum_val = math.sin(2 * math.pi * freq * t) * ((1.0 - prog) ** 2) * 0.28
            else:
                # Hi-hat noise
                drum_val = (random.random() * 2.0 - 1.0) * ((1.0 - prog) ** 3) * 0.12
            samples[idx] += drum_val

    return samples

if __name__ == '__main__':
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    save_wav('sfx_jump.wav', make_jump())
    save_wav('sfx_land.wav', make_land())
    save_wav('sfx_hit.wav', make_hit())
    save_wav('sfx_game_over.wav', make_game_over())
    save_wav('sfx_click.wav', make_click())
    save_wav('sfx_hook_connect.wav', make_hook_connect())
    save_wav('sfx_hook_release.wav', make_hook_release())
    save_wav('bgm_main.wav', make_bgm())
    print("All audio generated successfully!")
