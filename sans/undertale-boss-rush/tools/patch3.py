import json,io
s=io.open('v2/scr_game.gml',encoding='utf-8').read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n,(s.count(a),a[:70])
    s=s.replace(a,b)
# A globals
rep("function game_create() {\n","function game_create() {\n\tflashT = 0; flashC = c_white; shieldDir = 0;\n")
rep("function tintCol(tn, base) {","function soulCol(f) { var sc0 = opt(f, \"soulC\", \"\"); if (sc0 != \"\") return hexc(sc0); return f.gravity != 0 ? make_color_rgb(20, 60, 255) : c_red; }\nfunction tintCol(tn, base) {")
# B patInit / patEnd
rep('\tvar bn = opt(spec, "banner", "");','''\tfight.frameC = hexc(opt(spec, "frame", "#ffffff")); fight.soulC = opt(spec, "soulc", ""); fight.shield = opt(spec, "shield", false); shieldDir = 1;
	var dr = opt(spec, "draw", ""); fight.drawn = dr; if (dr != "") { flashT = .55; flashC = hexc(opt(spec, "flash", "#ffffff")); sfx("phase"); banner = { txt: "INK DESSINE : " + dr, t: 2.6 }; }
	var bn = opt(spec, "banner", "");''')
rep('function patEnd() { scrRotT = 0;','function patEnd() { fight.frameC = c_white; fight.soulC = ""; fight.shield = false; fight.drawn = ""; scrRotT = 0;')
# G + F startEnemy
rep('''	var spec = list[f.pidx mod array_length(list)]; f.pidx++;''','''	if (f.phase3) { var h3 = opt(f.b, "p3", []); if (is_array(h3) && array_length(h3) > 0) list = h3; }
	var spec = list[f.pidx mod array_length(list)];
	if (opt(f.b, "hues", false) && opt(f, "hue", -1) >= 0) { // Ink : la zone de couleur touchée sur la cible choisit la teinte du tour
		var HN = ["green", "blue", "violet", "magenta", "red", "orange", "yellow"], hn = HN[f.hue], cand = [], wantDraw = (f.phase2 && f.turn mod 3 == 2), hi;
		for (hi = 0; hi < array_length(list); hi++) if (opt(list[hi], "hue", "") == hn && ((opt(list[hi], "draw", "") != "") == wantDraw)) array_push(cand, list[hi]);
		if (array_length(cand) == 0) for (hi = 0; hi < array_length(list); hi++) if (opt(list[hi], "hue", "") == hn && opt(list[hi], "draw", "") == "") array_push(cand, list[hi]);
		if (array_length(cand) > 0) spec = cand[f.pidx mod array_length(cand)];
	}
	f.pidx++;''')
rep('''				a.done = true; a.t = 0;''','''				a.done = true; a.t = 0; f.hue = floor(clamp(a.x, 0, .999)*7);''')
# C step
rep('''	if (P.bound > 0) { P.bound -= DT; dx = 0; dy = 0; }''','''	if (P.bound > 0) { P.bound -= DT; dx = 0; dy = 0; }
	if (opt(f, "shield", false)) { if (kdr("up")) shieldDir = 1; else if (kdr("right")) shieldDir = 0; else if (kdr("down")) shieldDir = 3; else if (kdr("left")) shieldDir = 2; dx = 0; dy = 0; P.x = box.x + box.w/2; P.y = box.y + box.h/2; }''')
rep('''	f.enemyShake = max(0, f.enemyShake - DT*30);''','''	f.enemyShake = max(0, f.enemyShake - DT*30); if (flashT > 0) flashT -= DT;''')
rep('''		case "bubble":
			b.y += b.vy*DT;''','''		case "arrow":
			b.x += b.vx*DT; b.y += b.vy*DT; var ad = sqrt(sqr(b.x - P.x) + sqr(b.y - P.y));
			if (ad < 26 && b.dir == shieldDir) { b.dead = true; sfx("move"); spark(b.x, b.y, 5, c_white, 120, .25); }
			else if (ad < P.r + 3) { hurt = true; b.dead = true; }
			break;
		case "bubble":
			b.y += b.vy*DT;''')
