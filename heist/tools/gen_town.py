import json, math, sys
PI = math.pi
def R(x0, z0, x1, z1): return {"min": [x0, z0], "max": [x1, z1]}
def cont(tool="crowbar", time=3, noisy=True, pick=0, amount=(100, 100), refill=1, alarmed=False, car=0, collects=False, behind=None, verb="Forcer"):
    c = {"tool": tool, "time": time, "noisy": noisy, "pickTime": pick, "amount": list(amount), "refillDays": refill,
         "alarmed": alarmed, "carAlarm": car, "collects": collects, "verb": verb}
    if behind: c["behind"] = behind
    return c

buildings = [
  {"id": "block-a", "rect": R(-70,-14,-52,-4), "height": 9, "style": "brick", "color": "#7b4a3c", "solid": True},
  {"id": "hideout", "rect": R(-50,-14,-40,-4), "height": 3.2, "style": "concrete", "color": "#6b6f73", "floor": "concrete",
   "openings": {"s": [{"from": -46, "to": -44}]}},
  {"id": "block-b", "rect": R(-38,-14,-22,-4), "height": 7, "style": "plaster", "color": "#8a8372", "solid": True},
  {"id": "store", "rect": R(-20,-14,-8,-4), "height": 3.4, "style": "brick", "color": "#8c6f5a", "site": "store", "floor": "tile",
   "openings": {"s": [{"from": -19.2, "to": -16, "window": True}, {"from": -15, "to": -13, "door": {"id": "store-front", "role": "front"}}],
                "n": [{"from": -10, "to": -9, "door": {"id": "store-back", "role": "back"}}]},
   "partitions": [{"axis": "x", "at": -11, "from": -20, "to": -8, "openings": [{"from": -18, "to": -16.8}]}]},
  {"id": "block-c", "rect": R(-6,-14,6,-4), "height": 11, "style": "brick", "color": "#5f4a44", "solid": True},
  {"id": "jewelry", "rect": R(8,-14,24,-4), "height": 3.6, "style": "stone", "color": "#b9b2a2", "site": "jewelry", "floor": "wood",
   "openings": {"s": [{"from": 9, "to": 14, "window": True}, {"from": 15, "to": 17, "door": {"id": "jewel-front", "role": "front"}}, {"from": 18, "to": 23, "window": True}],
                "n": [{"from": 22, "to": 23, "door": {"id": "jewel-back", "role": "back"}}]},
   "partitions": [{"axis": "x", "at": -10.5, "from": 8, "to": 24, "openings": [{"from": 20, "to": 21, "door": {"id": "jewel-staff", "role": "inner"}}]}]},
  {"id": "block-d", "rect": R(26,-14,36,-4), "height": 8, "style": "plaster", "color": "#77808a", "solid": True},
  {"id": "bank", "rect": R(38,-14,62,-4), "height": 4.4, "style": "stone", "color": "#c9c4b6", "site": "bank", "floor": "marble",
   "openings": {"s": [{"from": 40, "to": 47, "window": True}, {"from": 49, "to": 51, "door": {"id": "bank-front", "role": "front"}}, {"from": 53, "to": 60, "window": True}],
                "n": [{"from": 59, "to": 60, "door": {"id": "bank-back", "role": "back"}}]},
   "partitions": [
     {"axis": "x", "at": -9, "from": 38, "to": 62, "openings": [{"from": 38.2, "to": 59.5, "window": True}, {"from": 60, "to": 61, "door": {"id": "bank-staff", "role": "inner"}}]},
     {"axis": "x", "at": -11.6, "from": 38, "to": 62, "openings": [{"from": 43, "to": 44.5, "door": {"id": "bank-vault", "role": "vault"}}, {"from": 54, "to": 55}]},
     {"axis": "z", "at": 48, "from": -14, "to": -11.6, "openings": []}]},
  {"id": "block-e", "rect": R(64,-14,70,-4), "height": 10, "style": "brick", "color": "#6d4f48", "solid": True},
  {"id": "south-1", "rect": R(-70,6,-46,8), "height": 10, "style": "brick", "color": "#6a4a40", "solid": True},
  {"id": "south-2", "rect": R(-46,6,-20,8), "height": 7, "style": "plaster", "color": "#8b8577", "solid": True},
  {"id": "south-3", "rect": R(-20,6,2,8), "height": 12, "style": "concrete", "color": "#5d636b", "solid": True},
  {"id": "south-4", "rect": R(2,6,30,8), "height": 8, "style": "brick", "color": "#7a5548", "solid": True},
  {"id": "south-5", "rect": R(30,6,52,8), "height": 6.5, "style": "plaster", "color": "#9a9484", "solid": True},
  {"id": "south-6", "rect": R(52,6,70,8), "height": 10, "style": "concrete", "color": "#656a72", "solid": True},
  {"id": "alley-fence", "rect": R(-70,-19.2,70,-19), "height": 2.6, "style": "metal", "color": "#3a3f3c", "solid": True},
  {"id": "end-west", "rect": R(-70.3,-19,-70,8), "height": 2.6, "style": "metal", "color": "#3a3f3c", "solid": True},
  {"id": "end-east", "rect": R(70,-19,70.3,8), "height": 2.6, "style": "metal", "color": "#3a3f3c", "solid": True},
]

