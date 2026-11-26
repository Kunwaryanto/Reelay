"""Mocks for the browser tests: a fake Supabase (REST, RPC, auth, functions) and TMDB pictures, served to the
built app by Playwright. Grown during development (see docs/testing.md); the tests in this folder import it.

`new()` opens a signed-in phone-sized page with the base mocks; `hroute` adds Home's data, `lbroute` Letterboxd.
`B` is where the built app is served (vite preview, port 4317). Page errors are collected in `errs`.
"""
import json, sys, base64, time, re, hashlib, datetime
from playwright.sync_api import sync_playwright
import os as _os
B=_os.environ.get('REELAY_URL', 'http://localhost:4317')
def jwt():
    h=base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b'=').decode()
    p=base64.urlsafe_b64encode(json.dumps({"sub":"u1","exp":int(time.time())+86400,"email":"lukas@example.com","role":"authenticated"}).encode()).rstrip(b'=').decode()
    return f'{h}.{p}.sig'
SESSION={"access_token":jwt(),"token_type":"bearer","expires_in":86400,"expires_at":int(time.time())+86400,"refresh_token":"r","user":{"id":"u1","email":"lukas@example.com","aud":"authenticated","role":"authenticated","app_metadata":{},"user_metadata":{},"created_at":"2026-01-01T00:00:00Z"}}
NAMES=['Black Doves','The Sinner','John Wick: Chapter 4','The Gilded Age','North of North','Paranoid','Titanic','Fargo','Maigret','A Very Long Title That Should Truncate Nicely','Tár','Amélie']
SV=['netflix','viaplay','hbo-max','svt-play','skyshowtime','disney-plus','prime-video','apple-tv']
def card(i,leave=None): return {"id":i,"kind":"film" if i%3==0 else "series","title":NAMES[i%len(NAMES)],"year":1995+i,"poster_path":f"/p{i}.jpg","backdrop_path":f"/b{i}.jpg","logo_path":None if i%2 else f"/l{i}.png","genres":["Crime","Drama"],"seasons":(i%9)+1 if i%3 else None,"runtime_min":80+i*7%90 if i%3==0 else None,"availability":[{"service_id":SV[i%len(SV)],"leaves_on":leave}]}
def svg(seed,w,h,label=''):
    c=int(hashlib.md5(seed.encode()).hexdigest()[:6],16); a=f'#{c:06x}'; b=f'#{(c*7)%0xffffff:06x}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="#fff" font-size="{h//8}" text-anchor="middle" font-family="sans-serif">{label}</text></svg>'
MODE={'wl':'list','ids':[3,4,5,6,7,8,9]}
def inv(i,c,e,email=None,joined=None): return {"id":i,"token":"tok"+i,"created_by":"u1","make_admin":False,"created_at":c+"T12:00:00Z","expires_at":e+"T12:00:00Z","used_by":None,"used_email":email,"used_at":joined and joined+"T12:00:00Z","joined_at":joined and joined+"T12:00:00Z"}
INV=[inv('a','2026-11-18','2026-12-02'),inv('b','2026-11-10','2026-11-24','anna.berg@example.com','2026-11-11'),inv('c','2026-11-01','2026-11-15')]
def _alike(r):
    # each title its own list (twelve others), as in the real table, so two titles' lists aren't one request
    me = int(json.loads(r.request.post_data or '{}').get('p_id', 0))
    if me == 1: return list(range(3, 15))   # title 1 (the More like this tests): the list as it always was
    pool = [i for i in range(3, 16) if i != me]
    k = me % len(pool)
    return (pool[k:] + pool[:k])[:12]

