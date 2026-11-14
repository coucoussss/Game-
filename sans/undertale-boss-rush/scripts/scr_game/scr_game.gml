// =====================================================================
//  Fan game Undertale projet - portage GameMaker (GML, GameMaker 2.3 et plus)
//  Tout le jeu est dans ce script. obj_game appelle game_create(),
//  game_step() et game_draw(). Les données (Sans, répliques, attaques)
//  sont lues dans datafiles/data.json, exporté depuis la version navigateur.
// =====================================================================
#macro LB_ONLY false
#macro GAME_TITLE "Les vrais fan games"
#macro DT (1/60)
#macro BCX 320
#macro BCY 302

// ---------- Outils ----------
function opt(o, k, d) {
	if (is_struct(o) && variable_struct_exists(o, k)) { var v = o[$ k]; if (!is_undefined(v)) return v; }
	return d;
}
function rnd(a, b) { return random_range(a, b); }
function pick(a) { return a[irandom(array_length(a) - 1)]; }
function hexc(s) {
	if (!is_string(s)) return c_white;
	if (s == "rainbow") return make_color_hsv(irandom(255), 220, 255);
	s = string_lower(s);
	if (string_char_at(s, 1) != "#") return c_white;
	var h = string_delete(s, 1, 1);
	if (string_length(h) == 3) h = string_char_at(h,1)+string_char_at(h,1)+string_char_at(h,2)+string_char_at(h,2)+string_char_at(h,3)+string_char_at(h,3);
	if (string_length(h) < 6) return c_white;
	var hx = "0123456789abcdef", v = [0, 0, 0];
	for (var i = 0; i < 3; i++) v[i] = (string_pos(string_char_at(h, 1 + i*2), hx) - 1) * 16 + (string_pos(string_char_at(h, 2 + i*2), hx) - 1);
	return make_color_rgb(max(0, v[0]), max(0, v[1]), max(0, v[2]));
}
function flat(a, out) {
	if (is_undefined(a)) return out;
	if (is_string(a)) { array_push(out, a); return out; }
	if (is_array(a)) for (var i = 0; i < array_length(a); i++) flat(a[i], out);
	return out;
}
function segDist(px, py, x1, y1, x2, y2) {
	var dx = x2 - x1, dy = y2 - y1, l = dx*dx + dy*dy, k = 0;
	if (l > 0) k = clamp(((px - x1)*dx + (py - y1)*dy) / l, 0, 1);
	return point_distance(px, py, x1 + k*dx, y1 + k*dy);
}
function rectHitP(b) {
	var nx = clamp(P.x, b.x, b.x + b.w), ny = clamp(P.y, b.y, b.y + b.h);
	return sqr(P.x - nx) + sqr(P.y - ny) < sqr(P.r - 1);
}
function kp(k) {
	if (AUTOTEST) return (k == "ok") ? atOk : false;
	switch (k) {
		case "up":    return keyboard_check_pressed(vk_up) || keyboard_check_pressed(ord("W"));
		case "down":  return keyboard_check_pressed(vk_down) || keyboard_check_pressed(ord("S"));
		case "left":  return keyboard_check_pressed(vk_left) || keyboard_check_pressed(ord("A"));
		case "right": return keyboard_check_pressed(vk_right) || keyboard_check_pressed(ord("D"));
		case "ok":    return keyboard_check_pressed(ord("Z")) || keyboard_check_pressed(vk_enter) || keyboard_check_pressed(vk_space);
		case "back":  return keyboard_check_pressed(ord("X")) || keyboard_check_pressed(vk_escape) || keyboard_check_pressed(vk_backspace) || keyboard_check_pressed(vk_shift);
	}
	return false;
}
function kdr(k) {
	if (abs(scrRot) > 120) { switch (k) { case "up": k = "down"; break; case "down": k = "up"; break; case "left": k = "right"; break; case "right": k = "left"; break; } }
	return kd(k);
}
function kd(k) {
	if (AUTOTEST) return atDir == k;
	switch (k) {
		case "up":    return keyboard_check(vk_up) || keyboard_check(ord("W"));
		case "down":  return keyboard_check(vk_down) || keyboard_check(ord("S"));
		case "left":  return keyboard_check(vk_left) || keyboard_check(ord("A"));
		case "right": return keyboard_check(vk_right) || keyboard_check(ord("D"));
	}
	return false;
}
function fnt(sz) {
	var k = string(sz);
	if (!variable_struct_exists(fonts, k)) fonts[$ k] = font_add(working_directory + "font.ttf", max(6, round(sz * 0.55)), false, false, 32, 382);
	return fonts[$ k];
}
function txt(s, xx, yy, sz, col = c_white, al = "left") {
	draw_set_font(fnt(sz)); draw_set_colour(col);
	draw_set_halign(al == "center" ? fa_center : (al == "right" ? fa_right : fa_left));
	draw_set_valign(fa_top);
	draw_text(xx, yy, s);
	draw_set_halign(fa_left);
}
function txtw(s, xx, yy, sz, col, wid) {
	draw_set_font(fnt(sz)); draw_set_colour(col); draw_set_halign(fa_left); draw_set_valign(fa_top);
	draw_text_ext(xx, yy, s, sz + 6, wid);
}
function setBox(w, h, cxm = BCX, cym = BCY) { box.tw = w; box.th = h; box.tx = cxm - w/2; box.ty = cym - h/2; }
function boxReady() { return abs(box.w - box.tw) < 3 && abs(box.h - box.th) < 3 && abs(box.x - box.tx) < 3 && abs(box.y - box.ty) < 3; }
function spark(xx, yy, n, c, sp, life, g = 0) {
	for (var i = 0; i < n && array_length(PART) < 500; i++) {
		var a = rnd(0, 6.283), v = rnd(.3, 1) * sp;
		array_push(PART, { x: xx, y: yy, vx: cos(a)*v, vy: sin(a)*v, life: rnd(.5, 1)*life, t: 0, c: c, g: g, s: rnd(1.5, 3.5) });
	}
}
function nm(b) { return opt(b, "nm", b.short); }
function isLB(f) { return f.b.short == "LAST BREATH"; }
function hasPhases(f) { return is_array(opt(f.b, "phases", undefined)); }
function edgePoint() {
	var s = irandom(3);
	if (s == 0) return [rnd(box.x, box.x + box.w), box.y + 4];
	if (s == 1) return [rnd(box.x, box.x + box.w), box.y + box.h - 4];
	if (s == 2) return [box.x + 4, rnd(box.y, box.y + box.h)];
	return [box.x + box.w - 4, rnd(box.y, box.y + box.h)];
}
function addB(o) {
	var d = { dead: false, warn: 0, life: 99, vx: 0, vy: 0, harmless: false, tint: "white", color: c_white, splash: false, kind: "rect", w: 10, h: 10, x: 0, y: 0 };
	var names = variable_struct_get_names(o);
	for (var i = 0; i < array_length(names); i++) d[$ names[i]] = o[$ names[i]];
	d.warn0 = d.warn;
	if (d.kind == "blaster") d.t -= .25;
	array_push(B, d);
	return d;
}
function soulCol(f) { var sc0 = opt(f, "soulC", ""); if (sc0 != "") return hexc(sc0); return f.gravity != 0 ? make_color_rgb(20, 60, 255) : c_red; }
function tintCol(tn, base) { if (tn == "blue") return make_color_rgb(20, 169, 255); if (tn == "orange") return make_color_rgb(255, 160, 64); return base; }

// ---------- Musique (les mp3 de Last Breath, convertis en ogg) ----------
function playSong(id_) {
	if (songId == id_) return;
	stopSong(); songId = id_;
	var s = opt(songs, id_, -1);
	if (s != -1) songInst = audio_play_sound(s, 1, true);
}
function stopSong() { if (songInst != -1) audio_stop_sound(songInst); songInst = -1; songId = ""; }
// ---------- Bruitages (datafiles/sfx) ----------
function sfx(n) {
	var s = opt(snd, n, -1);
	if (s == -1) return;
	if (opt(sfxLast, n, -1) == current_time) return; // un seul exemplaire du même son par image
	sfxLast[$ n] = current_time;
	audio_play_sound(s, 5, false);
}
function fightSong() {
	if (is_undefined(fight) || isLB(fight)) return;
	// "song" = tout le combat, "song1" / "song2" = seulement la phase 1 / la phase 2
	var own = opt(fight.b, fight.phase3 ? "song3" : (fight.phase2 ? "song2" : "song1"), "");
	if (own == "") own = opt(fight.b, "song", "");
	if (own != "" && opt(songs, own, -1) != -1) { playSong(own); return; } // musique propre à ce Sans
	playSong(fight.phase2 ? "mus_intense" : "mus_combat");
}

// ---------- Création ----------
function game_create() {
	flashT = 0; flashC = c_white; shieldDir = 0;
	exception_unhandled_handler(function(ex) { var lf = file_text_open_append("crash_log.txt"); file_text_write_string(lf, ex.longMessage + "\n"); file_text_close(lf); show_debug_message(ex.longMessage); game_end(); return 0; });
	game_set_speed(60, gamespeed_fps);
	scrRot = 0; scrRotT = 0; winT = 0; AUTOTEST = false; atOk = false; atDir = "none"; atFrame = 0; atI = 0; atPh = 0; atStop = false; atFF = 0; atShot = 0;
	for (var pi0 = 0; pi0 < parameter_count(); pi0++) if (parameter_string(pi0) == "--autotest") AUTOTEST = true;
	if (AUTOTEST) { game_set_speed(3000, gamespeed_fps); audio_master_gain(0); }
	window_set_caption(GAME_TITLE);
	randomize();
	draw_set_circle_precision(24);
	window_set_size(960, 720);
	fonts = {};
	show_debug_message("GC debut wd=" + working_directory + " browser=" + string(os_browser));
	var buf = buffer_load(working_directory + "data.json");
	show_debug_message("GC buffer_load=" + string(buf) + " exists=" + string(file_exists(working_directory + "data.json")));
	var js = buffer_read(buf, buffer_string);
	buffer_delete(buf);
	D = json_parse(js);
	show_debug_message("GC json ok bosses=" + string(array_length(D.bosses)));
	bosses = D.bosses; MAIN = D.MAIN; LBTXT = D.LBTXT;
	lbI = 0;
	for (var i = 0; i < array_length(bosses); i++) if (bosses[i].short == "LAST BREATH") lbI = i;
	spr = array_create(array_length(bosses), -1);
	for (var i = 0; i < array_length(bosses); i++) {
		var fn = working_directory + "sprites/boss_" + string(i) + ".png";
		if (file_exists(fn)) spr[i] = sprite_add(fn, 1, false, false, 0, 0);
	}
	spr2 = array_create(array_length(bosses), -1);
	for (var i = 0; i < array_length(bosses); i++) { var fnp = working_directory + "sprites/boss_" + string(i) + "_p2.png"; if (file_exists(fnp)) spr2[i] = sprite_add(fnp, 1, false, false, 0, 0); }
	sprA = array_create(array_length(bosses), 0);
	for (var i = 0; i < array_length(bosses); i++) { var la = []; for (var q0 = 0; q0 < 40; q0++) { var fna = working_directory + "sprites/boss_" + string(i) + "_a" + string(q0) + ".png"; if (!file_exists(fna)) break; array_push(la, sprite_add(fna, 1, false, false, 0, 0)); } sprA[i] = la; }
	sprLBA = [[], [], []];
	for (var ph0 = 0; ph0 < 3; ph0++) for (var q2 = 0; q2 < 12; q2++) { var fnl = working_directory + "sprites/lb_" + string(ph0) + "_a" + string(q2) + ".png"; if (!file_exists(fnl)) break; array_push(sprLBA[ph0], sprite_add(fnl, 1, false, false, 0, 0)); }
	sprLB = [-1, -1, -1]; sprGaster = -1;
	for (var i = 0; i < 3; i++) { var fn2 = working_directory + "sprites/lb_" + string(i) + ".png"; if (file_exists(fn2)) sprLB[i] = sprite_add(fn2, 1, false, false, 0, 0); }
	sprBl = [];
	for (var q1 = 0; q1 < 6; q1++) { var fnb = working_directory + "sprites/blaster_" + string(q1) + ".png"; if (!file_exists(fnb)) break; var sb0 = sprite_add(fnb, 1, false, false, 0, 0); sprite_set_offset(sb0, sprite_get_width(sb0)/2, sprite_get_height(sb0)/2); array_push(sprBl, sb0); }
	if (file_exists(working_directory + "sprites/gaster.png")) sprGaster =sprite_add(working_directory + "sprites/gaster.png", 1, false, false, 0, 0);
	POSEMAP = { bones: "raise", floor: "raise", stab: "raise", zone: "raise", rain: "raise", slam: "down", blaster: "point", giant: "point", grid: "point", beams: "point", chase: "point", echo: "point", burst: "point", strings: "point", target: "point", lanes: "point",
		blasterwall: "spread", spin: "spread", circle: "spread", ring: "spread", tunnel: "spread", tide: "spread", slash: "sweep", eels: "sweep", tentacle: "sweep", comb: "raise", diag: "sweep" };
	songs = {}; songId = ""; songInst = -1; muted = false;
	var ids = ["LB1", "LB15", "LB2", "LB"];
	ids = ["LB1", "LB15", "LB2", "LB", "mus_menu", "mus_combat", "mus_intense"];
	for (var i = 0; i < array_length(ids); i++) { var fn3 = working_directory + "music/" + ids[i] + ".ogg"; if (file_exists(fn3)) songs[$ ids[i]] = audio_create_stream(fn3); }
	for (var i = 0; i < array_length(bosses); i++) { // musiques propres (champ "song" dans data.json -> music/<song>.ogg)
		var fields = ["song", "song1", "song2", "song3"];
		for (var q = 0; q < 4; q++) { var sg = opt(bosses[i], fields[q], "");
			if (sg != "" && file_exists(working_directory + "music/" + sg + ".ogg")) songs[$ sg] = audio_create_stream(working_directory + "music/" + sg + ".ogg"); }
	}
	snd = {}; sfxLast = {};
	var sids = ["move", "select", "text", "hurt", "hit", "slash", "charge", "fire", "phase", "dust", "heal"];
	for (var i = 0; i < array_length(sids); i++) { var fn4 = working_directory + "sfx/" + sids[i] + ".ogg"; if (file_exists(fn4)) snd[$ sids[i]] = audio_create_stream(fn4); }
	LBPATS = lbPats();
	LBDLG1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, -1, -1, -1];
	LBDLG2 = [1, 2, 3, -1, 4, 5, -1, 6, 7, -1, 8, -1, 9, 10, -1, -1, -1];
	scene = "title"; tsel = 0; sel = 0; psel = 0; t = 0; shake = 0; winRes = "";
	P = { x: BCX, y: BCY, r: 6, hp: 30, max: 30, inv: 0, kr: 0, krT: 0, vy: 0, moving: false, bound: 0 };
	box = { x: 40, y: 237, w: 560, h: 130, tx: 40, ty: 237, tw: 560, th: 130 };
	B = []; PART = []; fight = undefined; dlg = undefined; banner = undefined; surf = -1;
	hitstop = 0; hitCd = 0; hurtFlash = 0; bossFlash = 0; fadeA = 1; lastScene = "title"; loseT = 0; loseCrack = false; loseShard = false; TRAIL = []; STARS = [];
	for (var si = 0; si < 70; si++) array_push(STARS, { x: rnd(0, 640), y: rnd(0, 480), v: rnd(8, 34), s: choose(1, 1, 2, 2, 3), ph: rnd(0, 6.28) });
	paused = false; pauseSel = 0; marathon = false; maraN = 0; maraT = 0; runT = 0; runHits = 0; osel = 0; credY = 0; newRec = false; wipeArm = false;
	OPT = { vol: 10, shake: true, full: false };
	REC = {};
	loadSave(); applyOpt();
	if (OPT.full && !AUTOTEST) window_set_fullscreen(true);
	LBMENU = [["PHASE 1", "« Not a Slacker Anymore »", "Sans intact, il esquive tout"],
	          ["PHASE 2", "« The Slaughter Continues »", "Sans entaillé, il bloque à l'os"],
	          ["PHASE 3", "« An Enigmatic Encounter »", "Gaster derrière lui, survie sans menu"]];
}

