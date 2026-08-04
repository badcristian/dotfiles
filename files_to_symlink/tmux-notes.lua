local uv = vim.uv or vim.loop

local project_dir = assert(vim.env.TMUX_NOTES_PROJECT_DIR, "TMUX_NOTES_PROJECT_DIR is required")
local global_dir = assert(vim.env.TMUX_NOTES_GLOBAL_DIR, "TMUX_NOTES_GLOBAL_DIR is required")
local notes_root = assert(vim.env.TMUX_NOTES_ROOT, "TMUX_NOTES_ROOT is required")
local workspace_path = assert(vim.env.TMUX_NOTES_WORKSPACE, "TMUX_NOTES_WORKSPACE is required")

notes_root = vim.fs.normalize(notes_root)
local core = dofile(vim.fs.joinpath(vim.fs.dirname(workspace_path), "tmux-notes-core.lua"))

local workspace = {}
local state = {
  closing = false,
  current_buf = nil,
  current_path = nil,
  active_tag = nil,
  note_buffers = {},
  query = "",
  records = {},
  rendering = false,
  rows_by_line = {},
  tag_counts = {},
  visible_records = {},
}

local group = vim.api.nvim_create_augroup("TmuxNotesWorkspace", { clear = true })
local namespace = vim.api.nvim_create_namespace("tmux-notes-workspace")

local function effective_appearance()
  local cache_path = vim.fn.expand("~/.cache/macos-effective-appearance")
  local ok, lines = pcall(vim.fn.readfile, cache_path, "", 1)
  local appearance = ok and vim.trim(lines[1] or "") or ""

  if appearance ~= "light" and appearance ~= "dark" then
    local detected = vim.fn.system({
      "/usr/bin/osascript",
      "-l",
      "JavaScript",
      "-e",
      'ObjC.import("AppKit"); $.NSApplication.sharedApplication.effectiveAppearance.name.js',
    })
    appearance = detected:find("Dark", 1, true) and "dark" or "light"
  end

  return appearance
end

local appearance = effective_appearance()
vim.o.background = appearance
pcall(vim.cmd.colorscheme, appearance == "light" and "catppuccin-latte" or "catppuccin-frappe")

local close_workspace
local create_note
local delete_selected
local find_notes
local find_note_contents
local focus_editor
local focus_list
local move_list_selection
local open_wiki_link
local refresh
local rename_note
local select_tag

local function save_buffer(buf)
  if not (buf and vim.api.nvim_buf_is_valid(buf) and vim.bo[buf].modified) then
    return
  end

  pcall(vim.api.nvim_buf_call, buf, function()
    vim.cmd("silent update")
  end)
end

local function save_all()
  for buf in pairs(state.note_buffers) do
    save_buffer(buf)
  end
end

local function copy_to_clipboard(text, success_message)
  vim.fn.system({ "pbcopy" }, text)

  if vim.v.shell_error ~= 0 then
    vim.notify("Could not copy text", vim.log.levels.ERROR)
    return false
  end

  if success_message then
    vim.notify(success_message, vim.log.levels.INFO)
  end

  return true
end

local function copy_path(path)
  local buf = vim.fn.bufnr(path)
  local lines

  if buf ~= -1 and vim.api.nvim_buf_is_loaded(buf) then
    save_buffer(buf)
    lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  else
    lines = vim.fn.readfile(path)
  end

  copy_to_clipboard(table.concat(lines, "\n"), "Copied " .. vim.fn.fnamemodify(path, ":t:r"))
end

local function copy_visual_selection()
  local visual_mode = vim.fn.mode()

  if visual_mode ~= "v" and visual_mode ~= "V" and visual_mode ~= "\22" then
    return false
  end

  local lines = vim.fn.getregion(vim.fn.getpos("v"), vim.fn.getpos("."), { type = visual_mode })
  if #lines == 0 then
    return false
  end

  return copy_to_clipboard(table.concat(lines, "\n"))
end

local function scan_directory(scope, directory)
  local records = {}

  for name, entry_type in vim.fs.dir(directory) do
    if (entry_type == "file" or entry_type == "link") and name:sub(-3) == ".md" then
      local path = vim.fs.joinpath(directory, name)
      local stat = uv.fs_stat(path)
      local title = name:sub(1, -4)
      local ok, source_lines = pcall(vim.fn.readfile, path)
      local source = ok and table.concat(source_lines, "\n") or ""
      local tags = core.extract_tags(source)

      records[#records + 1] = {
        action = "open",
        label = string.format("[%s] %s", scope == "project" and "P" or "G", title),
        mtime = stat and stat.mtime.sec or 0,
        path = path,
        scope = scope,
        links = core.wiki_links(source),
        search = string.format("%s %s %s", scope, title, table.concat(tags, " ")),
        tags = tags,
        title = title,
      }
    end
  end

  return records