def route(r):
    u=r.request.url
    if 'image.tmdb.org' in u:
        logo='/l' in u.split('/t/p/')[1]
        return r.fulfill(content_type='image/svg+xml', body=svg(u.split('/')[-1],500,180,'LOGO') if logo else svg(u.split('/')[-1],400,600))
    if '/rest/v1/rpc/onboarding_wall' in u:
        b=r.request.post_data_json; sv=b['p_services']; n=b['p_rows']*b['p_cols']
        MODE['wall_asked']=b
        return r.fulfill(json=[{"pos":i,"title_id":2000+i,"service_id":sv[i%len(sv)]} for i in range(n)])
    # Browse (migration 20261126000600): a category page, a whole row, the cards' pictures, one request each
    if '/rest/v1/rpc/browse_covers' in u:
        b=r.request.post_data_json; MODE.setdefault('browse_asked',[]).append(('covers',b))
        # as in the real one, the categories share their most popular titles; a country has two, Leaving soon three, all among the most popular
        pool=lambda k, c: [3000, 2900+k] if 'country' in c['rule'] else [3000, 3001, 3002] if 'leaving' in c['rule'] else range(3000, 3060)
        return r.fulfill(json={c['id']:[{"id":i,"path":f"/b{i}.jpg"} for i in pool(k, c)] for k,c in enumerate(b['p_cats'])})
    if '/rest/v1/rpc/browse_page' in u:
        b=r.request.post_data_json; MODE.setdefault('browse_asked',[]).append(('page',b))
        kind=b.get('p_kind'); k0=len(MODE['browse_asked'])*100
        def fit(i): c=card(i); return c if not kind or c['kind']==kind else None
        cards=[c for c in (fit(i) for i in range(4000+k0, 4400+k0)) if c]
        reasons=['Because you liked Past Lives','Adam rated it 4.5','Critics’ favourite · RT 96%','Best Picture · Oscar 2024']
        picks=[{**c,"hero_path":None,"hero_poster":False,"reason":reasons[j],"via":None,"by":["Celine Song"]} for j,c in enumerate(cards[:4])]
        rows=[{"id":rid,"items":cards[10+j*16:10+j*16+(16 if rid!='elsewhere' else 8)]} for j,rid in enumerate(b['p_rows'])]
        if MODE.get('browse_empty'): picks=[]; rows=[]; cards=[]
        return r.fulfill(json={"hero":[{**c,"logo_path":f"/l{c['id']}.png"} for c in cards[:3]],"picks":picks,"rows":rows})
    if '/rest/v1/rpc/browse_list' in u:
        b=r.request.post_data_json; MODE.setdefault('browse_asked',[]).append(('list',b))
        kind=b.get('p_kind')
        cards=[c for c in (card(i) for i in range(5000, 5300)) if not kind or c['kind']==kind][:b.get('p_limit',90)]
        return r.fulfill(json=[{**c,"original_language":"en","scores":{"imdb_rating":7.1,"rt_critics":88,"letterboxd":3.6}} for c in cards])
    if '/rest/v1/rpc/start_wall' in u: return r.fulfill(json=[f'/w{i}.jpg' for i in range(40)])
    if '/rest/v1/profiles' in u:
        if r.request.method!='GET': MODE.setdefault('patched',[]).append(r.request.post_data_json)
        return r.fulfill(json={"user_id":"u1","is_admin":True,"notify_leaving":True,"notify_arrivals":True,"notify_new_seasons":False,"onboarded_at":"2026-11-20T10:00:00Z","hidden_tags":MODE.get('hidden',[])} if r.request.method=='GET' else None, status=200 if r.request.method=='GET' else 204)
    if '/rest/v1/watchlist' in u:
        if r.request.method=='POST':
            d=json.loads(r.request.post_data); d=d if isinstance(d,list) else [d]
            if MODE.get('fresh'): MODE['ids']=[]; MODE['fresh']=False
            MODE['ids']+= [x['title_id'] for x in d]; MODE['wl']='list'
        if r.request.method!='GET': return r.fulfill(status=201, json=None)
        if MODE['wl']=='empty': return r.fulfill(json=[])
        if 'titles(' in u.replace('%28','(').replace('%3A',':'):
            out=[]
            for k,i in enumerate(MODE['ids']):
                t=card(i, "2026-11-23" if k==1 else ("2026-12-20" if k==2 else None)); t['scores']={"imdb_rating":6+k*0.3}
                if k>=5: t['availability']=[]
                out.append({"notify":k==6,"added_at":"2026-11-%02dT10:00:00Z"%(19-k),"title":t})
            return r.fulfill(json=out)
        return r.fulfill(json=[{"title_id":i,"notify":i==9} for i in MODE['ids']])
    if '/rest/v1/user_services' in u:
        if r.request.method=='POST': MODE.setdefault('svc',[]).append(json.loads(r.request.post_data)['service_id']); return r.fulfill(status=201,json=None)
        if r.request.method=='DELETE': return r.fulfill(status=204,body='')
        return r.fulfill(json=[{"service_id":x} for x in MODE.get('svc',[])])
    if '/rest/v1/people' in u:
        if 'id=eq.' in u:
            cr=[{"role":"cast","character":"Bertha Russell","title":card(i)} for i in range(3,12)]+[{"role":"director","character":None,"title":card(i)} for i in range(20,23)]
            return r.fulfill(json={"id":7,"name":"Carrie Coon","profile_path":None,"known_for":"Acting","credits":cr})
        if 'zzz' in u: return r.fulfill(json=[])
        return r.fulfill(json=[{"id":7,"name":"Carrie Coon","profile_path":None,"known_for":"Acting"},{"id":8,"name":"Bill Pullman","profile_path":"/c8.jpg","known_for":"Acting"}])
    if '/rest/v1/services' in u: return r.fulfill(json=[{"id":k,"name":n,"kind":"free" if k in('svt-play','pluto-tv') else "subscription","popular":i<9} for i,(k,n) in enumerate([('netflix','Netflix'),('hbo-max','HBO Max'),('svt-play','SVT Play'),('viaplay','Viaplay'),('disney-plus','Disney+'),('prime-video','Prime Video'),('apple-tv','Apple TV'),('skyshowtime','SkyShowtime'),('tv4-play','TV4 Play'),('mubi','MUBI'),('crunchyroll','Crunchyroll'),('curiosity','Curiosity Stream'),('pluto-tv','Pluto TV')])])
    if '/rest/v1/rpc/create_invite' in u:
        INV.insert(0,inv('new','2026-11-20','2026-12-04')); return r.fulfill(json=INV[0])
    if '/rest/v1/rpc/cancel_invite' in u:
        INV[:]=[x for x in INV if x['id']!=json.loads(r.request.post_data)['invite_id']]; return r.fulfill(status=204, body='')
    if '/rest/v1/rpc/restore_invite' in u: return r.fulfill(status=204, body='')
    if '/rest/v1/invites' in u: return r.fulfill(json=INV)
    if '/rest/v1/availability' in u: return r.fulfill(json=[{"leaves_on":"2026-11-21","title":card(20+i,"2026-11-%02d"%(21+i*3))} for i in range(6)])
    if '/rest/v1/rpc/similar_titles' in u: return r.fulfill(json=[{"id":i,"pos":k+1} for k,i in enumerate(MODE.get('similar',_alike(r)))])
    from urllib.parse import unquote
    _ids = re.search(r'[?&]id=in\.\(([\d,]+)\)', unquote(u)) if '/rest/v1/titles' in u and 'original_language' not in u else None
    if _ids: return r.fulfill(json=[card(int(x)) for x in _ids.group(1).split(',')][::-1])  # any order: the app puts them back in the list's
    # everything else on TMDB: a search answer, and saving one returns its new id
    if 'functions/v1/tmdb' in u:
        b=json.loads(r.request.post_data or '{}')
        if b.get('add'): return r.fulfill(json={'id': 777})
        if 'tmdb' in MODE: return r.fulfill(json={'results': MODE['tmdb']})
        return r.fulfill(json={'results':[{'kind':'film','tmdb_id':62,'title':'2001: A Space Odyssey','year':1968,'poster_path':'/p62.jpg'}] if '2001' in b.get('q','') else []})
    if '/rest/v1/rpc/search_titles' in u:
        q=json.loads(r.request.post_data)['q'].lower()
        hits=[i for i in range(3,40) if q in NAMES[i%len(NAMES)].lower()] or ([] if 'zzz' in q else [])
        return r.fulfill(json=[{"id":i} for i in hits])
    if '/rest/v1/rpc/title_totals' in u:
        # how many fit, films and series apart: the same pool the list pages through
        MODE['totals_asked']=MODE.get('totals_asked',0)+1
        pool=[card(i) for i in range(41,41+MODE.get('pool',14)) if i%5]
        return r.fulfill(json=[{"kind":k,"n":sum(1 for t in pool if t['kind']==k)} for k in ('film','series')])
    # search by filters, and Explore (Browse lists made of filters: ordered by popularity then id, in pages)
    if '/rest/v1/titles' in u and ('original_language' in u or r.request.method=='HEAD' or 'id.asc' in u) and '?id=eq.' not in u and '&id=eq.' not in u:
        from urllib.parse import unquote
        uu=unquote(u)
        def hit(i):
            t=card(i); t['scores']={"imdb_rating":round(5+(i*7%40)/10,1)}; t['original_language']='en'
            if i%5==0: t['availability']=[]
            return t
        m=re.search(r'id=in\.\(([\d,]+)\)',uu)
        if m: return r.fulfill(json=[hit(int(x)) for x in m.group(1).split(',')][::-1])
        # a list made by filters: MODE['pool'] titles in popularity order (14 unless a test asks for more), in pages
        pool=[hit(i) for i in range(41,41+MODE.get('pool',14)) if i%5]
        if 'kind=eq.film' in uu: pool=[t for t in pool if t['kind']=='film']
        if 'kind=eq.series' in uu: pool=[t for t in pool if t['kind']=='series']
        if r.request.method=='HEAD': return r.fulfill(status=200, headers={'content-range':f'*/{len(pool)}','access-control-expose-headers':'content-range','access-control-allow-origin':'*'}, body='')
        n=int(re.search(r'limit=(\d+)',uu).group(1)); o=int((re.search(r'offset=(\d+)',uu) or [0,0])[1])
        return r.fulfill(json=pool[o:o+n])
    if '/rest/v1/titles' in u:
        if 'id=eq.' in u:
            t=card(1); t.update({"original_title":"The Sinner","end_year":2021,"runtime_min":45,"overview":"Detective Harry Ambrose takes on a new case each season, digging into why ordinary people commit shocking crimes. The first season follows a young mother who stabs a stranger on a crowded beach, and has no idea why she did it.","original_language":"en","genres":["Crime","Mystery"],
              "availability":[{"service_id":"viaplay","type":"subscription","leaves_on":"2026-12-31","link":"https://viaplay.com/film/old-style","service":{"name":"Viaplay","kind":"subscription"}},{"service_id":"netflix","type":"subscription","leaves_on":None,"link":None,"service":{"name":"Netflix","kind":"subscription"}}],
              "scores":{"imdb_rating":7.8,"rt_critics":92,"letterboxd":None},
              "credits":[{"role":"cast","character":"Harry Ambrose","sort_order":i,"person":{"id":i,"name":n,"profile_path":None if i%2 else f"/c{i}.jpg"}} for i,n in enumerate(['Bill Pullman','Jessica Biel','Christopher Abbott','Carrie Coon','Matt Bomer'])]+[{"role":"creator","character":None,"sort_order":0,"person":{"id":99,"name":"Derek Simonds","profile_path":None}}],
              "awards":MODE.get('awards',[{"id":1,"award":"Emmys","year":2018,"short_category":"Lead Actress","won":False,"person_name":"Jessica Biel","rank":2}])})
            return r.fulfill(json=t)
        n=5 if 'logo_path' in u.split('select=')[1].split('&')[0] else 12
        if 'limit=15' in u:
            off=100+(40 if 'film' in u else 0)+(20 if 'year=lte' in u else 0)
            return r.fulfill(json=[card(off+i) for i in range(15)])
        return r.fulfill(json=[card(i+(3 if n==12 else 0)) for i in range(n)])
    if '/auth/v1/verify' in u: return r.fulfill(json=SESSION)
    if '/auth/v1/' in u: return r.fulfill(json={})
    return r.fulfill(status=404, json={})
