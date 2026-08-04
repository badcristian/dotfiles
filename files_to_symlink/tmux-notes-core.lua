local M = {}

local function trim(value)
  return (value:gsub("^%s+", ""):gsub("%s+$", ""))
end

function M.extract_tags(source)
  local seen = {}
  local tags = {}
  source = " " .. source:gsub("%[%[[^%]]+%]%]", "")

  for tag in source:gmatch("%s#([%w_%-]+)") do
    local normalized = tag:lower()
    if not seen[normalized] then
      seen[normalized] = true
      tags[#tags + 1] = normalized
    end
  end

  table.sort(tags)
  return tags
end

function M.wiki_links(source)
  local links = {}

  for inner in source:gmatch("%[%[([^%]]+)%]%]") do
    local target, label = inner:match("^([^|]+)|(.+)$")
    target = trim(target or inner)
    target = trim(target:match("^([^#]+)") or target)
    if target ~= "" then
      links[#links + 1] = { target = target, label = label and trim(label) or nil }
    end
  end

  return links
end

function M.wiki_link_at(line, cursor_column)
  local from = 1

  while true do
    local start_column, end_column, inner = line:find("%[%[([^%]]+)%]%]", from)
    if not start_column then
      return nil
    end

    if cursor_column >= start_column - 1 and cursor_column <= end_column then
      local target = trim((inner:match("^([^|]+)") or inner):match("^([^#]+)") or inner)
      return target ~= "" and target or nil
    end

    from = end_column + 1
  end
end

function M.replace_wiki_link_target(source, old_title, new_title)
  local old_normalized = trim(old_title):lower()
  local replacements = 0

  local updated = source:gsub("%[%[([^%]]+)%]%]", function(inner)
    local target_and_heading, label = inner:match("^([^|]+)|(.+)$")
    target_and_heading = target_and_heading or inner
    local target, heading = target_and_heading:match("^([^#]+)(#.*)$")
    target = trim(target or target_and_heading)

    if target:lower() ~= old_normalized then
      return "[[" .. inner .. "]]"
    end

    replacements = replacements + 1
    local rebuilt = new_title .. (heading or "")
    if label then
      rebuilt = rebuilt .. "|" .. label
    end
    return "[[" .. rebuilt .. "]]"
  end)

  return updated, replacements
end

return M