rep('''			if (!b.harmless && sqr(b.x - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r - 2)) hurt = true;''','''			if (variable_struct_exists(b, "oa")) { b.oa += b.oav*DT; b.orad = max(0, b.orad + b.orv*DT); b.x = b.ocx + cos(b.oa)*b.orad; b.y = b.ocy + sin(b.oa)*b.orad; }
			if (opt(b, "heal", 0) > 0 && sqr(b.x - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r + 1)) { P.hp = min(P.max, P.hp + b.heal); P.kr = min(P.kr, max(0, P.hp - 1)); sfx("heal"); b.dead = true; }
			if (!b.harmless && sqr(b.x - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r - 2)) hurt = true;''')
rep('''			if (b.life <= 0 || b.x < box.x - 40 || b.x > box.x + box.w + 40 || b.y < box.y - 40 || b.y > box.y + box.h + 40) b.dead = true;''','''			if (b.life <= 0 || (!variable_struct_exists(b, "oa") && (b.x < box.x - 40 || b.x > box.x + box.w + 40 || b.y < box.y - 40 || b.y > box.y + box.h + 40))) b.dead = true;''')
# draw
rep('''		case "blaster": break;''','''		case "blaster": break;
		case "arrow": break;''')
rep('''if (blink) draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, true); break; }''','''if (blink) draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, true); if (variable_struct_exists(b, "num")) txt(string(b.num), b.x + b.w/2, b.y + b.h/2 - 13, 22, c_white, "center"); break; }''')
rep('''		draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, 1);
''','''		if (opt(f, "drawn", "") != "" && f.state == "enemy") { gpu_set_fog(true, c_white, 0, 0); draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, 1); gpu_set_fog(false, c_white, 0, 0); txt(f.drawn, 320, 4, 18, flashC, "center"); }
		else draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, 1);
''')
rep('''	drawFrame(box.x, box.y, box.w, box.h);''','''	drawFrame(box.x, box.y, box.w, box.h, (f.state == "enemy") ? opt(f, "frameC", c_white) : c_white);''')
rep('''f.gravity != 0 ? make_color_rgb(20, 60, 255) : c_red, .7); }''','''soulCol(f), .7); }''')
rep('''if (sc > 0) heart(P.x, P.y, f.gravity != 0 ? make_color_rgb(20, 60, 255) : c_red, .85);''','''if (sc > 0) heart(P.x, P.y, soulCol(f), .85);
		for (i = 0; i < array_length(B); i++) if (B[i].kind == "arrow") { var ab = B[i]; lineBone(ab.x - sign(ab.vx)*9, ab.y - sign(ab.vy)*9, ab.x + sign(ab.vx)*9, ab.y + sign(ab.vy)*9, 6, ab.color); }
		if (opt(f, "shield", false)) { var sa = shieldDir*pi/2, shx = P.x + cos(sa)*19, shy = P.y - sin(sa)*19, gk;
			draw_set_colour(make_color_rgb(60, 120, 255)); draw_line_width(shx - sin(sa)*15, shy - cos(sa)*15, shx + sin(sa)*15, shy + cos(sa)*15, 4);
			draw_set_colour(make_color_rgb(57, 224, 90)); for (gk = 0; gk < 4; gk++) { var ga = gk*pi/2, gx2 = P.x + cos(ga)*(box.w/2 + 22), gy2 = P.y - sin(ga)*(box.h/2 + 22); draw_triangle(gx2 - cos(ga)*8, gy2 + sin(ga)*8, gx2 + cos(ga)*6 - sin(ga)*9, gy2 - sin(ga)*6 - cos(ga)*9, gx2 + cos(ga)*6 + sin(ga)*9, gy2 - sin(ga)*6 + cos(ga)*9, false); } }''')