def watch_quiet(pg):
    """Gives the page `settle(cap)`: wait until it is quiet (no request open for 250 ms, no short animation running),
    at most `cap` ms. Used instead of a fixed wait after opening a page, so a fast run doesn't sleep and a slow one
    (tests in parallel) doesn't give up too soon."""
    import time
    st = {'open': 0, 'last': time.monotonic()}
    def up(_): st['open'] += 1; st['last'] = time.monotonic()
    def down(_): st['open'] = max(0, st['open'] - 1); st['last'] = time.monotonic()
    pg.on('request', up); pg.on('requestfinished', down); pg.on('requestfailed', down)
    def settle(cap=4000):
        end = time.monotonic() + cap / 1000
        pg.wait_for_timeout(100)
        while time.monotonic() < end:
            if st['open'] == 0 and time.monotonic() - st['last'] >= 0.25 and not pg.evaluate(
                "document.getAnimations().some(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime < 3000)"):
                return
            pg.wait_for_timeout(50)
    pg.settle = settle

p=sync_playwright().start()
if True:
    # the system Chrome where there is one (this sandbox), Playwright's own Chromium otherwise (CI)
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome') if _os.path.exists('/usr/bin/google-chrome') else p.chromium.launch()
    def ctx(signed):
        c=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,service_workers='block',**({'timezone_id':MODE['tz']} if MODE.get('tz') else {}))
        c.route(re.compile(r'https://(mock\.supabase\.co|image\.tmdb\.org)/.*'),route)
        if signed: c.add_init_script(f"localStorage.setItem('sb-mock-auth-token',{json.dumps(json.dumps(SESSION))})")
        pg=c.new_page(); pg.on('pageerror',lambda e: print('pageerror',str(e)[:300]))
        watch_quiet(pg)
        return pg


