from pathlib import Path
from html import escape

OUT = Path(__file__).parent
BG = '#0e1523'
PANEL = '#151e2d'
PLOT = '#101827'
LINE = '#2b384a'
TEXT = '#e8edf7'
SOFT = '#92a1b7'
VIOLET = '#a78bfa'
AMBER = '#f3bd4d'


def txt(x, y, value, size=16, color=TEXT, weight=400, anchor='start', extra=''):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(value)}</text>'


def bus(x1, x2, y, label, stroke=VIOLET, fill='#37265c', width=1.8):
    h = 28
    n = 9
    points = f'{x1},{y} {x1+n},{y-h/2} {x2-n},{y-h/2} {x2},{y} {x2-n},{y+h/2} {x1+n},{y+h/2}'
    return f'<polygon points="{points}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>' + txt((x1+x2)/2, y+5, label, 14, TEXT, 650, 'middle', 'font-family="Menlo, Consolas, monospace"')


def common():
    s = [f'<rect x="22" y="78" width="856" height="270" rx="12" fill="{PLOT}" stroke="{LINE}"/>']
    for x, label in [(265,'0.8 ns'), (432,'1.0 ns'), (599,'1.2 ns'), (766,'1.4 ns')]:
        s.append(f'<line x1="{x}" x2="{x}" y1="104" y2="324" stroke="{LINE}" stroke-dasharray="3 5"/>')
        s.append(txt(x, 105, label, 11, SOFT, 500, 'middle'))
    for y, label in [(156,'DATA〈10:7〉'), (222,'CLK'), (288,'Q〈10:7〉')]:
        s.append(txt(45, y+4, label, 13, TEXT, 600))
        s.append(f'<line x1="172" x2="850" y1="{y+34}" y2="{y+34}" stroke="{LINE}"/>')
    s.append(bus(185, 315, 156, 'D3'))
    s.append('<rect x="315" y="142" width="176" height="28" fill="#323b48" stroke="#778394"/>')
    s.append('<path d="M319 169l27-27m0 28l28-28m0 28l28-28m0 28l28-28m0 28l28-28m0 28l8-8" stroke="#586677" stroke-width="1"/>')
    s.append(txt(403, 160, 'mixed', 12, '#c9d2de', 600, 'middle'))
    s.append(bus(491, 850, 156, 'D4'))
    s.append(f'<path d="M185 236H432V208H850" fill="none" stroke="#42c6b6" stroke-width="2.3"/>')
    s.append(f'<line x1="432" x2="432" y1="205" y2="307" stroke="#42c6b6" stroke-width="1" stroke-dasharray="4 5" opacity=".65"/>')
    s.append(bus(185, 457, 288, '0xA'))
    s.append(bus(457, 850, 288, '0xB'))
    return ''.join(s)


def risk(kind):
    s=[]
    if kind == 'A':
        s += [f'<rect x="457" y="309" width="393" height="5" rx="2.5" fill="{AMBER}"/>',
              f'<circle cx="467" cy="311.5" r="4.5" fill="{AMBER}"/>',
              txt(506, 336, 'BIT 错位风险 · 本次采样', 12, AMBER, 700)]
    elif kind == 'B':
        s += [f'<polygon points="457,288 466,274 841,274 850,288 841,302 466,302" fill="#3f3450" stroke="{AMBER}" stroke-width="2.2"/>',
              f'<rect x="467" y="274" width="90" height="28" fill="#6b4b24"/>',
              txt(512, 293, '错位风险', 12, '#ffe0a0', 750, 'middle'),
              txt(700, 293, '0xB', 14, TEXT, 700, 'middle', 'font-family="Menlo, Consolas, monospace"')]
    elif kind == 'C':
        s += [f'<circle cx="432" cy="156" r="8" fill="{PLOT}" stroke="{AMBER}" stroke-width="2"/>',
              f'<circle cx="432" cy="156" r="2.5" fill="{AMBER}"/>',
              f'<path d="M432 169v78q0 13 13 13h12v13" fill="none" stroke="{AMBER}" stroke-width="1.6" stroke-dasharray="4 4"/>',
              f'<path d="M452 269l5 6 5-6" fill="none" stroke="{AMBER}" stroke-width="1.6"/>',
              f'<rect x="485" y="320" width="245" height="24" rx="6" fill="#493719" stroke="#ad8436"/>',
              txt(607, 336, '采样落入混合区 → bit 可能错位', 11, '#ffe0a0', 650, 'middle')]
    else:
        s += [f'<rect x="174" y="315" width="676" height="26" rx="4" fill="#1d2634" stroke="{LINE}"/>',
              txt(188, 332, '采样状态', 11, SOFT, 600),
              f'<rect x="457" y="319" width="393" height="18" rx="3" fill="#604519"/>',
              f'<line x1="457" x2="850" y1="316" y2="316" stroke="{AMBER}" stroke-width="2"/>',
              txt(653, 332, '可能 bit 错位', 11, '#ffe0a0', 750, 'middle')]
    return ''.join(s)


CONCEPTS = [
    ('A', '结果下沿标注', '最接近当前实现', '低干扰，直接覆盖受影响的整段 Q；需保留清楚的文字说明。'),
    ('B', 'Q 数据段边框', '风险与数值同处一段', '扫视最直接；连续出现风险时，琥珀色会占据较大视觉面积。'),
    ('C', '采样因果线', '解释为什么会错位', '把输入混合区、采样时刻和 Q 结果连起来；适合选中态展开。'),
    ('D', '独立采样状态轨', '适合多次采样', '不改 Q 波形本体，按时间对齐多个风险；占用额外纵向空间。'),
]


def one(kind, title, tag, description):
    body = [f'<rect width="900" height="420" rx="18" fill="{BG}"/>',
            txt(26, 37, f'{kind}  {title}', 22, TEXT, 750),
            f'<rect x="647" y="17" width="226" height="28" rx="14" fill="#26334a"/>',
            txt(760, 36, tag, 12, '#bbcbdf', 650, 'middle'),
            txt(28, 65, description, 12, SOFT)]
    body.append(common())
    body.append(risk(kind))
    body.append(txt(28, 388, '示意：CLK 在输入 Bus 的 mixed 区采样；Q 仍显示当前边沿计算值 0xB。', 12, SOFT))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">{"".join(body)}</svg>'


for args in CONCEPTS:
    (OUT / f'concept-{args[0]}.svg').write_text(one(*args), encoding='utf-8')

board=[]
for i, args in enumerate(CONCEPTS):
    x=30+(i%2)*930
    y=105+(i//2)*450
    inner=one(*args).replace('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">','').removesuffix('</svg>')
    board.append(f'<g transform="translate({x} {y})">{inner}</g>')
header = [f'<rect width="1920" height="1035" fill="#0a101c"/>',
          txt(30, 48, 'Chrona · Bus 采样 bit 错位提示', 30, TEXT, 750),
          txt(30, 78, '四个可选的视觉方向 · 仅为设计稿，尚未更改产品界面', 15, SOFT),
          txt(30, 1003, '统一语义：黄色表示潜在 bit 错位；红色继续表示直接 Setup / Hold 违例。', 14, SOFT)]
(OUT / 'comparison.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1035" viewBox="0 0 1920 1035" style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+''.join(header+board)+'</svg>', encoding='utf-8')
