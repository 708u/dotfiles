local M = {}

local targets = ya.sync(function()
	local paths = {}
	for _, url in pairs(cx.active.selected) do
		paths[#paths + 1] = tostring(url.path)
	end
	if #paths == 0 and cx.active.current.hovered then
		paths[1] = tostring(cx.active.current.hovered.path)
	end
	return paths
end)

local function notify(content, level)
	ya.notify { title = "Send to agent", content = content, timeout = 5, level = level }
end

-- agent の入力欄の内容は読み取れないため、この yazi から追記した内容を一覧表示用に記録しておく
local sent_entries = ya.sync(function(state) return state.entries or {} end)

local record_sent = ya.sync(function(state, text)
	state.entries = state.entries or {}
	state.entries[#state.entries + 1] = text
	return #state.entries
end)

local function show_list()
	local entries = sent_entries()
	if #entries == 0 then
		return notify("まだ agent の入力欄へ追記していない", "info")
	end
	local lines = {}
	for i, text in ipairs(entries) do
		lines[i] = ui.Line(string.format("%d. %s", i, text))
	end
	ya.confirm {
		pos = { "center", w = 100, h = math.min(#lines + 4, 30) },
		title = ui.Line(string.format("agent の入力欄に追記したコメント (%d 件)", #lines)),
		body = ui.Text(lines):align(ui.Align.LEFT):wrap(ui.Wrap.YES),
	}
end

-- agent は yazi を起動した pane の directory で動いているため、その directory からの相対パスで渡す
local function relative(path, base)
	if base and path:sub(1, #base + 1) == base .. "/" then
		return path:sub(#base + 2)
	end
	return path
end

-- herdr は結果を JSON で stdout に出すため、yazi の画面に流れないよう output() で受け取る
local function herdr(args)
	local output, err = Command("herdr"):arg(args):output()
	if not output then
		return "herdr を実行できない: " .. tostring(err)
	elseif not output.status.success then
		return "herdr の実行に失敗した: " .. output.stderr
	end
end

function M:entry(job)
	if job.args[1] == "list" then
		return show_list()
	end

	ya.emit("escape", { visual = true })

	-- herdr の custom command から起動したときだけ、起動元の pane の ID が渡される
	local pane = os.getenv("HERDR_ACTIVE_PANE_ID")
	if not pane then
		return notify("herdr の custom command の外では送り先の pane がない", "warn")
	end

	local paths = targets()
	if #paths == 0 then
		return
	end

	local comment, event = ya.input {
		pos = { "top-center", y = 2, w = 80 },
		title = string.format("Comment for %d file(s) (empty to send paths only):", #paths),
	}
	if event ~= 1 then
		return
	end

	local base = os.getenv("HERDR_ACTIVE_PANE_CWD")
	local mentions = {}
	for i, path in ipairs(paths) do
		mentions[i] = "@" .. relative(path, base)
	end
	local text = table.concat(mentions, " ")
	if comment ~= "" then
		text = text .. " " .. comment
	end

	-- 2 件目からは Shift+Enter で改行し、コメントを 1 行ずつ並べる。Enter は agent への送信になるため使わない
	if #sent_entries() > 0 then
		local err = herdr({ "pane", "send-keys", pane, "shift+enter" })
		if err then
			return notify(err, "error")
		end
	end
	local err = herdr({ "pane", "send-text", pane, text })
	if err then
		return notify(err, "error")
	end

	-- 続けて別のファイルにコメントできるよう yazi は閉じない。agent への送信は入力欄で確認してから行う
	local n = record_sent(text)
	ya.emit("escape", { select = true })
	notify(string.format("%d 件目を agent の入力欄に追記した。C で一覧、q で戻る", n), "info")
end

return M
