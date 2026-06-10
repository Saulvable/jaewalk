#!/usr/bin/env python3
"""
JaeWalk PDF 서버 — localhost:5174에서 실행
POST /pdf  { trip, points } → PDF 다운로드
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, io, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER

# 나눔고딕 폰트 — Windows 경로
FONT_PATH = r'C:\Users\JaeHo\AppData\Local\Microsoft\Windows\Fonts\NanumGothic.ttf'
FONT_BOLD = r'C:\Users\JaeHo\AppData\Local\Microsoft\Windows\Fonts\NanumGothicBold.ttf'

try:
    pdfmetrics.registerFont(TTFont('NanumGothic', FONT_PATH))
    pdfmetrics.registerFont(TTFont('NanumGothicBold', FONT_BOLD))
    FONT = 'NanumGothic'
    FONT_B = 'NanumGothicBold'
    print('나눔고딕 폰트 로드 성공')
except:
    FONT = 'Helvetica'
    FONT_B = 'Helvetica-Bold'
    print('나눔고딕 없음 — Helvetica 사용 (한글 깨질 수 있음)')

TYPE_LABELS = {'departure':'출발지','airport':'공항','hotel':'숙소','food':'식당',
               'attraction':'관광지','shopping':'쇼핑','transport':'교통','other':'기타'}
TRANSPORT_LABELS = {'walk':'도보','car':'자동차','uber':'우버/택시',
                    'transit':'버스/전철','flight':'비행기'}

C_RED   = colors.HexColor('#FF3D5A')
C_TITLE = colors.HexColor('#1a237e')  # 진한 네이비 — 가독성 좋고 한국인 선호
C_MID   = colors.HexColor('#16213e')
C_MID2  = colors.HexColor('#1e2a4a')
C_BORDER= colors.HexColor('#0f3460')
C_TEAL  = colors.HexColor('#3ecfb2')
C_WHITE = colors.white
C_LIGHT = colors.HexColor('#dddddd')

def ps(name, **kw):
    base = dict(fontName=FONT, fontSize=9, textColor=C_WHITE, leading=13)
    base.update(kw)
    return ParagraphStyle(name, **base)

def make_pdf(trip, points):
    buf = io.BytesIO()
    points = sorted(points, key=lambda p: (p.get('day',1), p.get('order',0)))

    S = {
        'title': ps('title', fontSize=20, textColor=C_TITLE, fontName=FONT_B, alignment=TA_CENTER, spaceAfter=4*mm),
        'desc':  ps('desc',  fontSize=10, textColor=C_LIGHT, alignment=TA_CENTER, spaceAfter=5*mm),
        'day':   ps('day',   fontSize=13, textColor=C_TITLE, fontName=FONT_B, spaceBefore=6*mm, spaceAfter=3*mm),
        'th':    ps('th',    fontSize=9,  textColor=C_WHITE, fontName=FONT_B, alignment=TA_CENTER),
        'td':    ps('td',    fontSize=9,  textColor=C_WHITE),
        'td_c':  ps('td_c',  fontSize=9,  textColor=C_WHITE, alignment=TA_CENTER),
        'td_t':  ps('td_t',  fontSize=9,  textColor=C_TEAL, alignment=TA_CENTER),
        'td_n':  ps('td_n',  fontSize=9,  textColor=C_LIGHT),
        'foot':  ps('foot',  fontSize=8,  textColor=C_LIGHT, alignment=TA_CENTER),
    }

    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=12*mm, rightMargin=12*mm, topMargin=15*mm, bottomMargin=15*mm)
    story = []

    story.append(Paragraph(trip.get('name','여행'), S['title']))
    if trip.get('description'):
        story.append(Paragraph(trip['description'], S['desc']))

    grouped = {}
    for p in points:
        grouped.setdefault(p.get('day',1), []).append(p)

    for day, day_pts in sorted(grouped.items()):
        story.append(Paragraph(f'Day {day}', S['day']))
        header = [Paragraph(h, S['th']) for h in ['#','장소','유형','도착','출발','이동수단','소요','비용','메모']]
        rows = [header]
        row_colors = []

        for i, pt in enumerate(day_pts):
            trans = TRANSPORT_LABELS.get(pt.get('transport_to_next',''), '')
            dur   = f"{pt['duration_minutes']}분" if pt.get('duration_minutes') else ''
            cost  = f"${pt['cost']}" if pt.get('cost') else ''
            note_parts = []
            if pt.get('tag'):  note_parts.append(pt['tag'])   # # 없이
            if pt.get('note'): note_parts.append(pt['note'])

            rows.append([
                Paragraph(str(pt.get('order', i+1)), S['td_c']),
                Paragraph(pt.get('name',''), S['td']),
                Paragraph(TYPE_LABELS.get(pt.get('type','other'),'기타'), S['td_c']),
                Paragraph(pt.get('arrive_time',''), S['td_t']),
                Paragraph(pt.get('depart_time',''), S['td_t']),
                Paragraph(trans, S['td_c']),
                Paragraph(dur, S['td_c']),
                Paragraph(cost, S['td_c']),
                Paragraph('  '.join(note_parts), S['td_n']),
            ])
            row_colors.append(('BACKGROUND',(0,i+1),(-1,i+1), C_MID if i%2==0 else C_MID2))

        col_w = [7*mm, 52*mm, 14*mm, 14*mm, 14*mm, 18*mm, 12*mm, 12*mm, 40*mm]
        tbl = Table(rows, colWidths=col_w, repeatRows=1)
        ts = TableStyle([
            ('BACKGROUND',(0,0),(-1,0), C_RED),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
            ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('GRID',(0,0),(-1,-1),0.3,C_BORDER),
            ('BOX',(0,0),(-1,-1),0.8,C_RED),
        ])
        for rc in row_colors:
            ts.add(*rc)
        tbl.setStyle(ts)
        story.append(tbl)
        story.append(Spacer(1, 5*mm))

    story.append(HRFlowable(width='100%', thickness=0.5, color=C_BORDER, spaceBefore=4*mm))
    story.append(Paragraph('Generated by JaeWalk', S['foot']))
    doc.build(story)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path != '/pdf':
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        try:
            pdf_bytes = make_pdf(body['trip'], body['points'])
            trip_name = body['trip'].get('name', 'trip').replace(' ', '_')
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/pdf')
            from urllib.parse import quote
            safe_name = quote(trip_name.encode('utf-8'))
            self.send_header('Content-Disposition', f"attachment; filename*=UTF-8''{safe_name}.pdf")
            self.send_header('Content-Length', len(pdf_bytes))
            self.end_headers()
            self.wfile.write(pdf_bytes)
            print(f'PDF 생성: {trip_name}.pdf ({len(pdf_bytes)//1024}KB)')
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(str(e).encode())
            print(f'에러: {e}')

    def log_message(self, format, *args):
        pass  # 불필요한 로그 숨김

print('JaeWalk PDF 서버 시작 — http://localhost:5174')
HTTPServer(('localhost', 5174), Handler).serve_forever()