def P(t, x, z, rot=0, variant=0):
    d = {"type": t, "pos": [x, z]}
    if rot: d["rot"] = rot
    if variant: d["variant"] = variant
    return d

props = [
  P("bed", -48.7, -13.2), P("table", -42.2, -8.4), P("locker", -49.5, -9, 3), P("workbench", -42.5, -13.4),
  P("counter", -15, -7.8), P("shelf", -17.5, -5.75), P("shelf", -10.6, -5.95), P("fridge", -8.6, -9.6, 1), P("safe", -19.3, -13.3),
  P("dumpster", -2, -16.6), P("stall", -30, -17.6), P("van", -34.5, -17.3), P("crate", -28.3, -18.3), P("crate", -31.9, -18.4),
  P("dumpster", 56, -16.8, 0, 1), P("crate", 30, -18.2), P("crate", 30.9, -18.3),
  P("display-case", 10.5, -6.2), P("display-case", 13, -6.2), P("display-case", 19, -6.2), P("display-case", 21.5, -6.2), P("display-case", 16, -7.4),
  P("jewel-counter", 14.5, -9.05), P("safe", 9.0, -13.2, 0, 1), P("desk", 14, -12.9),
  P("teller-desk", 44, -9.45), P("teller-desk", 50, -9.45), P("teller-desk", 56, -9.45),
  P("column", 43, -6.6), P("column", 57, -6.6), P("bench", 39.2, -6, 3), P("desk", 55, -13.0),
  P("deposit-boxes", 40.5, -13.55), P("deposit-boxes", 45.5, -13.55), P("cash-pallet", 42.9, -13.2),
  P("car", -58, 3.3, 0, 0), P("car", -31, 3.3, 0, 1), P("car", -3, 3.3, 0, 2), P("car", 12, 3.3, 0, 3), P("car", 33, 3.3, 0, 4), P("car", 47, 3.3, 0, 5),
  P("trash-can", -21, -3.4), P("trash-can", 7, -3.4), P("trash-can", 37, -3.4),
  P("hydrant", -39, -2.75), P("hydrant", 25, -2.75), P("bench", 0, -3.55), P("bench", 30, -3.55),
  P("planter", 47.6, -3.3), P("planter", 52.4, -3.3), P("planter", 14, -3.3, 0, 1), P("planter", 18, -3.3, 0, 1),
  P("barrier", -69.4, 1), P("barrier", 69.4, 1),
  P("ac-unit", -24, -14.3), P("ac-unit", 2, -14.3), P("ac-unit", 31, -14.3),
]

sites = [
  {"id": "store", "name": "Supérette Lumière", "tier": 1, "rect": R(-20,-14,-8,-4),
   "staffOnly": [R(-19.8,-10.9,-8.2,-8.2), R(-19.8,-13.8,-8.2,-11.1)], "open": 8, "close": 22, "policeStop": [-14, 0], "lockedFuseBox": False},
  {"id": "jewelry", "name": "Bijouterie Aurore", "tier": 2, "rect": R(8,-14,24,-4),
   "staffOnly": [R(8.2,-10.4,23.8,-9.3), R(8.2,-13.8,23.8,-10.6)], "open": 10, "close": 19, "policeStop": [16, 0], "lockedFuseBox": True},
  {"id": "bank", "name": "Banque Centrale du Crédit", "tier": 3, "rect": R(38,-14,62,-4),
   "staffOnly": [R(38.2,-11.5,61.8,-9.1), R(38.2,-13.8,61.8,-11.7)], "open": 9, "close": 17, "policeStop": [50, 0], "lockedFuseBox": True},
]

