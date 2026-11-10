# S33 - Hexa: monta index.html dai sorgenti (uso: python3 src/build.py, dalla cartella della versione)
import os
d = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(d, 'shell.html'), encoding='utf-8').read(); w = open(os.path.join(d, 'worklet.js'), encoding='utf-8').read()
alg = w[w.index('const ALG = ['):w.index('const PMS')]
s = s.replace('/*@@WORKLET*/', w).replace('/*@@PATCHES*/', alg + open(os.path.join(d, 'patches.js'), encoding='utf-8').read()).replace('/*@@APP*/', open(os.path.join(d, 'app.js'), encoding='utf-8').read())
open(os.path.join(d, '..', 'index.html'), 'w', encoding='utf-8').write(s); print('ok', len(s))
