from pathlib import Path
from html import escape

OUT = Path(__file__).parent
OUT.mkdir(parents=True, exist_ok=True)
C = {
    'page':'#f3f4f8', 'card':'#ffffff', 'canvas':'#fafafe',
    'line':'#e1e4ed', 'grid':'#d8dce7', 'text':'#282b3b',
    'muted':'#697184', 'violet':'#745cf1', 'violet_fill':'#edeaff',
    'teal':'#0b8c73', 'amber':'#ac6800', 'amber_bright':'#e6a125',
    'amber_fill':'#fff2d5', 'grey':'#e6e9ef',
}


def text(x,y,t,size=14,color=None,weight=400,anchor='start'):
    return f'<text x="{x}" y="{y}" fill="{color or C["text"]}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(t)}</text>'


def wave(x1,x2,y,label,extra=''):
    n=9
    return (f'<path d="M{x1} {y}l{n} -15h{x2-x1-2*n}l{n} 15l-{n} 15h-{x2-x1-2*n}Z" fill="{C["violet_fill"]}" stroke="{C["violet"]}" stroke-width="1.7" {extra}/>'
            +text((x1+x2)/2,y+4,label,13,'#493cc0',700,'middle'))


def scene(variant):
    s=[f'<rect x="28" y="85" width="844" height="259" rx="12" fill="{C["canvas"]}" stroke="{C["line"]}"/>']
    for x,label in [(255,'0.8 ns'),(422,'1.0 ns'),(589,'1.2 ns'),(756,'1.4 ns')]:
        s += [f'<path d="M{x} 111v216" stroke="{C["grid"]}" stroke-dasharray="3 5"/>',text(x,108,label,11,C['muted'],500,'middle')]
    for y,label in [(155,'DATA〈10:7〉'),(220,'CLK'),(285,'Q〈10:7〉')]:
        s += [text(47,y+5,label,13,C['text'],650),f'<path d="M171 {y+31}H850" stroke="{C["line"]}"/>']
    # The input mixing window stays grey, as it is in the product.
    s += [wave(183,308,155,'D3'),
          f'<rect x="308" y="140" width="174" height="30" fill="{C["grey"]}" stroke="#abb2c0"/>',
          '<path d="M311 169l28-28m0 28l28-28m0 28l28-28m0 28l28-28m0 28l28-28m0 28l5-5" stroke="#b9c0cc"/>',
          wave(482,850,155,'D4'),
          f'<path d="M183 235H422V205H850" fill="none" stroke="{C["teal"]}" stroke-width="2.4"/>',
          f'<path d="M422 205v103" stroke="{C["teal"]}" stroke-opacity=".5" stroke-dasharray="4 4"/>']
    # Warning from the output edge to the end of this sampled Q word.
    if variant=='A':
        s += ['<rect x="446" y="262" width="404" height="47" rx="7" fill="#fff1ce"/>',
              '<rect x="446" y="262" width="4" height="47" rx="2" fill="#d48600"/>']
    elif variant=='B':
        s += ['<rect x="445" y="260" width="406" height="51" rx="8" fill="#fff8e9" stroke="#c47c00" stroke-width="1.8"/>']
    elif variant=='C':
        s += ['<rect x="445" y="260" width="406" height="52" rx="7" fill="#fff7e6"/>',
              '<path d="M446 262H850M446 310H850" stroke="#d38a09" stroke-width="2.5"/>',
              '<path d="M446 262v48M850 262v48" stroke="#d38a09" stroke-width="2"/>']
    else:
        s += ['<rect x="445" y="260" width="406" height="51" rx="6" fill="#fff6e3"/>',
              '<pattern id="risk-hatch" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M-4 14L14 -4M3 18L18 3" stroke="#eccb8d" stroke-width="1"/></pattern>',
              '<rect x="445" y="260" width="406" height="51" rx="6" fill="url(#risk-hatch)"/>',
              '<path d="M445 260v51" stroke="#c47c00" stroke-width="3"/>']
    s += [wave(183,446,285,'0xA'),wave(446,850,285,'0xB')]
    if variant=='A':
        s += ['<path d="M446 309H850" stroke="#d48600" stroke-width="2"/>']
    if variant=='D':
        s += ['<path d="M446 311H850" stroke="#d99b2c" stroke-width="1.2"/>']
    return ''.join(s)


IDEAS=[
 ('A','整段底色','轻量','浅琥珀底色托住整个风险 Q 段，保留原紫色波形。'),
 ('B','整段边框','明确','用完整的框界定风险范围，视觉上最像“这一段有警告”。'),
 ('C','双轨括号','精确','上下两条强调线夹住风险段，边界明确且波形内部干净。'),
 ('D','整段纹理','可辨识','淡斜纹铺满风险区，黑白打印或低彩度显示仍易分辨。'),
]


def card(kind,title,tag,desc):
    content=[f'<rect width="900" height="405" rx="18" fill="{C["card"]}" stroke="{C["line"]}"/>',
             text(29,38,f'{kind}  {title}',22,C['text'],750),
             f'<rect x="790" y="17" width="80" height="28" rx="14" fill="{C["amber_fill"]}"/>',
             text(830,36,tag,12,C['amber'],700,'middle'),
             text(30,66,desc,12,C['muted']),scene(kind),
             text(30,382,'风险从本次 Q 输出边沿开始；Q 数值仍按当前边沿计算。',12,C['muted'])]
    return ''.join(content)


for idea in IDEAS:
    body=card(*idea)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="405" viewBox="0 0 900 405" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">{body}</svg>'
    (OUT/f'light-{idea[0]}.svg').write_text(svg,encoding='utf-8')

parts=[f'<rect width="1880" height="995" fill="{C["page"]}"/>',
       text(30,48,'Chrona · Bus 采样风险的整段提示',30,C['text'],750),
       text(30,78,'亮色主题 · 同一段 Q 波形的四种 warning 表现',15,C['muted'])]
for i,idea in enumerate(IDEAS):
    parts.append(f'<g transform="translate({30+(i%2)*920} {103+(i//2)*430})">{card(*idea)}</g>')
parts.append(text(30,962,'设计稿：黄色仅表示 bit 可能错位；直接 Setup / Hold 违例继续使用红色。',14,C['muted']))
(OUT/'light-comparison.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1880" height="995" viewBox="0 0 1880 995" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">{"".join(parts)}</svg>',encoding='utf-8')
