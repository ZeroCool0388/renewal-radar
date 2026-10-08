"""Generate a text-based, dated synthetic sample for exercising upload parsing."""
from pathlib import Path
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from xml.sax.saxutils import escape
text=Path('data/contracts/03-helix-pharma-sow.md').read_text()
# A PDF upload is deliberately an ordinary fixed-date document, not a rolling seed.
text=text.replace('{{Q1:03-12}}','2027-03-12').replace('{{Q1START:03-12:12}}','2026-03-12')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='ContractBody',fontName='Helvetica',fontSize=10,leading=15,textColor=colors.HexColor('#334155'),spaceAfter=9))
styles['Heading1'].textColor=colors.HexColor('#0f172a')
styles['Heading2'].textColor=colors.HexColor('#00858a')
styles['Heading2'].spaceBefore=15
story=[]
for para in re.split(r'\n\s*\n',text):
 if para.startswith('# '):story.append(Paragraph(escape(para[2:].replace('—','-')),styles['Heading1']))
 elif para.startswith('## '):story.append(Paragraph(escape(para[3:]),styles['Heading2']))
 else:story.append(Paragraph(escape(para.replace('—','-')).replace('\n','<br/>'),styles['ContractBody']))
def footer(canvas,doc):
 canvas.saveState();canvas.setStrokeColor(colors.HexColor('#e2e8f0'));canvas.line(45,38,A4[0]-45,38);canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#64748b'));canvas.drawString(45,25,'SYNTHETIC DEMO DATA. Fictional company. Not real.');canvas.drawRightString(A4[0]-45,25,str(doc.page));canvas.restoreState()
SimpleDocTemplate('data/contracts/03-helix-pharma-sow.pdf',pagesize=A4,rightMargin=45,leftMargin=45,topMargin=45,bottomMargin=55,title='Helix Pharma - Synthetic Statement of Work',author='Renewal Radar').build(story,onFirstPage=footer,onLaterPages=footer)
