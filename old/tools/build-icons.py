# Rebuilds assets/icons.json from the official icon sources.
#
#   python3 tools/build-icons.py <azure-pack-dir> <drawio-img-lib-dir> assets/icons.json
#
# <azure-pack-dir>: the extracted npm package @squinch/pack-azure (has pack.json and icons/),
#   a verbatim copy of Microsoft Azure Architecture Icons V24.
# <drawio-img-lib-dir>: src/main/webapp/img/lib from https://github.com/jgraph/drawio
#   (azure2/power_platform, azure2/identity and dynamics365 are used).

import json, re, os, sys
sq, dio, out = sys.argv[1], sys.argv[2], sys.argv[3]
def clean(s):
    s = re.sub(r'<\?xml[^>]*\?>', '', s)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'<!DOCTYPE[^>]*>', '', s)
    s = re.sub(r'<metadata.*?</metadata>', '', s, flags=re.S)
    s = re.sub(r'<sodipodi:namedview[^>]*?(/>|>.*?</sodipodi:namedview>)', '', s, flags=re.S)
    s = re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"', '', s)
    s = re.sub(r'\sxmlns:(inkscape|sodipodi|svg|rdf|cc|dc)="[^"]*"', '', s)
    s = re.sub(r'>\s+<', '><', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if 'xmlns="http://www.w3.org/2000/svg"' not in s:
        s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return s
pack = json.load(open(os.path.join(sq, 'pack.json')))
azure = []
for k, v in pack['icons'].items():
    p = os.path.join(sq, 'icons', v['file'])
    if not os.path.exists(p): continue
    azure.append({'id': k, 't': v['title'], 'c': v.get('category') or 'Other', 's': clean(open(p, encoding='utf-8').read())})
def title(fn):
    n = {'Dynamics365':'Dynamics_365','AIBuilder':'AI_Builder','MRPortal':'MR_Portal','SCMWarehousing':'SCM_Warehousing'}.get(fn[:-4], fn[:-4]).replace('_', ' ')
    n = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', n)
    return n.replace('A I Builder','AI Builder').replace('Power B I','Power BI').replace('Power Fx','Power Fx').replace('S C M','SCM').replace('M R','MR')
def slug(t): return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')
def folder(path, cat):
    res = []
    for fn in sorted(os.listdir(path)):
        if fn.endswith('.svg'):
            t = title(fn)
            res.append({'id': slug(t), 't': t, 'c': cat, 's': clean(open(os.path.join(path, fn), encoding='utf-8').read())})
    return res
azure.insert(0, {'id':'entra-id','t':'Microsoft Entra ID','c':'Identity','s':clean(open(os.path.join(dio,'azure2/identity/Azure_Active_Directory.svg'),encoding='utf-8').read())})
azure.sort(key=lambda i:(i['c'],i['t'].lower()))
pp = folder(os.path.join(dio, 'azure2/power_platform'), 'Power Platform')
d365 = folder(os.path.join(dio, 'dynamics365'), 'Dynamics 365')
data = {'packs': [
  {'id': 'pp', 'title': 'Power Platform', 'icons': pp},
  {'id': 'd365', 'title': 'Dynamics 365', 'icons': d365},
  {'id': 'azure', 'title': 'Azure', 'release': pack.get('release'), 'icons': azure},
], 'terms': 'Microsoft icons. Microsoft permits use in architectural diagrams, training materials, or documentation.'}
json.dump(data, open(out, 'w'), separators=(',', ':'))
print(len(azure), len(pp), len(d365), os.path.getsize(out))
print(sorted(set(i['c'] for i in azure)))
print([i['id'] for i in pp])