// ---------- Attaques de Last Breath (refaites avec la bibliothèque d'attaques) ----------
function lbPats() {
	// Ordre et forme des attaques relevés sur la vidéo du combat complet. chain = enchaîne sans tour du joueur, rot = rotation de l'écran, sway = la boîte bouge
	var p1 = [
		{ w: 240, h: 180, mix: [{ t: "bones", rate: .9, speed: 175 }, { t: "blaster", rate: 2.0, n: 2 }] },
		{ w: 230, h: 200, gravity: true, mix: [{ t: "comb", rate: 1.7, speed: 125, gap: 3 }] },
		{ w: 290, h: 170, gravity: true, mix: [{ t: "bones", rate: 1.0, speed: 160, kinds: ["white", "blue"] }, { t: "blaster", rate: 2.6, n: 2 }] },
		{ w: 290, h: 170, gravity: true, mix: [{ t: "bones", rate: .9, speed: 170, gap: 58 }] },
		{ w: 300, h: 170, gravity: true, mix: [{ t: "floor", rate: .55, speed: 150, min: 14, max: 30 }, { t: "comb", rate: 2.6, speed: 140, gap: 4, depth: .5 }] },
		{ w: 300, h: 170, gravity: true, mix: [{ t: "floor", rate: .55, speed: 160, kinds: ["white", "blue"] }, { t: "comb", rate: 2.8, speed: 150, gap: 4, depth: .5 }] },
		{ w: 270, h: 200, gravity: true, mix: [{ t: "stab", rate: 1.3, sides: ["top", "bottom"], size: 30 }, { t: "slam", rate: 3.0, dirs: [0, 1] }, { t: "blaster", rate: 2.6 }] },
		{ w: 240, h: 240, mix: [{ t: "spin", rate: 4.5, w: 1.4 }, { t: "blaster", rate: 2.0, n: 2 }] },
		{ w: 310, h: 170, gravity: true, mix: [{ t: "circle", rate: 2.6, n: 3, stagger: .15, width: 20 }, { t: "floor", rate: .9, speed: 150 }] },
		{ w: 290, h: 170, gravity: true, mix: [{ t: "bones", rate: .85, speed: 170, kinds: ["white", "orange"], gap: 60 }] },
		{ w: 230, h: 230, mix: [{ t: "rain", rate: .2, speed: 175, size: 10, shape: "bonev" }] },
		{ w: 300, h: 200, mix: [{ t: "circle", rate: 1.8, n: 3, stagger: .12, width: 22 }, { t: "blaster", rate: 2.2 }] },
		{ w: 280, h: 170, gravity: true, mix: [{ t: "floor", rate: .7, speed: 200, min: 14, max: 56 }, { t: "comb", rate: 2.6, speed: 140, gap: 4, depth: .5 }] },
		{ w: 230, h: 230, mix: [{ t: "stab", rate: 1.0, sides: ["top", "bottom"], size: 54 }] },
		{ w: 240, h: 240, gravity: true, mix: [{ t: "stab", rate: 1.2, sides: ["top", "bottom", "left", "right"], size: 26 }, { t: "slam", rate: 2.0, dirs: [0, 1, 2, 3] }] },
		{ w: 300, h: 180, gravity: true, mix: [{ t: "floor", rate: .55, speed: 170 }, { t: "comb", rate: 2.2, speed: 150, gap: 4, depth: .55 }] },
		{ w: 280, h: 200, mix: [{ t: "blaster", rate: 1.3, n: 1, charge: .8, width: 24 }, { t: "blaster", rate: 1.7, n: 1, charge: .6, width: 18 }] },
		{ w: 240, h: 230, mix: [{ t: "blasterwall", rate: 2.4, n: 5, sides: ["top", "left"] }, { t: "bones", rate: .8, speed: 170, gap: 64 }] },
		// attaque finale de la phase 1 : blaster, tunnel d'os, cercle de blasters, œil bleu
		{ w: 280, h: 170, gravity: true, chain: true, dur: 5, banner: "ÂME BLEUE", mix: [{ t: "giant", rate: 2.0 }, { t: "blaster", rate: 1.6 }] },
		{ w: 560, h: 150, chain: true, dur: 9, mix: [{ t: "tunnel", color: "#e9ecf5" }, { t: "blaster", rate: 2.0 }] },
		{ w: 230, h: 230, chain: true, dur: 12, banner: "CERCLE DE BLASTERS", mix: [{ t: "circle", rate: 3.0, n: 18, stagger: .09, width: 20 }] },
		{ w: 250, h: 220, gravity: true, dur: 12, banner: "ŒIL BLEU", mix: [{ t: "slam", rate: 1.2, dirs: [0, 1, 2, 3] }, { t: "stab", rate: 1.4, sides: ["top", "bottom", "left", "right"], size: 26 }, { t: "blaster", rate: 1.8 }] }
	];
	var p2 = [
		{ w: 240, h: 200, gravity: true, mix: [{ t: "comb", rate: 1.6, speed: 135, gap: 3 }, { t: "bones", rate: 1.1, speed: 170, kinds: ["white", "blue"] }] },
		{ w: 290, h: 170, gravity: true, rot: 180, mix: [{ t: "bones", rate: .85, speed: 175, kinds: ["blue", "orange"], gap: 60 }, { t: "floor", rate: .9, speed: 170 }] },
		{ w: 210, h: 260, rot: 180, mix: [{ t: "circle", rate: 2.0, n: 4, stagger: .15, width: 22 }, { t: "stab", rate: 1.8, sides: ["left", "right"], size: 26 }] },
		{ w: 260, h: 190, gravity: true, mix: [{ t: "giant", rate: 2.4 }, { t: "comb", rate: 2.0, speed: 150, gap: 3 }] },
		{ w: 240, h: 240, mix: [{ t: "stab", rate: .9, sides: ["top", "bottom"], size: 60 }, { t: "comb", rate: 2.2, speed: 140, gap: 4, depth: .5 }] },
		{ w: 280, h: 190, gravity: true, rot: 180, mix: [{ t: "blasterwall", rate: 2.2, n: 8, sides: ["bottom"] }, { t: "diag", rate: .9, speed: 150 }] },
		{ w: 300, h: 170, gravity: true, mix: [{ t: "stab", rate: 1.2, sides: ["top", "bottom"], size: 30 }, { t: "floor", rate: .6, speed: 190, kinds: ["white", "blue"] }] },
		{ w: 250, h: 250, rot: 180, mix: [{ t: "circle", rate: 1.8, n: 6, stagger: .1, width: 22 }, { t: "blaster", rate: 1.8, n: 2 }] },
		{ w: 260, h: 210, mix: [{ t: "bones", rate: .9, speed: 190, kinds: ["blue", "white"], gap: 62 }, { t: "blasterwall", rate: 2.3, n: 7, sides: ["left", "top"] }] },
		{ w: 300, h: 190, gravity: true, rot: 180, mix: [{ t: "floor", rate: .6, speed: 190 }, { t: "blaster", rate: 1.6, n: 2 }] },
		{ w: 240, h: 240, mix: [{ t: "stab", rate: .8, sides: ["top", "bottom"], size: 62 }, { t: "blaster", rate: 1.8 }] },
		{ w: 300, h: 180, gravity: true, mix: [{ t: "diag", rate: .8, speed: 160 }, { t: "bones", rate: 1.0, speed: 180, kinds: ["orange", "white"], gap: 60 }] },
		{ w: 250, h: 240, rot: 180, mix: [{ t: "beams", rate: .6, count: 3 }, { t: "circle", rate: 2.2, n: 5, stagger: .12, width: 22 }] },
		// attaque finale de la phase 2 : pluie de blasters, œil jaune, écran retourné
		{ w: 250, h: 220, chain: true, dur: 8, banner: "DERNIÈRE ATTAQUE", mix: [{ t: "blasterwall", rate: 1.8, n: 6, sides: ["top"] }, { t: "blaster", rate: 1.8 }] },
		{ w: 250, h: 230, chain: true, dur: 8, mix: [{ t: "circle", rate: 1.8, n: 8, stagger: .1, width: 22 }, { t: "blaster", rate: 2.0, n: 2 }] },
		{ w: 290, h: 170, gravity: true, rot: 180, chain: true, dur: 10, banner: "ŒIL JAUNE", mix: [{ t: "bones", rate: .7, speed: 195, kinds: ["blue", "orange"], gap: 58 }, { t: "floor", rate: .8, speed: 190 }, { t: "slam", rate: 2.6, dirs: [0] }] },
		{ w: 240, h: 240, dur: 12, mix: [{ t: "circle", rate: 1.4, n: 12, stagger: .08, width: 24 }, { t: "blasterwall", rate: 2.0, n: 7, sides: ["top", "left"] }, { t: "blaster", rate: 1.4, n: 2 }] }
	];
	var p3 = [
		{ w: 250, h: 200, mix: [{ t: "blaster", rate: 1.0, n: 3 }, { t: "bones", rate: 1.0, speed: 190, kinds: ["blue", "orange", "white"] }] },
		{ w: 280, h: 180, gravity: true, mix: [{ t: "bones", rate: .75, speed: 195, gap: 56 }, { t: "comb", rate: 2.0, speed: 150, gap: 3 }] },
		{ w: 290, h: 180, gravity: true, sway: 90, mix: [{ t: "bones", rate: .8, speed: 175, kinds: ["white", "blue"], gap: 58 }] },
		{ w: 290, h: 180, gravity: true, rot: 40, mix: [{ t: "bones", rate: .8, speed: 185, gap: 58 }, { t: "floor", rate: 1.0, speed: 175 }] },
		{ w: 240, h: 240, mix: [{ t: "circle", rate: 2.0, n: 3, stagger: .1, width: 22 }, { t: "blaster", rate: 1.6, n: 2 }] },
		{ w: 300, h: 170, gravity: true, mix: [{ t: "floor", rate: .55, speed: 210, kinds: ["white", "blue", "orange"] }, { t: "comb", rate: 2.2, speed: 160, gap: 3, depth: .5 }] },
		{ w: 250, h: 250, mix: [{ t: "blasterwall", rate: 2.4, n: 5, sides: ["top", "left"] }, { t: "circle", rate: 2.4, n: 6, stagger: .08, width: 18 }] },
		{ w: 270, h: 200, mix: [{ t: "bones", rate: .6, speed: 215, gap: 62, teleport: true }, { t: "blaster", rate: 1.8 }] },
		{ w: 280, h: 200, gravity: true, rot: 180, mix: [{ t: "stab", rate: 1.0, sides: ["top", "bottom"], size: 40 }, { t: "comb", rate: 2.0, speed: 150, gap: 3 }] },
		{ w: 260, h: 230, mix: [{ t: "giant", rate: 1.8 }, { t: "giant", rate: 2.3 }, { t: "blasterwall", rate: 2.8, n: 3, sides: ["top"] }] },
		{ w: 300, h: 200, mix: [{ t: "blaster", rate: 1.2, n: 3 }, { t: "tunnel", color: "#e9ecf5" }] },
		{ w: 300, h: 180, gravity: true, mix: [{ t: "stab", rate: 1.1, sides: ["top", "bottom"], size: 34 }, { t: "floor", rate: .6, speed: 205 }, { t: "blaster", rate: 1.8 }] },
		{ w: 250, h: 250, rot: 20, glyphs: true, dur: 11, mix: [{ t: "tentacle", rate: 1.4, width: 34, color: "#f2f2f2", edge: "#8a8a8a" }, { t: "rain", rate: .16, speed: 165, size: 7, color: "#ffffff" }, { t: "beams", rate: 2.2, count: 1 }] },
		{ w: 240, h: 230, cx: 190, cy: 210, dur: 10, banner: "DERNIÈRE ATTAQUE", mix: [{ t: "blasterwall", rate: 2.2, n: 7, sides: ["left", "top"] }, { t: "circle", rate: 2.2, n: 10, stagger: .09, width: 22 }, { t: "bones", rate: .8, speed: 200 }] }
	];
	return [p1, p2, p3];
}

// ---------- Boss rush : choix de la phase ----------
function rushOpts(b) {
	if (b.short == "LAST BREATH") return LBMENU;
	var o = [["PHASE 1", "Début du combat", "PV pleins, attaques normales"]];
	var hd = opt(b, "hard", []);
	if (!is_undefined(opt(b, "p2", undefined)) && is_array(hd) && array_length(hd) > 0) array_push(o, ["PHASE 2", "Moitié des PV", "Il ne retient plus ses coups"]);
	if (opt(b, "song3", "") != "") array_push(o, ["PHASE 3", "Dernier quart des PV", "Il jette ses dernières forces"]);
	return o;
}
function newFight(i) {
	var b = bosses[i];
	fight = { i: i, b: b, hp: b.hp, max: b.hp, phase2: false, ketchup: 3, talkBonus: 1, talkN: 0, pidx: 0, turn: 0, state: "dialog",
		pat: undefined, patT: 0, atk: undefined, menuSel: 0, flavor: pick(b.flavor), fc: 0, ph: 0, cur: undefined, lbTired: false,
		lbSaid: false, surv: 0, lbLast: false, over: "", startPh: 0, res: undefined, resTxt: "", enemyShake: 0, dodge: 0,
		redOn: false, phase3: false, gravDir: 0, gravT: 0, animT: -1, poseI: 0, poseT: 0, gravity: 0, slam: false, invert: false, level: undefined, levelColor: c_black, levelEdge: c_white };
	if (isLB(fight)) { fight.max = 60; fight.hp = 60; fight.cur = LBPATS[0]; }
	runT = 0; runHits = 0; paused = false;
	P.max = opt(b, "kr", false) ? 92 : 30; P.hp = P.max; P.inv = 0; P.kr = 0; P.vy = 0; P.bound = 0; B = []; banner = undefined;
	setBox(560, 130); box.x = box.tx; box.y = box.ty; box.w = box.tw; box.h = box.th;
	scene = "fight";
	if (isLB(fight)) { playSong("LB1"); say(LBTXT.intro, "menu"); }
	else { fightSong(); say(b.intro, "menu"); }
}
function rushStart(i, ph) {
	newFight(i); fight.startPh = ph;
	if (ph == 0) return;
	var f = fight, b = f.b; dlg = undefined;
	if (isLB(f)) {
		for (var k = 0; k < ph; k++) { f.ph = k + 1; f.phase2 = true; f.cur = LBPATS[k + 1]; }
		f.pidx = 0; f.hp = f.max; P.hp = P.max; P.kr = 0;
		if (ph == 1) {
			playSong("LB2");
			var L = ["*:Sans s'est relevé avec une fraction de point de vie. Une entaille rouge barre sa veste."];
			say(flat(LBTXT.p2[0], L), "menu");
		} else {
			f.surv = array_length(LBPATS[2]); playSong("LB");
			say(b.phases[1].say, "phase_p3");
		}
		return;
	}
	f.phase2 = true; f.pidx = 0; f.phase3 = (ph >= 2); f.hp = ceil(f.max / (ph >= 2 ? 4 : 2)); fightSong();
	say(b.p2, "enemy");
}

// ---------- Sauvegarde, options, records, marathon ----------
function loadSave() {
	if (!file_exists("save.json")) return;
	try {
		var fh = file_text_open_read("save.json"); var js0 = file_text_read_string(fh); file_text_close(fh);
		var d0 = json_parse(js0);
		var o0 = opt(d0, "opt", undefined);
		if (is_struct(o0)) { OPT.vol = clamp(opt(o0, "vol", 10), 0, 10); OPT.shake = opt(o0, "shake", true) ? true : false; OPT.full = opt(o0, "full", false) ? true : false; }
		var r0 = opt(d0, "rec", undefined);
		if (is_struct(r0)) REC = r0;
	} catch (e0) { REC = {}; }
}
function saveGame() {
	if (AUTOTEST) return;
	var fh = file_text_open_write("save.json"); file_text_write_string(fh, json_stringify({ opt: OPT, rec: REC })); file_text_close(fh);
}
function applyOpt() { if (!AUTOTEST) audio_master_gain(muted ? 0 : OPT.vol/10); }
function fmtTime(sec) { var m0 = floor(sec/60), s0 = floor(sec) mod 60; return string(m0) + ":" + (s0 < 10 ? "0" : "") + string(s0); }
function recOf(k) {
	var r = opt(REC, k, undefined);
	if (!is_struct(r)) return { wins: 0, best: -1, hits: -1 };
	return { wins: opt(r, "wins", 0), best: opt(r, "best", -1), hits: opt(r, "hits", -1) };
}
function onWin() {
	newRec = false;
	if (AUTOTEST) return;
	var f = fight;
	if (marathon) maraN += 1;
	if (f.startPh != 0) return;
	var r = recOf(f.b.short);
	r.wins += 1;
	if (r.best < 0 || runT < r.best) { r.best = runT; newRec = true; }
	if (r.hits < 0 || runHits < r.hits) r.hits = runHits;
	REC[$ f.b.short] = r; saveGame();
}
function startMarathon() { marathon = true; maraN = 0; maraT = 0; rushStart(0, 0); }
function endMarathon() {
	var r = opt(REC, "_marathon", undefined), bn = -1, bt = -1;
	if (is_struct(r)) { bn = opt(r, "n", -1); bt = opt(r, "time", -1); }
	newRec = (maraN > bn) || (maraN == bn && maraT < bt);
	if (newRec) { REC[$ "_marathon"] = { n: maraN, time: maraT }; saveGame(); }
	marathon = false; stopSong(); scene = "maraend";
}
function stepPause() {
	var n = marathon ? 2 : 3;
	if (kp("up")) { pauseSel = (pauseSel + n - 1) mod n; sfx("move"); }
	if (kp("down")) { pauseSel = (pauseSel + 1) mod n; sfx("move"); }
	if (!kp("ok")) return;
	sfx("select"); paused = false;
	if (pauseSel == 0) return;
	if (!marathon && pauseSel == 1) { rushStart(fight.i, fight.startPh); return; }
	patEnd(); B = []; stopSong();
	if (marathon) endMarathon(); else scene = "select";
}

