-- Constants
MODIFIERS = {"cmd"}

-- App configuration
APPS = {
  {shortcut = "0", name = "Notes"},
  {shortcut = "1", name = "iTerm"},
  {shortcut = "2", name = "Google Chrome"},
  {shortcut = "3", name = "PhpStorm"},
  {shortcut = "4", name = "Visual Studio Code"},
  {shortcut = "5", name = "Slack"},
  {shortcut = "g", name = "Github Desktop"},
  {shortcut = "§", name = "TablePlus"},
  {shortcut = "9", name = "Postman"},
  {shortcut = "l", name = "Slack"},
  {shortcut = "e", name = "Tinkerwell"},
  {shortcut = "p", name = "Spotify"},
  {shortcut = "/", name = "Claude", modifiers = {"cmd", "shift"}},  -- cmd+shift+/
}

-- Bind application shortcuts
for _, app in ipairs(APPS) do
  hs.hotkey.bind(app.modifiers or MODIFIERS, app.shortcut, function()
    hs.application.launchOrFocus(app.name)
  end)
end