def I(id, kind, name, x, z, y=1.2, **kw):
    d = {"id": id, "kind": kind, "name": name, "pos": [x, z], "y": y}
    d.update(kw)
    return d

inter = [
  I("coat", "cash", "Vieux manteau", -49.7, -6, 1.4, amount=40),
  I("dumpster", "pickup", "Benne à ordures", -2, -15.9, 1.2, item="crowbar"),
  I("fence", "fence", "Le Fourgue", -30, -17.4, 1.2),
  I("bed", "bed", "Matelas", -48.7, -12.5, 0.5),
  I("plan-table", "plan-table", "Table de plan", -42.2, -7.7, 0.8),
  # Supérette
  I("store-register", "register", "Caisse", -16, -7.8, 1.15, site="store"),
  I("store-safe", "container", "Coffre", -19.3, -12.8, 0.7, site="store",
    container=cont(time=8, pick=12, amount=(500, 500), collects=True, verb="Forcer le coffre")),
  I("store-fuse", "fuse-box", "Boîtier électrique", -14, -14.15, 1.5, site="store"),
  I("store-front-door", "door", "Porte d'entrée", -14, -4.1, site="store", door="store-front"),
  I("store-back-door", "door", "Porte arrière", -9.5, -13.9, site="store", door="store-back"),
  # Bijouterie
  I("jewel-fuse", "fuse-box", "Boîtier électrique", 12, -14.15, 1.5, site="jewelry"),
  I("jewel-front-door", "door", "Porte d'entrée", 16, -4.1, site="jewelry", door="jewel-front"),
  I("jewel-back-door", "door", "Porte arrière", 22.5, -13.9, site="jewelry", door="jewel-back"),
  I("jewel-staff-door", "door", "Porte du personnel", 20.5, -10.5, site="jewelry", door="jewel-staff"),
  I("jewel-safe", "container", "Coffre du bijoutier", 9.0, -12.7, 0.7, site="jewelry",
    container=cont(time=10, pick=14, amount=(2500, 2500), refill=3, verb="Forcer le coffre")),
  # Banque
  I("bank-fuse", "fuse-box", "Boîtier électrique", 52, -14.15, 1.5, site="bank"),
  I("bank-front-door", "door", "Porte d'entrée", 50, -4.1, site="bank", door="bank-front"),
  I("bank-back-door", "door", "Porte arrière", 59.5, -13.9, site="bank", door="bank-back"),
  I("bank-staff-door", "door", "Porte du personnel", 60.5, -9.0, site="bank", door="bank-staff"),
  I("bank-vault-drill", "vault-drill", "Porte de la chambre forte", 43.75, -11.3, 1.2, site="bank", door="bank-vault"),
  I("vault-cash", "container", "Palette de billets", 42.9, -12.6, 0.9, site="bank",
    container=cont(tool="none", time=4, noisy=False, amount=(9000, 9000), refill=3, behind="bank-vault", verb="Remplir le sac")),
  I("deposit-1", "container", "Coffres individuels", 40.5, -13.2, 1.2, site="bank",
    container=cont(time=3, pick=6, amount=(700, 1200), refill=3, behind="bank-vault", verb="Forcer les coffres")),
  I("deposit-2", "container", "Coffres individuels", 45.5, -13.2, 1.2, site="bank",
    container=cont(time=3, pick=6, amount=(700, 1200), refill=3, behind="bank-vault", verb="Forcer les coffres")),
]
for i, (x, z) in enumerate([(10.5, -6.2), (13, -6.2), (19, -6.2), (21.5, -6.2), (16, -7.4)]):
    inter.append(I(f"jewel-case-{i+1}", "container", "Vitrine", x, z, 1.0, site="jewelry", reach=1.7,
                   container=cont(time=1.5, pick=5, amount=(350, 500), refill=2, alarmed=True, verb="Briser la vitrine")))