// ---------- Dialogues ----------
function say(lines, th) {
	dlg = { lines: flat(lines, []), i: 0, c: 0, th: th };
	if (array_length(dlg.lines) == 0) { dlg = undefined; doThen(th); return; }
	if (!is_undefined(fight)) fight.state = "dialog";
	setBox(560, 130);
}
function lineSpeaker(L) {
	var p = string_copy(L, 1, 2);
	if (p == "*:") return "*";
	if (p == "S:") return "SANS";
	if (p == "G:") return "GASTER";
	return nm(fight.b);
}
function lineText(L) {
	var p = string_copy(L, 1, 2);
	if (p == "*:" || p == "S:" || p == "G:") return string_delete(L, 1, 2);
	return L;
}
function doThen(th) {
	switch (th) {
		case "menu": toMenu(); break;
		case "enemy": startEnemy(); break;
		case "finish_kill": scene = "win"; winRes = "kill"; winT = 0; onWin(); break;
		case "finish_spare": scene = "win"; winRes = "spare"; onWin(); break;
		case "lb_death": fight.hp = 0; phaseUp(); break;
		case "phase_p2": playSong("LB2"); toMenu(); break;
		case "phase_p3": P.hp = P.max; P.kr = 0; shake = 10; startEnemy(); break;
		case "lb_final": fight.state = "attack"; fight.atk = { x: 0, done: false, t: 0 }; setBox(560, 130); break;
	}
}
function toMenu() {
	var f = fight; f.state = "menu"; f.fc = 0;
	if (isLB(f)) {
		var F = [LBTXT.p1flavor, LBTXT.p2flavor, LBTXT.p3flavor][min(2, f.ph)];
		f.flavor = (f.lbTired && f.ph == 0) ? "Sans t'épargne. (PITIÉ pour l'épargner, ATTAQUE pour le frapper)" : F[min(array_length(F) - 1, f.pidx)];
	} else if (f.talkN >= 2) f.flavor = nm(f.b) + " n'a plus envie de se battre. (PITIÉ pour l'épargner)";
	else f.flavor = pick(f.b.flavor);
	setBox(560, 130);
}
function startEnemy() {
	var f = fight;
	if (isLB(f) && !f.lbSaid && f.over == "") {
		var Ls = undefined;
		if (f.ph == 0 && f.pidx < array_length(LBDLG1) && LBDLG1[f.pidx] >= 0) { Ls = LBTXT.p1[LBDLG1[f.pidx]]; if (LBDLG1[f.pidx] == 18) Ls = flat([LBTXT.p1[18], LBTXT.p1[19]], []); }
		else if (f.ph == 1 && f.pidx < array_length(LBDLG2) && LBDLG2[f.pidx] >= 0) Ls = LBTXT.p2[LBDLG2[f.pidx]];
		if (!is_undefined(Ls)) { f.lbSaid = true; say(Ls, "enemy"); return; }
	}
	f.lbSaid = false; f.dodge = 0;
	var list = f.cur;
	if (is_undefined(list)) { list = f.b.pats; var hd = opt(f.b, "hard", []); if (f.phase2 && is_array(hd) && array_length(hd) > 0) list = hd; }
	if (f.phase3) { var h3 = opt(f.b, "p3", []); if (is_array(h3) && array_length(h3) > 0) list = h3; }
	var spec = list[f.pidx mod array_length(list)];
	if (opt(f.b, "hues", false) && opt(f, "hue", -1) >= 0) { // Ink : la zone de couleur touchée sur la cible choisit la teinte du tour
		var HN = ["green", "blue", "violet", "magenta", "red", "orange", "yellow"], hn = HN[f.hue], cand = [], wantDraw = (f.phase2 && f.turn mod 3 == 2), hi;
		for (hi = 0; hi < array_length(list); hi++) if (opt(list[hi], "hue", "") == hn && ((opt(list[hi], "draw", "") != "") == wantDraw)) array_push(cand, list[hi]);
		if (array_length(cand) == 0) for (hi = 0; hi < array_length(list); hi++) if (opt(list[hi], "hue", "") == hn && opt(list[hi], "draw", "") == "") array_push(cand, list[hi]);
		if (array_length(cand) > 0) spec = cand[f.pidx mod array_length(cand)];
	}
	f.pidx++;
	var tier = min(MAIN - 1, f.i) / (MAIN - 1) * .5;
	var lv = tier + (f.phase2 ? .8 : 0) + (f.phase3 ? .5 : 0) + (f.turn >= 3 ? .4 : 0) + f.ph * .22;
	if (isLB(f)) lv = .3 + f.ph * .35;
	f.pat = makePattern(spec, lv); f.patT = 0; bossAnim(); f.state = "boxing"; B = [];
	setBox(f.pat.w, f.pat.h, opt(spec, "cx", BCX), opt(spec, "cy", BCY));
	P.x = BCX; P.y = BCY; f.turn++;
}
function phaseUp() {
	var f = fight, phd = f.b.phases[f.ph];
	f.ph++; f.phase2 = true; f.cur = LBPATS[min(2, f.ph)]; f.pidx = 0; f.hp = f.max; f.dodge = 0; f.lbTired = false;
	if (f.ph == 2) f.surv = array_length(LBPATS[2]);
	playSong(f.ph == 1 ? "LB15" : "LB"); sfx("phase");
	P.hp = min(P.max, P.hp + 25); P.kr = min(P.kr, max(0, P.hp - 1)); shake = 14; if (f.ph == 1) banner = { txt: "HP: Restored   ITEMS: Restored", t: 3 }; if (f.ph == 2) banner = { txt: "NO EFFECT", t: 3 };
	spark(320, 100, 60, make_color_rgb(255, 64, 64), 320, .9, 200); spark(320, 100, 40, c_white, 260, .8, 200);
	say(phd.say, f.ph == 1 ? "phase_p2" : "phase_p3");
}