# ---- Letterboxd -----------------------------------------------------------------------------------------
import sys,re,json
ST={'acct':None,'case':'many'}
ACC={"username":"lukask","display_name":"Lukas K","mark_watched":True,"synced_at":"2026-11-22T02:17:00Z","sync_error":None,"films":412}
def L(me,name,user,eid,d,r,rw=False): return {"me":me,"name":name,"username":user,"entry_id":eid,"watched_on":d,"rating":r,"rewatch":rw}
MINE2=[L(True,'Lukas K','lukask','w9','2025-03-12',4,True),L(True,'Lukas K','lukask','w1','2023-04-02',3.5)]
FR=[L(False,'Anna Berg','anna','a1','2026-11-19',4.5),L(False,'Erik','erik','e2','2024-02-10',3,True),L(False,'Erik','erik','e1','2023-05-01',3.5),L(False,'Maja','maja','m1','2024-01-05',None),L(False,'Jonas','jonas','j1','2023-11-02',4),L(False,'Sara','sara','s1','2023-08-12',3.5),L(False,'Oskar','oskar','o1','2023-04-20',2),L(False,'Linnea','linnea','l1','2023-03-03',5)]
CASES={'many':MINE2+FR,'one':MINE2[:1]+FR[:1],'friends':FR[:4],'twice':MINE2,'once':MINE2[:1],'nobody':[]}
def lbroute(r):
    u=r.request.url
    if 'rpc/letterboxd_me' in u: return r.fulfill(json=[ST['acct']] if ST['acct'] else [])
    # the whole list in one answer (letterboxd_watched_ids); 'lots' is more films than the API's 1,000-row cap
    if 'rpc/letterboxd_watched' in u: return r.fulfill(json=(list(range(1, 1201)) if ST.get('lots') else [3,6,9,12,45,48]) if ST['acct'] else [])
    if 'rpc/letterboxd_for_title' in u: return r.fulfill(json=CASES[ST['case']])
    if 'functions/v1/letterboxd' in u:
        if r.request.method=='OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'})
        name=json.loads(r.request.post_data or '{}').get('username','')
        if name=='nobody': return r.fulfill(status=404,json={'error':'not_found'},headers={'access-control-allow-origin':'*'})
        ST['acct']=dict(ACC,username=name); return r.fulfill(json={'status':'connected','films':412},headers={'access-control-allow-origin':'*'})
    if 'letterboxd_accounts' in u:
        if r.request.method=='DELETE': ST['acct']=None
        if r.request.method=='PATCH': ST['acct']['mark_watched']=json.loads(r.request.post_data)['mark_watched']
        return r.fulfill(status=204,body='',headers={'access-control-allow-origin':'*'})
    return r.fallback()
