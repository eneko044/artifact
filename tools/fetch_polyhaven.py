import json, os, sys, urllib.request
_opener = urllib.request.build_opener()
_opener.addheaders = [('User-Agent', 'curl/8.5.0')]
urllib.request.install_opener(_opener)
BASE = os.path.dirname(os.path.abspath(__file__)) + '/../game/assets'
def get(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest): return
    urllib.request.urlretrieve(url, dest)
def api(id):
    return json.load(urllib.request.urlopen('https://api.polyhaven.com/files/' + id))
TEX = ['large_sandstone_blocks_01','yellow_plaster_02','patterned_clay_plaster','sandy_gravel','red_sandstone_pavement','weathered_planks','rusty_metal_02','concrete_wall_008','sandstone_brick_wall_01','worn_plaster_wall']
MODELS = ['wooden_crate_01','wooden_crate_02','Barrel_01','concrete_road_barrier','old_military_crate','metal_jerrycan','cardboard_box_01','wooden_military_crate','service_pistol','ammo_box','covered_car','old_tyre','street_lamp_01','stick_grenade','utility_box_01']
for t in TEX:
    f = api(t)
    for key, name in (('Diffuse','diff'),('nor_gl','nor'),('arm','arm')):
        try:
            u = f[key]['1k']['jpg']['url']
        except KeyError:
            print('missing', t, key); continue
        get(u, f'{BASE}/tex/{t}_{name}.jpg')
    print('tex', t)
for m in MODELS:
    f = api(m)['gltf']['1k']['gltf']
    d = f'{BASE}/models/{m}'
    get(f['url'], f'{d}/{m}.gltf')
    for rel, v in f['include'].items():
        get(v['url'], f'{d}/{rel}')
    print('model', m)
h = api('kloofendal_43d_clear_puresky')['hdri']['1k']['hdr']['url']
get(h, f'{BASE}/hdri/sky_1k.hdr'); print('hdri')