// ---------- Motifs d'attaque ----------
function makePattern(spec, lv) {
	var p = { spec: spec, lv: lv, dur: opt(spec, "dur", 7), w: opt(spec, "w", 240), h: opt(spec, "h", 180), subs: [] };
	var mix = opt(spec, "mix", []);
	for (var i = 0; i < array_length(mix); i++) array_push(p.subs, { o: mix[i], t: mix[i].t, n: 0, q: [], ph: rnd(0, 6) });
	return p;
}
function patInit(p) {
	var s, i, spec = p.spec;
	for (i = 0; i < array_length(p.subs); i++) {
		s = p.subs[i];
		switch (s.t) {
			case "slam": s.n = 1.4; break;
			case "blasterwall": s.n = .7; break; case "giant": s.n = 1.1; break; case "spin": s.n = .5; break;
			case "zone": s.n = .8; break; case "circle": s.n = .7; break; case "rain": s.n = 0; break; case "tunnel": s.n = 0; break;
			case "eels": case "lanes": case "echo": case "burst": case "stab": s.n = .4; break;
			case "bones": case "grid": case "strings": case "blaster": case "floor": s.n = .2; break;
			case "tide": s.n = 0; fight.levelColor = hexc(opt(s.o, "color", "#0d2a27")); fight.levelEdge = hexc(opt(s.o, "edge", "#2fae96")); fight.level = box.y + box.h; break;
			default: s.n = .3;
		}
	}
	var gv = opt(spec, "gravity", false);
	if (gv) { fight.gravity = (is_bool(gv) || gv == 1) ? 1 : gv; P.vy = 0; fight.gravDir = opt(spec, "gdir", 0); fight.gravT = 0; if (fight.turn <= 2) banner = { txt: "ÂME BLEUE : HAUT POUR SAUTER", t: 2 }; }
	if (opt(spec, "invert", false)) { fight.invert = true; banner = { txt: "COMMANDES INVERSÉES", t: 1.6 }; }
	scrRotT = opt(spec, "rot", 0);
	fight.frameC = hexc(opt(spec, "frame", "#ffffff")); fight.soulC = opt(spec, "soulc", ""); fight.shield = opt(spec, "shield", false); shieldDir = 1;
	var dr = opt(spec, "draw", ""); fight.drawn = dr; if (dr != "") { flashT = .55; flashC = hexc(opt(spec, "flash", "#ffffff")); sfx("phase"); banner = { txt: "INK DESSINE : " + dr, t: 2.6 }; }
	var bn = opt(spec, "banner", ""); if (bn != "") banner = { txt: bn, t: 2.4 };
}
function patEnd() { fight.redOn = false; fight.frameC = c_white; fight.soulC = ""; fight.shield = false; fight.drawn = ""; scrRotT = 0; fight.slam = false; fight.gravDir = 0; fight.gravT = 0; fight.invert = false; fight.level = undefined; fight.gravity = 0; P.bound = 0; }
function animFrames(f) { return isLB(f) ? sprLBA[min(2, f.ph)] : sprA[f.i]; }
function bossAnim() { if (!is_undefined(fight) && is_undefined(opt(fight.b, "poses", undefined))) fight.animT = 0; }
// Pose du bras choisie selon l'attaque qui vient de partir (champ "poses" du Sans dans data.json : catégorie -> numéros d'images)
function bossPose(tp) {
	var f = fight; if (is_undefined(f)) return;
	var tbl = opt(f.b, "poses", undefined); if (is_undefined(tbl)) return;
	var frames = animFrames(f); if (array_length(frames) == 0) return;
	var cat = opt(POSEMAP, tp, "point"), order = [cat, "point", "raise", "sweep", "spread"];
	for (var i = 0; i < 5; i++) {
		var l = opt(tbl, order[i], []);
		if (is_array(l) && array_length(l) > 0) { f.poseI = min(array_length(frames) - 1, l[irandom(array_length(l) - 1)]); f.poseT = (tp == "blaster" || tp == "giant" || tp == "slash") ? .8 : .5; return; }
	}
}
function patUpdate(p, tt) {
	if (floor(tt/1.5) != floor((tt - DT)/1.5)) bossAnim();
	for (var i = 0; i < array_length(p.subs); i++) subUpdate(p.subs[i], p.lv, tt);
	var sw = opt(p.spec, "sway", 0); if (sw > 0) setBox(p.w, p.h, BCX + sin(tt*1.3)*sw, BCY + sin(tt*.9 + 1)*sw*.25);
	if (opt(p.spec, "shrink", false)) { var k = 1 - .35 * min(1, tt / p.dur); setBox(p.w * k, p.h * k); }
}
function subUpdate(s, lv, tt) {
	var o = s.o, i, j, n, a, sp, sz, c, side, N, k, ep, xx, yy, dir, cnt, tn, L;
	if (s.t == "tide") {
		if (opt(o, "wave", false)) fight.level = box.y + box.h*.62 + sin(tt*1.8)*box.h*.25;
		else fight.level = lerp(box.y + box.h, box.y + box.h*(.5 - lv*.06), min(1, tt/3.5)) + sin(tt*3)*4;
		if (opt(o, "bubbles", true) == false) return;
		s.n -= DT; if (s.n <= 0) { s.n = max(.15, .35 - lv*.07); addB({ kind: "bubble", x: rnd(box.x + 8, box.x + box.w - 8), y: box.y + box.h, vy: -rnd(70, 110) - lv*20, r: rnd(5, 9), wob: rnd(0, 6), color: fight.levelEdge }); }
		return;
	}
	if (s.t == "echo") {
		var keep = [];
		for (i = 0; i < array_length(s.q); i++) { var e = s.q[i]; e.t -= DT;
			if (e.t > 0) array_push(keep, e); else addB({ x: e.x, y: box.y, w: 22, h: box.h, warn: .3, life: .3, kind: "beam", color: hexc(opt(o, "color", "#6fd0ff")) }); }
		s.q = keep;
	}
	s.n -= DT; if (s.n > 0) return;
	bossPose(s.t);
	c = hexc(opt(o, "color", "#ffffff"));
	switch (s.t) {
	case "comb":
		s.n = max(1.1, opt(o, "rate", 1.8) - lv*.2); N = opt(o, "cols", 9); var gp = irandom(N - opt(o, "gap", 3)), gw = opt(o, "gap", 3), cw = box.w/N, hh = box.h*opt(o, "depth", .62), cs = opt(o, "speed", 120) + lv*20;
		for (i = 0; i < N; i++) { if (i >= gp && i < gp + gw) continue;
			addB({ x: box.x + i*cw + cw/2 - 5, y: box.y - hh, w: 10, h: hh, vy: cs, vx: 0, life: (box.h + hh)/cs + .6, color: c, kind: "bonev", tint: pick(opt(o, "kinds", ["white"])) }); }
		break;
	case "diag":
		s.n = max(.5, opt(o, "rate", .9) - lv*.12); dir = choose(1, -1); var dl = box.h*.85, dv = opt(o, "speed", 150) + lv*20, dx0 = (dir > 0) ? box.x - 12 : box.x + box.w + 12;
		addB({ kind: "line", x1: dx0, y1: box.y + box.h*.08, x2: dx0 + dir*dl*.5, y2: box.y + box.h*.08 + dl, wd: 12, vx: dir*dv, vy: 0, warn: 0, life: (box.w + 80)/dv + .4, color: c, edge: c });
		break;
	case "slam":
		s.n = opt(o, "rate", 2.6);
		if (fight.gravity != 0) { fight.gravDir = pick(opt(o, "dirs", [0])); fight.gravT = 0; P.vy = 13; fight.slam = true; bossPose("slam"); }
		break;
	case "blasterwall":
		s.n = max(2.3, opt(o, "rate", 3.4) - lv*.25); side = pick(opt(o, "sides", ["top", "left"])); N = opt(o, "n", 6); var g = irandom(N - 1);
		for (i = 0; i < N; i++) { if (i == g) continue;
			if (side == "top") addB({ kind: "blaster", x: box.x + (i + .5)/N*box.w, y: box.y - 44, ang: pi/2, t: 0, charge: .95, fire: .4, wd: box.w/N + 2, sc: .8, color: c });
			else if (side == "bottom") addB({ kind: "blaster", x: box.x + (i + .5)/N*box.w, y: box.y + box.h + 44, ang: -pi/2, t: 0, charge: .95, fire: .4, wd: box.w/N + 2, sc: .8, color: c });
			else if (side == "right") addB({ kind: "blaster", x: box.x + box.w + 44, y: box.y + (i + .5)/N*box.h, ang: pi, t: 0, charge: .95, fire: .4, wd: box.h/N + 2, sc: .8, color: c });
			else addB({ kind: "blaster", x: box.x - 44, y: box.y + (i + .5)/N*box.h, ang: 0, t: 0, charge: .95, fire: .4, wd: box.h/N + 2, sc: .8, color: c }); }
		break;
	case "giant":
		s.n = max(2.6, opt(o, "rate", 3.4) - lv*.2); var wd = opt(o, "width", 64);
		if (random(1) < .5) addB({ kind: "blaster", x: box.x + box.w/2 + rnd(-box.w*.25, box.w*.25), y: box.y - 56, ang: pi/2, t: 0, charge: 1.15, fire: .5, wd: wd, sc: 1.9, color: c });
		else addB({ kind: "blaster", x: box.x - 56, y: box.y + box.h/2 + rnd(-box.h*.2, box.h*.2), ang: 0, t: 0, charge: 1.15, fire: .5, wd: min(wd, box.h*.5), sc: 1.9, color: c });
		break;
	case "spin":
		s.n = opt(o, "rate", 4.2); dir = choose(1, -1); a = rnd(0, 6.28); L = point_distance(0, 0, box.w, box.h)/2 + 8;
		var ks = opt(o, "kinds", ["white"]);
		addB({ kind: "spin", cx: box.x + box.w/2, cy: box.y + box.h/2, ang: a, av: dir*(opt(o, "w", 1.3) + lv*.14), len: L, wd: 10, tint: pick(ks), life: 3.4, warn: .7 });
		if (opt(o, "plus", false)) addB({ kind: "spin", cx: box.x + box.w/2, cy: box.y + box.h/2, ang: a + pi/2, av: dir*(opt(o, "w", 1.3) + lv*.14), len: L, wd: 10, tint: pick(ks), life: 3.4, warn: .7 });
		break;
	case "zone":
		s.n = max(2.2, opt(o, "rate", 3) - lv*.2); N = opt(o, "cols", 5); var cw = box.w/N, safe = array_create(N, false), ns = 0, want = min(N - 1, opt(o, "safe", 2));
		while (ns < want) { j = irandom(N - 1); if (!safe[j]) { safe[j] = true; ns++; } }
		for (i = 0; i < N; i++) {
			if (safe[i]) addB({ x: box.x + i*cw, y: box.y, w: cw, h: box.h, life: .95, kind: "safe", harmless: true, color: make_color_rgb(47, 224, 90) });
			else addB({ x: box.x + i*cw + 2, y: box.y, w: cw - 4, h: box.h, warn: .95, life: .5, kind: "stab", color: c }); }
		break;
	case "circle":
		s.n = max(3, opt(o, "rate", 4.2) - lv*.3); N = opt(o, "n", 8); var off = rnd(0, 6.28), mx = box.x + box.w/2, my = box.y + box.h/2, R = max(box.w, box.h)*.55 + 50; dir = choose(1, -1);
		for (i = 0; i < N; i++) { a = off + dir*i/N*6.283; xx = clamp(mx + cos(a)*R, 24, 616); yy = clamp(my + sin(a)*R, 70, 440);
			addB({ kind: "blaster", x: xx, y: yy, ang: arctan2(my - yy, mx - xx), t: -i*opt(o, "stagger", .26), charge: .7, fire: .3, wd: opt(o, "width", 26), sc: 1, color: c }); }
		break;
	case "bones":
		s.n = max(.35, opt(o, "rate", 1) - lv*.18); tn = pick(opt(o, "kinds", ["white"])); dir = choose(1, -1);
		var gap = (tn == "blue" || tn == "orange") ? 0 : max(34, opt(o, "gap", 54) - lv*5);
		addB({ kind: "wall", x: dir > 0 ? box.x - 10 : box.x + box.w + 10, vx: dir*(opt(o, "speed", 160) + lv*30), gy: rnd(box.y + 35, box.y + box.h - 35), ngy: rnd(box.y + 35, box.y + box.h - 35),
			tele: opt(o, "teleport", false), jump: false, jt: -1, gap: gap, tint: tn, color: hexc(opt(o, "color", "#e9ecf5")) });
		break;
	case "rain":
		s.n = max(.06, opt(o, "rate", .25) - lv*.05); sp = opt(o, "speed", 150) + lv*30; sz = opt(o, "size", 10); var shp = opt(o, "shape", "shard"), sd = opt(o, "side", "");
		if (sd == "left" || (sd == "sides" && random(1) < .5)) { var Lf = (sd == "left") || random(1) < .5;
			addB({ x: Lf ? box.x - sz - 4 : box.x + box.w, y: rnd(box.y, box.y + box.h - sz), w: sz + 4, h: sz, vx: Lf ? sp : -sp, color: c, kind: shp }); }
		else addB({ x: rnd(box.x, box.x + box.w - sz), y: box.y - sz - 4, w: sz, h: sz + 4, vy: sp, vx: opt(o, "drift", false) ? rnd(-40, 40) : 0, color: c, kind: shp, splash: opt(o, "splash", false) });
		break;
	case "grid":
		s.n = max(.4, opt(o, "rate", .8) - lv*.12); var gw = box.w/5, gh = box.h/5; k = min(18, opt(o, "n", 3) + round(lv) + (random(1) < .5 ? 1 : 0));
		var cells = array_create(25, 0); for (i = 0; i < 25; i++) cells[i] = i;
		for (i = 24; i > 0; i--) { j = irandom(i); var tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp; }
		var gc = hexc(opt(o, "color", "#ff4fd8"));
		for (i = 0; i < k; i++) addB({ x: box.x + (cells[i] mod 5)*gw + 2, y: box.y + floor(cells[i]/5)*gh + 2, w: gw - 4, h: gh - 4, warn: .6, life: .35, kind: "pix", color: gc });
		break;
	case "beams":
		s.n = max(.45, opt(o, "rate", .9) - lv*.15); cnt = opt(o, "count", 2) + round(lv*.5); var tints = opt(o, "tints", undefined);
		for (i = 0; i < cnt; i++) { tn = is_array(tints) ? pick(tints) : "white"; var bc = tintCol(tn, c);
			if (random(1) < .5) addB({ x: box.x, y: rnd(box.y + 5, box.y + box.h - 25), w: box.w, h: 20, warn: .55, life: .3, kind: "beam", tint: tn, color: bc });
			else addB({ x: rnd(box.x + 5, box.x + box.w - 25), y: box.y, w: 20, h: box.h, warn: .55, life: .3, kind: "beam", tint: tn, color: bc }); }
		break;
	case "tunnel":
		s.n = .11; var tc = box.y + box.h/2 + sin(tt*(1.6 + lv*.5) + s.ph)*(box.h/2 - 40), tg = (62 - lv*6)/2, tv = -(150 + lv*25), tcol = hexc(opt(o, "color", "#1d6f63"));
		addB({ x: box.x + box.w, y: box.y, w: 12, h: tc - tg - box.y, vx: tv, color: tcol, kind: "tar" });
		addB({ x: box.x + box.w, y: tc + tg, w: 12, h: box.y + box.h - tc - tg, vx: tv, color: tcol, kind: "tar" });
		break;
	case "eels":
		s.n = max(.35, opt(o, "rate", .85) - lv*.15); dir = choose(1, -1); L = opt(o, "len", 90); yy = rnd(box.y + 10, box.y + box.h*(opt(o, "top", false) ? .55 : 1) - 14);
		addB({ x: dir > 0 ? box.x - L : box.x + box.w, y: yy, w: L, h: 12, vx: dir*(170 + lv*30), color: hexc(opt(o, "color", "#ff7a3d")), kind: "eel" });
		break;
	case "chase":
		s.n = max(.5, opt(o, "rate", 1.4) - lv*.2);
		for (i = 0; i < opt(o, "n", 2); i++) { ep = edgePoint(); addB({ kind: "orb", x: ep[0], y: ep[1], r: opt(o, "r", 7), sp: opt(o, "speed", 110) + lv*25, home: opt(o, "home", 1.4), warn: .35, life: 5, color: c, shape: opt(o, "shape", "orb") }); }
		break;
	case "ring":
		s.n = max(.5, opt(o, "rate", 1.1) - lv*.15); cnt = opt(o, "n", 8) + round(lv*2); sp = opt(o, "speed", 120) + lv*20; var from = opt(o, "from", "center"), rr = opt(o, "r", 6), shp2 = opt(o, "shape", "orb");
		if (from == "edges") { for (i = 0; i < cnt; i++) { ep = edgePoint(); a = arctan2(P.y - ep[1], P.x - ep[0]) + rnd(-.35, .35);
			addB({ kind: "orb", x: ep[0], y: ep[1], vx: cos(a)*sp, vy: sin(a)*sp, r: rr, home: 0, warn: .3 + i*.06, life: 6, color: c, shape: shp2 }); } break; }
		xx = box.x + box.w/2; yy = box.y + box.h/2;
		for (j = 0; j < 8; j++) { xx = rnd(box.x + 20, box.x + box.w - 20); yy = rnd(box.y + 20, box.y + box.h - 20); if (point_distance(xx, yy, P.x, P.y) > 70) break; }
		var o0 = rnd(0, 6.28);
		for (i = 0; i < cnt; i++) { a = o0 + i/cnt*6.28; addB({ kind: "orb", x: xx, y: yy, vx: cos(a)*sp, vy: sin(a)*sp, r: rr, home: 0, warn: .45, life: 6, color: c, shape: shp2 }); }
		break;
	case "lanes":
		s.n = max(.3, opt(o, "rate", .6) - lv*.08); cnt = (random(1) < .25 + lv*.1) ? 2 : 1; var used = [false, false, false, false];
		var lc = [make_color_rgb(194, 75, 153), make_color_rgb(0, 255, 255), make_color_rgb(18, 250, 5), make_color_rgb(249, 57, 63)];
		for (i = 0; i < cnt; i++) { do { j = irandom(3); } until (!used[j]); used[j] = true;
			addB({ kind: "orb", x: box.x + box.w*(j + .5)/4, y: box.y - 8, vx: 0, vy: opt(o, "speed", 190) + lv*25, r: 8, home: 0, warn: .18, life: 6, color: lc[j], shape: "fnf" }); }
		break;
	case "echo":
		s.n = max(1.4, opt(o, "rate", 2.2) - lv*.2); xx = rnd(box.x + 16, box.x + box.w - 38); var ec = hexc(opt(o, "color", "#6fd0ff"));
		addB({ x: xx, y: box.y, w: 22, h: box.h, warn: .55, life: .3, kind: "beam", color: ec });
		array_push(s.q, { x: xx, t: 1 }, { x: xx, t: 1.7 });
		break;
	case "burst":
		s.n = max(.8, opt(o, "rate", 1.5) - lv*.2); ep = edgePoint(); a = arctan2(P.y - ep[1], P.x - ep[0]); sp = opt(o, "speed", 250) + lv*20; cnt = opt(o, "n", 4) + round(lv);
		for (i = 0; i < cnt; i++) addB({ kind: "orb", x: ep[0], y: ep[1], vx: cos(a)*sp, vy: sin(a)*sp, r: 5, home: 0, warn: .3 + i*.09, life: 5, color: hexc(opt(o, "color", "#ffd24a")), shape: "orb" });
		break;
	case "slash":
		s.n = max(.45, opt(o, "rate", 1.1) - lv*.18); cnt = opt(o, "count", 1) + (lv >= 1 ? 1 : 0);
		for (i = 0; i < cnt; i++) { var aim = random(1) < .5; xx = aim ? P.x : rnd(box.x + 30, box.x + box.w - 30); yy = aim ? P.y : rnd(box.y + 30, box.y + box.h - 30); a = rnd(0, pi); L = 420;
			addB({ kind: "line", x1: xx - cos(a)*L, y1: yy - sin(a)*L, x2: xx + cos(a)*L, y2: yy + sin(a)*L, wd: opt(o, "width", 16), warn: opt(o, "warn", .55), life: .25, color: c });
			if (opt(o, "cross", false)) addB({ kind: "line", x1: xx - cos(a + pi/2)*L, y1: yy - sin(a + pi/2)*L, x2: xx + cos(a + pi/2)*L, y2: yy + sin(a + pi/2)*L, wd: opt(o, "width", 16), warn: opt(o, "warn", .55), life: .25, color: c }); }
		break;
	case "strings":
		s.n = max(.3, opt(o, "rate", .7) - lv*.12); var v = choose(-1, 1)*(40 + lv*20), sc2 = hexc(opt(o, "color", "#3d8bff")), bind = opt(o, "bind", false);
		if (random(1) < .6) { xx = rnd(box.x + 10, box.x + box.w - 10); addB({ kind: "line", x1: xx, y1: box.y - 10, x2: xx + rnd(-30, 30), y2: box.y + box.h + 10, wd: 4, warn: .5, life: 2.6, color: sc2, vx: v, vy: 0, bind: bind }); }
		else { yy = rnd(box.y + 10, box.y + box.h - 10); addB({ kind: "line", x1: box.x - 10, y1: yy, x2: box.x + box.w + 10, y2: yy + rnd(-20, 20), wd: 4, warn: .5, life: 2.6, color: sc2, vx: 0, vy: v, bind: bind }); }
		break;
	case "blaster":
		s.n = max(.45, opt(o, "rate", 1.3) - lv*.2); cnt = opt(o, "n", 1) + (lv >= 1 ? 1 : 0);
		for (i = 0; i < cnt; i++) { side = irandom(3);
			if (side == 0) { xx = rnd(box.x, box.x + box.w); yy = box.y - 34; } else if (side == 1) { xx = rnd(box.x, box.x + box.w); yy = box.y + box.h + 34; }
			else if (side == 2) { xx = box.x - 34; yy = rnd(box.y, box.y + box.h); } else { xx = box.x + box.w + 34; yy = rnd(box.y, box.y + box.h); }
			var tx = P.x + rnd(-24, 24), ty = P.y + rnd(-24, 24);
			addB({ kind: "blaster", x: xx, y: yy, ang: arctan2(ty - yy, tx - xx), t: -i*.18, charge: opt(o, "charge", .65), fire: .35, wd: opt(o, "width", 26), sc: 1, color: c }); }
		break;
	case "floor":
		s.n = max(.35, opt(o, "rate", .85) - lv*.12); dir = choose(1, -1); var hh = rnd(opt(o, "min", 18), opt(o, "max", 44)) + lv*5;
		addB({ x: dir > 0 ? box.x - 10 : box.x + box.w, y: box.y + box.h - hh, w: 10, h: hh, vx: dir*(opt(o, "speed", 150) + lv*25), color: c, kind: "bonev", tint: pick(opt(o, "kinds", ["white"])) });
		break;
	case "stab":
		s.n = max(.6, opt(o, "rate", 1.3) - lv*.2); side = pick(opt(o, "sides", ["bottom", "bottom", "left", "right", "top"])); var tz = opt(o, "size", 38);
		if (side == "bottom") addB({ x: box.x, y: box.y + box.h - tz, w: box.w, h: tz, warn: .6, life: .45, kind: "stab", side: side, color: c });
		else if (side == "top") addB({ x: box.x, y: box.y, w: box.w, h: tz, warn: .6, life: .45, kind: "stab", side: side, color: c });
		else if (side == "left") addB({ x: box.x, y: box.y, w: tz, h: box.h, warn: .6, life: .45, kind: "stab", side: side, color: c });
		else addB({ x: box.x + box.w - tz, y: box.y, w: tz, h: box.h, warn: .6, life: .45, kind: "stab", side: side, color: c });
		break;
	case "tentacle":
		s.n = max(.45, opt(o, "rate", 1.1) - lv*.18); var Lt = random(1) < .5; xx = Lt ? box.x - 20 : box.x + box.w + 20; yy = rnd(box.y, box.y + box.h); a = arctan2(P.y - yy, P.x - xx); L = box.w + 80;
		addB({ kind: "line", x1: xx, y1: yy, x2: xx + cos(a)*L, y2: yy + sin(a)*L, wd: opt(o, "width", 18), warn: .6, life: .45, color: hexc(opt(o, "color", "#14141f")), edge: hexc(opt(o, "edge", "#4fe0ff")) });
		break;
	case "target":
		s.n = max(.9, opt(o, "rate", 1.8) - lv*.2); ep = edgePoint();
		addB({ kind: "orb", x: ep[0], y: ep[1], r: 9, sp: opt(o, "speed", 120) + lv*20, home: 1.3, warn: .2, life: 1.7, color: hexc(opt(o, "color", "#ff6b8a")), shape: "reticle", burst: opt(o, "burst", 8) + round(lv*2), bcol: hexc(opt(o, "bcol", "#ffffff")), harmless: true });
		break;
	case "gridblast": // Dusttale : N blasters en haut + N à droite -> quadrillage
		s.n = opt(o, "rate", 4.2); N = opt(o, "n", 3); var gf = opt(o, "fire", 2.4), gwd = opt(o, "width", 20), gch = opt(o, "charge", 1.1);
		if (opt(o, "pulse", false)) {
			// vidéo : les blasters restent en place, glissent en groupe entre deux salves, tirent 0,33 s toutes les secondes
			s.n = opt(o, "cyc", 1); xx = rnd(-.12, .26); yy = rnd(-.05, .3);
			if (!variable_struct_exists(s, "bl")) { s.bl = [];
				for (i = 0; i < N; i++) {
					array_push(s.bl, addB({ kind: "blaster", x: box.x + (xx + i*.31)*box.w, y: box.y - 8, ang: pi/2, t: 0, charge: opt(o, "first", 2.4), fire: gf, wd: gwd, sc: .8, color: c, cyc: s.n, noaim: true, len: box.h + 4, gi: i, gs: 0 }));
					array_push(s.bl, addB({ kind: "blaster", x: box.x + box.w + 8, y: box.y + (yy + i*.32)*box.h, ang: pi, t: 0, charge: opt(o, "first", 2.4), fire: gf, wd: gwd, sc: .8, color: c, cyc: s.n, noaim: true, len: box.w + 4, gi: i, gs: 1 })); } }
			for (i = 0; i < array_length(s.bl); i++) { var gb = s.bl[i]; if (gb.gs == 0) gb.tx = box.x + (xx + gb.gi*.31)*box.w; else gb.ty = box.y + (yy + gb.gi*.32)*box.h; }
			break;
		}
		for (i = 0; i < N; i++) {
			addB({ kind: "blaster", x: box.x + (i + .5)/N*box.w, y: box.y - 40, ang: pi/2, t: 0, charge: gch, fire: gf, wd: gwd, sc: .8, color: c });
			addB({ kind: "blaster", x: opt(o, "left", false) ? box.x - 40 : box.x + box.w + 40, y: box.y + (i + .5)/N*box.h, ang: opt(o, "left", false) ? 0 : pi, t: 0, charge: gch, fire: gf, wd: gwd, sc: .8, color: c }); }
		break;
	case "tridents": // Dusttale : 3 tridents qui se plantent en alternance (gauche+droite / centre) + grand os de droite à gauche
		s.n = opt(o, "rate", 4);
		if (s.ph >= 0) { s.ph = -1; var tfx = [.19, .5, .82]; for (i = 0; i < 3; i++) addB({ kind: "trident", x: box.x + tfx[i]*box.w, y: box.y, slot: i, k: 0, tip: box.y - 6, age: -opt(o, "delay", 1.5), half: opt(o, "half", .5), color: c }); }
		sp = opt(o, "speed", 176) + lv*15;
		addB({ x: box.x + box.w + 90, y: box.y - 8, w: 12, h: box.h + 8 - opt(o, "gap", 16), vx: -sp, vy: 0, life: (box.w + 200)/sp, oa: 1, color: c, kind: "bonev", tint: "white" });
		break;
	case "redflash": // Dusttale : traits rouges qui défilent (gauche vers le haut, droite vers le bas), puis boîte rouge 2 s (traits figés et inoffensifs)
		s.n = 999;
		var rsp = box.h*.36, rln = opt(o, "lines", 5.8), rrd = opt(o, "red", 2.1), rv = opt(o, "speed", 40);
		for (i = 0; i < 3; i++) {
			addB({ kind: "redline", x: box.x, y: 0, w: box.w*.49, h: 3, side: 0, on: true, off: i*rsp + rsp*.3, sp3: rsp*3, v: -rv, a: 0, lines: rln, red: rrd, color: c });
			addB({ kind: "redline", x: box.x + box.w*.52, y: 0, w: box.w*.48, h: 3, side: 1, on: true, off: i*rsp, sp3: rsp*3, v: rv, a: 0, lines: rln, red: rrd, color: c }); }
		addB({ kind: "redwash", x: box.x, y: box.y, w: box.w, h: box.h, a: 0, lines: rln, red: rrd, color: c, harmless: true });
		break;
	case "crossbones": // Dusttale : groupes de mini-os autour de l'âme (cage immobile, croix qui s'ouvre, 4 os qui convergent)
		s.n = max(.45, opt(o, "rate", .6) - lv*.05); xx = P.x; yy = P.y; k = random(1);
		if (k < .4) { // cage 3x3 sans le centre : rester immobile
			var cv = irandom(1) == 0;
			for (i = 0; i < 9; i++) { if (i == 4) continue; var cdx = ((i mod 3) - 1)*21, cdy = (floor(i/3) - 1)*(cv ? 21 : 13);
				if (cv) addB({ x: xx + cdx - 2, y: yy + cdy - 6, w: 4, h: 12, life: .55, color: c, kind: "bonev", tint: "white", oa: 1 });
				else addB({ x: xx + cdx - 6, y: yy + cdy - 2, w: 12, h: 4, life: .55, color: c, kind: "bonev", tint: "white", oa: 1 }); }
		} else if (k < .8) { // 4 tirets aux coins d'un rectangle, qui convergent là où était l'âme
			for (i = 0; i < 4; i++) { var qx = (i mod 2 == 0) ? -90 : 90, qy = (i < 2) ? -64 : 64;
				addB({ x: xx + qx - 6, y: yy + qy - 2, w: 12, h: 4, vx: -qx/.6, vy: -qy/.6, life: .6, color: c, kind: "bonev", tint: "white", oa: 1 }); }
		} else { // croix serrée autour de l'âme, qui s'ouvre
			addB({ x: xx - 6, y: yy - 16, w: 12, h: 4, vx: 0, vy: -150, life: .6, color: c, kind: "bonev", tint: "white", oa: 1 });
			addB({ x: xx - 6, y: yy + 12, w: 12, h: 4, vx: 0, vy: 150, life: .6, color: c, kind: "bonev", tint: "white", oa: 1 });
			addB({ x: xx - 16, y: yy - 6, w: 4, h: 12, vx: -150, vy: 0, life: .6, color: c, kind: "bonev", tint: "white", oa: 1 });
			addB({ x: xx + 12, y: yy - 6, w: 4, h: 12, vx: 150, vy: 0, life: .6, color: c, kind: "bonev", tint: "white", oa: 1 });
		}
		break;
	case "fullcol": // DustTrust / Ink : toute la boîte se remplit de colonnes cyan (ne pas bouger) ou orange (bouger)
		s.n = opt(o, "rate", 3.2); tn = pick(opt(o, "tints", ["blue", "orange"]));
		addB({ x: box.x, y: box.y, w: box.w, h: box.h, warn: opt(o, "warn", .9), life: opt(o, "life", .7), kind: "beam", tint: tn, color: tintCol(tn, c) });
		break;
	case "numgrid": // Ink (violet) : les 9 cases sont frappées l'une après l'autre dans un ordre tiré au sort
		s.n = opt(o, "rate", 4.4); var ng = [0, 1, 2, 3, 4, 5, 6, 7, 8];
		for (i = 8; i > 0; i--) { j = irandom(i); k = ng[i]; ng[i] = ng[j]; ng[j] = k; }
		for (i = 0; i < 9; i++) addB({ x: box.x + (ng[i] mod 3)*box.w/3 + 2, y: box.y + floor(ng[i]/3)*box.h/3 + 2, w: box.w/3 - 4, h: box.h/3 - 4, warn: .7 + i*opt(o, "step", .36), life: .3, kind: "pix", color: c, num: i + 1 });
		break;
	case "zigzag": // Ink (rouge) : rayon qui rebondit en zigzag d'une paroi à l'autre
		s.n = max(1, opt(o, "rate", 1.5) - lv*.1); N = opt(o, "seg", 4); k = irandom(1); xx = rnd(box.x + box.w*.3, box.x + box.w*.7); yy = box.y - 30;
		for (i = 0; i < N; i++) { var zx = ((i + k) mod 2 == 0) ? box.x : box.x + box.w, zy = box.y + (i + rnd(.6, 1))*box.h/N; if (i == N - 1) zy = box.y + box.h + 30;
			addB({ kind: "line", x1: xx, y1: yy, x2: zx, y2: zy, wd: opt(o, "width", 7), warn: opt(o, "warn", .7), life: .35, color: (i mod 2 == 0) ? c : hexc(opt(o, "color2", "#ff9a2e")) });
			xx = zx; yy = zy; }
		break;
	case "shieldrain": // âme verte : flèches/os des 4 côtés à bloquer avec le bouclier
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
	default:
		s.n = 1.2; ep = edgePoint(); addB({ kind: "orb", x: ep[0], y: ep[1], r: 7, sp: 110, home: 1.4, warn: .35, life: 4, color: c, shape: "orb" });
	}
}

