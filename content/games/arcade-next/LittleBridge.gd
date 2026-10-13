extends Node

var fonts = {}
var restored = false
var previous_paused = false
var external_paused = false
var clock = 0.0
var progress = {}

func _ready():
	pause_mode = Node.PAUSE_MODE_PROCESS
	if OS.has_feature("JavaScript"):
		var parsed = JSON.parse(str(JavaScript.eval("JSON.stringify(window.FufuGodot.state)", true)))
		if parsed.error == OK and typeof(parsed.result) == TYPE_DICTIONARY:
			progress = parsed.result
	call_deferred("decorate")

func has_progress():
	return int(progress.get("level", 0)) >= 1 and int(progress.get("level", 0)) <= 6

func resume_progress():
	var data = get_node("/root/PlayerData")
	data.new_game()
	data.level = int(progress.level) - 1
	data.score = int(progress.get("score", 0))
	data.health = int(clamp(progress.get("health", 3), 1, 3))
	data.chutes = int(clamp(progress.get("chutes", 3), 0, 99))
	data.intro_played = true
	data.new_level()
	get_tree().change_scene("res://code/levels/Level%02d.tscn" % int(progress.level))

func font(size):
	if not fonts.has(size):
		var f = DynamicFont.new()
		f.font_data = load("res://fufu-sc.ttf")
		f.size = size
		fonts[size] = f
	return fonts[size]

func localize(node):
	if node is Label or node is Button:
		var old = node.get_font("font")
		var size = old.size if old is DynamicFont else 32
		if node is Label and node.name in ["You", "Them", "Collect", "Escape"]:
			size = 62
		node.add_font_override("font", font(size))
	for child in node.get_children():
		localize(child)

func decorate():
	var current = get_tree().current_scene
	if current == null:
		return
	localize(current)
	if current.filename == "res://code/MainScreen.tscn":
		var button = current.get_node_or_null("Menu/StartGame")
		if button != null and has_progress():
			button.text = "继续任务"

func snapshot():
	var data = get_node_or_null("/root/PlayerData")
	if data == null or not OS.has_feature("JavaScript"):
		return
	if data.level >= 1 and data.level <= 6:
		progress = {"level":data.level,"score":data.retry_score,"health":max(1,data.retry_health),"chutes":data.retry_chutes}
	elif data.level > 6:
		progress = {"level":7,"score":data.score,"complete":true}
	JavaScript.eval("window.FufuGodot.save(" + JSON.print(progress) + ");window.FufuGodot.captured();", true)
	var current = get_tree().current_scene
	var player = current.get_node_or_null("Player") if current != null else null
	var pos = player.position if player is Node2D else Vector2.ZERO
	if player != null:
		var names = []
		for child in player.get_children():
			names.append(child.name)
		JavaScript.eval("window.FufuGodot.children=" + JSON.print(names) + ";",true)
	JavaScript.eval("window.FufuGodot.nativeState=" + JSON.print({"level":data.level,"score":data.score,"scene":current.filename if current != null else "","x":pos.x,"y":pos.y,"time":data.time_remaining}) + ";", true)

func _process(delta):
	if not OS.has_feature("JavaScript"):
		return
	var paused = bool(JavaScript.eval("window.FufuGodot.paused", true))
	if paused and not external_paused:
		previous_paused = get_tree().paused
		get_tree().paused = true
	elif not paused and external_paused:
		get_tree().paused = previous_paused
	external_paused = paused
	if bool(JavaScript.eval("window.FufuGodot.restart", true)):
		progress = {}
		get_node("/root/PlayerData").new_game()
		JavaScript.eval("window.FufuGodot.restart=false;window.FufuGodot.save({});",true)
		get_tree().change_scene("res://code/MainScreen.tscn")
	clock += delta
	if clock > 0.3 or bool(JavaScript.eval("window.FufuGodot.capture",true)):
		clock = 0.0
		decorate()
		snapshot()