rep('''		draw_set_colour(c_white); draw_ellipse(box.x + 14, box.y + 10, box.x + box.w - 14, box.y + box.h - 10, true);''','''		if (opt(f.b, "hues", false)) { var HC = ["#39e05a", "#3d6bff", "#8a2be2", "#ff3df0", "#ff1a1a", "#ff9a2e", "#ffe21a"], hq; draw_set_alpha(.45);
			for (hq = 0; hq < 7; hq++) { draw_set_colour(hexc(HC[hq])); draw_rectangle(box.x + 8 + hq*(box.w - 16)/7 + 2, box.y + 30, box.x + 8 + (hq + 1)*(box.w - 16)/7 - 2, box.y + box.h - 30, false); } draw_set_alpha(1); }
		draw_set_colour(c_white); draw_ellipse(box.x + 14, box.y + 10, box.x + box.w - 14, box.y + box.h - 10, true);''')
rep('''	drawHud(f);
	if (hurtFlash > 0)''','''	drawHud(f);
	if (flashT > 0) { draw_set_alpha(min(1, flashT*3)); draw_set_colour(flashC); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1); }
	if (hurtFlash > 0)''')
rep('''warn: .7 + i*opt(o, "step", .36), life: .3, kind: "pix", color: c });''','''warn: .7 + i*opt(o, "step", .36), life: .3, kind: "pix", color: c, num: i + 1 });''')
new=r'''	case "shieldrain": // âme verte : flèches/os des 4 côtés à bloquer avec le bouclier
		s.n = max(.3, opt(o, "rate", .8) - lv*.08); k = irandom(3); sp = opt(o, "speed", 150) + lv*20; L = opt(o, "dist", 230);
		var sdx = (k == 0) ? 1 : ((k == 2) ? -1 : 0), sdy = (k == 1) ? -1 : ((k == 3) ? 1 : 0);
		addB({ kind: "arrow", x: box.x + box.w/2 + sdx*L, y: box.y + box.h/2 + sdy*L, vx: -sdx*sp, vy: -sdy*sp, dir: k, r: 5, color: c });
		break;
	case "orbit": // anneau de projectiles qui tourne et se referme (une brèche pour sortir)
		s.n = opt(o, "rate", 3.6); N = opt(o, "n", 14); var orr = opt(o, "radius", min(box.w, box.h)*.5 + 30), ocx = box.x + box.w/2, ocy = box.y + box.h/2, oav = opt(o, "spin", 1.1)*choose(1, -1), ogap = irandom(N - 1), ocl = opt(o, "close", 30);
		for (i = 0; i < N; i++) { if (((i - ogap + N) mod N) < opt(o, "hole", 3)) continue;
			addB({ kind: "orb", x: ocx + cos(i/N*6.283)*orr, y: ocy + sin(i/N*6.283)*orr, vx: 0, vy: 0, r: opt(o, "r", 6), home: 0, warn: 0, life: orr/max(1, ocl)*.8, color: (opt(o, "color2", "") != "" && i mod 2 == 1) ? hexc(o.color2) : c, shape: "orb", oa: i/N*6.283, oav: oav, orad: orr, orv: -ocl, ocx: ocx, ocy: ocy }); }
		break;
	case "spiral": // bras en spirale depuis un point (os de Papyrus, flammes de Toriel)
		s.n = opt(o, "rate", .1); s.ph += opt(o, "turn", .31); sp = opt(o, "speed", 95) + lv*10; xx = box.x + box.w*opt(o, "cx", .5); yy = box.y + box.h*opt(o, "cy", 0); N = opt(o, "arms", 2);
		for (i = 0; i < N; i++) { a = s.ph + i*6.283/N; if (sin(a) < -.2 && opt(o, "cy", 0) <= 0) continue;
			addB({ kind: "orb", x: xx, y: yy, vx: cos(a)*sp, vy: sin(a)*sp, r: opt(o, "r", 5), home: 0, warn: 0, life: 6, color: (i mod 2 == 0) ? c : hexc(opt(o, "color2", "#ffffff")), shape: "orb" }); }
		break;
	case "star": // plusieurs grands os/rayons qui tournent ensemble autour du centre
		s.n = opt(o, "rate", 4.4); dir = choose(1, -1); a = rnd(0, 6.28); L = point_distance(0, 0, box.w, box.h)/2 + 8; N = opt(o, "n", 3);
		for (i = 0; i < N; i++) addB({ kind: "spin", cx: box.x + box.w/2, cy: box.y + box.h/2, ang: a + i*pi/N, av: dir*(opt(o, "w", .9) + lv*.1), len: L, wd: opt(o, "width", 9), tint: pick(opt(o, "kinds", ["white"])), life: 3.6, warn: .8 });
		break;
	case "pillars": // deux piliers côte à côte : cyan (immobile) + orange (bouger)
		s.n = opt(o, "rate", 2.8); k = irandom(1); var pw = box.w*opt(o, "frac", .22); xx = rnd(box.x, box.x + box.w - pw*2);
		addB({ x: xx, y: box.y, w: pw, h: box.h, warn: .9, life: .8, kind: "beam", tint: k ? "blue" : "orange", color: tintCol(k ? "blue" : "orange", c) });
		addB({ x: xx + pw, y: box.y, w: pw, h: box.h, warn: .9, life: .8, kind: "beam", tint: k ? "orange" : "blue", color: tintCol(k ? "orange" : "blue", c) });
		break;
	case "fireflies": // lucioles / mots "Heal" : les toucher soigne
		s.n = opt(o, "rate", .8);
		addB({ kind: "orb", x: rnd(box.x + 14, box.x + box.w - 14), y: rnd(box.y + 14, box.y + box.h - 14), vx: 0, vy: 0, r: 6, home: 0, warn: .5, life: 2.2, color: c, shape: "reticle", harmless: true, heal: opt(o, "heal", 3) });
		break;
'''
anchor="\tdefault:\n\t\ts.n = 1.2; ep = edgePoint();"
rep(anchor,new+anchor)
io.open('v3/scr_game.gml','w',encoding='utf-8',newline='').write(s)

