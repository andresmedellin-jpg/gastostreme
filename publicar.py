#!/usr/bin/env python3
"""Sube el número de versión en index.html para que los navegadores carguen los archivos nuevos.
Uso: python3 publicar.py   (antes de cada commit que cambie js/ o css/)"""
import re, datetime, pathlib
p = pathlib.Path(__file__).with_name('index.html')
s = p.read_text()
v = datetime.datetime.now().strftime('%Y%m%d-%H%M')
s = re.sub(r'\?v=[0-9-]+', f'?v={v}', s)
p.write_text(s)
print('versión', v)

# Operia: una carpeta por cliente (app.medco.mx/<cliente>/) con la misma app, su archivo clientes/<cliente>.js
# y sin modo demo. Se generan a partir de index.html; no se editan a mano.
raiz = p.parent
for c in sorted((raiz / 'clientes').glob('*.js')):
    cid = c.stem
    h = s.replace('<head>', '<head>\n  <base href="/">', 1)
    h = h.replace('<title>Administración</title>', '<title>Operia</title>', 1)
    i = h.index('  <script>\n    // Con ?demo')
    j = h.index('</body>')
    h = h[:i] + f"""  <script src="clientes/{cid}.js?v={v}"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
  <script type="module">
    // Cliente de Operia: si su base todavía no está lista, se avisa en lugar de abrir la app
    if (window.__CLIENTE && window.__CLIENTE.supabaseUrl) import('./js/app.js?v={v}');
    else document.body.innerHTML = '<div style="font-family:Arial,sans-serif;max-width:420px;margin:18vh auto;padding:24px;text-align:center"><h2 style="margin:0 0 8px">' + (window.__CLIENTE ? window.__CLIENTE.nombre : 'Operia') + '</h2><p style="color:#555">Tu plataforma está en preparación. Pronto podrás entrar aquí.</p></div>';
  </script>
""" + h[j:]
    (raiz / cid).mkdir(exist_ok=True)
    h = h.replace('<!doctype html>', '<!doctype html>\n<!-- Generado por publicar.py a partir de index.html: no editar -->', 1)
    (raiz / cid / 'index.html').write_text(h)
    print('cliente', cid)