// ---------- Mise à jour ----------
function atLog(m) { var lf = file_text_open_append("autotest_log.txt"); file_text_write_string(lf, m + "\n"); file_text_close(lf); }
function autoStep() {
	atFrame++; atOk = (atFrame mod 3) == 0;
	if (atFrame mod 20 == 0) atDir = pick(["up", "down", "left", "right", "none"]);
	if (scene != "fight") {
		if (!is_undefined(fight)) atLog("fin " + nm(fight.b) + " -> " + scene);
		if (atI < array_length(bosses) && atPh >= array_length(rushOpts(bosses[atI]))) { atI++; atPh = 0; }
		if (atI >= array_length(bosses)) { atLog("TERMINE"); game_end(); return; }
		atLog("combat " + nm(bosses[atI]) + " phase " + string(atPh + 1));
		rushStart(atI, atPh); atPh++; atStop = false; atFF = 0;
		return;
	}
	P.hp = P.max; P.kr = 0; atFF++;
	var f = fight;
	if (f.state == "menu") f.menuSel = irandom(2);
	var list = f.cur;
	if (is_undefined(list)) { list = f.b.pats; var hd = opt(f.b, "hard", []); if (f.phase2 && is_array(hd) && array_length(hd) > 0) list = hd; }
	if (!atStop && f.turn > array_length(list)) { atStop = true; f.hp = min(f.hp, 1); f.menuSel = 0; }
	if (atFF > 90000 || (atStop && atFF > 80000)) { atLog("delai depasse " + nm(f.b)); scene = "win"; winRes = "kill"; }
}
function drawStars(c) {
	draw_set_colour(merge_colour(c, c_white, .55));
	for (var i = 0; i < array_length(STARS); i++) { var q = STARS[i]; draw_set_alpha(.18 + .22*(.5 + .5*sin(t*2 + q.ph))); draw_rectangle(q.x, q.y, q.x + q.s, q.y + q.s, false); }
	draw_set_alpha(1);
}
function drawBand(f) {
	if (!isLB(f)) return;
	if (f.ph == 1) { draw_set_alpha(.55); draw_rectangle_colour(0, 392, 640, 480, c_black, c_black, make_color_rgb(18, 110, 104), make_color_rgb(18, 110, 104), false); draw_set_alpha(1); }
	else if (f.ph >= 2) { draw_set_alpha(.75); draw_rectangle_colour(0, 380, 640, 480, c_black, c_black, make_color_rgb(150, 0, 0), make_color_rgb(150, 0, 0), false); draw_set_alpha(1); }
}
function drawBack(f) {
	drawBand(f);
	var c = hexc(f.b.col);
	draw_set_alpha(.2 + .05*sin(t*1.5) + (f.phase2 ? .12 : 0));
	draw_rectangle_colour(0, 0, 640, 215, c, c, c_black, c_black, false);
	draw_set_alpha(1);
	drawStars(c);
}
function drawPortrait(i, cx, by, a) {
	var sp = (bosses[i].short == "LAST BREATH") ? sprLB[clamp(psel, 0, 2)] : spr[i];
	if (sp != -1 && sprite_exists(sp)) draw_sprite_ext(sp, 0, cx - sprite_get_width(sp)/2, by - sprite_get_height(sp), 1, 1, 0, c_white, a);
}
function drawPart() {
	for (var i = 0; i < array_length(PART); i++) { var p = PART[i]; draw_set_alpha(1 - p.t/p.life); draw_set_colour(p.c); draw_rectangle(p.x, p.y, p.x + p.s, p.y + p.s, false); }
	draw_set_alpha(1);
}
function game_step() {
	t += DT;
	if (t < DT*3) show_debug_message("STEP scene=" + scene);
	if (AUTOTEST) autoStep();
	if (keyboard_check_pressed(ord("M"))) { muted = !muted; applyOpt(); }
	if (keyboard_check_pressed(vk_f4)) { OPT.full = !window_get_fullscreen(); window_set_fullscreen(OPT.full); saveGame(); }
	var k = min(1, DT*12);
	box.x = lerp(box.x, box.tx, k); box.y = lerp(box.y, box.ty, k); box.w = lerp(box.w, box.tw, k); box.h = lerp(box.h, box.th, k);
	shake = max(0, shake - DT*20);
	scrRot = (scene == "fight") ? lerp(scrRot, scrRotT, min(1, DT*4)) : 0; if (scene != "fight") scrRotT = 0;
	hurtFlash = max(0, hurtFlash - DT*3); bossFlash = max(0, bossFlash - DT*6); hitCd = max(0, hitCd - DT); fadeA = max(0, fadeA - DT*3.5);
	if (scene != lastScene) { lastScene = scene; fadeA = 1; if (scene == "lose") { loseT = 0; loseCrack = false; loseShard = false; fadeA = 0; } }
	for (var si = 0; si < array_length(STARS); si++) { var st0 = STARS[si]; st0.y -= st0.v*DT; if (st0.y < -4) { st0.y = 484; st0.x = rnd(0, 640); } }
	var keepT = []; for (var si = 0; si < array_length(TRAIL); si++) { var tr0 = TRAIL[si]; tr0.t -= DT; if (tr0.t > 0) array_push(keepT, tr0); } TRAIL = keepT;
	var keepP = [];
	for (var i = 0; i < array_length(PART); i++) { var p = PART[i]; p.t += DT; p.vy += p.g*DT; p.x += p.vx*DT; p.y += p.vy*DT; if (p.t < p.life) array_push(keepP, p); }
	PART = keepP;
	if (scene != "fight") {
		if (scene != "win" && scene != "lose") playSong("mus_menu");
		if (kp("up") || kp("down") || kp("left") || kp("right")) sfx("move");
		if (kp("ok") || kp("back")) sfx("select");
	}
	switch (scene) {
	case "title":
		var n = LB_ONLY ? 3 : 6;
		if (kp("up")) tsel = (tsel + n - 1) mod n;
		if (kp("down")) tsel = (tsel + 1) mod n;
		if (kp("ok")) {
			if (LB_ONLY) rushStart(lbI, tsel);
			else if (tsel == 0) scene = "select";
			else if (tsel == 1) startMarathon();
			else if (tsel == 2) scene = "records";
			else if (tsel == 3) { scene = "options"; osel = 0; wipeArm = false; }
			else if (tsel == 4) { scene = "credits"; credY = 0; }
			else game_end();
		}
		return;
	case "records":
		if (kp("ok") || kp("back")) scene = "title";
		return;
	case "credits":
		credY += DT*(kd("down") ? 140 : 32);
		if (kp("ok") || kp("back")) scene = "title";
		return;
	case "maraend":
		if (kp("ok") || kp("back")) scene = "title";
		return;
	case "options":
		if (kp("up")) { osel = (osel + 4) mod 5; wipeArm = false; }
		if (kp("down")) { osel = (osel + 1) mod 5; wipeArm = false; }
		if (osel == 0 && (kp("left") || kp("right"))) { OPT.vol = clamp(OPT.vol + (kp("right") ? 1 : -1), 0, 10); applyOpt(); saveGame(); }
		if (kp("ok") || (osel != 0 && osel != 3 && osel != 4 && (kp("left") || kp("right")))) {
			if (osel == 1) { OPT.shake = !OPT.shake; saveGame(); }
			else if (osel == 2) { OPT.full = !OPT.full; window_set_fullscreen(OPT.full); saveGame(); }
			else if (osel == 3 && kp("ok")) { if (wipeArm) { REC = {}; saveGame(); wipeArm = false; } else wipeArm = true; }
			else if (osel == 4 && kp("ok")) scene = "title";
		}
		if (kp("back")) scene = "title";
		return;
	case "select":
		var nb = array_length(bosses);
		if (kp("up")) sel = (sel - 3 + nb) mod nb;
		if (kp("down")) sel = (sel + 3) mod nb;
		if (kp("left")) sel = (sel - 1 + nb) mod nb;
		if (kp("right")) sel = (sel + 1) mod nb;
		if (kp("back")) scene = "title";
		else if (kp("ok")) { if (array_length(rushOpts(bosses[sel])) > 1) { scene = "phase"; psel = 0; } else rushStart(sel, 0); }
		return;
	case "phase":
		var O = rushOpts(bosses[sel]), no = array_length(O);
		if (kp("up") || kp("left")) psel = (psel + no - 1) mod no;
		if (kp("down") || kp("right")) psel = (psel + 1) mod no;
		if (kp("back")) scene = "select";
		else if (kp("ok")) rushStart(sel, psel);
		return;
	case "win":
		winT += DT;
		if (kp("ok") && (!isLB(fight) || winRes != "kill" || winT > 7)) {
			stopSong();
			if (marathon) { if (fight.i + 1 < array_length(bosses)) rushStart(fight.i + 1, 0); else endMarathon(); }
			else scene = LB_ONLY ? "title" : "select";
		}
		return;
	case "lose":
		loseT += DT;
		if (loseT >= .45 && !loseCrack) { loseCrack = true; sfx("hit"); }
		if (loseT >= .95 && !loseShard) { loseShard = true; sfx("dust"); spark(P.x, P.y, 34, c_red, 230, 1.1, 420); }
		if (loseT < 1.6) return;
		if (marathon) { if (kp("ok") || kp("back")) endMarathon(); return; }
		if (kp("ok")) rushStart(fight.i, fight.startPh);
		else if (kp("back")) { stopSong(); scene = LB_ONLY ? "title" : "select"; if (LB_ONLY) tsel = fight.startPh; }
		return;
	case "fight":
		if (!AUTOTEST && (keyboard_check_pressed(ord("P")) || (keyboard_check_pressed(vk_escape) && (paused || fight.state == "enemy")))) { paused = !paused; pauseSel = 0; sfx("select"); return; }
		if (paused) { stepPause(); return; }
		runT += DT; if (marathon) maraT += DT;
		stepFight();
		return;
	}
}
function stepFight() {
	var f = fight, i, b;
	f.enemyShake = max(0, f.enemyShake - DT*30); if (flashT > 0) flashT -= DT;
	if (f.poseT > 0) f.poseT -= DT;
	if (f.animT >= 0) { f.animT += DT; if (f.animT*14 >= array_length(animFrames(f))) f.animT = -1; }
	if (!is_undefined(banner)) { banner.t -= DT; if (banner.t <= 0) banner = undefined; }
	if (f.state == "dialog") {
		if (is_undefined(dlg)) { toMenu(); return; }
		var full = string_length(lineText(dlg.lines[dlg.i]));
		var c0 = floor(dlg.c);
		dlg.c = min(full, dlg.c + DT*40);
		if (floor(dlg.c) > c0 && c0 mod 2 == 0 && string_char_at(lineText(dlg.lines[dlg.i]), c0 + 1) != " ") sfx("text");
		if (kp("ok") || kp("back")) {
			if (dlg.c < full) dlg.c = full;
			else { dlg.i++; dlg.c = 0; if (dlg.i >= array_length(dlg.lines)) { var th = dlg.th; dlg = undefined; doThen(th); } }
		}
		return;
	}
	if (f.state == "menu") {
		f.fc = min(string_length(f.flavor), f.fc + DT*40);
		if (isLB(f) && f.ph >= 2) { startEnemy(); return; }
		if (kp("left")) { f.menuSel = (f.menuSel + 3) mod 4; sfx("move"); }
		if (kp("right")) { f.menuSel = (f.menuSel + 1) mod 4; sfx("move"); }
		if (kp("ok")) {
			sfx("select");
			var nmb = nm(f.b);
			if (f.menuSel == 0) { f.state = "attack"; f.atk = { x: 0, done: false, t: 0 }; setBox(560, 130); }
			else if (f.menuSel == 1) {
				var TL = opt(f.b, "talk", undefined);
				if (isLB(f)) TL = f.ph > 0 ? LBTXT.talk2 : LBTXT.talk1;
				if (!is_array(TL) || array_length(TL) == 0) TL = ["Tu lui parles. Il t'écoute à moitié."];
				var line = TL[f.talkN mod array_length(TL)]; f.talkN++; f.talkBonus = 1.5;
				if (string_char_at(line, 2) != ":") line = "*:" + line;
				say([line], "enemy");
			}
			else if (f.menuSel == 2) {
				if (f.ketchup > 0) { f.ketchup--; sfx("heal"); var hh = min(15, P.max - P.hp); P.hp += hh; P.kr = min(P.kr, max(0, P.hp - 1));
					say(["*:Tu bois une gorgée de ketchup. +" + string(hh) + " PV. (reste : " + string(f.ketchup) + ")"], "enemy"); }
				else say(["*:La bouteille est vide. Tu la secoues quand même."], "menu");
			}
			else {
				if (isLB(f) && !(f.lbTired && f.ph == 0)) say([f.ph > 0 ? "*:Il est trop tard pour la pitié." : "*:Sans n'accepte pas. Pas encore."], "enemy");
				else if (f.talkN >= 2 || isLB(f)) { f.over = "spare"; B = []; var Ls = ["*:Tu épargnes " + nmb + "."];
					say(flat(isLB(f) ? LBTXT.spare : f.b.defeat, Ls), "finish_spare"); }
				else say(["*:Tu proposes d'épargner " + nmb + ". Pas encore : parle-lui d'abord avec AGIR."], "enemy");
			}
		}
		return;
	}
	if (f.state == "attack") {
		var a = f.atk;
		if (!a.done) {
			a.x += DT/1.25;
			if (kp("ok") || a.x >= 1) {
				a.done = true; a.t = 0; f.hue = floor(clamp(a.x, 0, .999)*7);
				var off = abs(a.x - .5)*2, dmg = 0, crit = false;
				if (a.x < 1) { dmg = round(8 + (1 - off)*18); if (off < .08) { dmg = 34; crit = true; } }
				dmg = round(dmg*f.talkBonus); f.talkBonus = 1; f.resTxt = "";
				if (f.lbLast) { dmg = max(dmg, 8); f.hp = min(f.hp, dmg); }
				else if (isLB(f) && f.ph < 2) {
					if (f.lbTired) { dmg = max(dmg, f.hp); crit = true; }
					else if (f.ph == 0) { dmg = 0; f.dodge = .001; f.resTxt = "MISS"; }
					else { dmg = 0; f.resTxt = "BLOQUE"; }
				}
				if (dmg == 0 && f.resTxt == "") f.resTxt = "MISS";
				f.res = { dmg: dmg, crit: crit, prev: f.hp };
				sfx("slash");
				if (dmg > 0) { f.hp = max(0, f.hp - dmg); f.enemyShake = 12; bossFlash = 1; sfx("hit"); spark(320, 110, 18, c_white, 210, .5, 320); }
			}
		} else {
			a.t += DT; if (f.dodge > 0) f.dodge = min(1, f.dodge + DT*5);
			if (a.t > 1.1) {
				f.dodge = 0;
				if (f.hp <= 0 && hasPhases(f) && f.ph < array_length(f.b.phases)) phaseUp();
				else if (f.hp <= 0) { f.over = "kill"; B = []; sfx("dust"); stopSong(); var Ld = flat(f.b.defeat, []); array_push(Ld, "*:" + nm(f.b) + " se transforme en poussière."); say(Ld, "finish_kill"); }
				else if (!hasPhases(f) && !f.phase2 && f.hp <= f.max/2) { f.phase2 = true; f.pidx = 0; sfx("phase"); fightSong(); say(f.b.p2, "enemy"); }
				else if (!hasPhases(f) && f.phase2 && !f.phase3 && opt(f.b, "song3", "") != "" && f.hp <= f.max/4) { f.phase3 = true; f.pidx = 0; sfx("phase"); shake = 12; fightSong(); say(["*:L'air devient lourd. Il ne s'arrêtera plus."], "enemy"); }
				else startEnemy();
			}
		}
		return;
	}
	if (f.state == "boxing") {
		if (boxReady()) { box.x = box.tx; box.y = box.ty; box.w = box.tw; box.h = box.th; f.state = "enemy"; patInit(f.pat); }
		return;
	}
	if (f.state != "enemy") return;
	if (hitstop > 0) { hitstop -= DT; return; }
	// --- l'âme ---
	var dx = (kdr("right") ? 1 : 0) - (kdr("left") ? 1 : 0), dy = (kdr("down") ? 1 : 0) - (kdr("up") ? 1 : 0);
	if (f.invert) { dx = -dx; dy = -dy; }
	if (P.bound > 0) { P.bound -= DT; dx = 0; dy = 0; }
	if (opt(f, "shield", false)) { if (kdr("up")) shieldDir = 1; else if (kdr("right")) shieldDir = 0; else if (kdr("down")) shieldDir = 3; else if (kdr("left")) shieldDir = 2; dx = 0; dy = 0; P.x = box.x + box.w/2; P.y = box.y + box.h/2; }
	P.moving = (dx != 0 || dy != 0);
	var sp = 4, kk = DT*30;
	P.x += dx*sp*kk;
	if (f.gravity != 0) {
		if (f.gravDir >= 2) P.x -= dx*sp*kk;
		if (f.gravT > 0) { f.gravT -= DT; if (f.gravT <= 0) f.gravDir = 0; }
		var gd = f.gravDir, vert = gd < 2, sg = (gd == 0 || gd == 3) ? 1 : -1;
		var lo = (vert ? box.y : box.x) + P.r + 2, hi = (vert ? box.y + box.h : box.x + box.w) - P.r - 2;
		var floorC = sg > 0 ? hi : lo, roofC = sg > 0 ? lo : hi, cc = vert ? P.y : P.x;
		var jmp = kdr(vert ? (sg > 0 ? "up" : "down") : (sg > 0 ? "left" : "right"));
		var onFloor = (cc - floorC)*sg >= -.5;
		if (onFloor && jmp && P.bound <= 0 && P.vy >= 0) P.vy = -6;
		if (!jmp && P.vy <= -1) P.vy = -1;
		var v = P.vy;
		P.vy = v + (v > .5 ? (v < 8 ? .6 : 0) : (v > -1 ? .2 : (v > -4 ? .5 : .2)))*f.gravity*kk;
		cc += P.vy*sg*kk;
		if ((cc - floorC)*sg > 0) {
			cc = floorC; P.vy = 0;
			if (f.slam) {
				f.slam = false; shake = max(shake, 9); sfx("hit"); if (gd != 0) f.gravT = 1.1;
				spark(vert ? P.x : cc + 6*sg, vert ? cc + 6*sg : P.y, 14, c_white, 180, .35, vert ? 400 : 0);
				var SN = ["bottom", "top", "left", "right"], tz0 = 24, sdn = SN[gd];
				if (sdn == "bottom") addB({ x: box.x, y: box.y + box.h - tz0, w: box.w, h: tz0, warn: .42, life: .35, kind: "stab", side: sdn, color: c_white });
				else if (sdn == "top") addB({ x: box.x, y: box.y, w: box.w, h: tz0, warn: .42, life: .35, kind: "stab", side: sdn, color: c_white });
				else if (sdn == "left") addB({ x: box.x, y: box.y, w: tz0, h: box.h, warn: .42, life: .35, kind: "stab", side: sdn, color: c_white });
				else addB({ x: box.x + box.w - tz0, y: box.y, w: tz0, h: box.h, warn: .42, life: .35, kind: "stab", side: sdn, color: c_white });
			}
		}
		if ((cc - roofC)*sg < 0) { cc = roofC; P.vy = max(0, P.vy); }
		if (vert) P.y = cc; else { P.x = cc; P.y += dy*sp*kk; }
		P.moving = ((vert ? dx : dy) != 0) || abs(P.vy) > 1;
	} else P.y += dy*sp*kk;
	P.x = clamp(P.x, box.x + P.r + 2, box.x + box.w - P.r - 2); P.y = clamp(P.y, box.y + P.r + 2, box.y + box.h - P.r - 2);
	P.inv = max(0, P.inv - DT);
	if (P.moving && array_length(TRAIL) < 40 && (floor(t*60) mod 2 == 0)) array_push(TRAIL, { x: P.x, y: P.y, t: .2 });
	f.patT += DT; patUpdate(f.pat, f.patT);
	// --- projectiles ---
	var hurt = false, hurtBl = false, floorY = is_undefined(f.level) ? box.y + box.h : f.level, nB = array_length(B);
	for (i = 0; i < nB; i++) {
		b = B[i];
		switch (b.kind) {
		case "wall":
			b.x += b.vx*DT; var mid = box.x + box.w/2;
			if (b.tele && !b.jump && ((b.vx > 0 && b.x > mid - 60) || (b.vx < 0 && b.x < mid + 60))) { b.jump = true; b.jt = 0; }
			if (b.jump && b.jt >= 0) { b.jt += DT; if (b.jt > .3) { b.gy = b.ngy; b.jt = -1; } }
			var inX = abs(P.x - b.x) < P.r + 3, outGap = (b.gap == 0) || abs(P.y - b.gy) > b.gap/2 - P.r + 2;
			if (inX && outGap) { if (b.tint == "blue") { if (P.moving) hurt = true; } else if (b.tint == "orange") { if (!P.moving) hurt = true; } else hurt = true; }
			if (b.x < box.x - 30 || b.x > box.x + box.w + 30) b.dead = true;
			break;
		case "spin":
			if (b.warn > 0) { b.warn -= DT; break; }
			b.life -= DT; b.ang += b.av*DT;
			var ux = cos(b.ang)*b.len, uy = sin(b.ang)*b.len;
			if (segDist(P.x, P.y, b.cx - ux, b.cy - uy, b.cx + ux, b.cy + uy) < b.wd/2 + P.r - 2) { if (b.tint == "blue") { if (P.moving) hurt = true; } else if (b.tint == "orange") { if (!P.moving) hurt = true; } else hurt = true; }
			if (b.life <= 0) b.dead = true;
			break;
		case "blaster":
			if (b.t <= 0 && b.t + DT > 0) sfx("charge");
			b.t += DT;
			if (b.t > b.charge && b.t < b.charge + b.fire) {
				if (!variable_struct_exists(b, "shot")) { b.shot = 1; sfx("fire"); shake = max(shake, 2 + opt(b, "sc", 1)*2); spark(b.x + cos(b.ang)*26, b.y + sin(b.ang)*26, 16, b.color, 300, .4); }
				if (b.t > b.charge + .03 && segDist(P.x, P.y, b.x, b.y, b.x + cos(b.ang)*1200, b.y + sin(b.ang)*1200) < b.wd/2 + P.r - 2) { hurt = true; hurtBl = true; }
			}
			if (variable_struct_exists(b, "tx")) b.x = lerp(b.x, b.tx, min(1, DT*14));
			if (variable_struct_exists(b, "ty")) b.y = lerp(b.y, b.ty, min(1, DT*14));
			if (variable_struct_exists(b, "cyc") && b.t > b.charge + b.fire + .05) { b.t = 0; b.charge = b.cyc - b.fire - .05; variable_struct_remove(b, "shot"); }
			if (b.t > b.charge + b.fire + .2) b.dead = true;
			break;
		case "trident":
			b.age += DT;
			if (b.age >= 0) {
				var tset = (b.age < .5) ? -1 : floor((b.age - .5)/b.half) mod 2, tgo = (tset < 0) ? 0 : (((b.slot == 1) == (tset == 1)) ? 1 : 0);
				b.k = clamp(b.k + (tgo > b.k ? 1 : -1)*DT/.14, 0, 1);
				b.tip = lerp(box.y - 6, box.y + box.h - 5, b.k);
				var thw = (P.y > b.tip - 46) ? 17 : 6;
				if (b.k > .6 && abs(P.x - b.x) < thw + 1 && P.y - P.r + 1 < b.tip) hurt = true;
			}
			break;
		case "redline":
			b.a += DT; b.on = (b.a mod (b.lines + b.red)) < b.lines;
			if (b.on) b.off += b.v*DT;
			b.y = box.y + ((b.off mod b.sp3) + b.sp3) mod b.sp3 - 6;
			if (b.on && b.y > box.y && b.y < box.y + box.h && rectHitP(b)) hurt = true;
			break;
		case "redwash":
			b.a += DT; f.redOn = (b.a mod (b.lines + b.red)) >= b.lines;
			break;
		case "arrow":
			b.x += b.vx*DT; b.y += b.vy*DT; var ad = sqrt(sqr(b.x - P.x) + sqr(b.y - P.y));
			if (ad < 26 && b.dir == shieldDir) { b.dead = true; sfx("move"); spark(b.x, b.y, 5, c_white, 120, .25); }
			else if (ad < P.r + 3) { hurt = true; b.dead = true; }
			break;
		case "bubble":
			b.y += b.vy*DT; b.wob += DT*5; b.cx = b.x + sin(b.wob)*6;
			if (sqr(b.cx - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r - 2)) hurt = true;
			if (b.y < box.y - 10) b.dead = true;
			break;
		case "orb":
			if (b.warn > 0) { b.warn -= DT; break; }
			b.life -= DT;
			if (opt(b, "home", 0) > 0) { b.home -= DT; var ha = arctan2(P.y - b.y, P.x - b.x), kh = min(1, DT*3); b.vx = lerp(b.vx, cos(ha)*b.sp, kh); b.vy = lerp(b.vy, sin(ha)*b.sp, kh); }
			b.x += b.vx*DT; b.y += b.vy*DT;
			if (variable_struct_exists(b, "oa")) { b.oa += b.oav*DT; b.orad = max(0, b.orad + b.orv*DT); b.x = b.ocx + cos(b.oa)*b.orad; b.y = b.ocy + sin(b.oa)*b.orad; }
			if (opt(b, "heal", 0) > 0 && sqr(b.x - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r + 1)) { P.hp = min(P.max, P.hp + b.heal); P.kr = min(P.kr, max(0, P.hp - 1)); sfx("heal"); b.dead = true; }
			if (!b.harmless && sqr(b.x - P.x) + sqr(b.y - P.y) < sqr(b.r + P.r - 2)) hurt = true;
			if (b.life <= 0 && opt(b, "burst", 0) > 0) { var nbst = b.burst, ob = rnd(0, 6.28);
				for (var q = 0; q < nbst; q++) { var ba = ob + q/nbst*6.28; addB({ kind: "orb", x: b.x, y: b.y, vx: cos(ba)*150, vy: sin(ba)*150, r: 6, home: 0, warn: 0, life: 3, color: b.bcol, shape: "orb" }); }
				b.burst = 0; }
			if (b.life <= 0 || (!variable_struct_exists(b, "oa") && (b.x < box.x - 40 || b.x > box.x + box.w + 40 || b.y < box.y - 40 || b.y > box.y + box.h + 40))) b.dead = true;
			break;
		case "line":
			if (b.warn > 0) { b.warn -= DT; break; }
			b.life -= DT; b.x1 += b.vx*DT; b.x2 += b.vx*DT; b.y1 += b.vy*DT; b.y2 += b.vy*DT;
			if (segDist(P.x, P.y, b.x1, b.y1, b.x2, b.y2) < b.wd/2 + P.r - 2) { if (opt(b, "bind", false)) { if (P.bound <= 0) P.bound = .8; } else hurt = true; }
			if (b.life <= 0) b.dead = true;
			break;
		default:
			if (b.warn > 0) { b.warn -= DT; break; }
			b.x += b.vx*DT; b.y += b.vy*DT; b.life -= DT; if (b.life <= 0) b.dead = true;
			if (b.kind == "stab") { if (!variable_struct_exists(b, "life0")) b.life0 = b.life + DT; b.pr = clamp(min((b.life0 - b.life)/.07, b.life/.09), 0, 1); }
			if (!b.harmless && (b.kind != "stab" || b.pr > .65) && rectHitP(b)) { if (b.tint == "blue") { if (P.moving) hurt = true; } else if (b.tint == "orange") { if (!P.moving) hurt = true; } else hurt = true; }
			if (b.splash && b.y + b.h >= floorY) { b.dead = true;
				addB({ x: b.x, y: floorY - 9, w: 8, h: 8, vx: 150, color: b.color, kind: "tar", life: 1.4 }); addB({ x: b.x, y: floorY - 9, w: 8, h: 8, vx: -150, color: b.color, kind: "tar", life: 1.4 }); }
			if (b.x > box.x + box.w + 120 || b.x + b.w < box.x - 120 || b.y > box.y + box.h + 30) b.dead = true;
		}
	}
	if (!is_undefined(f.level) && P.y + P.r - 2 > f.level) hurt = true;
	var keep = []; for (i = 0; i < array_length(B); i++) if (!B[i].dead) array_push(keep, B[i]); B = keep;
	// KR comme dans Undertale
	if (P.kr > 0) { var fr = P.kr >= 40 ? 1 : (P.kr >= 30 ? 2 : (P.kr >= 20 ? 5 : (P.kr >= 10 ? 15 : 30))); P.krT += DT; if (P.krT >= fr/30) { P.krT = 0; P.kr--; P.hp = max(1, P.hp - 1); } }
	if (hurt && P.inv <= 0) {
		runHits += 1;
		if (opt(f.b, "kr", false)) { P.hp = max(0, P.hp - 1); P.kr = min(40, max(0, P.hp - 1), P.kr + (hurtBl ? 10 : 6)); P.inv = 1/30; }
		else { P.hp = max(0, P.hp - f.b.dmg); P.inv = 20/30; }
		shake = 6; spark(P.x, P.y, 14, make_color_rgb(255, 48, 64), 220, .5, 150); sfx("hurt"); if (hitCd <= 0) { hurtFlash = .7; hitstop = .05; hitCd = .4; }
		if (P.hp <= 0) { patEnd(); scene = "lose"; B = []; stopSong(); return; }
	}
	if (f.patT >= f.pat.dur) {
		patEnd(); B = [];
		var lst = is_undefined(f.cur) ? f.b.pats : f.cur;
		if (isLB(f) && opt(f.pat.spec, "chain", false) && f.pidx < array_length(lst)) { startEnemy(); return; }
		if (isLB(f) && f.ph < 2 && !f.lbTired && f.pidx >= array_length(lst)) {
			if (f.ph > 0) say(LBTXT.death, "lb_death");
			else { f.lbTired = true; say(LBTXT.tired, "menu"); }
		}
		else if (f.surv > 0) {
			f.surv--; P.hp = min(P.max, P.hp + 8);
			if (f.surv > 0) startEnemy();
			else { f.lbLast = true; say(["*:Sans n'a plus une goutte de magie.", "*:Il reste là, à bout de souffle. Il sourit encore.", "*:Un seul coup suffira."], "lb_final"); }
		}
		else toMenu();
	}
}