d=json.load(io.open('v2/datafiles/data.json',encoding='utf-8'));B=d['bosses'];W="#ffffff"
G,BL,VI,MA,RE,OR,YE,CY="#39e05a","#3d6bff","#8a2be2","#ff3df0","#ff1a1a","#ff9a2e","#ffe21a","#31d6ff"
ink=[
 # --- tours colorés ---
 {"hue":"blue","frame":BL,"w":150,"h":150,"gravity":True,"dur":10,"banner":"TEINTE BLEUE","mix":[{"t":"floor","rate":.8,"speed":150,"color":BL},{"t":"stab","rate":2.0,"sides":["right"],"size":26,"color":BL}]},
 {"hue":"orange","frame":OR,"soulc":OR,"w":440,"h":100,"dur":9,"banner":"TEINTE ORANGE : NE T'ARRÊTE PAS","mix":[{"t":"fullcol","rate":2.2,"tints":["orange"]},{"t":"lanes","rate":.7,"color":W},{"t":"blaster","rate":2.6}]},
 {"hue":"orange","frame":OR,"w":150,"h":150,"dur":8,"mix":[{"t":"rain","rate":.12,"speed":60,"size":4,"color":W,"drift":True},{"t":"fullcol","rate":3.4,"tints":["orange"]}]},
 {"hue":"green","frame":G,"soulc":G,"shield":True,"w":120,"h":120,"dur":12,"banner":"TEINTE VERTE : FLÈCHES = BOUCLIER","mix":[{"t":"shieldrain","rate":.75,"speed":150,"color":W}]},
 {"hue":"green","frame":G,"w":300,"h":130,"dur":10,"banner":"TOUCHE LES LUEURS VERTES","mix":[{"t":"fireflies","rate":.7,"heal":3,"color":G},{"t":"rain","rate":.45,"speed":120,"size":6,"side":"sides","color":"#9aa3a0"}]},
 {"hue":"violet","frame":VI,"w":180,"h":180,"dur":10,"banner":"TEINTE VIOLETTE : SUIS LES NOMBRES","mix":[{"t":"numgrid","rate":4.6,"color":VI},{"t":"gridblast","n":2,"rate":4.6,"fire":.9,"left":True,"color":CY}]},
 {"hue":"violet","frame":VI,"w":170,"h":170,"dur":9,"mix":[{"t":"zone","rate":2.8,"cols":3,"safe":2,"color":VI},{"t":"slash","rate":1.6,"count":2,"width":10,"cross":True,"color":W}]},
 {"hue":"yellow","frame":YE,"w":160,"h":160,"dur":9,"banner":"TEINTE JAUNE","mix":[{"t":"ring","rate":1.2,"n":7,"speed":120,"color":YE},{"t":"chase","n":1,"rate":1.8,"speed":105,"color":YE}]},
 {"hue":"yellow","frame":YE,"w":170,"h":170,"dur":9,"mix":[{"t":"diag","rate":.5,"speed":150,"color":YE},{"t":"orbit","rate":3.8,"n":16,"color":YE}]},
 {"hue":"red","frame":RE,"w":160,"h":160,"dur":9,"banner":"TEINTE ROUGE","mix":[{"t":"zigzag","rate":1.5,"seg":4,"color":CY,"color2":OR}]},
 {"hue":"red","frame":RE,"w":160,"h":160,"dur":9,"mix":[{"t":"spin","rate":3.2,"w":1.6},{"t":"rain","rate":.3,"speed":120,"size":5,"color":RE,"drift":True}]},
 {"hue":"red","frame":RE,"w":150,"h":150,"sway":90,"dur":9,"mix":[{"t":"slash","rate":1.3,"count":1,"width":12,"color":RE},{"t":"blaster","rate":2.2}]},
 {"hue":"magenta","frame":MA,"soulc":MA,"w":260,"h":140,"dur":9,"banner":"TEINTE MAGENTA","mix":[{"t":"strings","rate":.6,"color":MA,"bind":True},{"t":"chase","n":1,"rate":2.0,"speed":100,"color":MA}]},
 {"hue":"magenta","frame":MA,"w":180,"h":180,"dur":9,"mix":[{"t":"gridblast","n":3,"rate":3.0,"fire":.9,"charge":.9,"left":True,"color":MA}]},
 # --- personnages dessinés ---
 {"hue":"blue","draw":"ASRIEL","flash":"#00ffff","frame":W,"soulc":CY,"w":300,"h":130,"dur":16,"mix":[{"t":"slash","rate":2.2,"count":2,"width":30,"cross":True,"color":W},{"t":"burst","rate":1.7,"n":5,"color":W},{"t":"pillars","rate":3.4},{"t":"giant","rate":5,"width":40}]},
 {"hue":"blue","draw":"PAPYRUS","flash":"#0000ff","frame":W,"gravity":True,"w":320,"h":130,"dur":16,"mix":[{"t":"spiral","rate":.1,"cx":.12,"speed":100,"color":OR,"color2":W},{"t":"spiral","rate":.1,"cx":.88,"speed":100,"turn":-.31,"color":W,"color2":OR},{"t":"floor","rate":1.1,"speed":160},{"t":"blaster","rate":3.2}]},
 {"hue":"violet","draw":"TORIEL","flash":"#7a1cff","frame":W,"w":320,"h":150,"dur":16,"mix":[{"t":"rain","rate":.1,"speed":120,"size":7,"color":OR,"drift":True},{"t":"spiral","rate":.12,"cx":.5,"arms":2,"speed":90,"color":W,"color2":OR},{"t":"orbit","rate":4.2,"n":18,"radius":110,"color":W,"color2":OR}]},
 {"hue":"orange","draw":"METTATON NEO","flash":"#ff9a2e","frame":W,"soulc":OR,"w":300,"h":150,"dur":16,"mix":[{"t":"beams","rate":1.1,"count":1},{"t":"star","rate":4.4,"n":3,"w":.9},{"t":"burst","rate":1.6,"n":4,"color":W},{"t":"gridblast","n":2,"rate":5,"fire":.8,"color":W}]},
 {"hue":"magenta","draw":"MUFFET","flash":"#ff3df0","frame":W,"soulc":MA,"w":320,"h":120,"dur":16,"mix":[{"t":"strings","rate":.45,"color":MA,"bind":True},{"t":"lanes","rate":.55,"color":W},{"t":"slash","rate":1.8,"count":2,"width":5,"color":MA}]},
 {"hue":"red","draw":"ASGORE","flash":"#ff0000","frame":W,"w":170,"h":170,"dur":16,"mix":[{"t":"fullcol","rate":2.4,"tints":["orange","blue"]},{"t":"orbit","rate":3.6,"n":16,"color":W},{"t":"rain","rate":.3,"speed":130,"size":7,"color":W,"drift":True}]},
 {"hue":"yellow","draw":"???","flash":"#ffe21a","frame":W,"soulc":YE,"rot":.35,"w":180,"h":180,"dur":15,"mix":[{"t":"blasterwall","rate":2.2,"n":3,"sides":["top"]},{"t":"ring","rate":1.5,"n":10,"speed":110,"color":W},{"t":"slash","rate":2.0,"count":2,"width":8,"cross":True,"color":W}]},
 {"hue":"green","draw":"UNDYNE","flash":"#00ff00","frame":W,"soulc":G,"shield":True,"w":110,"h":110,"dur":16,"mix":[{"t":"shieldrain","rate":.42,"speed":190,"color":"#c8ccd0"}]}]
