from pathlib import Path
root=Path(__file__).resolve().parents[1]
for p in root.glob('*.html'):
    if p.name=='index.html':continue
    source=p.read_text(encoding='utf-8')
    if 'src="dev-guard.js"' not in source:
        marker='<script src="dev-guard.js"></script>\n'
        if '<meta charset="utf-8">' in source:source=source.replace('<meta charset="utf-8">','<meta charset="utf-8">'+marker,1)
        else:source=marker+source
        p.write_text(source,encoding='utf-8')
p=root/'_headers';source=p.read_text(encoding='utf-8');source=source.replace("connect-src 'self' https://dfwnzfznhnkcqrdcydnx.supabase.co", "connect-src 'self'")
p.write_text(source,encoding='utf-8')
print('Guardas de desarrollo instaladas; CSP impide conexiones a Supabase operativo.')