for i, x in enumerate([44, 50, 56]):
    inter.append(I(f"bank-drawer-{i+1}", "register", "Guichet", x, -8.8, 1.1, site="bank", amount=600, needsStaff=f"teller-{i+1}"))
for i, x in enumerate([-58, -3, 33]):
    inter.append(I(f"car-trunk-{i+1}", "container", "Coffre de voiture", x - 2.3, 3.3, 0.9, reach=1.7,
                   container=cont(time=2.5, pick=5, amount=(30, 90), car=0.35, verb="Forcer le coffre")))

def N(id, site, text, x, z, y, marker, range=8, trigger="look"):
    return {"id": id, "site": site, "text": text, "pos": [x, z], "y": y, "trigger": trigger, "range": range, "marker": marker}
E = lambda id, site, text, x, z, marker="person": N(id, site, text, x, z, 1.6, marker, 0, "event")

intel = [
  E("fence", "town", "Le Fourgue tient boutique dans la ruelle, de 18 h à 5 h. Matériel contre argent propre ; il blanchit le sale et encaisse la dette.", -30, -18.4),
  E("watchman", "town", "Un veilleur de nuit armé fait le tour du pâté de maisons, de 22 h à 6 h : la rue, puis la ruelle.", 63, -3),
  N("store-hours", "store", "Supérette : ouverte de 8 h à 22 h. Porte de devant verrouillée la nuit.", -14, -3.95, 2.95, "info", 14),
  N("store-camera", "store", "Une caméra au plafond, braquée sur la caisse. Diode rouge : elle est alimentée.", -8.6, -4.6, 2.8, "camera", 11),
  N("store-register", "store", "Caisse enregistreuse. Elle se remplit au fil de la journée.", -16, -7.8, 1.15, "cash", 6),
  N("store-safe", "store", "Petit coffre dans l'arrière-boutique. Pied-de-biche (bruyant) ou crochets (lent).", -19.3, -13.3, 0.7, "safe", 5),
  N("store-fuse", "store", "Boîtier électrique derrière la boutique : il alimente la caméra et l'alarme de porte.", -14, -14.15, 1.5, "power", 7),
  N("store-back-door", "store", "Porte arrière, avec un contact d'alarme sur le chambranle.", -9.5, -14.0, 1.2, "door", 6),
  E("store-clerk-break", "store", "L'employé sort fumer par la porte arrière toutes les deux heures, à la demie. Il la laisse ouverte.", -9.5, -15.5),
  E("store-clerk-closing", "store", "À la fermeture, l'employé vide la caisse dans le coffre avant de partir.", -18.4, -12.2),
  N("jewel-hours", "jewelry", "Bijouterie : ouverte de 10 h à 19 h.", 16, -3.95, 3.1, "info", 14),
  N("jewel-camera-1", "jewelry", "Caméra côté ouest de la salle : elle couvre les vitrines.", 8.6, -4.6, 3.0, "camera", 11),
  N("jewel-camera-2", "jewelry", "Caméra côté est de la salle : elle couvre l'entrée et le comptoir.", 23.4, -4.6, 3.0, "camera", 11),
  N("jewel-cases", "jewelry", "Cinq vitrines sous détecteur de bris de verre. Les crochets les ouvrent sans les briser.", 16, -7.4, 1.0, "cash", 7),
  N("jewel-staff-door", "jewelry", "Porte du personnel, verrouillée. L'arrière-boutique est derrière.", 20.5, -10.4, 1.2, "door", 7),
  N("jewel-safe", "jewelry", "Le coffre du bijoutier : les plus belles pièces y dorment.", 9.0, -13.2, 0.7, "safe", 6),
  N("jewel-fuse", "jewelry", "Boîtier électrique cadenassé. Il faut le crocheter ou le forcer avant de couper.", 12, -14.15, 1.5, "power", 7),
  N("jewel-back-door", "jewelry", "Porte arrière blindée, sous alarme.", 22.5, -14.0, 1.2, "door", 6),
  E("jewel-guard", "jewelry", "Un vigile armé se tient près de l'entrée pendant les heures d'ouverture.", 17.8, -5.2),
  E("jewel-lunch", "jewelry", "À 13 h, le bijoutier déjeune dans l'arrière-boutique. La porte du personnel reste ouverte.", 14, -12.2),
  N("bank-hours", "bank", "Banque : ouverte de 9 h à 17 h.", 50, -3.95, 3.6, "info", 16),
  N("bank-camera-1", "bank", "Caméra à l'ouest du hall.", 38.6, -4.6, 3.6, "camera", 12),
  N("bank-camera-2", "bank", "Caméra à l'est du hall.", 61.4, -4.6, 3.6, "camera", 12),
  N("bank-tellers", "bank", "Trois guichets derrière une vitre. Un guichetier menacé peut remettre sa caisse.", 50, -9.0, 1.3, "cash", 8),
  N("bank-staff-door", "bank", "Porte du personnel, à l'est des guichets. Verrouillée.", 60.5, -8.9, 1.2, "door", 8),
  N("bank-vault", "bank", "Porte de chambre forte. Seule une perceuse thermique en viendra à bout : 40 secondes de vacarme.", 43.75, -11.5, 1.3, "safe", 9),
  N("bank-fuse", "bank", "Boîtier électrique cadenassé, derrière la banque.", 52, -14.15, 1.5, "power", 7),
  N("bank-back-door", "bank", "Porte arrière de la banque : elle donne sur le bureau du directeur.", 59.5, -14.0, 1.2, "door", 6),
  E("bank-guards", "bank", "Deux vigiles armés le jour : un à l'entrée, un qui tourne dans le hall.", 51.8, -5.2),
  E("bank-night-guard", "bank", "La nuit, un vigile armé fait sa ronde à l'intérieur, du hall aux guichets.", 50, -6),
]