B[8]['hues']=True; B[8]['pats']=ink; B[8]['hard']=ink
# DUSTTRUST phase 3 (concert) + final (plein écran)
V="#b33cff"
B[12]['p3']=[
 {"w":220,"h":170,"rot":.5,"dur":10,"banner":"LIGHTS, CAMERA, ACTION !","mix":[{"t":"comb","rate":1.7,"speed":150,"gap":3,"kinds":["white","orange"]},{"t":"blasterwall","rate":3.0,"n":2,"sides":["left","right"]}]},
 {"w":260,"h":170,"dur":10,"mix":[{"t":"gridblast","n":5,"rate":3.4,"fire":.8,"charge":.9},{"t":"fullcol","rate":3.0,"tints":["blue","orange"]}]},
 {"w":420,"h":130,"soulc":MA,"frame":MA,"dur":11,"banner":"SOLO DE GUITARE","mix":[{"t":"strings","rate":.5,"color":MA},{"t":"lanes","rate":.5,"color":W},{"t":"beams","rate":1.0,"count":1,"tints":["orange","blue"]}]},
 {"w":160,"h":160,"sway":110,"rot":-.4,"dur":10,"mix":[{"t":"star","rate":4.2,"n":2,"w":1.2,"kinds":["blue"]},{"t":"circle","rate":3.4,"n":6,"width":18}]},
 {"w":200,"h":260,"cy":250,"dur":10,"mix":[{"t":"stab","rate":1.1,"sides":["left","right"],"size":44},{"t":"star","rate":4.4,"n":2,"w":1.0},{"t":"giant","rate":3.4,"width":52}]},
 {"w":560,"h":290,"cy":232,"dur":12,"banner":"DIVINE TERROR","mix":[{"t":"fullcol","rate":3.2,"tints":["orange"],"life":.5},{"t":"comb","rate":1.5,"speed":170,"gap":2,"depth":.4},{"t":"gridblast","n":4,"rate":4.0,"fire":.9,"width":30}]},
 {"w":560,"h":290,"cy":232,"dur":12,"mix":[{"t":"orbit","rate":3.0,"n":22,"radius":190,"close":45,"r":9,"color":W,"color2":CY,"hole":4},{"t":"slash","rate":1.6,"count":2,"width":26,"cross":True,"color":MA}]},
 {"w":560,"h":290,"cy":232,"dur":12,"mix":[{"t":"slash","rate":.9,"count":2,"width":4,"color":W},{"t":"beams","rate":.8,"count":2,"tints":["orange"]},{"t":"stab","rate":1.6,"sides":["bottom"],"size":120}]},
 {"w":560,"h":290,"cy":232,"dur":12,"mix":[{"t":"giant","rate":2.2,"width":70},{"t":"spiral","rate":.12,"cx":.5,"cy":.5,"arms":4,"speed":110,"color":W,"color2":OR},{"t":"blasterwall","rate":2.6,"n":4,"sides":["left","right"]}]}]
json.dump(d,io.open('v3/datafiles/data.json','w',encoding='utf-8'),ensure_ascii=False)
