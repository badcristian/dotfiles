local source = debug.getinfo(1, "S").source:sub(2)
local root = vim.fs.dirname(vim.fs.dirname(source))
local notes = dofile(vim.fs.joinpath(root, "files_to_symlink", "tmux-notes-core.lua"))

local function same(actual, expected, label)
  if vim.inspect(actual) ~= vim.inspect(expected) then
    error(string.format("%s\nexpected: %s\nactual:   %s", label, vim.inspect(expected), vim.inspect(actual)))
  end
end

same(notes.extract_tags("#Todo text #romanian-test #todo"), { "romanian-test", "todo" }, "extracts unique tags")
same(notes.extract_tags("[[People#Ana]] https://site.test/#part #real"), { "real" }, "ignores link fragments")
same(notes.wiki_link_at("See [[Daily Notes|today]] now", 8), "Daily Notes", "finds aliased link")
same(notes.wiki_links("[[Plan]] and [[People#Ana|Ana]]"), {
  { target = "Plan" },
  { target = "People", label = "Ana" },
}, "extracts wiki links")

local updated, count = notes.replace_wiki_link_target(
  "[[Plan]] [[Plan#Next|next]] [[Other]] [[planning]]",
  "Plan",
  "Roadmap"
)
same(updated, "[[Roadmap]] [[Roadmap#Next|next]] [[Other]] [[planning]]", "renames exact wiki targets")
same(count, 2, "reports replacements")

print("tmux-notes-core: ok")
