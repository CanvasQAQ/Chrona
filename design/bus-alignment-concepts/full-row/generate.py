from pathlib import Path
from html import escape

OUT=Path(__file__).parent
OUT.mkdir(parents=True,exist_ok=True)

PALETTES={
 'light-color':dict(page='#f3f4f8',card='#ffffff',canvas='#fafafe',text='#292b3a',muted='#697184',grid='#dce0e9',border='#dfe2eb',wave='#745cf1',wavefill='#eeebff',wavetext='#493cc0',clock='#0b8c73',mix='#e5e8ee',mixline='#b6becb',risk='#c47d09',riskfill='#fff7e7'),
 'dark-color':dict(page='#0b0c12',card='#13141b',canvas='#0d0e14',text='#f0f0f5',muted='#a5a7b5',grid='#2b2d3a',border='#353844',wave='#8b7cff',wavefill='#262045',wavetext='#d5ccff',clock='#35d6b4',mix='#2e313d',mixline='#515565',risk='#efb54e',riskfill='#332816'),
 'light-mono':dict(page='#f2f2f2',card='#ffffff',canvas='#ffffff',text='#1c1c1c',muted='#666666',grid='#e3e3e3',border='#dddddd',wave='#343434',wavefill='#ffffff',wavetext='#242424',clock='#414141',mix='#eeeeee',mixline='#c5c5c5',risk='#c5a359',riskfill='#fffaf0'),
 'dark-mono':dict(page='#080808',card='#101010',canvas='#000000',text='#f4f4f4',muted='#c2c2c2',grid='#333333',border='#353535',wave='#e6e6e6',wavefill='#0b0b0b',wavetext='#eeeeee',clock='#dadada',mix='#202020',mixline='#484848',risk='#bba36a',riskfill='#1a170f'),
}

NAMES={'light-color':('亮色主题','彩色线条'), 'dark-color':('暗色主题','彩色线条'), 'light-mono':('亮色主题','黑白线条'), 'dark-mono':('暗色主题','黑白线条')}

def t(x,y,s,p,size=14,color='text',weight=400,anchor='start'):
    return f'<text x="{x}" y="{y}" fill="{p[color]}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>'

def wave(x1,x2,y,label,p):
    n=9; inner=x2-x1-2*n
    path=f'M{x1} {y}l{n} -15h{inner}l{n} 15l-{n} 15h-{inner}Z'
    return f'<path d="{path}" fill="{p["wavefill"]}" stroke="{p["wave"]}" stroke-width="1.8"/>' + t((x1+x2)/2,y+5,label,p,14,'wavetext',700,'middle')

def card(key):
    p=PALETTES[key]; title,variant=NAMES[key]; mono='mono' in key
    s=[f'<rect width="900" height="405" rx="18" fill="{p["card"]}" stroke="{p["border"]}"/>',
       t(28,38,title,p,21,weight=750),
       t(872,38,variant,p,13,'muted',650,'end'),
       t(29,65,'整个 Q 波形持续显示采样错位风险，不按时间段切割。',p,12,'muted'),
       f'<rect x="28" y="86" width="844" height="261" rx="12" fill="{p["canvas"]}" stroke="{p["border"]}"/>']
    for x,label in [(252,'0.8 ns'),(419,'1.0 ns'),(586,'1.2 ns'),(753,'1.4 ns')]:
        s += [f'<path d="M{x} 112v214" stroke="{p["grid"]}" stroke-dasharray="3 5"/>',t(x,109,label,p,11,'muted',500,'middle')]
    for y,label in [(154,'DATA〈10:7〉'),(219,'CLK')]:
        s += [t(48,y+5,label,p,13,weight=650),f'<path d="M174 {y+32}H850" stroke="{p["grid"]}"/>']
    s += [wave(185,309,154,'D3',p),
          f'<rect x="309" y="139" width="174" height="30" fill="{p["mix"]}" stroke="{p["mixline"]}"/>',
          f'<path d="M311 169l28-30m0 30l28-30m0 30l28-30m0 30l28-30m0 30l28-30m0 30l7-8" stroke="{p["mixline"]}" stroke-width="1"/>',
          wave(483,850,154,'D4',p),
          f'<path d="M185 234H419V204H850" fill="none" stroke="{p["clock"]}" stroke-width="2.3"/>']
    # An uninterrupted frame covers every Q word, leaving the signal name outside.
    if mono:
        s += [f'<rect x="176" y="258" width="684" height="57" rx="8" fill="{p["riskfill"]}" stroke="{p["risk"]}" stroke-width="1.4"/>']
    else:
        s += [f'<rect x="176" y="258" width="684" height="57" rx="8" fill="{p["riskfill"]}" stroke="{p["risk"]}" stroke-width="1.8"/>']
    s += [t(50,291,'Q〈10:7〉',p,13,weight=700),wave(185,453,286,'0xA',p),wave(453,650,286,'0xB',p),wave(650,850,286,'0xC',p),
          t(29,380,'框只覆盖 Q 波形区域；颜色与线重只表示视觉强弱，风险语义相同。',p,12,'muted')]
    return ''.join(s)

for key in PALETTES:
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="405" viewBox="0 0 900 405" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">{card(key)}</svg>'
    (OUT/f'{key}.svg').write_text(svg,encoding='utf-8')

board=['<rect width="1880" height="995" fill="#f0f1f5"/>',
       '<text x="30" y="48" fill="#242839" font-size="30" font-weight="750">Chrona · 整段 Q 波形错位风险</text>',
       '<text x="30" y="78" fill="#657083" font-size="15">B 方案深化 · 两种主题 × 两种线条调色板</text>']
for i,key in enumerate(PALETTES):
    board.append(f'<g transform="translate({30+(i%2)*920} {104+(i//2)*430})">{card(key)}</g>')
board.append('<text x="30" y="963" fill="#657083" font-size="14">仅为设计稿；四种情况都使用黄色 warning 外框，黑白线条版本更轻柔。</text>')
(OUT/'comparison.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1880" height="995" viewBox="0 0 1880 995" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+''.join(board)+'</svg>',encoding='utf-8')
