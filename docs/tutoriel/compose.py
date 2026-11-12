import json, subprocess, glob, sys
V = '/tmp/claude-0/-home-user/53c51b4b-3207-568d-98c6-f0c8e2ce75ec/scratchpad/voice/'
d = json.load(open(V + 'starts6.json'))
st, parts, cuts, total = d['starts'], d['parts'], sorted(d['cuts']), d['total']
N = len(st)
vid = glob.glob(V + 'rec/*.webm')[0]


def dur(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode())


def overlap(a, b, c, e):
    return max(0.0, min(b, e) - max(a, c))


def segs(a, b):
    out, t = [], a
    for ca, cb in cuts:
        if cb <= t or ca >= b:
            continue
        if ca > t:
            out.append((t, min(ca, b)))
        t = max(t, cb)
    if t < b:
        out.append((t, b))
    return [s for s in out if s[1] - s[0] > 0.05]


def rel(x, a):
    return (x - a) - sum(overlap(a, x, ca, cb) for ca, cb in cuts)


def step_range(i0, i1):
    """intervalle d'enregistrement couvrant les étapes i0..i1 (inclus)"""
    a = st[i0]
    b = st[i1 + 1] if i1 + 1 < N else total + 5
    return a, b


def tts(text, out):
    open(V + 'c.txt', 'w').write(text)
    subprocess.run(f'python3 -m piper -m {V}fr_FR-siwis-medium.onnx --length-scale 0.9 --sentence-silence 0.55 -f {V}tmp_r.wav < {V}c.txt', shell=True, check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', V + 'tmp_r.wav', '-af', 'loudnorm=I=-17:TP=-2', '-ar', '44100', out], check=True)


for k, t in (('route', 'Tutoriel.\n\nL’itinéraire.'), ('az', 'Tutoriel.\n\nLes azimuts.'), ('game', 'Tutoriel.\n\nLe grand jeu.')):
    tts(t.replace('’', "'"), V + f'title_{k}.wav')


def build(name, pieces):
    """pieces : ('card', image, audio_wav|None, extra_dur) | ('rec', i0, i1)"""
    inputs, fl, aud = ['-i', vid], [], []
    vlabels, offset, nrec, idx_in = [], 0.0, 0, 1
    # nombre de coupes à partir de l'entrée 0
    plan = []
    for p in pieces:
        if p[0] == 'card':
            l = (dur(p[2]) if p[2] else 0.0) + p[3]
            plan.append(('card', p, l))
        else:
            a, b = step_range(p[1], p[2])
            sg = segs(a, b)
            plan.append(('rec', p, sum(y - x for x, y in sg), a, b, sg))
    ntrim = sum(len(x[5]) for x in plan if x[0] == 'rec')
    fl.append(f'[0:v]split={max(ntrim, 1)}' + ''.join(f'[s{i}]' for i in range(max(ntrim, 1))))
    ti = 0
    for x in plan:
        if x[0] == 'card':
            _, p, l = x
            inputs += ['-loop', '1', '-t', f'{l:.3f}', '-i', V + p[1]]
            fl.append(f'[{idx_in}:v]scale=1280:720,format=yuv420p,fps=25,setsar=1[c{idx_in}]')
            vlabels.append(f'[c{idx_in}]'); idx_in += 1
            if p[2]:
                inputs += ['-i', p[2]]
                ms = int((offset + 0.4) * 1000)
                fl.append(f'[{idx_in}:a]adelay={ms}|{ms}[a{idx_in}]'); aud.append(f'[a{idx_in}]'); idx_in += 1
            offset += l
        else:
            _, p, l, a, b, sg = x
            for (u, v) in sg:
                fl.append(f'[s{ti}]trim=start={u:.3f}:end={v:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p,setsar=1[r{ti}]')
                vlabels.append(f'[r{ti}]'); ti += 1
            for i in range(p[1], p[2] + 1):
                if i == 0 and name == 'global':
                    continue
                inputs += ['-i', V + f'n{i}.wav']
                ms = int((offset + rel(st[i], a) + 0.3) * 1000)
                fl.append(f'[{idx_in}:a]adelay={ms}|{ms}[a{idx_in}]'); aud.append(f'[a{idx_in}]'); idx_in += 1
            offset += l
    fc = ';'.join(fl) + ';' + ''.join(vlabels) + f'concat=n={len(vlabels)}:v=1:a=0[vout];' + ''.join(aud) + f'amix=inputs={len(aud)}:normalize=0[aout]'
    cmd = ['ffmpeg', '-y', '-v', 'error'] + inputs + ['-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '29', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-shortest', V + f'tuto-{name}.mp4']
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(name, r.returncode, r.stderr[-300:], round(offset, 1))


def first(p):
    return min(i for i in range(N) if parts[i] == p)


def last(p):
    return max(i for i in range(N) if parts[i] == p)


# --- global : affiche (avec la première phrase), puis chaque partie précédée de sa carte
g = [('card', 'poster-global.png', V + 'n0.wav', 1.0), ('rec', 1, last(1))]
for k in range(2, 7):
    g.append(('card', f'part{k}.png', V + f'p{k}.wav', 1.2))
    g.append(('rec', first(k), last(k)))
build('global', g)
build('route', [('card', 'poster-route.png', V + 'title_route.wav', 1.2), ('rec', first(2), last(3))])
build('az', [('card', 'poster-az.png', V + 'title_az.wav', 1.2), ('rec', first(4), last(4))])
build('game', [('card', 'poster-game.png', V + 'title_game.wav', 1.2), ('rec', first(5), last(5))])
