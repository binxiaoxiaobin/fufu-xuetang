extends Node

var clock = 0.0
var save_clock = 0.0
var fonts = {}
var translations = {}
var star = false
var data_dir = ""
var last_save = ""
var external_paused = false
var previous_paused = false

func _enter_tree():
	pause_mode = Node.PAUSE_MODE_PROCESS
	star = ProjectSettings.get_setting("application/config/name") == "Starcatcher"
	if not OS.has_feature("JavaScript"):
		return
	data_dir = "user://learner-" + str(JavaScript.eval("window.FufuGodot.learnerId", true))
	var state = JSON.parse(str(JavaScript.eval("JSON.stringify(window.FufuGodot.state)", true))).result
	if not star and typeof(state) == TYPE_DICTIONARY:
		var directory = Directory.new()
		directory.make_dir_recursive(data_dir)
		for relative in state:
			if relative.begins_with("/") or ".." in relative or typeof(state[relative]) != TYPE_STRING or not (relative.ends_with(".ini") or relative.ends_with(".dat")):
				continue
			var path = data_dir + "/" + relative
			directory.make_dir_recursive(path.get_base_dir())
			var file = File.new()
			if file.open(path, File.WRITE) == OK:
				file.store_buffer(Marshalls.base64_to_raw(state[relative]))
				file.close()

func _ready():
	var file = File.new()
	if file.open("res://fufu-zh.json", File.READ) == OK:
		translations = JSON.parse(file.get_as_text()).result
		file.close()
	call_deferred("restore_star")

func restore_star():
	if not star or not OS.has_feature("JavaScript"):
		return
	var state = JSON.parse(str(JavaScript.eval("JSON.stringify(window.FufuGodot.state)", true))).result
	var global_node = get_node_or_null("/root/global")
	if typeof(state) == TYPE_DICTIONARY and global_node != null and state.has("level"):
		global_node.idxCurrentLevel = int(clamp(state.level, 0, global_node.arrLevels.size() - 1))
		global_node.bPlayerCanFlip = state.get("flip", false)
		global_node.changeSceneTo(global_node.arrLevels[global_node.idxCurrentLevel])

func get_font(size):
	if not fonts.has(size):
		var font = DynamicFont.new()
		font.font_data = load("res://fufu-sc.ttf")
		font.size = size
		font.use_filter = false
		fonts[size] = font
	return fonts[size]

func localize(node):
	if node is Label or node is Button or node is LineEdit or node is TextEdit:
		var old = node.get("text")
		if typeof(old) == TYPE_STRING and translations.has(old):
			node.set("text", translations[old])
		node.add_font_override("font", get_font(11 if star else 13))
	elif node is RichTextLabel:
		node.add_font_override("normal_font", get_font(13))
	elif node is PopupMenu:
		node.add_font_override("font", get_font(13))
		for i in range(node.get_item_count()):
			var text = node.get_item_text(i)
			if translations.has(text):
				node.set_item_text(i, translations[text])
	for child in node.get_children():
		localize(child)

func collect(directory_path, relative, result):
	var directory = Directory.new()
	if directory.open(directory_path) != OK:
		return
	directory.list_dir_begin(true, true)
	var entry = directory.get_next()
	while entry != "":
		var path = directory_path + "/" + entry
		var key = relative + entry
		if directory.current_is_dir():
			if not entry.to_lower() in ["worlds", "cache"]:
				collect(path, key + "/", result)
		elif entry.ends_with(".ini") or entry.ends_with(".dat"):
			var file = File.new()
			if file.open(path, File.READ) == OK:
				if file.get_len() < 200000:
					result[key] = Marshalls.raw_to_base64(file.get_buffer(file.get_len()))
				file.close()
		entry = directory.get_next()
	directory.list_dir_end()

func snapshot():
	var result = {}
	if star:
		var global_node = get_node_or_null("/root/global")
		if global_node != null:
			result = {"level":global_node.idxCurrentLevel, "flip":global_node.bPlayerCanFlip}
	else:
		collect(data_dir, "", result)
	var value = JSON.print(result)
	if value != last_save:
		last_save = value
		JavaScript.eval("window.FufuGodot.save(" + value + ")", true)
	JavaScript.eval("window.FufuGodot.captured()", true)

func _process(delta):
	if not OS.has_feature("JavaScript"):
		return
	clock += delta
	save_clock += delta
	if clock >= 0.25:
		clock = 0
		localize(get_tree().root)
		var paused = bool(JavaScript.eval("window.FufuGodot.paused", true))
		# YKnytt also pauses its tree for in-game screens; preserve that state.
		if paused:
			if not external_paused:
				previous_paused = get_tree().paused
			get_tree().paused = true
		elif external_paused:
			get_tree().paused = previous_paused
		external_paused = paused
		AudioServer.set_bus_mute(0, paused)
		if JavaScript.eval("window.FufuGodot.capture", true) or save_clock >= 5:
			save_clock = 0
			snapshot()