def cam(id, site, x, z, y, tx, tz, fov=1.35, rng=13):
    return {"id": id, "site": site, "pos": [x, z], "y": y, "facing": round(math.atan2(tz - z, tx - x), 3), "fov": fov, "range": rng}
cameras = [
  cam("store-camera", "store", -8.6, -4.6, 2.8, -16, -7.8),
  cam("jewel-camera-1", "jewelry", 8.6, -4.6, 3.0, 15, -8),
  cam("jewel-camera-2", "jewelry", 23.4, -4.6, 3.0, 16, -8),
  cam("jewel-camera-3", "jewelry", 23.4, -13.4, 3.0, 10, -12.5, 1.2, 15),
  cam("bank-camera-1", "bank", 38.6, -4.6, 3.6, 48, -8, 1.4, 15),
  cam("bank-camera-2", "bank", 61.4, -4.6, 3.6, 52, -8, 1.4, 15),
  cam("bank-camera-3", "bank", 38.6, -11.2, 3.6, 55, -10.3, 1.0, 22),
  cam("bank-camera-4", "bank", 38.6, -13.4, 3.6, 46, -12.6, 1.3, 10),
]

H = PI / 2
staff = [
  {"id": "clerk", "site": "store", "role": "clerk", "name": "L'employé", "armed": False, "from": 7.75, "to": 22,
   "post": [-16, -9], "postFacing": H,
   "arrive": [[-69, -3], [-14, -3], [-14, -5.5], [-11, -7], [-11, -9], [-16, -9]],
   "leave": [[-16, -9], [-17.4, -10], [-18.4, -12.2], [-17.4, -10], [-11, -9], [-11, -7], [-14, -5.5], [-14, -3], [-69, -3]], "depositAt": 2,
   "pause": {"every": 2, "minute": 30, "duration": 12, "path": [[-16, -9], [-17.4, -10], [-17.4, -12.2], [-9.5, -12.4], [-9.5, -15.5]],
             "facing": -H, "door": "store-back", "intel": "store-clerk-break"},
   "leaveIntel": "store-clerk-closing"},
  {"id": "jeweler", "site": "jewelry", "role": "jeweler", "name": "Le bijoutier", "armed": False, "from": 9.75, "to": 19,
   "post": [14.5, -9.9], "postFacing": H,
   "arrive": [[69, -3], [16, -3], [16, -5.2], [20.5, -8], [20.5, -9.9], [14.5, -9.9]],
   "pause": {"every": 13, "minute": 0, "duration": 20, "path": [[14.5, -9.9], [20.5, -9.9], [20.5, -12], [14, -12.2]],
             "facing": -H, "door": "jewel-staff", "intel": "jewel-lunch"}},
  {"id": "jewel-guard", "site": "jewelry", "role": "guard", "name": "Le vigile", "armed": True, "from": 9.75, "to": 19,
   "post": [17.8, -5.2], "postFacing": -2.4, "arrive": [[69, -3.4], [17, -3.4], [17.8, -5.2]], "seenIntel": "jewel-guard"},
  {"id": "watchman", "site": "jewelry", "role": "watchman", "name": "Le veilleur de nuit", "armed": True, "from": 22, "to": 6,
   "post": [63, -3], "postFacing": PI, "arrive": [[69, -3], [63, -3]],
   "patrol": [[63, -3], [-21, -3], [-21, -16.5], [63, -16.5]], "seenIntel": "watchman"},
  {"id": "bank-guard-1", "site": "bank", "role": "guard", "name": "Le vigile de l'entrée", "armed": True, "from": 8.75, "to": 17,
   "post": [51.8, -5.2], "postFacing": -2.2, "arrive": [[69, -3.6], [51, -3.6], [51.8, -5.2]], "seenIntel": "bank-guards"},
  {"id": "bank-guard-2", "site": "bank", "role": "guard", "name": "Le vigile du hall", "armed": True, "from": 8.75, "to": 17,
   "post": [41, -5.5], "postFacing": 0, "arrive": [[69, -3.8], [50.3, -3.8], [50.3, -5.5], [41, -5.5]],
   "patrol": [[41, -5.5], [59, -5.5], [59, -7.8], [41, -7.8]], "seenIntel": "bank-guards"},
  {"id": "bank-night-guard", "site": "bank", "role": "guard", "name": "Le vigile de nuit", "armed": True, "from": 17, "to": 8.75,
   "post": [50, -6], "postFacing": H, "arrive": [[69, -3.5], [50, -3.5], [50, -6]],
   "patrol": [[50, -6], [41, -6], [41, -7.8], [59, -7.8], [60.5, -7.8], [60.5, -10.3], [42, -10.3], [60.5, -10.3], [60.5, -7.8], [59, -6]],
   "seenIntel": "bank-night-guard"},
]
for i, x in enumerate([44, 50, 56]):
    staff.append({"id": f"teller-{i+1}", "site": "bank", "role": "teller", "name": "Un guichetier", "armed": False, "from": 8.75, "to": 17,
                  "post": [x, -10.2], "postFacing": H,
                  "arrive": [[69, -3.2 - i * 0.3], [50, -3.2], [50, -6], [60.5, -7.5], [60.5, -10.2], [x, -10.2]]})