def film_title(r):
    r.fallback() if 'id=eq.' not in r.request.url else None
errs=[]
def new():
    pg=ctx(True); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'.*(rpc/letterboxd|functions/v1/letterboxd|letterboxd_accounts).*'), lbroute)
    # the title page: a film with all four scores
    def tt(r):
        u=r.request.url
        if '/rest/v1/titles' in u and 'id=eq.' in u and 'overview' in u:
            return r.fulfill(json=title_detail())
        return r.fallback()
    pg.route(re.compile(r'.*/rest/v1/titles.*'), tt)
    return pg
def title_detail():
            t=card(3); t.update({"tmdb_id":603692,"kind":"film","title":"John Wick: Chapter 4","year":2023,"original_title":None,"title_en":MODE.get("title_en"),"hero_path":MODE.get("hero",[None,False])[0],"hero_poster":MODE.get("hero",[None,False])[1],"end_year":None,"runtime_min":170,"seasons":None,"overview":"With the price on his head ever increasing, John Wick uncovers a path to defeating the High Table.","genres":["Action","Thriller"],"original_language":"en",
              "availability":[{"service_id":"viaplay","type":"subscription","leaves_on":None,"link":None,"service":{"name":"Viaplay","kind":"subscription"}}],
              "scores":{"imdb_rating":7.6,"rt_critics":94,"rt_audience":89,"letterboxd":3.9},"credits":[{"role":"director","character":None,"sort_order":0,"person":{"id":1,"name":"Chad Stahelski","profile_path":None}}],"awards":MODE.get('awards',[])})
            return t
