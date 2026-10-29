#!/usr/bin/env python3
"""Sube el número de versión en index.html para que los navegadores carguen los archivos nuevos.
Uso: python3 publicar.py   (antes de cada commit que cambie js/ o css/)"""
import re, datetime, pathlib
p = pathlib.Path(__file__).with_name('index.html')
v = datetime.datetime.now().strftime('%Y%m%d-%H%M')
p.write_text(re.sub(r'\?v=[0-9-]+', f'?v={v}', p.read_text()))
print('versión', v)
