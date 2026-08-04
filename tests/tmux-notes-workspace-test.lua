local source = debug.getinfo(1, "S").source:sub(2)
local repository = vim.fs.dirname(vim.fs.dirname(source))
local root = vim.fn.tempname()
local project = vim.fs.joinpath(root, "projects", "demo")
local other_project = vim.fs.joinpath(root, "projects", "other")
local global = vim.fs.joinpath(root, "global")

vim.fn.mkdir(project, "p")
vim.fn.mkdir(other_project, "p")
vim.fn.mkdir(global, "p")

local function write(path, lines)
  assert(vim.fn.writefile(lines, path) == 0, "could not write " .. path)
end

write(vim.fs.joinpath(project, "Plan.md"), { "# Plan", "", "Project work #todo" })
write(vim.fs.joinpath(project, "Index.md"), {
  "Open [[Plan]] and [[Plan#Next|the next step]]. #reference",
})
write(vim.fs.joinpath(other_project, "Remote.md"), { "The other project also points to [[Plan]]." })
write(vim.fs.joinpath(global, "Shared.md"), { "Shared link: [[Plan]]. #reference" })

vim.env.TMUX_NOTES_PROJECT_DIR = project
vim.env.TMUX_NOTES_GLOBAL_DIR = global
vim.env.TMUX_NOTES_ROOT = root
vim.env.TMUX_NOTES_WORKSPACE = vim.fs.joinpath(repository, "files_to_symlink", "tmux-notes.lua")

dofile(vim.env.TMUX_NOTES_WORKSPACE)
vim.wait(600)

local workspace = assert(_G.TmuxNotesWorkspace)
local note_buf = assert(workspace.state.current_buf)
assert(vim.b[note_buf].tmux_notes == true)
assert(vim.b[note_buf].completion == true)
assert(vim.bo[note_buf].spelllang == "en_us,ro")
assert(vim.api.nvim_win_get_width(workspace.list_win) == 30)

vim.api.nvim_set_current_win(workspace.editor_win)
assert(vim.wo.spell == false)
local completion_map = vim.fn.maparg("<C-l>", "i", false, true)
assert(completion_map.desc == "Show word completion")
local sources = require("blink.cmp.config").sources.default()
assert(vim.tbl_contains(sources, "spell"))
assert(require("render-markdown.state").cache[note_buf] ~= nil)
assert(#vim.fn.spellsuggest("buna", 10) > 0)

assert(workspace.state.tag_counts.reference == 2)
assert(workspace.state.tag_counts.todo == 1)
assert(workspace.state.tag_counts.next == nil)

vim.ui.select = function(items, _, callback)
  for _, item in ipairs(items) do
    if item.tag == "reference" then
      callback(item)
      return
    end
  end
  error("reference tag missing")
end
workspace.select_tag()
assert(workspace.state.active_tag == "reference")
assert(#workspace.state.visible_records == 2)

local captured_search
local original_grep = Snacks.picker.grep
Snacks.picker.grep = function(options)
  captured_search = options
end
workspace.find_note_contents()
Snacks.picker.grep = original_grep
assert(captured_search.cwd == root)
assert(captured_search.glob == "*.md")

workspace.state.active_tag = nil
workspace.refresh()
local index_line
for line, row in pairs(workspace.state.rows_by_line) do
  if row.title == "Index" then
    index_line = line
  end
end
assert(index_line)
vim.api.nvim_set_current_win(workspace.list_win)
vim.api.nvim_win_set_cursor(workspace.list_win, { index_line, 0 })
vim.wait(50)
vim.api.nvim_set_current_win(workspace.editor_win)
vim.api.nvim_win_set_cursor(workspace.editor_win, { 1, 8 })
vim.api.nvim_feedkeys("gf", "mx", false)
vim.wait(100)
assert(workspace.state.current_path:match("Plan%.md$"))

local plan_line
for line, row in pairs(workspace.state.rows_by_line) do
  if row.title == "Plan" then
    plan_line = line
  end
end
assert(plan_line)
vim.api.nvim_set_current_win(workspace.list_win)
vim.api.nvim_win_set_cursor(workspace.list_win, { plan_line, 0 })
vim.ui.input = function(_, callback)
  callback("Roadmap")
end
workspace.rename_note()
vim.wait(200)

assert(vim.uv.fs_stat(vim.fs.joinpath(project, "Roadmap.md")))
assert(not vim.uv.fs_stat(vim.fs.joinpath(project, "Plan.md")))
for _, path in ipairs({
  vim.fs.joinpath(project, "Index.md"),
  vim.fs.joinpath(other_project, "Remote.md"),
  vim.fs.joinpath(global, "Shared.md"),
}) do
  local content = table.concat(vim.fn.readfile(path), "\n")
  assert(content:find("[[Roadmap", 1, true), path)
end

local roadmap
for _, record in ipairs(workspace.state.records) do
  if record.title == "Roadmap" then
    roadmap = record
  end
end
assert(roadmap and roadmap.backlinks == 2)
assert(workspace.statusline():find("tags", 1, true))

vim.fn.delete(root, "rf")
print("tmux-notes-workspace: ok")