def top(pg): return "(()=>{const ms=[...document.querySelectorAll('main.page')].filter(m=>m.offsetParent&&!m.closest('[inert]'));return ms[ms.length-1]})()"
which=sys.argv_real if hasattr(sys,'argv_real') else None


# ---- Home ---------------------------------------------------------------------------------------------------
import os, sys, re, json
from urllib.parse import unquote
ST['acct']=dict(ACC, username='kunwaryanto', hide_watched=True, mark_watched=False, imported_at=None, imported_films=None)
MODE['svc']=['netflix','hbo-max','viaplay']
CASE={'personal':True}
seenq=[]
def with_facts(v):
    """Home's cards as home_card gives them since 20261126000900 (with the long-press menu's facts), when a test asks."""
    if not MODE.get('facts'): return v
    if isinstance(v, list): [with_facts(x) for x in v]
    elif isinstance(v, dict):
        if isinstance(v.get('id'), int) and 'availability' in v: v.setdefault('by_names', ['Chad Stahelski']); v.setdefault('rt', 90); v.setdefault('lb', 3.8); v.setdefault('end_year', None)
        else: [with_facts(x) for x in v.values()]
    return v
def mock_ask(path, body=None):
    """What the mocks answer for one request (the letterboxd ones, Home's, then the rest), as a list."""
    got={}
    class Req:
        url='https://mock.supabase.co/rest/v1/'+path; method='POST' if body is not None else 'GET'
        post_data=json.dumps(body) if body is not None else None; post_data_json=body; headers={}
    class R:
        request=Req()
        def fulfill(self, json=None, status=200, **k): got['v']=json if status<400 else []
        def fallback(self):
            n=got.get('n',0); got['n']=n+1
            [hroute2, route, lambda _: got.__setitem__('v', [])][min(n,2)](self)
    lbroute(R())
    v=got.get('v') or []
    return v if isinstance(v,list) else [v]
def hroute(r):
    try: return hroute2(r)
    except Exception as e: print('  MOCK ERROR', repr(e), unquote(r.request.url).split('/rest/v1/')[-1][:260]); return r.fulfill(json=[])
