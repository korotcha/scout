"""One-time, read-only extraction of the user's supplied summary, not a rebuild."""
import json
import math
from pathlib import Path
import openpyxl

source = Path('/workspace/scratch/d1a4c3330353/upload/РОСТ в ОКТЯБРЕ - Выгрузка для поиска - НОЯБРЬ (выгрузка 01.11).xlsx')
book = openpyxl.load_workbook(source, read_only=True, data_only=True)
rows = []
def number(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None
for r in book['Свод'].iter_rows(min_row=2, values_only=True):
    if len(r) < 9 or not r[1] or not r[2]:
        continue
    rows.append({ 'query': str(r[1]), 'subject': str(r[2]), 'frequency': number(r[3]),
        'yoyDemand': number(r[4]), 'perArticle': number(r[5]), 'yoyPressure': number(r[6]),
        'articles': number(r[7]), 'mom': number(r[8]) })
destination = Path(__file__).resolve().parents[1] / 'public' / 'source-summary.json'
destination.write_text(json.dumps({'period': '2025-10', 'comparisonPeriod': '2024-10',
    'source': source.name, 'rows': rows}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Extracted {len(rows)} real summary rows; {destination.stat().st_size} bytes.')
