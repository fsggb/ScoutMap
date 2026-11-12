import json,subprocess,glob,sys
V='/tmp/claude-0/-home-user/53c51b4b-3207-568d-98c6-f0c8e2ce75ec/scratchpad/voice/'
d=json.load(open(V+'starts5.json'));st=d['starts'];cuts=sorted(d['cuts']);total=d['total']
def dur(i):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',V+f'n{i}.wav']).decode())
card=dur(0)+1.0
cuts=sorted(cuts+[[0,st[1]-0.1]])
# fusion des coupes qui se chevauchent
m=[]
for a,b in cuts:
    if m and a<=m[-1][1]: m[-1][1]=max(m[-1][1],b)
    else: m.append([a,b])
cuts=m
keep=[];t=0.0
for a,b in cuts:
    if a>t: keep.append((t,a))
    t=max(t,b)
keep.append((t,total+5))
def mapt(x):
    s=0.0
    for a,b in cuts:
        if b<=x: s+=b-a
        elif a<x: s+=x-a
    return x-s
vid=glob.glob(V+'rec/*.webm')[0]
fc=f"[1:v]scale=1280:720,format=yuv420p,fps=25,setsar=1[card];"
fc+=''.join(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p,setsar=1[v{i}];" for i,(a,b) in enumerate(keep))
fc+='[card]'+''.join(f'[v{i}]' for i in range(len(keep)))+f'concat=n={len(keep)+1}:v=1:a=0[vout]'
ins=['-i',vid,'-loop','1','-t',f'{card:.3f}','-i','/home/user/scoutmap/assets/tuto-poster.png']
fa=[]
for i,s in enumerate(st):
    ins+=['-i',V+f'n{i}.wav']
    pos=0.3 if i==0 else card+mapt(s)+0.3
    ms=int(pos*1000); fa.append(f'[{i+2}:a]adelay={ms}|{ms}[a{i}]')
mix=''.join(f'[a{i}]' for i in range(len(st)))+f'amix=inputs={len(st)}:normalize=0[aout]'
cmd=['ffmpeg','-y','-v','error']+ins+['-filter_complex',fc+';'+';'.join(fa)+';'+mix,'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','veryfast','-crf','29','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',V+'tuto-final.mp4']
r=subprocess.run(cmd,capture_output=True,text=True);print(r.stderr[-500:])
print('card',round(card,1),'steps',[round(card+mapt(s)+0.3,1) if i else 0.3 for i,s in enumerate(st)])