end

local function scan_notes()
  local records = scan_directory("project", project_dir)

  vim.list_extend(records, scan_directory("global", global_dir))
  table.sort(records, function(left, right)
    if left.mtime == right.mtime then
      return left.label:lower() < right.label:lower()
    end
    return left.mtime > right.mtime
  end)

  local titles = {}
  state.tag_counts = {}
  for _, record in ipairs(records) do
    titles[record.title:lower()] = record
    record.backlinks = 0
    for _, tag in ipairs(record.tags) do
      state.tag_counts[tag] = (state.tag_counts[tag] or 0) + 1
    end
  end

  for _, record in ipairs(records) do
    local seen_targets = {}
    for _, link in ipairs(record.links) do
      local target = titles[link.target:lower()]
      if target and not seen_targets[target.path] then
        seen_targets[target.path] = true
        target.backlinks = target.backlinks + 1
      end
    end
  end

  return records
end

local function all_note_paths()
  return vim.fs.find(function(name)
    return name:sub(-3) == ".md"
  end, {
    path = notes_root,
    type = "file",
    limit = math.huge,
  })
end

vim.cmd("silent! only")
vim.cmd("enew")
vim.o.mouse = "a"

local editor_win = vim.api.nvim_get_current_win()
local empty_buf = vim.api.nvim_get_current_buf()

vim.bo[empty_buf].buftype = "nofile"
vim.bo[empty_buf].bufhidden = "hide"
vim.bo[empty_buf].buflisted = false
vim.bo[empty_buf].swapfile = false
vim.bo[empty_buf].modifiable = false
vim.api.nvim_buf_set_name(empty_buf, "tmux-notes://empty")

vim.cmd("topleft vnew")

local list_win = vim.api.nvim_get_current_win()
local list_buf = vim.api.nvim_get_current_buf()

vim.bo[list_buf].buftype = "nofile"
vim.bo[list_buf].bufhidden = "hide"
vim.bo[list_buf].buflisted = false
vim.bo[list_buf].filetype = "tmuxnotes"
vim.bo[list_buf].swapfile = false
vim.bo[list_buf].modifiable = false
vim.api.nvim_buf_set_name(list_buf, "tmux-notes://list")

local list_width = math.max(30, math.min(36, math.floor(vim.o.columns * 0.24)))
vim.api.nvim_win_set_width(list_win, list_width)
vim.o.laststatus = 2
vim.wo[list_win].cursorline = true
vim.wo[list_win].number = false
vim.wo[list_win].relativenumber = false
vim.wo[list_win].signcolumn = "no"
vim.wo[list_win].spell = false
vim.wo[list_win].statusline = "%!v:lua.TmuxNotesWorkspace.statusline()"
vim.wo[list_win].winfixwidth = true
vim.wo[list_win].wrap = false

local restoring_list = false

local function restore_list_window()
  if restoring_list or state.closing then
    return
  end

  if not (vim.api.nvim_win_is_valid(list_win) and vim.api.nvim_buf_is_valid(list_buf)) then
    return
  end

  if vim.api.nvim_win_get_buf(list_win) == list_buf then
    return
  end

  restoring_list = true
  vim.api.nvim_win_set_buf(list_win, list_buf)
  restoring_list = false
end

vim.api.nvim_create_autocmd({ "BufWinEnter", "WinEnter" }, {
  group = group,
  callback = function()
    if vim.api.nvim_get_current_win() == list_win then
      vim.schedule(restore_list_window)
    end
  end,
})

local function ensure_editor_window()
  if vim.api.nvim_win_is_valid(editor_win) then
    return editor_win
  end

  if not vim.api.nvim_win_is_valid(list_win) then
    return nil
  end

  local previous_win = vim.api.nvim_get_current_win()
  vim.api.nvim_set_current_win(list_win)
  vim.cmd("rightbelow vsplit")

  editor_win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_buf(editor_win, empty_buf)
  vim.api.nvim_win_set_width(list_win, list_width)
  workspace.editor_win = editor_win

  if vim.api.nvim_win_is_valid(previous_win) then
    vim.api.nvim_set_current_win(previous_win)
  end

  return editor_win
