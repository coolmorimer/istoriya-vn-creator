"""Build the 0.2.34 user guide from verified UI copy and native screenshots."""
import argparse, base64, hashlib, html, json, re
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, NextPageTemplate
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage
from pypdf import PdfReader

parser=argparse.ArgumentParser()
parser.add_argument('--screens',default='docs/manual034/screens')
parser.add_argument('--out',default='output/pdf')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
data=json.loads((root/'docs/manual034/content.json').read_text(encoding='utf-8'))
screens=Path(args.screens);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Guide',str(root/'public/fonts/DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('GuideBold',str(root/'public/fonts/DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
W,H=landscape(A4);CW=W-72
styles=getSampleStyleSheet()
for name in ['Normal','BodyText','Heading1','Heading2','Title']:
 styles[name].fontName='Guide'
styles.add(ParagraphStyle(name='GuideBody',fontName='Guide',fontSize=10.5,leading=15,spaceAfter=7,textColor=colors.HexColor('#20232c')))
styles.add(ParagraphStyle(name='GuideTitle',fontName='GuideBold',fontSize=28,leading=35,spaceAfter=18,textColor=colors.HexColor('#33213f')))
styles.add(ParagraphStyle(name='GuideH1',fontName='GuideBold',fontSize=18,leading=24,spaceBefore=17,spaceAfter=10,keepWithNext=True,textColor=colors.HexColor('#442160')))
styles.add(ParagraphStyle(name='GuideRoute',fontName='GuideBold',fontSize=9.5,leading=13,spaceAfter=12,keepWithNext=True,textColor=colors.HexColor('#5c397a')))
styles.add(ParagraphStyle(name='GuideNote',fontName='Guide',fontSize=9.5,leading=13,spaceBefore=8,spaceAfter=12,backColor=colors.HexColor('#f0edf5'),borderPadding=9))
styles.add(ParagraphStyle(name='GuideCaption',fontName='Guide',fontSize=9,leading=12,spaceBefore=7,spaceAfter=12,textColor=colors.HexColor('#515561')))
styles.add(ParagraphStyle(name='GuideCell',fontName='Guide',fontSize=9.3,leading=12.5))
styles.add(ParagraphStyle(name='GuideTOC',fontName='Guide',fontSize=9,leading=12,leftIndent=0,firstLineIndent=0,spaceBefore=0))

def human(s):
 return re.sub(r'(?<=[А-Яа-яЁё])(?=\d)|(?<=\d)(?=[А-Яа-яЁё])',' ',s)
def clean(s):
 return human(s).replace('\u2011','-').replace('—','-').replace('–','-')
def p(s,style='GuideBody'):
 return Paragraph(escape(clean(s)).replace('\n','<br/>'),styles[style])
def footer(c,doc):
 c.saveState();c.setStrokeColor(colors.HexColor('#dbd6e2'));c.line(36,31,W-36,31)
 c.setFillColor(colors.HexColor('#60616d'));c.setFont('Guide',8)
 c.drawString(36,18,'История 0.2.34 | Руководство пользователя | 19.10.2026')
 c.drawRightString(W-36,18,str(doc.page));c.restoreState()
class GuideDoc(BaseDocTemplate):
 def afterFlowable(self,f):
  if isinstance(f,Paragraph) and getattr(f,'guide_key',None):
   text=f.getPlainText();key=f.guide_key;self.canv.bookmarkPage(key);self.canv.addOutlineEntry(text,key,level=0,closed=False);self.notify('TOCEntry',(0,text,self.page,key))
pdf=out/'Istoriya-0.2.34-guide.pdf'
doc=GuideDoc(str(pdf),pagesize=(W,H),leftMargin=36,rightMargin=36,topMargin=30,bottomMargin=43,title=data['title'],author='История',allowSplitting=True)
doc.addPageTemplates(PageTemplate(id='guide',frames=[Frame(36,43,CW,H-73,id='body',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=footer))
toc_width=(CW-24)/2
doc.addPageTemplates(PageTemplate(id='toc',frames=[Frame(36,43,toc_width,H-73,id='toc-left',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0),Frame(36+toc_width+24,43,toc_width,H-73,id='toc-right',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=footer))
story=[p(data['title'],'GuideTitle'),p('Версия '+data['version']+' · '+data['date'],'GuideRoute'),p(data['intro']),Spacer(1,16),p('Как пользоваться','GuideH1')]
for text in ['Первый запуск: разделы 1-5. Пошаговая работа: 6-19. Игровые системы: 20-26. Настройка и выпуск: 27-33. Справочник и проблемы: 34-38.','Оглавление и закладки PDF кликабельны. Ищите название кнопки через Ctrl+F. Для мелких полей увеличивайте снимок: в PDF сохранены исходные пиксели.','Учебный файл «Приключение в чайной - игровой проект.vnproject» открывается кнопкой «Открыть проект». Набор в собственную историю добавляется через «Сюжет → Игровой мир → Готовые наборы».','Главное различие: авторский проект, тестовая партия и готовая игра хранятся отдельно. Сохраняйте проект и переносимую резервную копию, а не только игровой слот.']:
 story.append(p(text))
story.extend([Spacer(1,16),p('Учебные задания','GuideH1')])
for text in ['Урок 1: открыть готовое приключение и пройти его - раздел4.','Урок 2: собрать свою сцену и две ветки - раздел5.','Урок 3: выдать ключ и открыть им дверь - раздел16.','Урок 4: получить припасы и сварить чай - раздел22.','Урок 5: настроить встречу, победу и поражение - раздел25.']:
 story.append(p(text))
story.extend([NextPageTemplate('toc'),PageBreak()]);story.append(p('Оглавление','GuideH1'));toc=TableOfContents();toc.levelStyles=[styles['GuideTOC']];story.extend([toc,NextPageTemplate('guide'),PageBreak()])
images={};figure_count=0
for sec in data['sections']:
 h=p(sec['title'],'GuideH1');h.guide_key=sec['id'];story.append(h)
 if sec.get('route'):story.append(p(sec['route'],'GuideRoute'))
 for i,text in enumerate(sec.get('steps',[]),1):story.append(p(f'{i}. {text}'))
 if sec.get('table'):
  rows=[[p(cell,'GuideCell') for cell in row] for row in sec['table']]
  table=Table(rows,colWidths=[CW*.30,CW*.70],repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#ebe6f1')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f8f8fa')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#b9abc7'))]));story.append(table)
 if sec.get('note'):story.append(p(sec['note'],'GuideNote'))
 if sec.get('image'):
  name=sec['image'];file=screens/name
  with PILImage.open(file) as img:
   iw,ih=img.size;img.verify()
  images[name]={'width':iw,'height':ih,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
  factor=min(CW/iw,442/ih,1.7);figure_count+=1
  image=Image(str(file),width=iw*factor,height=ih*factor);image.hAlign='CENTER'
  caption=p(f'Снимок {figure_count}. '+sec['caption'],'GuideCaption')
  story.append(KeepTogether([Spacer(1,9),image,caption]))
 story.append(Spacer(1,12))
doc.multiBuild(story)
def he(s):return html.escape(human(s))
toc_html=''.join(f'<li style="list-style:none"><a href="#{s["id"]}">{he(s["title"])}</a></li>' for s in data['sections'])
parts=[]
for s in data['sections']:
 a=f'<section id="{s["id"]}"><h2>{he(s["title"])}</h2>'
 if s.get('route'):a+=f'<p class="route">{he(s["route"])}</p>'
 if s.get('steps'):a+='<ol>'+''.join('<li>'+he(t)+'</li>' for t in s['steps'])+'</ol>'
 if s.get('table'):
  a+='<div class="table-scroll"><table><thead><tr>'+''.join('<th>'+he(c)+'</th>' for c in s['table'][0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+he(c)+'</td>' for c in row)+'</tr>' for row in s['table'][1:])+'</tbody></table></div>'
 if s.get('note'):a+='<p class="note">'+he(s['note'])+'</p>'
 if s.get('image'):
  encoded=base64.b64encode((screens/s['image']).read_bytes()).decode();a+=f'<figure><img loading="lazy" src="data:image/png;base64,{encoded}" alt="{he(s["caption"])}"><figcaption>{he(s["caption"])}</figcaption></figure>'
 a+='<a class="back" href="#contents">К оглавлению ↑</a></section>';parts.append(a)
page='''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>История 0.2.34 - руководство</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f8f8fa;color:#20232c;font:17px/1.6 Arial,sans-serif}main{max-width:1200px;margin:auto;padding:44px 32px;background:white}h1{font-size:36px;line-height:1.2;margin:0 0 20px}h2{font-size:27px;line-height:1.3;margin:0 0 18px;color:#442160}a{color:#653391;text-underline-offset:3px}section{border-top:1px solid #ddd7e3;margin-top:44px;padding-top:32px;scroll-margin-top:20px}.route{font-weight:bold;color:#5c397a}li{padding-left:3px;margin:0 0 13px}nav ol{columns:2;column-gap:48px}nav li{break-inside:avoid;font-size:16px;margin:0 0 8px}.note{background:#f0edf5;padding:16px 20px}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:20px 0;font-size:16px}td,th{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid #dedee5}th{background:#ebe6f1}td:first-child{width:30%;font-weight:bold}figure{margin:26px 0}figure img{display:block;max-width:100%;max-height:900px;width:auto;height:auto;margin:auto;border:1px solid #ddd}figcaption{font-size:14px;color:#515561;margin-top:12px}.back{font-size:14px}.version{color:#64616e}kbd{font:inherit}a:focus-visible{outline:3px solid #9254c0;outline-offset:4px}::selection{background:#dfcaef} @media(max-width:700px){main{padding:24px 18px}nav ol{columns:1}h1{font-size:30px}h2{font-size:23px}table{font-size:14px}}@media print{main{max-width:none;padding:0}.back{display:none}section{break-before:page}figure{break-inside:avoid}}
</style></head><body><main>'''+f'<h1>{he(data["title"])}</h1><p class="version">Версия {data["version"]} · {data["date"]}</p><p>{he(data["intro"])}</p><p>Поиск: Ctrl+F. Снимки встроены в файл, интернет для чтения не нужен. Увеличение страницы: Ctrl+плюс / Ctrl+колесо.</p><nav id="contents"><h2>Оглавление</h2><ol>{toc_html}</ol></nav>'+''.join(parts)+'</main></body></html>'
(out/'Istoriya-0.2.34-guide.html').write_text(page,encoding='utf-8')
reader=PdfReader(str(pdf));text='\n'.join(pg.extract_text() or '' for pg in reader.pages)
assert len(reader.pages)>10 and all(s['title'].split('. ',1)[-1] in text for s in data['sections'])
assert all((pg.extract_text() or '').strip() for pg in reader.pages),'Empty PDF page'
manifest={'version':data['version'],'sections':len(data['sections']),'figures':figure_count,'distinctScreenshots':len(images),'pages':len(reader.pages),'characters':len(text),'embeddedHtmlImages':page.count('data:image/png;base64,'),'images':images,'pdfSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'htmlSha256':hashlib.sha256((out/'Istoriya-0.2.34-guide.html').read_bytes()).hexdigest(),'textExtractionPassed':True}
(out/'guide-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in manifest.items() if k!='images'},ensure_ascii=False))