// ---------- Rendu ----------
function heart(xx, yy, col = c_red, s = 1) {
	draw_set_colour(col);
	draw_circle(xx - 3.6*s, yy - 2*s, 4.3*s, false); draw_circle(xx + 3.6*s, yy - 2*s, 4.3*s, false);
	draw_triangle(xx - 7.8*s, yy - .5*s, xx + 7.8*s, yy - .5*s, xx, yy + 7.5*s, false);
}
function drawBone(xx, yy, w, h, col) {
	if (w <= 0 || h <= 0) return;
	draw_set_colour(col);
	var vert = h >= w, th = vert ? w : h, sh = max(3, round(th*.45)), r = th*.29 + 1, o = th*.23;
	if (vert) { draw_rectangle(xx + (w - sh)/2, yy, xx + (w + sh)/2, yy + h, false);
		draw_circle(xx + w/2 - o, yy, r, false); draw_circle(xx + w/2 + o, yy, r, false); draw_circle(xx + w/2 - o, yy + h, r, false); draw_circle(xx + w/2 + o, yy + h, r, false); }
	else { draw_rectangle(xx, yy + (h - sh)/2, xx + w, yy + (h + sh)/2, false);
		draw_circle(xx, yy + h/2 - o, r, false); draw_circle(xx, yy + h/2 + o, r, false); draw_circle(xx + w, yy + h/2 - o, r, false); draw_circle(xx + w, yy + h/2 + o, r, false); }
}
function lineBone(x1, y1, x2, y2, wd, col) {
	draw_set_colour(col); draw_line_width(x1, y1, x2, y2, max(3, wd*.45));
	var a = arctan2(y2 - y1, x2 - x1), nx = -sin(a)*wd*.23, ny = cos(a)*wd*.23, r = wd*.29 + 1;
	draw_circle(x1 + nx, y1 + ny, r, false); draw_circle(x1 - nx, y1 - ny, r, false); draw_circle(x2 + nx, y2 + ny, r, false); draw_circle(x2 - nx, y2 - ny, r, false);
}
function btri(X, Y, c, s, k, x1, y1, x2, y2, x3, y3) {
	draw_triangle(X + (x1*c - y1*s)*k, Y + (x1*s + y1*c)*k, X + (x2*c - y2*s)*k, Y + (x2*s + y2*c)*k, X + (x3*c - y3*s)*k, Y + (x3*s + y3*c)*k, false);
}
function bquad(X, Y, c, s, k, x1, y1, x2, y2) { btri(X, Y, c, s, k, x1, y1, x2, y1, x2, y2); btri(X, Y, c, s, k, x1, y1, x2, y2, x1, y2); }
function drawTrident(b) {
	// trident pointe en bas : manche long, traverse, deux dents latérales évasées, dent centrale plus longue
	var cx = b.x, ty = b.tip, hy = ty - 44;
	draw_set_colour(b.color);
	draw_rectangle(cx - 1, hy - box.h - 30, cx + 1, ty - 12, false);
	draw_rectangle(cx - 3, hy - box.h - 36, cx + 3, hy - box.h - 30, false);
	draw_rectangle(cx - 4, hy - 6, cx + 4, hy - 4, false);
	draw_rectangle(cx - 13, hy, cx + 13, hy + 2, false);
	draw_rectangle(cx - 14, hy, cx - 12, hy + 20, false); draw_rectangle(cx + 12, hy, cx + 14, hy + 20, false);
	draw_triangle(cx - 17, hy + 20, cx - 10, hy + 20, cx - 13, hy + 33, false);
	draw_triangle(cx + 10, hy + 20, cx + 17, hy + 20, cx + 13, hy + 33, false);
	draw_triangle(cx - 5, ty - 15, cx + 5, ty - 15, cx, ty, false);
}
function drawBlaster(b) {
	if (b.t < -.25) return;
	var k = opt(b, "sc", 1), c = cos(b.ang), s = sin(b.ang), firing = b.t > b.charge, enter = clamp((b.t + .25)/.3, 0, 1);
	var dt2 = b.t - b.charge, back = power(1 - enter, 3)*90 + (firing ? min(1, dt2/.06)*10*k + 300*k*dt2*dt2 : 0);
	var X = b.x - c*back, Y = b.y - s*back, open = firing ? 4 : 0;
	draw_set_alpha(enter);
	// rayon
	if (b.t > b.charge && b.t < b.charge + b.fire + .2) {
		var life = (b.t - b.charge)/(b.fire + .2), wdb = b.wd*(life < .7 ? 1 : max(0, 1 - (life - .7)/.3))*min(1, life*14)*(1 + sin(t*70)*.07);
		var mx = X + c*22*k, my = Y + s*22*k;
		gpu_set_blendmode(bm_add); draw_set_alpha(.3*enter); draw_set_colour(b.color); draw_line_width(mx, my, mx + c*opt(b, "len", 1200), my + s*opt(b, "len", 1200), wdb*1.8); gpu_set_blendmode(bm_normal); draw_set_alpha(enter);
		draw_set_colour(b.color); draw_line_width(mx, my, mx + c*opt(b, "len", 1200), my + s*opt(b, "len", 1200), wdb);
		draw_circle(mx, my, wdb/2, false);
	} else if (!opt(b, "noaim", false) && b.t > 0 && b.t < b.charge && (floor(b.t*20) mod 2 == 0)) {
		draw_set_alpha(.35*enter); draw_set_colour(b.color); draw_line_width(X + c*22*k, Y + s*22*k, X + c*1200, Y + s*1200, 2); draw_set_alpha(enter);
	}
	// sprite du Gaster Blaster (datafiles/sprites/blaster_0.png, gueule vers le bas)
	if (array_length(sprBl) > 0) {
		var nbl = array_length(sprBl), fbl;
		if (firing) fbl = min(nbl - 1, 3 + floor(dt2/.05));
		else if (dt2 > -.1) fbl = min(nbl - 1, 3);
		else fbl = floor(max(0, b.t)*14) mod min(3, nbl);
		var spb = sprBl[fbl], bsc = 58*k/sprite_get_height(spb), jx = firing ? 0 : random_range(-.6, .6);
		var ab = enter*(dt2 > b.fire ? max(0, 1 - (dt2 - b.fire)/.2) : 1);
		draw_sprite_ext(spb, 0, X - c*4*k + jx, Y - s*4*k + jx, bsc, bsc, -radtodeg(b.ang) + 90 + power(1 - enter, 2)*220, c_white, ab);
		draw_set_alpha(1);
		return;
	}
	// crâne vu de dessus, gueule vers l'avant
	draw_set_colour(c_white);
	draw_circle(X - c*10*k, Y - s*10*k, 15*k, false);
	bquad(X, Y, c, s, k, -14, -15, 6, 15);
	bquad(X, Y, c, s, k, 6, -11 - open, 22, -2 - open);
	bquad(X, Y, c, s, k, 6, 2 + open, 22, 11 + open);
	draw_set_colour(c_black);
	btri(X, Y, c, s, k, -4, -11, 6, -6, -4, -3); btri(X, Y, c, s, k, -4, 11, 6, 6, -4, 3);
	if (b.t > 0 && !firing) { draw_set_colour(make_color_rgb(120, 200, 255)); draw_circle(X + (1*c + 7*s)*k, Y + (1*s - 7*c)*k, 2*k, false); }
	draw_set_alpha(1);
}
function drawBullets() {
	var blink = (floor(t*14) mod 2) == 0, i, b;
	for (i = 0; i < array_length(B); i++) {
		b = B[i];
		switch (b.kind) {
		case "wall":
			var gx = b.x - 5;
			if (b.gap == 0) drawBone(gx, box.y, 10, box.h, tintCol(b.tint, b.color));
			else { drawBone(gx, box.y - 6, 10, b.gy - b.gap/2 - box.y + 6, tintCol(b.tint, b.color)); drawBone(gx, b.gy + b.gap/2, 10, box.y + box.h - (b.gy + b.gap/2) + 6, tintCol(b.tint, b.color)); }
			break;
		case "spin":
			var ux = cos(b.ang)*b.len, uy = sin(b.ang)*b.len;
			if (b.warn > 0) { if (blink) { draw_set_alpha(.4); lineBone(b.cx - ux, b.cy - uy, b.cx + ux, b.cy + uy, b.wd, tintCol(b.tint, c_white)); draw_set_alpha(1); } }
			else lineBone(b.cx - ux, b.cy - uy, b.cx + ux, b.cy + uy, b.wd, tintCol(b.tint, c_white));
			break;
		case "bubble": draw_set_colour(b.color); draw_circle(b.cx, b.y, b.r, true); break;
		case "orb":
			if (b.warn > 0) { if (blink) { draw_set_colour(b.color); draw_circle(b.x, b.y, b.r + 4, true); } break; }
			draw_set_colour(b.color);
			if (b.vx != 0 || b.vy != 0) { draw_set_alpha(.3); draw_line_width(b.x, b.y, b.x - b.vx*.06, b.y - b.vy*.06, b.r*1.3); draw_set_alpha(1); }
			if (opt(b, "shape", "orb") == "reticle") { draw_circle(b.x, b.y, b.r, true); draw_line(b.x - b.r - 4, b.y, b.x + b.r + 4, b.y); draw_line(b.x, b.y - b.r - 4, b.x, b.y + b.r + 4); }
			else draw_circle(b.x, b.y, b.r, false);
			break;
		case "line":
			if (b.warn > 0) { var wl = 1 - b.warn/max(.001, b.warn0); draw_set_alpha(.15 + .5*wl); draw_set_colour(c_red); draw_line_width(b.x1, b.y1, b.x2, b.y2, 1 + wl*3); draw_set_alpha(1); break; }
			var ed = opt(b, "edge", -1);
			if (ed != -1) { draw_set_colour(ed); draw_line_width(b.x1, b.y1, b.x2, b.y2, b.wd + 4); }
			draw_set_colour(b.color); draw_line_width(b.x1, b.y1, b.x2, b.y2, b.wd);
			break;
		case "blaster": break;
		case "arrow": break;
		case "trident": break;
		case "redline":
			if (b.on) { draw_set_colour(b.color); draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h - 1, false); draw_set_alpha(.35); draw_rectangle(b.x, b.y - 1, b.x + b.w, b.y + b.h, false); draw_set_alpha(1); }
			break;
		case "redwash":
			if (fight.redOn) { draw_set_colour(make_color_rgb(255, 24, 0)); draw_rectangle(b.x - 4, b.y - 4, b.x + b.w + 4, b.y + b.h + 4, false); }
			break;
		default:
			if (b.warn > 0) { var wk = 1 - b.warn/max(.001, b.warn0); draw_set_alpha(.12 + .38*wk); draw_set_colour(b.kind == "pix" ? b.color : c_red); draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, false); draw_set_alpha(1); if (blink) draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, true); if (variable_struct_exists(b, "num")) txt(string(b.num), b.x + b.w/2, b.y + b.h/2 - 13, 22, c_white, "center"); break; }
			if (b.kind == "safe") { draw_set_alpha(.25); draw_set_colour(b.color); draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, false); draw_set_alpha(1); }
			else if (b.kind == "bonev") drawBone(b.x, b.y, b.w, b.h, tintCol(b.tint, b.color));
			else if (b.kind == "stab") {
				var sd2 = opt(b, "side", "bottom"), horiz = (sd2 == "left" || sd2 == "right"), nn, q, pr2 = 1 - opt(b, "pr", 1);
				var ox = (sd2 == "left") ? -pr2*b.w : ((sd2 == "right") ? pr2*b.w : 0), oy = (sd2 == "top") ? -pr2*b.h : ((sd2 == "bottom") ? pr2*b.h : 0);
				if (horiz) { nn = max(1, floor(b.h/14)); for (q = 0; q < nn; q++) drawBone(b.x + ox, b.y + q*b.h/nn + 2, b.w, 10, b.color); }
				else { nn = max(1, floor(b.w/14)); for (q = 0; q < nn; q++) drawBone(b.x + q*b.w/nn + 2, b.y + oy, 10, b.h, b.color); }
			}
			else { draw_set_colour(tintCol(b.tint, b.color)); draw_rectangle(b.x, b.y, b.x + b.w, b.y + b.h, false); }
		}
	}
	draw_set_alpha(1);
}
function drawBoss(f) {
	if (f.state == "enemy" && !is_undefined(f.pat) && opt(f.pat.spec, "hideBoss", false)) return;
	var b = f.b, sp = -1, sc = 1, xx = 320 - 130*(f.dodge > 0 ? 1 - sqr(1 - f.dodge) : 0) + random_range(-.5, .5)*f.enemyShake, yy = 30;
	if (isLB(f)) {
		sp = sprLB[min(2, f.ph)];
		if (f.animT >= 0) { var fl = sprLBA[min(2, f.ph)], fidl = floor(f.animT*14); if (fidl < array_length(fl)) sp = fl[fidl]; }
		if (f.ph >= 2 && sprGaster != -1) { var gs = 1.0; draw_sprite_ext(sprGaster, 0, 320 - sprite_get_width(sprGaster)*gs/2, 0, gs, gs, 0, c_white, .55 + .1*sin(t*2)); }
	} else {
		sp = (f.phase2 && spr2[f.i] != -1) ? spr2[f.i] : spr[f.i];
		if (f.animT >= 0 && !(f.phase2 && spr2[f.i] != -1)) { var fa = sprA[f.i], fid = floor(f.animT*14); if (fid < array_length(fa)) sp = fa[fid]; }
	}
	if (f.poseT > 0 && !(!isLB(f) && f.phase2 && spr2[f.i] != -1)) { var fpz = animFrames(f); if (array_length(fpz) > 0) sp = fpz[min(f.poseI, array_length(fpz) - 1)]; }
	if (sp != -1 && sprite_exists(sp)) {
		var br = sin(t*2.2), syy = sc*(1 + br*.014), sxx = sc*(1 - br*.009), sw = sin(t*1.1)*2 + xx;
		var px = sw - sprite_get_width(sp)*sxx/2, py = yy + 175 - sprite_get_height(sp)*syy;
		if (f.phase2) { gpu_set_blendmode(bm_add); var ac = hexc(b.col); for (var ai = 0; ai < 3; ai++) draw_sprite_ext(sp, 0, px + cos(t*3 + ai*2.1)*4, py + sin(t*3 + ai*2.1)*3, sxx, syy, 0, ac, .2); gpu_set_blendmode(bm_normal); }
		if (opt(f, "drawn", "") != "" && f.state == "enemy") { gpu_set_fog(true, c_white, 0, 0); draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, 1); gpu_set_fog(false, c_white, 0, 0); txt(f.drawn, 320, 4, 18, flashC, "center"); }
		else draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, 1);
		if (bossFlash > 0) { gpu_set_fog(true, c_white, 0, 0); draw_sprite_ext(sp, 0, px, py, sxx, syy, 0, c_white, bossFlash*.8); gpu_set_fog(false, c_white, 0, 0); }
	}
	else { // Sans secret sans dessin : silhouette simple
		draw_set_colour(hexc(b.col)); draw_circle(xx, yy + 60, 34, false); draw_rectangle(xx - 40, yy + 96, xx + 40, yy + 170, false);
		draw_set_colour(c_black); draw_circle(xx - 12, yy + 58, 7, false); draw_circle(xx + 12, yy + 58, 7, false);
	}
}
function drawFrame(x1, y1, w, h, col = c_white) {
	draw_set_colour(c_black); draw_rectangle(x1, y1, x1 + w, y1 + h, false);
	draw_set_colour(col); for (var i = 0; i < 4; i++) draw_rectangle(x1 - 2 - i + 2, y1 - 2 - i + 2, x1 + w + i, y1 + h + i, true);
}
function drawHud(f) {
	txt("SANS", 30, 395, 24); txt("LV 1", 112, 395, 24);
	txt("HP", 210, 398, 18);
	var bw = min(240, P.max*2.6);
	draw_set_colour(c_red); draw_rectangle(240, 397, 240 + bw, 417, false);
	draw_set_colour(c_yellow); draw_rectangle(240, 397, 240 + bw*P.hp/P.max, 417, false);
	if (P.kr > 0) { draw_set_colour(make_color_rgb(255, 0, 255)); draw_rectangle(240 + bw*(P.hp - P.kr)/P.max, 397, 240 + bw*P.hp/P.max, 417, false); }
	var hx = 250 + bw;
	if (opt(f.b, "kr", false)) { txt("KR", hx, 398, 18, P.kr > 0 ? make_color_rgb(255, 0, 255) : c_white); hx += 30; }
	txt(string(P.hp) + " / " + string(P.max), hx, 395, 24, P.kr > 0 ? make_color_rgb(255, 0, 255) : c_white);
	if (isLB(f) && f.ph >= 2) { txt("(les boutons sont brisés)", 320, 440, 18, make_color_rgb(125, 132, 153), "center"); return; }
	var names = ["ATTAQUE", "AGIR", "OBJET", "PITIÉ"], orange = make_color_rgb(255, 127, 39);
	for (var i = 0; i < 4; i++) {
		var bx = 22 + i*153, on = (f.state == "menu" && f.menuSel == i), col = on ? c_yellow : orange;
		draw_set_colour(col); draw_rectangle(bx, 432, bx + 130, 466, true); draw_rectangle(bx + 1, 433, bx + 129, 465, true);
		if (on) heart(bx + 18, 448, c_red, 1); else { draw_rectangle(bx + 12, 442, bx + 24, 454, true); }
		txt(names[i], bx + 76, 436, 24, col, "center");
	}
}
function game_draw() {
	if (t < DT*3) show_debug_message("DRAW scene=" + scene);
	draw_clear(c_black);
	var shk = OPT.shake ? shake : 0;
	var sx = random_range(-1, 1)*shk*.6, sy = random_range(-1, 1)*shk*.6;
	if (abs(scrRot) > .5) matrix_set(matrix_world, matrix_multiply(matrix_multiply(matrix_build(-320, -240, 0, 0, 0, 0, 1, 1, 1), matrix_build(0, 0, 0, 0, 0, scrRot, 1, 1, 1)), matrix_build(320 + sx, 240 + sy, 0, 0, 0, 0, 1, 1, 1)));
	else matrix_set(matrix_world, matrix_build(sx, sy, 0, 0, 0, 0, 1, 1, 1));
	var grey = make_color_rgb(125, 132, 153), i;
	switch (scene) {
	case "title":
		drawStars(make_color_rgb(120, 140, 255));
		if (LB_ONLY) {
			txt("LAST BREATH", 320, 60, 48, c_white, "center");
			txt("Choisis la phase de départ.", 320, 120, 22, grey, "center");
			for (i = 0; i < 3; i++) { var yy = 180 + i*78, on = (i == tsel);
				if (on) heart(150, yy + 16); txt(LBMENU[i][0], 176, yy, 34, on ? c_yellow : c_white); txt(LBMENU[i][1], 320, yy + 6, 22, on ? c_yellow : make_color_rgb(200, 205, 224)); txt(LBMENU[i][2], 176, yy + 38, 20, grey); }
		} else {
			txt(GAME_TITLE, 320, 96, 48, c_white, "center");
			var opts = ["Boss rush", "Marathon", "Records", "Options", "Crédits", "Quitter"];
			for (i = 0; i < 6; i++) { var y2 = 190 + i*36; if (i == tsel) heart(214, y2 + 14); txt(opts[i], 238, y2, 28, i == tsel ? c_yellow : c_white); }
			var tips = ["Choisis un adversaire et sa phase de départ.", "Tous les adversaires à la suite, sans seconde chance.", "Tes meilleurs temps et tes victoires.", "Volume, secousses, plein écran.", "Les créateurs des AU et des fan games.", "Fermer le jeu."];
			txt(tips[tsel], 320, 410, 18, make_color_rgb(200, 205, 224), "center");
		}
		txt("[HAUT BAS] choisir   [Z] valider   [P] pause en combat   [M] son   [F4] plein écran", 320, 446, 16, grey, "center");
		break;
	case "select":
		drawStars(hexc(bosses[sel].col));
		drawPortrait(sel, 320, 392, .16);
		txt("BOSS RUSH", 320, 12, 40, c_white, "center");
		txt("Choisis ton adversaire.", 320, 50, 20, c_white, "center");
		var nb = array_length(bosses), rows = ceil(nb/3), top = clamp(floor(sel/3) - 2, 0, max(0, rows - 6));
		if (top > 0) txt("^", 612, 78, 20); if (top + 6 < rows) txt("v", 612, 360, 20);
		for (i = 0; i < nb; i++) { var r = floor(i/3) - top; if (r < 0 || r > 5) continue;
			var cc = i mod 3, bx = 20 + cc*196, by = 78 + r*52, on2 = (i == sel), bb = bosses[i], nms = nm(bb);
			if (on2) heart(bx + 14, by + 18); else txt(string(i + 1), bx + 4, by + 11, 18, make_color_rgb(85, 91, 110));
			txt(nms, bx + 34, by + (string_length(nms) > 12 ? 7 : 3), string_length(nms) > 12 ? 17 : 24, on2 ? c_yellow : c_white);
			txt(bb.au, bx + 34, by + 26, 16, grey); }
		var bs = bosses[sel];
		txt(nm(bs) + " - " + bs.au + (opt(bs, "by", "") != "" ? " - créé par " + bs.by : ""), 320, 396, 20, c_white, "center");
		txt("[Z] combattre   [X] retour", 320, 446, 20, grey, "center");
		break;
	case "phase":
		var bp = bosses[sel], O = rushOpts(bp), g = array_length(O) > 2 ? 78 : 96, y0 = array_length(O) > 2 ? 150 : 170;
		drawStars(hexc(bp.col));
		drawPortrait(sel, 548, 425, .45);
		txt("BOSS RUSH", 320, 12, 40, c_white, "center");
		txt(nm(bp) + " - " + bp.au, 320, 56, 22, hexc(bp.col), "center");
		txt("Choisis la phase de départ.", 320, 90, 20, c_white, "center");
		for (i = 0; i < array_length(O); i++) { var y3 = y0 + i*g, on3 = (i == psel);
			if (on3) heart(150, y3 + 16); txt(O[i][0], 176, y3, 34, on3 ? c_yellow : c_white); txt(O[i][1], 320, y3 + 6, 22, on3 ? c_yellow : make_color_rgb(200, 205, 224)); txt(O[i][2], 176, y3 + 38, 20, grey); }
		txt("[HAUT BAS] choisir   [Z] combattre   [X] retour", 320, 446, 20, grey, "center");
		break;
	case "records":
		drawStars(make_color_rgb(120, 140, 255));
		txt("RECORDS", 320, 10, 36, c_white, "center");
		txt("ADVERSAIRE", 40, 52, 16, grey); txt("VICTOIRES", 300, 52, 16, grey); txt("MEILLEUR TEMPS", 400, 52, 16, grey); txt("COUPS", 550, 52, 16, grey);
		for (i = 0; i < array_length(bosses); i++) { var rr = recOf(bosses[i].short), ry = 74 + i*22, rc = rr.wins > 0 ? c_white : make_color_rgb(85, 91, 110);
			txt(nm(bosses[i]), 40, ry, 16, rr.wins > 0 ? hexc(bosses[i].col) : rc); txt(string(rr.wins), 300, ry, 16, rc);
			txt(rr.best >= 0 ? fmtTime(rr.best) : "-", 400, ry, 16, rc); txt(rr.hits >= 0 ? string(rr.hits) : "-", 550, ry, 16, rc); }
		var mr0 = opt(REC, "_marathon", undefined);
		txt("MARATHON : " + (is_struct(mr0) ? string(opt(mr0, "n", 0)) + " / " + string(array_length(bosses)) + " en " + fmtTime(opt(mr0, "time", 0)) : "jamais tenté"), 320, 392, 20, c_yellow, "center");
		txt("Les records comptent pour un combat commencé en phase 1.", 320, 420, 16, grey, "center");
		txt("[Z] retour", 320, 448, 18, grey, "center");
		break;
	case "options":
		drawStars(make_color_rgb(120, 140, 255));
		txt("OPTIONS", 320, 40, 40, c_white, "center");
		var ol = ["Volume", "Secousses d'écran", "Plein écran", wipeArm ? "Effacer les records : [Z] pour confirmer" : "Effacer les records", "Retour"];
		var ov = ["", OPT.shake ? "oui" : "non", OPT.full ? "oui" : "non", "", ""];
		for (i = 0; i < 5; i++) { var oy = 140 + i*48, oon = (i == osel);
			if (oon) heart(120, oy + 14); txt(ol[i], 146, oy, 26, oon ? c_yellow : c_white); txt(ov[i], 460, oy, 26, oon ? c_yellow : c_white);
			if (i == 0) { for (var vi = 0; vi < 10; vi++) { draw_set_colour(vi < OPT.vol ? (oon ? c_yellow : c_white) : make_color_rgb(60, 64, 80)); draw_rectangle(400 + vi*16, oy + 6, 411 + vi*16, oy + 24, false); } } }
		txt("[HAUT BAS] choisir   [GAUCHE DROITE] régler   [X] retour", 320, 440, 18, grey, "center");
		break;
	case "credits":
		drawStars(make_color_rgb(120, 140, 255));
		var CL = [[GAME_TITLE, 40, c_white], ["", 20, grey], ["Fan game non officiel et non commercial.", 20, c_white], ["", 20, grey],
			["UNDERTALE et DELTARUNE", 26, c_yellow], ["Toby Fox", 22, c_white], ["", 20, grey], ["LES ADVERSAIRES", 26, c_yellow]];
		for (i = 0; i < array_length(bosses); i++) { var cb = bosses[i]; array_push(CL, [nm(cb), 22, hexc(cb.col)]); array_push(CL, [cb.au + (opt(cb, "by", "") != "" ? " - " + cb.by : ""), 18, grey]); }
		array_push(CL, ["", 20, grey]); array_push(CL, ["Les personnages, musiques et sprites", 20, c_white]); array_push(CL, ["appartiennent à leurs auteurs respectifs.", 20, c_white]);
		array_push(CL, ["", 20, grey]); array_push(CL, ["Merci d'avoir joué.", 26, c_yellow]);
		var cy0 = 470 - credY, ctot = 0;
		for (i = 0; i < array_length(CL); i++) { var ch = CL[i][1] + 12; if (cy0 > -40 && cy0 < 440) txt(CL[i][0], 320, cy0, CL[i][1], CL[i][2], "center"); cy0 += ch; ctot += ch; }
		if (credY > ctot + 480) credY = 0;
		draw_set_colour(c_black); draw_rectangle(0, 446, 640, 480, false);
		txt("[BAS] accélérer   [Z] retour", 320, 452, 18, grey, "center");
		break;
	case "maraend":
		drawStars(make_color_rgb(255, 200, 80));
		txt("MARATHON", 320, 80, 56, c_white, "center");
		txt(maraN >= array_length(bosses) ? "Tous les adversaires sont vaincus." : "Le marathon s'arrête ici.", 320, 170, 24, grey, "center");
		txt(string(maraN) + " / " + string(array_length(bosses)) + " adversaires", 320, 220, 34, c_yellow, "center");
		txt("Temps de combat : " + fmtTime(maraT), 320, 274, 24, c_white, "center");
		if (newRec) txt("NOUVEAU RECORD", 320, 320, 26, c_yellow, "center");
		txt("[Z] retour", 320, 410, 24, grey, "center");
		break;
	case "win":
		if (isLB(fight) && winRes == "kill") {
			var wsp = sprLB[2];
			if (wsp != -1 && sprite_exists(wsp)) { var ww = sprite_get_width(wsp), wh = sprite_get_height(wsp), cut = floor(clamp((winT - 2.5)/3, 0, 1)*wh); if (cut < wh) draw_sprite_part(wsp, 0, 0, cut, ww, wh - cut, 320 - ww/2, 120 + cut); }
			if (winT > 7) { txt("LV 20", 320, 60, 40, c_white, "center"); txt("PV 99 / 99", 320, 110, 24, grey, "center"); txt("[Z] retour", 320, 400, 24, c_white, "center"); }
			if (winT < 1.2) { draw_set_alpha(1 - winT/1.2); draw_set_colour(c_white); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1); }
			break;
		}
		txt(winRes == "spare" ? "ÉPARGNÉ" : "VICTOIRE", 320, 150, 64, c_white, "center");
		txt(nm(fight.b) + (winRes == "spare" ? " a été épargné." : " est vaincu."), 320, 250, 26, grey, "center");
		if (fight.startPh == 0) txt("Temps " + fmtTime(runT) + "   Coups reçus " + string(runHits) + (newRec ? "   NOUVEAU RECORD" : ""), 320, 300, 20, newRec ? c_yellow : c_white, "center");
		if (marathon) txt("Marathon : " + string(maraN) + " / " + string(array_length(bosses)), 320, 340, 22, c_yellow, "center");
		txt(marathon ? "[Z] combat suivant" : "[Z] retour", 320, 400, 24, c_white, "center");
		break;
	case "lose":
		txt("GAME", 320, 90, 96, c_white, "center"); txt("OVER", 320, 180, 96, c_white, "center");
		if (isLB(fight)) { var go = LBTXT.gameover; for (i = 0; i < array_length(go); i++) txt(go[i], 320, 292 + i*28, 24, c_white, "center"); }
		else txt("Reste déterminé...", 320, 320, 26, c_white, "center");
		txt(marathon ? "[Z] fin du marathon" : "[Z] réessayer    [X] " + (LB_ONLY ? "choix de phase" : "boss rush"), 320, 410, 24, grey, "center");
		draw_set_alpha(1 - clamp((loseT - 1.1)/.5, 0, 1)); draw_set_colour(c_black); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1);
		if (loseT < .95) { heart(P.x, P.y, c_red, 1.1); if (loseCrack) { draw_set_colour(c_black); draw_line_width(P.x - 1, P.y - 8, P.x + 3, P.y - 3, 2); draw_line_width(P.x + 3, P.y - 3, P.x - 3, P.y + 1, 2); draw_line_width(P.x - 3, P.y + 1, P.x + 1, P.y + 8, 2); } }
		drawPart();
		break;
	case "fight":
		drawFight();
		break;
	}
	matrix_set(matrix_world, matrix_build_identity());
	if (paused && scene == "fight") {
		draw_set_alpha(.72); draw_set_colour(c_black); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1);
		txt("PAUSE", 320, 110, 56, c_white, "center");
		var pl = marathon ? ["Reprendre", "Abandonner le marathon"] : ["Reprendre", "Recommencer", "Quitter le combat"];
		for (i = 0; i < array_length(pl); i++) { var py0 = 220 + i*44; if (i == pauseSel) heart(196, py0 + 14); txt(pl[i], 222, py0, 28, i == pauseSel ? c_yellow : c_white); }
		txt("[P] ou [Échap] reprendre", 320, 420, 18, grey, "center");
	}
	if (fadeA > 0) { draw_set_alpha(fadeA); draw_set_colour(c_black); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1); }
	if (AUTOTEST && atShot < 16 && (atFrame mod 1300) == 700) { screen_save("at_" + string(atShot) + ".png"); atShot++; }
}
function drawFight() {
	var f = fight, i;
	drawBack(f);
	drawBoss(f);
	if (isLB(f)) txt("PHASE " + string(min(2, f.ph) + 1), 24, 16, 20, hexc(f.b.col));
	// résultat de l'attaque
	if (f.state == "attack" && f.atk.done && !is_undefined(f.res)) {
		var tt = f.atk.t;
		if (f.res.dmg > 0 && tt < .45) { draw_set_colour(c_red); var k = min(1, tt/.25); draw_line_width(290, 80, 290 + 60*k, 80 + 120*k, 5); }
		var yy = 40 - min(20, tt*60);
		if (f.res.dmg > 0) txt(string(f.res.dmg), 320, yy, 40, c_red, "center"); else txt(f.resTxt, 320, yy, 34, make_color_rgb(192, 192, 192), "center");
		var bw = 200, cur = lerp(f.res.prev, f.hp, min(1, tt*2));
		draw_set_colour(make_color_rgb(64, 64, 64)); draw_rectangle(220, 196, 220 + bw, 208, false);
		draw_set_colour(make_color_rgb(0, 255, 0)); draw_rectangle(220, 196, 220 + bw*max(0, cur)/f.max, 208, false);
	}
	drawFrame(box.x, box.y, box.w, box.h, (f.state == "enemy") ? opt(f, "frameC", c_white) : c_white);
	if (!is_undefined(f.level)) { draw_set_colour(f.levelColor); draw_rectangle(box.x, f.level, box.x + box.w, box.y + box.h, false); draw_set_colour(f.levelEdge); draw_line_width(box.x, f.level, box.x + box.w, f.level, 2); }
	if (f.state == "dialog" && !is_undefined(dlg)) {
		var L = dlg.lines[dlg.i], who = lineSpeaker(L), s = string_copy(lineText(L), 1, floor(dlg.c));
		if (who == "*") txtw("* " + s, box.x + 20, box.y + 16, 24, c_white, box.w - 40);
		else { txt(who, box.x + 20, box.y + 12, 20, who == "SANS" ? c_white : (who == "GASTER" ? make_color_rgb(200, 200, 200) : hexc(f.b.col))); txtw(s, box.x + 20, box.y + 40, 24, c_white, box.w - 40); }
	}
	if (f.state == "menu") txtw("* " + string_copy(f.flavor, 1, floor(f.fc)), box.x + 20, box.y + 16, 24, c_white, box.w - 40);
	if (f.state == "attack") {
		var cx0 = box.x + box.w/2, cy0 = box.y + box.h/2;
		if (opt(f.b, "hues", false)) { var HC = ["#39e05a", "#3d6bff", "#8a2be2", "#ff3df0", "#ff1a1a", "#ff9a2e", "#ffe21a"], hq; draw_set_alpha(.45);
			for (hq = 0; hq < 7; hq++) { draw_set_colour(hexc(HC[hq])); draw_rectangle(box.x + 8 + hq*(box.w - 16)/7 + 2, box.y + 30, box.x + 8 + (hq + 1)*(box.w - 16)/7 - 2, box.y + box.h - 30, false); } draw_set_alpha(1); }
		draw_set_colour(c_white); draw_ellipse(box.x + 14, box.y + 10, box.x + box.w - 14, box.y + box.h - 10, true);
		draw_ellipse(cx0 - 60, box.y + 24, cx0 + 60, box.y + box.h - 24, true);
		draw_set_colour(make_color_rgb(0, 160, 0)); draw_rectangle(cx0 - 3, box.y + 8, cx0 + 3, box.y + box.h - 8, false);
		if (!f.atk.done || (floor(t*12) mod 2 == 0)) { var ax = box.x + 8 + f.atk.x*(box.w - 16); draw_set_colour(c_white); draw_rectangle(ax - 5, box.y + 4, ax + 5, box.y + box.h - 4, false); draw_set_colour(c_black); draw_rectangle(ax - 2, box.y + 8, ax + 2, box.y + box.h - 8, false); }
	}
	if (f.state == "enemy") {
		// projectiles découpés au cadre de la boîte
		var ident = matrix_get(matrix_world);
		matrix_set(matrix_world, matrix_build_identity());
		if (!surface_exists(surf)) surf = surface_create(640, 480);
		surface_set_target(surf); draw_clear_alpha(c_black, 0); drawBullets(); surface_reset_target();
		matrix_set(matrix_world, ident);
		draw_surface_part(surf, max(0, box.x), max(0, box.y), box.w, box.h, max(0, box.x), max(0, box.y));
		for (i = 0; i < array_length(B); i++) if (B[i].kind == "trident" && B[i].age >= 0) drawTrident(B[i]);
		if (f.redOn) { draw_set_colour(make_color_rgb(255, 24, 0)); draw_rectangle(box.x - 4, box.y - 4, box.x + box.w + 4, box.y + box.h + 4, false); }
		if (f.state == "enemy" && !is_undefined(f.pat) && opt(f.pat.spec, "gauge", false)) {
			var gk = clamp(1 - f.patT/max(.1, f.pat.dur), 0, 1);
			draw_set_colour(make_color_rgb(0, 220, 60)); draw_rectangle(box.x + box.w + 12, box.y + box.h - 6, box.x + box.w + 12 + 64*gk, box.y + box.h - 1, false);
		}
		for (i = 0; i < array_length(B); i++) if (B[i].kind == "blaster") drawBlaster(B[i]);
		for (i = 0; i < array_length(TRAIL); i++) { draw_set_alpha(TRAIL[i].t/.2*.3); heart(TRAIL[i].x, TRAIL[i].y, soulCol(f), .7); }
		draw_set_alpha(1);
		var sc = (P.inv > 0 && (floor(t*20) mod 2 == 0) && !opt(f.b, "kr", false)) ? -1 : 1;
		if (sc > 0) heart(P.x, P.y, f.redOn ? c_black : soulCol(f), .85);
		for (i = 0; i < array_length(B); i++) if (B[i].kind == "arrow") { var ab = B[i]; lineBone(ab.x - sign(ab.vx)*9, ab.y - sign(ab.vy)*9, ab.x + sign(ab.vx)*9, ab.y + sign(ab.vy)*9, 6, ab.color); }
		if (opt(f, "shield", false)) { var sa = shieldDir*pi/2, shx = P.x + cos(sa)*19, shy = P.y - sin(sa)*19, gk;
			draw_set_colour(make_color_rgb(60, 120, 255)); draw_line_width(shx - sin(sa)*15, shy - cos(sa)*15, shx + sin(sa)*15, shy + cos(sa)*15, 4);
			draw_set_colour(make_color_rgb(57, 224, 90)); for (gk = 0; gk < 4; gk++) { var ga = gk*pi/2, gx2 = P.x + cos(ga)*(box.w/2 + 22), gy2 = P.y - sin(ga)*(box.h/2 + 22); draw_triangle(gx2 - cos(ga)*8, gy2 + sin(ga)*8, gx2 + cos(ga)*6 - sin(ga)*9, gy2 - sin(ga)*6 - cos(ga)*9, gx2 + cos(ga)*6 + sin(ga)*9, gy2 - sin(ga)*6 + cos(ga)*9, false); } }
	}
	drawPart();
	if (f.state == "enemy" && !is_undefined(f.pat) && opt(f.pat.spec, "glyphs", false)) {
		draw_set_colour(c_white);
		for (var gi = 0; gi < 14; gi++) { var gx = 60 + ((gi*97 + floor(t*14*(1 + (gi mod 3)))) mod 520), gy = 40 + ((gi*61 + floor(t*9)) mod 380), gs = 3 + (gi mod 4); draw_set_alpha(.35 + .25*sin(t*3 + gi));
			switch (gi mod 4) { case 0: draw_rectangle(gx, gy, gx + gs*2, gy + gs*2, true); break; case 1: draw_triangle(gx, gy + gs*2, gx + gs, gy, gx + gs*2, gy + gs*2, true); break; case 2: draw_circle(gx, gy, gs, true); break; default: draw_line(gx, gy, gx + gs*2, gy + gs*2); draw_line(gx + gs*2, gy, gx, gy + gs*2); } }
		draw_set_alpha(1);
	}
	if (!is_undefined(banner)) txt(banner.txt, 320, box.y - 34, 22, c_yellow, "center");
	drawHud(f);
	if (flashT > 0) { draw_set_alpha(min(1, flashT*3)); draw_set_colour(flashC); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1); }
	if (hurtFlash > 0) { draw_set_alpha(hurtFlash*.22); draw_set_colour(c_red); draw_rectangle(-20, -20, 660, 500, false); draw_set_alpha(1); }
}