end

local function set_empty_message(lines)
  if not ensure_editor_window() then
    return
  end

  vim.bo[empty_buf].modifiable = true
  vim.api.nvim_buf_set_lines(empty_buf, 0, -1, false, lines)
  vim.bo[empty_buf].modifiable = false
  vim.api.nvim_win_set_buf(editor_win, empty_buf)
  vim.wo[editor_win].number = false
  vim.wo[editor_win].relativenumber = false
  vim.wo[editor_win].signcolumn = "no"
  vim.wo[editor_win].statusline = "%!v:lua.TmuxNotesWorkspace.statusline()"
end

local function configure_note_buffer(buf)
  vim.bo[buf].bufhidden = "hide"
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].swapfile = false
  vim.b[buf].tmux_notes = true
  vim.b[buf].completion = true
  vim.bo[buf].spelllang = "en_us,ro"

  if not vim.b[buf].tmux_notes_configured then
    vim.b[buf].tmux_notes_configured = true
    state.note_buffers[buf] = true

    vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI", "BufLeave" }, {
      group = group,
      buffer = buf,
      callback = function(event)
        save_buffer(event.buf)
      end,
    })

    vim.keymap.set("n", "<Esc>", close_workspace, {
      buffer = buf,
      desc = "Save and close notes",
      silent = true,
    })
    vim.keymap.set("n", "<leader><space>", find_notes, {
      buffer = buf,
      desc = "Find notes",
      silent = true,
    })
    vim.keymap.set("n", "<leader>/", find_note_contents, {
      buffer = buf,
      desc = "Search note contents",
      silent = true,
    })
    vim.keymap.set("n", "s", find_note_contents, {
      buffer = buf,
      desc = "Search note contents",
      silent = true,
    })
    vim.keymap.set("n", "R", rename_note, {
      buffer = buf,
      desc = "Rename current note",
      silent = true,
    })
    vim.keymap.set("n", "gf", open_wiki_link, {
      buffer = buf,
      desc = "Open wiki link under cursor",
      silent = true,
    })
    vim.keymap.set("n", "?", function()
      workspace.show_help()
    end, {
      buffer = buf,
      desc = "Show notes keys",
      silent = true,
    })
    vim.keymap.set("i", "<C-l>", function()
      local ok, cmp = pcall(require, "blink.cmp")
      if ok then
        cmp.show()
      end
    end, {
      buffer = buf,
      desc = "Show word completion",
      silent = true,
    })
    vim.keymap.set({ "n", "i" }, "<Tab>", focus_list, {
      buffer = buf,
      desc = "Focus note list",
      silent = true,
    })
    vim.keymap.set({ "n", "i" }, "<C-h>", focus_list, {
      buffer = buf,
      desc = "Focus note list",
      silent = true,
    })
    vim.keymap.set({ "n", "i" }, "<F15>", function()
      move_list_selection(-1)
    end, {
      buffer = buf,
      desc = "Select previous note",
      silent = true,
    })
    vim.keymap.set({ "n", "i" }, "<F16>", function()
      move_list_selection(1)
    end, {
      buffer = buf,
      desc = "Select next note",
      silent = true,
    })
    vim.keymap.set("n", "<C-y>", function()
      copy_path(vim.api.nvim_buf_get_name(buf))
    end, {
      buffer = buf,
      desc = "Copy note",
      silent = true,
    })
    vim.keymap.set("n", "P", function()
      create_note("project")
    end, {
      buffer = buf,
      desc = "New project note",
      silent = true,
    })
    vim.keymap.set("n", "G", function()
      create_note("global")
    end, {
      buffer = buf,
      desc = "New global note",
      silent = true,
    })
    vim.keymap.set("x", "<LeftRelease>", function()
      vim.schedule(copy_visual_selection)
      return "<LeftRelease>"
    end, {
      buffer = buf,
      desc = "Auto-copy selected note text",
      expr = true,
      replace_keycodes = true,
      silent = true,
    })
  end
end

