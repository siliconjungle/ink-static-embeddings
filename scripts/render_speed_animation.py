"""Render a shareable relative-speed animation from retained CPU measurements.

Requires Pillow and ffmpeg. Example:
uv run --no-project --with pillow python scripts/render_speed_animation.py
"""
import argparse
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
    # Render type/curves at 2x, then downsample for clean social previews.
    scale=2;size=(1200,860)
    base=Image.new('RGB',(size[0]*scale,size[1]*scale),'#0b101d')
    draw=ImageDraw.Draw(base)
    def font(n,bold=False):return ImageFont.truetype(str(args.font_dir/('Arial Bold.ttf' if bold else 'Arial.ttf')),n*scale)
    def text(x,y,s,n=24,color='#eaf0fc',bold=False):draw.text((x*scale,y*scale),s,font=font(n,bold),fill=color)
    def box(bounds,fill,radius=18,outline=None):
        draw.rounded_rectangle(tuple(int(x*scale) for x in bounds),radius=radius*scale,fill=fill,outline=outline,width=scale)
    ink='#55e6c1';numpy='#b29aff';muted='#98a8c3';track='#263248'
    text(55,38,'Potion 2M inference speed',52,bold=True)
    text(57,108,'Ink → JavaScript vs Model2Vec / NumPy',26,muted)
    tracks=[]
    panels=[('short',180,'SHORT INPUTS · 1–16 TOKENS',f'Ink {times["short"]["numpy"]/times["short"]["after"]:.2f}× faster',ink),
            ('all',445,'MIXED CORPUS · 64 QUERIES',f'NumPy {times["all"]["after"]/times["all"]["numpy"]:.2f}× faster',numpy)]
    for key,y,title,badge,color in panels:
        box((45,y,1155,y+240),'#121c2d',outline='#263248')
        text(73,y+25,title,24,muted,True)
        box((824,y+15,1134,y+59),'#202e43',12)
        text(842,y+24,badge,24,color,True)
        for index,(name,mode,c) in enumerate([('Ink / JavaScript','after',ink),('Model2Vec / NumPy','numpy',numpy)]):
            row=y+104+index*78
            text(75,row-23,name,26,c,True)
            latency=times[key][mode]/1000
            text(75,row+11,f'{latency:.2f} µs / query',20,muted)
            draw.line((466*scale,row*scale,1105*scale,row*scale),fill=track,width=6*scale)
            for x in [466,1105]:draw.ellipse(((x-4)*scale,(row-4)*scale,(x+4)*scale,(row+4)*scale),fill='#53617a')
            tracks.append((row,c,latency))
    text(57,719,'Single-query CPU latency · Apple M4 Pro',23,bold=True)
    text(57,756,'Fixed weights and token IDs. Loading and tokenization excluded.',21,muted)
    text(57,791,'Motion shows relative speed, not real-time execution. Faster = lower latency.',18,muted)
    text(57,824,'github.com/siliconjungle/ink-static-embeddings',18,muted)
    fps=30;duration=10;left,right=466,1105;distance=right-left
    def frame(t,poster=False):
        image=base.copy();pen=ImageDraw.Draw(image)
        # All balls share a distance. Their velocities are proportional to 1/latency.
        # Fade at the loop boundary so exact measured ratios need no forced integer cycles.
        opacity=1 if poster else min(1,t/.25,(duration-t)/.35)
        for row,c,latency in tracks:
            cycle=0 if poster else t/(2.4*latency/(times['short']['numpy']/1000))
            phase=cycle%1
            x=left+distance*(2*phase if phase<.5 else 2*(1-phase))
            rgb=tuple(int(c[i:i+2],16) for i in (1,3,5))
            bg=(18,28,45);fill=tuple(round(bg[i]+(rgb[i]-bg[i])*max(0,opacity)) for i in range(3))
            r=13
            pen.ellipse(((x-r)*scale,(row-r)*scale,(x+r)*scale,(row+r)*scale),fill=fill)
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
    print(json.dumps({'dimensions':size,'duration_seconds':duration,'gif':str(gif),'mp4':str(video),'source':'results/javascript/report.json'}))


if __name__=='__main__':main()