peds = [
  {"id": "ped-1", "path": [[-66, 4.9], [66, 4.9]], "from": 7, "to": 23, "variant": 0},
  {"id": "ped-2", "path": [[66, -3.2], [-66, -3.2]], "from": 6.5, "to": 21, "variant": 1},
  {"id": "ped-3", "path": [[-66, -3], [-14, -3], [-14, -5], [-12, -6.8], [-14, -5], [-14, -3], [30, -3]], "from": 8.5, "to": 21.5, "variant": 2},
  {"id": "ped-4", "path": [[66, 4.9], [50, 4.9], [50, -3], [50, -6.5], [47, -8.2], [50, -6.5], [50, -3], [20, -3]], "from": 9.2, "to": 16.6, "variant": 3},
  {"id": "ped-5", "path": [[-66, 4.9], [16, 4.9], [16, -3], [16, -5.4], [12.2, -5.3], [16, -5.4], [16, -3], [66, -3]], "from": 10.3, "to": 18.4, "variant": 4},
]

town = {
  "bounds": R(-70, -19, 70, 8), "spawn": [-45, -9], "hideout": R(-50, -14, -40, -4),
  "buildings": buildings, "props": props, "sites": sites, "interactables": inter, "intel": intel,
  "cameras": cameras, "staff": staff, "pedestrians": peds,
  "lamps": [[x, -2.7] for x in (-62, -46, -30, -14, 2, 18, 34, 50, 66)] + [[-28, -18.6], [0, -18.6], [30, -18.6], [55, -18.6]],
  "fence": {"pos": [-30, -18.45], "facing": round(H, 4), "openFrom": 18, "openTo": 5},
  "policeSpawn": [69, 1],
}
def rnd(o):
    if isinstance(o, float): return round(o, 4)
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    if isinstance(o, list): return [rnd(v) for v in o]
    return o
json.dump(rnd(town), open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