local function open_record(record)
  if not record or record.action ~= "open" then
    return
  end

  if not ensure_editor_window() then
    vim.notify("Could not restore the note editor", vim.log.levels.ERROR)
    return
  end

  if state.current_path ~= record.path then
    save_buffer(state.current_buf)
  end

  local buf = vim.fn.bufadd(record.path)
  vim.b[buf].tmux_notes = true
  vim.b[buf].completion = true
  vim.bo[buf].swapfile = false
  vim.fn.bufload(buf)
  configure_note_buffer(buf)
  vim.api.nvim_win_set_buf(editor_win, buf)

  vim.wo[editor_win].linebreak = true
  vim.wo[editor_win].number = true
  vim.wo[editor_win].relativenumber = false
  vim.wo[editor_win].signcolumn = "no"
  vim.wo[editor_win].spell = false
  vim.wo[editor_win].statusline = "%!v:lua.TmuxNotesWorkspace.statusline()"
  vim.wo[editor_win].wrap = true

  state.current_buf = buf
  state.current_path = record.path

  vim.schedule(function()
    if vim.api.nvim_buf_is_valid(buf) then
      pcall(vim.api.nvim_buf_call, buf, function()
        require("render-markdown").buf_enable()
      end)
    end
  end)
end

local function record_for_path(path)
  path = vim.fs.normalize(path)
  local notes_prefix = notes_root .. "/"
  if path:sub(1, #notes_prefix) ~= notes_prefix or path:sub(-3) ~= ".md" then
    return nil
  end

  local relative_path = path:sub(#notes_prefix + 1)
  local scope = relative_path:sub(1, 7) == "global/" and "global" or "project"
  local title = vim.fn.fnamemodify(path, ":t:r")
  return {
    action = "open",
    label = string.format("[%s] %s", scope == "global" and "G" or "P", title),
    path = path,
    scope = scope,
    search = relative_path,
    title = title,
  }
end

local function open_picker_item(picker, item, jump_to_match)
  picker:close()
  if not item then
    return
  end

  local path = Snacks.picker.util.path(item)
  local record = path and record_for_path(path) or nil
  if not record then
    vim.notify("That file is outside the notes directory", vim.log.levels.ERROR)
    return
  end

  vim.schedule(function()
    open_record(record)
    vim.api.nvim_set_current_win(editor_win)
    if jump_to_match and item.pos then
      local line_count = vim.api.nvim_buf_line_count(state.current_buf)
      local row = math.max(1, math.min(item.pos[1], line_count))
      local line = vim.api.nvim_buf_get_lines(state.current_buf, row - 1, row, false)[1] or ""
      local column = math.max(0, math.min(item.pos[2], #line))
      vim.api.nvim_win_set_cursor(editor_win, { row, column })
      vim.cmd("normal! zz")
    end
  end)
end

find_notes = function()
  if not (_G.Snacks and Snacks.picker and Snacks.picker.files) then
    vim.notify("The notes picker is unavailable", vim.log.levels.ERROR)
    return
  end

  save_buffer(state.current_buf)
  Snacks.picker.files({
    cwd = notes_root,
    ft = "md",
    title = "Notes",
    confirm = function(picker, item)
      open_picker_item(picker, item, false)
    end,
  })
end

find_note_contents = function()
  if not (_G.Snacks and Snacks.picker and Snacks.picker.grep) then
    vim.notify("The notes search picker is unavailable", vim.log.levels.ERROR)
    return
  end

  save_all()
  Snacks.picker.grep({
    cwd = notes_root,
    glob = "*.md",
    title = "Search note contents",
    confirm = function(picker, item)
      open_picker_item(picker, item, true)
    end,
  })
end

local function selected_row()
  local line = vim.api.nvim_win_get_cursor(list_win)[1]
  return state.rows_by_line[line]
end

local function open_selected()
  local row = selected_row()
  if row and row.action == "open" then
    open_record(row)
  end
end

local function record_for_current_context()
  local row = vim.api.nvim_get_current_win() == list_win and selected_row() or nil
  if row and row.action == "open" then
    return row
  end

  for _, record in ipairs(state.records) do
    if record.path == state.current_path then
      return record
    end
  end
end

local function selectable_lines()
  local lines = {}

  for line in pairs(state.rows_by_line) do
    lines[#lines + 1] = line
  end

  table.sort(lines)
  return lines
end

move_list_selection = function(direction)
  if vim.api.nvim_get_mode().mode:sub(1, 1) == "i" then
    vim.cmd("stopinsert")
  end

  local lines = selectable_lines()
  if #lines == 0 then
    return
  end

  local current_line = vim.api.nvim_win_get_cursor(list_win)[1]
  local current_index = vim.fn.index(lines, current_line) + 1

  if current_index == 0 then
    current_index = direction > 0 and 1 or #lines
  else
    current_index = math.max(1, math.min(#lines, current_index + direction))
  end

  vim.api.nvim_win_set_cursor(list_win, { lines[current_index], 0 })
  open_selected()
end

local function render_list(preferred_path)
  restore_list_window()
  state.rendering = true
  state.rows_by_line = {}
  vim.api.nvim_buf_clear_namespace(list_buf, namespace, 0, -1)

  local candidates = {}
  for _, record in ipairs(state.records) do
    if not state.active_tag or vim.tbl_contains(record.tags, state.active_tag) then
      candidates[#candidates + 1] = record
    end
  end

  if state.query == "" then
    state.visible_records = vim.deepcopy(candidates)
  else
    state.visible_records = vim.fn.matchfuzzy(vim.deepcopy(candidates), state.query, { key = "search" })
  end

  local lines = {
    " [P] project · [G] global",
    " Filter › " .. (state.query == "" and "all" or state.query),
    "",
    " Tags",
  }

  local function add_row(row, text)
    lines[#lines + 1] = text
    state.rows_by_line[#lines] = row
  end

  add_row({ action = "tag", tag = nil }, string.format(" %s All (%d)", state.active_tag == nil and "●" or "○", #state.records))
  local tags = vim.tbl_keys(state.tag_counts)
  table.sort(tags)
  for _, tag in ipairs(tags) do
    add_row({ action = "tag", tag = tag }, string.format(
      " %s #%s (%d)",
      state.active_tag == tag and "●" or "○",
      tag,
      state.tag_counts[tag]
    ))
  end

  lines[#lines + 1] = ""
  add_row({ action = "new", scope = "project" }, " [P] + New project note")

  local project_records = {}
  local global_records = {}
  for _, record in ipairs(state.visible_records) do
    local records = record.scope == "global" and global_records or project_records
    records[#records + 1] = record
  end

  for _, record in ipairs(project_records) do
    local backlink = record.backlinks > 0 and (" ←" .. record.backlinks) or ""
    add_row(record, " " .. record.label .. backlink)
  end

  local group_spacer_after_line = #lines
  add_row({ action = "new", scope = "global" }, " [G] + New global note")

  for _, record in ipairs(global_records) do
    local backlink = record.backlinks > 0 and (" ←" .. record.backlinks) or ""
    add_row(record, " " .. record.label .. backlink)
  end

  vim.bo[list_buf].modifiable = true
  vim.api.nvim_buf_set_lines(list_buf, 0, -1, false, lines)
  vim.bo[list_buf].modifiable = false

  vim.api.nvim_buf_set_extmark(list_buf, namespace, group_spacer_after_line - 1, 0, {
    virt_lines = { { { " ", "Normal" } } },
    virt_lines_above = false,
  })

  for index, line in ipairs(lines) do
    if index <= 2 then
      vim.api.nvim_buf_add_highlight(list_buf, namespace, "Comment", index - 1, 0, -1)
    elseif line:find("#", 1, true) then
      vim.api.nvim_buf_add_highlight(list_buf, namespace, "Identifier", index - 1, 0, -1)
    elseif line:find("●", 1, true) then
      vim.api.nvim_buf_add_highlight(list_buf, namespace, "DiagnosticOk", index - 1, 0, -1)
    elseif line:find("%[P%]", 1) then
      vim.api.nvim_buf_add_highlight(list_buf, namespace, "DiagnosticInfo", index - 1, 1, 4)
    elseif line:find("%[G%]", 1) then
      vim.api.nvim_buf_add_highlight(list_buf, namespace, "Special", index - 1, 1, 4)
    end
  end

  local available_lines = selectable_lines()
  local target_line = available_lines[1] or 1
  for line = 1, #lines do
    local row = state.rows_by_line[line]
    if row and row.action == "open" then
      target_line = line
      break
    end
  end

  if preferred_path then
    for line, row in pairs(state.rows_by_line) do
      if row.path == preferred_path then
        target_line = line
        break
      end
    end
  end

  vim.api.nvim_win_set_cursor(list_win, { target_line, 0 })
  state.rendering = false
end

refresh = function(preferred_path)
  state.records = scan_notes()
  local should_open_selected = preferred_path == nil

  if preferred_path then
    for _, record in ipairs(state.records) do
      if record.path == preferred_path then
        should_open_selected = true
        break
      end
    end
  end

  render_list(preferred_path)
  if should_open_selected then
    open_selected()
  end

  if #state.records == 0 then
    state.current_buf = nil
    state.current_path = nil
    set_empty_message({
      "",
      "  No notes yet.",
      "",
      "  Select a new-note action from the left.",
    })
  end
end

focus_list = function()
  if vim.api.nvim_get_mode().mode:sub(1, 1) == "i" then
    vim.cmd("stopinsert")
  end

  save_buffer(state.current_buf)
  refresh(state.current_path)
  vim.api.nvim_set_current_win(list_win)
end

focus_editor = function(start_insert)
  open_selected()

  if not state.current_buf then
    return
  end

  vim.api.nvim_set_current_win(editor_win)
  if start_insert then
    vim.cmd("startinsert")
  end
end

close_workspace = function()
  if state.closing then
    return
  end

  state.closing = true
  save_all()
  vim.cmd("qa!")
end

local function sanitized_title(title)
  title = vim.trim(title or "")
  title = title:gsub("[/:]", "-")
  title = title:gsub("%.md$", "")

  if title == "" or title == "." or title == ".." then
    return nil
  end

  return title
end

create_note = function(scope, supplied_title)
  local function finish(title)
    title = sanitized_title(title)
    if not title then
      if supplied_title then
        error("Invalid note name")
      end
      return
    end

    local directory = scope == "project" and project_dir or global_dir
    local path = vim.fs.joinpath(directory, title .. ".md")

    if not uv.fs_stat(path) then
      local result = vim.fn.writefile({}, path)
      if result ~= 0 then
        vim.notify("Could not create note", vim.log.levels.ERROR)
        return
      end
    end

    state.query = ""
    refresh(path)
    focus_editor(false)
  end

  if supplied_title then
    finish(supplied_title)
    return
  end

  vim.ui.input({ prompt = "New " .. scope .. " note name: " }, finish)
end

select_tag = function()
  local items = { { label = "All notes", tag = nil } }
  local tags = vim.tbl_keys(state.tag_counts)
  table.sort(tags)
  for _, tag in ipairs(tags) do
    items[#items + 1] = {
      label = string.format("#%s (%d)", tag, state.tag_counts[tag]),
      tag = tag,
    }
  end

  vim.ui.select(items, {
    prompt = "Filter by tag",
    format_item = function(item)
      return item.label
    end,
  }, function(item)
    if not item then
      return
    end
    state.active_tag = item.tag
    refresh(state.current_path)
  end)
end

open_wiki_link = function()
  if not state.current_buf then
    return
  end

  local cursor = vim.api.nvim_win_get_cursor(editor_win)
  local line = vim.api.nvim_buf_get_lines(state.current_buf, cursor[1] - 1, cursor[1], false)[1] or ""
  local target = core.wiki_link_at(line, cursor[2])
  if not target then
    vim.notify("Put the cursor inside a [[wiki link]] first", vim.log.levels.INFO)
    return
  end

  local match
  for _, preferred_scope in ipairs({ "project", "global" }) do
    for _, record in ipairs(state.records) do
      if record.scope == preferred_scope and record.title:lower() == target:lower() then
        match = record
        break
      end
    end
    if match then
      break
    end
  end

  if not match then
    vim.notify('No note named "' .. target .. '"', vim.log.levels.WARN)
    return
  end

  open_record(match)
end

rename_note = function()
  local record = record_for_current_context()
  if not record then
    vim.notify("Select a note before renaming", vim.log.levels.INFO)
    return
  end

  vim.ui.input({ prompt = "Rename note: ", default = record.title }, function(input)
    local new_title = sanitized_title(input)
    if not new_title or new_title == record.title then
      return
    end

    save_all()
    local old_path = record.path
    local new_path = vim.fs.joinpath(vim.fs.dirname(old_path), new_title .. ".md")
    if uv.fs_stat(new_path) then
      vim.notify("A note with that name already exists", vim.log.levels.ERROR)
      return
    end

    for _, path in ipairs(all_note_paths()) do
      if path ~= old_path and vim.fn.fnamemodify(path, ":t:r"):lower() == record.title:lower() then
        vim.notify("Another note has the same title, so its wiki links are ambiguous", vim.log.levels.ERROR)
        return
      end
    end

    local changes = {}
    local replacement_count = 0
    for _, path in ipairs(all_note_paths()) do
      local ok, lines = pcall(vim.fn.readfile, path)
      if ok then
        local source = table.concat(lines, "\n")
        local updated, count = core.replace_wiki_link_target(source, record.title, new_title)
        if count > 0 then
          changes[#changes + 1] = { path = path, source = updated }
          replacement_count = replacement_count + count
        end
      end
    end

    local renamed, rename_error = uv.fs_rename(old_path, new_path)
    if not renamed then
      vim.notify("Could not rename note: " .. tostring(rename_error), vim.log.levels.ERROR)
      return
    end

    for _, change in ipairs(changes) do
      local path = change.path == old_path and new_path or change.path
      local result = vim.fn.writefile(vim.split(change.source, "\n", { plain = true }), path)
      if result ~= 0 then
        vim.notify("The note was renamed, but a wiki link could not be updated: " .. path, vim.log.levels.ERROR)
      end

      local changed_buf = vim.fn.bufnr(change.path)
      if changed_buf ~= -1 and vim.api.nvim_buf_is_loaded(changed_buf) then
        vim.bo[changed_buf].modifiable = true
        vim.api.nvim_buf_set_lines(changed_buf, 0, -1, false, vim.split(change.source, "\n", { plain = true }))
        vim.bo[changed_buf].modified = false
      end
    end

    local buf = vim.fn.bufnr(old_path)
    if buf ~= -1 and vim.api.nvim_buf_is_valid(buf) then
      vim.api.nvim_buf_set_name(buf, new_path)
    end
    if state.current_path == old_path then
      state.current_path = new_path
    end

    refresh(new_path)
    vim.notify(string.format("Renamed note and updated %d wiki link%s", replacement_count, replacement_count == 1 and "" or "s"))
  end)
end

delete_selected = function(skip_confirmation)
  local row = selected_row()
  if not row or row.action ~= "open" then
    return
  end

  if not skip_confirmation then
    local choice = vim.fn.confirm('Delete "' .. row.title .. '"?', "&Delete\n&Cancel", 2)
    if choice ~= 1 then
      return
    end
  end

  local buf = vim.fn.bufnr(row.path)
  if state.current_path == row.path then
    save_buffer(state.current_buf)
    vim.api.nvim_win_set_buf(editor_win, empty_buf)
    state.current_buf = nil
    state.current_path = nil
  end

  local removed, remove_error = os.remove(row.path)
  if not removed then
    vim.notify("Could not delete note: " .. tostring(remove_error), vim.log.levels.ERROR)
    return
  end

  if buf ~= -1 and vim.api.nvim_buf_is_valid(buf) then
    state.note_buffers[buf] = nil
    pcall(vim.api.nvim_buf_delete, buf, { force = true })
  end

  refresh()
end

local function activate_selected()
  local row = selected_row()
  if not row then
    return
  end

  if row.action == "new" then
    create_note(row.scope)
  elseif row.action == "tag" then
    state.active_tag = row.tag
    refresh(state.current_path)
  else
    focus_editor(false)
  end
end

local function show_help()
  vim.notify(table.concat({
    "j/k or ↑/↓          select and preview",
    "Cmd-↑ / Cmd-↓       select from either column",
    "Enter or Tab        focus editor in Normal mode",
    "i / Esc             Insert / Normal mode",
    "Tab / Ctrl-h/l      switch columns",
    "P / G               new project/global note",
    "/ / Space Space     filter/find by filename",
    "s / Space /         search inside all notes",
    "t                   choose a tag filter",
    "R                   safely rename + update [[links]]",
    "gf                  follow [[wiki link]] under cursor",
    "Ctrl-L              show word completion",
    "Ctrl-N/P, Ctrl-Y    choose / accept completion",
    "Ctrl-Y / Ctrl-D     copy/delete selected note",
    "r                   refresh",
    "Esc / q / Cmd-N     save and close",
  }, "\n"), vim.log.levels.INFO, { title = "Notes keys" })
end

local function statusline()
  local mode = vim.api.nvim_get_mode().mode:sub(1, 1)
  if vim.api.nvim_get_current_win() == list_win then
    return "%#Comment# j/k move · ↵ open · / filter · s search · t tags · R rename · ?"
  end
  if mode == "i" then
    return "%#DiagnosticOk# INSERT %#Comment# ^L complete · ^N/P choose · ^Y accept · Esc normal"
  end
  return "%#Comment# i edit · gf link · s search · R rename · Tab list · ?"
end

local function filter_notes()
  vim.ui.input({ prompt = "Filter notes: ", default = state.query }, function(query)
    if query == nil then
      return
    end

    state.query = vim.trim(query)
    refresh(state.current_path)
  end)
end

vim.keymap.set("n", "<CR>", activate_selected, { buffer = list_buf, desc = "Edit or create note", silent = true })
vim.keymap.set("n", "<Tab>", function()
  focus_editor(false)
end, { buffer = list_buf, desc = "Focus note editor", silent = true })
vim.keymap.set("n", "<C-l>", function()
  focus_editor(false)
end, { buffer = list_buf, desc = "Focus note editor", silent = true })
for _, key in ipairs({ "j", "<Down>", "<F16>" }) do
  vim.keymap.set("n", key, function()
    move_list_selection(1)
  end, { buffer = list_buf, desc = "Select next note", silent = true })
end
for _, key in ipairs({ "k", "<Up>", "<F15>" }) do
  vim.keymap.set("n", key, function()
    move_list_selection(-1)
  end, { buffer = list_buf, desc = "Select previous note", silent = true })
end
vim.keymap.set("n", "/", filter_notes, { buffer = list_buf, desc = "Filter notes", silent = true })
vim.keymap.set("n", "<Esc>", close_workspace, { buffer = list_buf, desc = "Save and close notes", silent = true })
vim.keymap.set("n", "<leader><space>", find_notes, { buffer = list_buf, desc = "Find notes", silent = true })
vim.keymap.set("n", "<leader>/", find_note_contents, { buffer = list_buf, desc = "Search note contents", silent = true })
vim.keymap.set("n", "s", find_note_contents, { buffer = list_buf, desc = "Search note contents", silent = true })
vim.keymap.set("n", "t", select_tag, { buffer = list_buf, desc = "Choose tag filter", silent = true })
vim.keymap.set("n", "R", rename_note, { buffer = list_buf, desc = "Rename note", silent = true })
vim.keymap.set("n", "q", close_workspace, { buffer = list_buf, desc = "Save and close notes", silent = true })
vim.keymap.set("n", "?", show_help, { buffer = list_buf, desc = "Show notes keys", silent = true })
vim.keymap.set("n", "<C-d>", function()
  delete_selected(false)
end, { buffer = list_buf, desc = "Delete note", silent = true })
vim.keymap.set("n", "<C-y>", function()
  local row = selected_row()
  if row and row.action == "open" then
    copy_path(row.path)
  end
end, { buffer = list_buf, desc = "Copy note", silent = true })
vim.keymap.set("n", "p", function()
  create_note("project")
end, { buffer = list_buf, desc = "New project note", silent = true })
vim.keymap.set("n", "P", function()
  create_note("project")
end, { buffer = list_buf, desc = "New project note", silent = true })
vim.keymap.set("n", "g", function()
  create_note("global")
end, { buffer = list_buf, desc = "New global note", silent = true })
vim.keymap.set("n", "G", function()
  create_note("global")
end, { buffer = list_buf, desc = "New global note", silent = true })
vim.keymap.set("n", "r", function()
  refresh(state.current_path)
end, { buffer = list_buf, desc = "Refresh notes", silent = true })

vim.api.nvim_create_autocmd("CursorMoved", {
  group = group,
  buffer = list_buf,
  callback = function()
    if state.rendering then
      return
    end

    local line = vim.api.nvim_win_get_cursor(list_win)[1]
    if not state.rows_by_line[line] then
      local lines = selectable_lines()
      vim.api.nvim_win_set_cursor(list_win, { lines[1] or 1, 0 })
      return
    end

    open_selected()
  end,
})

vim.api.nvim_create_autocmd("VimLeavePre", {
  group = group,
  callback = save_all,
})

workspace.create_note = create_note
workspace.copy_visual_selection = copy_visual_selection
workspace.delete_selected = delete_selected
workspace.editor_win = editor_win
workspace.focus_editor = focus_editor
workspace.focus_list = focus_list
workspace.find_notes = find_notes
workspace.find_note_contents = find_note_contents
workspace.list_buf = list_buf
workspace.list_win = list_win
workspace.move_list_selection = move_list_selection
workspace.refresh = refresh
workspace.rename_note = rename_note
workspace.select_tag = select_tag
workspace.show_help = show_help
workspace.statusline = statusline
workspace.state = state

_G.TmuxNotesWorkspace = workspace

refresh()
vim.api.nvim_set_current_win(list_win)
vim.cmd("redraw")
