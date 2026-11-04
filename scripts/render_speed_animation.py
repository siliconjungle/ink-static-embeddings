"""Render a shareable relative-speed animation from retained CPU and GPU measurements.

Requires Pillow and ffmpeg. Example:
uv run --no-project --with pillow python scripts/render_speed_animation.py
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--font-dir',type=Path,default=Path('/System/Library/Fonts/Supplemental'))
    p.add_argument('--output',type=Path,default=Path('media'))
    args=p.parse_args();args.output.mkdir(exist_ok=True,parents=True)
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:raise RuntimeError('ffmpeg is required')
    report=json.loads(Path('results/javascript/report.json').read_text())
    times=report['median_ns_per_embedding']
    gpu_report=json.loads(Path('results/targets/report.json').read_text())
    gpu={r['mode']:r['median_ns_per_embedding']/1000 for r in gpu_report['summary'] if r['batch']==1024}
    # Ink's sites use Arial, near-black, warm white, quiet rules and open space.
    scale=2;size=(1200,870);background='#111111'
    base=Image.new('RGB',(size[0]*scale,size[1]*scale),background)
    draw=ImageDraw.Draw(base)
    def font(n,bold=False):return ImageFont.truetype(str(args.font_dir/('Arial Bold.ttf' if bold else 'Arial.ttf')),n*scale)
    def text(x,y,s,n=24,color='#e3e3df',bold=False,anchor=None):
        draw.text((x*scale,y*scale),s,font=font(n,bold),fill=color,anchor=anchor)
    text(62,30,'ink',112,bold=True)
    text(1136,97,'potion 2m',28,'#a8aaa2',anchor='ra')
    ink='#e3e3df';numpy='#92958b';muted='#a8aaa2';track='#30322c'
    tracks=[];motion=[]
    panels=[(210,'short · 1–16 tokens',times['short']['after']/1000,times['short']['numpy']/1000,'ink · js','numpy'),
            (435,'mixed · 64 queries',times['all']['after']/1000,times['all']['numpy']/1000,'ink · js','numpy'),
            (660,'batch · 1,024',gpu['gpu'],gpu['upstream'],'ink · gpu','numpy · cpu')]
    left,right=330,980;distance=right-left
    for y,title,ink_us,numpy_us,ink_label,numpy_label in panels:
        winner='ink' if ink_us<numpy_us else 'numpy'
        ratio=max(ink_us,numpy_us)/min(ink_us,numpy_us)
        text(64,y,title,28)
        text(1136,y,f'{winner} {ratio:.2f}×',28,anchor='ra')
        motion.append({'panel':title,'ink_latency_us':ink_us,'numpy_latency_us':numpy_us,
                       'ink_speed_over_numpy':numpy_us/ink_us})
        for index,(name,latency,c) in enumerate([(ink_label,ink_us,ink),(numpy_label,numpy_us,numpy)]):
            row=y+75+index*60
            text(64,row,name,24,c,anchor='lm')
            text(1136,row,f'{latency:.2f} µs',24,c,anchor='rm')
            draw.line((left*scale,row*scale,right*scale,row*scale),fill=track,width=2*scale)
            tracks.append((row,c,latency,index==0))
        if y!=660:draw.line((64*scale,(y+183)*scale,1136*scale,(y+183)*scale),fill='#282a25',width=scale)
    fps=30;duration=16
    def frame(t,poster=False):
        image=base.copy();pen=ImageDraw.Draw(image)
        for row,c,latency,solid in tracks:
            # A common slowdown factor across all six tracks; no rounded trip
            # counts or alignment adjustment. The repeating GIF visibly resets.
            cycle=0 if poster else t/(2.4*latency/(times['short']['numpy']/1000))
            phase=cycle%1;x=left+distance*(2*phase if phase<.5 else 2*(1-phase))
            rgb=tuple(int(c[i:i+2],16) for i in (1,3,5))
            fill=rgb
            r=10;bounds=((x-r)*scale,(row-r)*scale,(x+r)*scale,(row+r)*scale)
            if solid:pen.ellipse(bounds,fill=fill)
            else:pen.ellipse(bounds,fill=background,outline=fill,width=2*scale)
        return image.resize(size,Image.Resampling.LANCZOS)
    frame(0,True).save(args.output/'potion-2m-speed.png')
    video=args.output/'potion-2m-speed.mp4'
    command=[ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24',
             '-s',f'{size[0]}x{size[1]}','-r',str(fps),'-i','-','-an','-c:v','libx264',
             '-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(video)]
    process=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        for i in range(fps*duration):process.stdin.write(frame(i/fps).tobytes())
        process.stdin.close()
        if process.wait():raise RuntimeError('video encoding failed')
    finally:
        if process.poll() is None:process.kill();process.wait()
    gif=args.output/'potion-2m-speed.gif'
    subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(video),'-filter_complex',
       '[0:v]fps=20,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
       '-loop','0',str(gif)],check=True)
    sources=['results/javascript/report.json','results/targets/report.json']
    (args.output/'animation.json').write_text(json.dumps({'duration_seconds':duration,'seamless':False,
        'gif_loop_count':0,'style_sources':['https://inkwell.ing/','https://siliconjungle.github.io/ink-spec-site/'],
        'sources_sha256':{s:hashlib.sha256(Path(s).read_bytes()).hexdigest() for s in sources},
        'motion':'Velocities derive directly from inverse measured latency, with one time scale across all panels. No forced alignment, ratio approximation or fade. The GIF resets at its repeat boundary.',
        'reference_round_trip_seconds':2.4,'reference_latency_us':times['short']['numpy']/1000,
        'panels':motion},indent=2)+'\n')
    print(json.dumps({'dimensions':size,'duration_seconds':duration,'gif':str(gif),'mp4':str(video),'sources':['results/javascript/report.json','results/targets/report.json']}))


if __name__=='__main__':main()