def hroute2(r):
    u=unquote(r.request.url); seenq.append(u.split('/rest/v1/')[-1][:90])
    if '/availability_events' in u and 'title_id=in.' in u: return r.fulfill(json=[{"title_id":500+i,"service_id":"netflix","happened_on":(datetime.date.today()-datetime.timedelta(days=2+i*10)).isoformat()} for i in range(4)] if MODE.get('news',True) else [])
    if 'availability_events' in u: return r.fulfill(json=[{"happened_on":"2026-11-%02d"%(22-i//3),"service_id":['netflix','hbo-max','viaplay'][i%3],"title":dict(card(200+i),popularity=100-i)} for i in range(12)])
    if '/rest/v1/credits' in u and 'title_id=in.' in u:
        ids=[int(x) for x in re.search(r'title_id=in\.\(([^)]*)\)',u).group(1).split(',') if x]
        # by its place in the request: one person, two (joined with "and") or three (the first "and 2 others"), for the spotlight's credit line
        def who(i): return [["Celine Song"],["Vince Gilligan"],["Daniel Kwan","Daniel Scheinert"],["Matt Duffer","Ross Duffer","Shawn Levy"]][i%4]
        return r.fulfill(json=[{"title_id":i,"role":"director" if card(i)['kind']=='film' else "creator","person":{"name":n}} for k,i in enumerate(ids) for n in who(k)])
    # Home in two requests (migration 20261126000700): answered from the separate lookups' own mocks above and below,
    # so every case those tests set up still holds
    # the member's things at launch in one request (migration 20261126000900): only when a test asks for it, else
    # 404 (an older database), so every test that mocks those lookups one by one still holds
    if 'rpc/me_bundle' in u:
        if not MODE.get('me_bundle'): return r.fulfill(status=404, json={})
        MODE['me_asked']=MODE.get('me_asked',0)+1
        one=lambda v: (v[0] if v else None)
        return r.fulfill(json={'profile':one(mock_ask('profiles?select=*')),'services':[x['service_id'] for x in mock_ask('user_services?select=service_id')],
          'watchlist':with_facts(mock_ask('watchlist?select=notify,added_at,title:titles(id,kind,title,year,poster_path,genres,original_language,runtime_min,seasons,availability(service_id,leaves_on),scores(imdb_rating,rt_critics,letterboxd))&order=added_at.desc')),
          'letterboxd':one(mock_ask('rpc/letterboxd_me',{})),'watched':mock_ask('rpc/letterboxd_watched_ids',{}),'stamp':'s1'})
    if 'rpc/title_page' in u:
        if not MODE.get('title_page'): return r.fulfill(status=404, json={})
        MODE['title_page_asked']=MODE.get('title_page_asked',0)+1
        class F:
            class request: post_data=r.request.post_data
        return r.fulfill(json=dict(title_detail(), more=[dict(card(i), tags=[]) for i in MODE.get('similar', _alike(F))]))
    if 'rpc/home_bundle' in u or 'rpc/home_more' in u:
        b=r.request.post_data_json; MODE.setdefault('home_asked',[]).append((u.split('/rpc/')[1],b))
        def ask(path, body=None):
            got={}
            class Req:
                url='https://mock.supabase.co/rest/v1/'+path; method='POST' if body is not None else 'GET'
                post_data=json.dumps(body) if body is not None else None; post_data_json=body; headers={}
            class R:
                request=Req()
                def fulfill(self, json=None, status=200, **k): got['v']=json if status<400 else []
                def fallback(self):
                    if 'fell' in got: got['v']=[]
                    else: got['fell']=1; route(self)
            hroute2(R())
            v=got.get('v') or []
            return v if isinstance(v,list) else [v]
        T='titles?select=id,kind,title,year,poster_path,backdrop_path,logo_path'
        if 'rpc/home_bundle' in u:
            day=b['p_day']; args={'p_day':day,'p_services':b['p_services'],'p_hide':b['p_hide']}
            return r.fulfill(json=with_facts({
              'trendF':ask(T+'&kind=eq.film&trend_rank=not.is.null'), 'trendS':ask(T+'&kind=eq.series&trend_rank=not.is.null'),
              'arrivals':ask('availability_events?select=happened_on,service_id,title:titles!inner(id)&event=eq.added'),
              'leaving':ask('availability?select=leaves_on,service_id,title:titles!inner(id)'),
              'saved':ask('watchlist?select=added_at,title:titles!inner(id)'),
              'because':ask('rpc/home_because',args), 'becauseAlt':ask('rpc/home_because',dict(args,p_day=day+1)),
              'friends':ask('rpc/home_friends',args), 'taste':ask('rpc/home_taste',{}),
              'newF':ask(T+'&kind=eq.film&year=gte.2025'), 'newS':ask(T+'&kind=eq.series&year=gte.2025'),
              'awardWins':ask('awards?select=award'), 'theme':ask(T+'&imdb_rating=gte.7.5&scores!inner&imdb_votes=gte.2000') if b['p_gems'] else [],
              'savedRecs':ask('rpc/home_saved',args), 'people':ask('rpc/home_people',args), 'makers':ask('rpc/home_makers',args)}))
        lists={k:(ask(T+'&id=in.(%s)'%','.join(map(str,v))) if v else []) for k,v in b['p_lists'].items()}
        sa=ask('availability_events?select=title_id&title_id=in.(%s)'%','.join(map(str,b['p_saved']))) if b['p_saved'] else []
        dec=[ask(T+'&kind=eq.%s&year=gte.%s&year=lte.%s'%(k,b['p_decade']['from'],b['p_decade']['to'])) for k in ('film','series')]
        gen=[[ask(T+'&kind=eq.%s&genres=ov.{%s}'%(k,','.join(g))) for k in ('film','series')] for g in b['p_genres']]
        return r.fulfill(json=with_facts({'lists':lists,'savedArrivals':sa,'decade':dec,'genres':gen}))
    if 'rpc/home_base' in u:
        # the ready-made generic part of Home (only when a test asks for it: otherwise Home is built whole)
        if not MODE.get('base'): return r.fulfill(status=404, json={})
        MODE['base_asked']=MODE.get('base_asked',0)+1
        def cs(lo,n,kind): return [dict(card(i),kind=kind) for i in range(lo,lo+n)]
        return r.fulfill(json={"day":datetime.date.today().isoformat(),"trendF":cs(600,20,'film'),"trendS":cs(640,20,'series'),"newF":cs(680,12,'film'),"newS":cs(700,12,'series'),
          "arrivals":[{"happened_on":"2026-11-%02d"%(22-i//3),"service_id":['netflix','hbo-max','viaplay'][i%3],"title":dict(card(720+i),popularity=100-i)} for i in range(12)],
          "leaving":[{"leaves_on":(datetime.date.today()+datetime.timedelta(days=3+i)).isoformat(),"service_id":"netflix","title":card(760+i,(datetime.date.today()+datetime.timedelta(days=3+i)).isoformat())} for i in range(10)]})
    if 'rpc/home_because' in u:
        day=json.loads(r.request.post_data)['p_day']; alt=day%2==1
        return r.fulfill(json=[{"source":"Arrival" if alt else "Heat","title_id":(340 if alt else 300)+i,"rank":i+1} for i in range(8)] if CASE['personal'] else [])
    if 'rpc/home_saved' in u: return r.fulfill(json=[{"source":"Severance","source_id":500,"title_id":360+i,"rank":i+1} for i in range(8)] if CASE['personal'] else [])
    if 'rpc/home_people' in u: return r.fulfill(json=[{"person_id":7,"name":"Denis Villeneuve","title_id":380+i} for i in range(6)] if CASE['personal'] else [])
    if 'rpc/home_makers' in u: return r.fulfill(json=([{"role":"director","person_id":8,"name":"Michael Mann","source":"Heat","title_id":2400+i} for i in range(3)]
        +[{"role":"actor","person_id":9,"name":"Florence Pugh","source":None,"title_id":2420+i} for i in range(3)]) if CASE['personal'] else [])
    if 'rpc/home_friends' in u: return r.fulfill(json=[{"title_id":320+i,"name":["Anna Berg","Erik","Maja"][i%3],"rating":5-0.5*(i%3)} for i in range(6)] if CASE['personal'] else [])
    if 'rpc/home_taste' in u: return r.fulfill(json=[{"genre":"Thriller","average":4.2,"films":12},{"genre":"Science Fiction","average":4.1,"films":9},{"genre":"Drama","average":3.9,"films":30}] if CASE['personal'] else [])
    # wins in today's award: one title can have several (the row shows it once, with "+n")
    if '/awards' in u: return r.fulfill(json=[{"award":"Oscars","short_category":["Best Picture","Best Director","Best Actress"][i%3],"rank":1+i%3,"year":2025-i,"title":card(400+i//2)} for i in range(20)])
    if '/watchlist' in u and 'titles!inner' in u: return r.fulfill(json=[{"added_at":"2026-11-20","title":dict(card(500+i,(MODE['leave'] if isinstance(MODE.get('leave'),str) else (datetime.date.today()+datetime.timedelta(days=3)).isoformat()) if MODE.get('leave') and i==5 else None), kind='film' if i>=4 else card(500+i)['kind'], runtime_min=[95,88,140,130,92,85,99,150,97,120,91,110][i%12])} for i in range(12)] if CASE['personal'] else [])
    if '/titles' in u and '&id=in.' in u and 'backdrop_path' in u:
        ids=[int(x) for x in re.search(r'&id=in\.\(([\d,]+)\)',u).group(1).split(',')]; return r.fulfill(json=[card(i) for i in ids])
    if '/titles' in u and re.search(r'[?&]id=in\.\(\d', u):   # cards by id (onboarding's wall)
        ids=[int(x) for x in re.search(r'[?&]id=in\.\(([\d,]+)\)',u).group(1).split(',')]; return r.fulfill(json=[card(i) for i in ids])
    if '/titles' in u and 'trend_rank' in u: 
        k='film' if 'kind=eq.film' in u else 'series'; return r.fulfill(json=[dict(card(600+i*3+(0 if k=='film' else 1)),kind=k) for i in range(12)])
    if '/titles' in u and 'scores!inner' in u and 'imdb_votes' in u and 'backdrop_path' in u: return r.fulfill(json=[card(700+i) for i in range(10)])
    if '/titles' in u and 'backdrop_path' in u and 'kind=eq.' in u and 'id=eq.' not in u:
        k='film' if 'kind=eq.film' in u else 'series'
        base=800 if 'year=gte' in u and 'year=lte' not in u else 900 if 'year=lte' in u else 1000+(hash(re.search(r'genres=ov\.\{([^}]*)',u).group(1))%50)*20 if 'genres=ov' in u else 1100
        return r.fulfill(json=[dict(card(base+i*2+(0 if k=='film' else 1)),kind=k) for i in range(8)])
    if '/availability?' in u and 'leaves_on' in u: return r.fulfill(json=[{"leaves_on":"2026-11-%02d"%(23+i),"service_id":"netflix","title":card(100+i,"2026-11-%02d"%(23+i))} for i in range(6)])
    if '/titles' in u or '/availability' in u or '/awards' in u: 0 and print('  FALLBACK', u.split('/rest/v1/')[-1][:230])
    return r.fallback()
