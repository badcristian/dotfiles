-- =============================================================================
-- Hammerspoon Configuration
-- Provides keyboard shortcuts for launching apps and custom actions
-- =============================================================================
-- Modifiers used globally for app shortcuts (can be overridden per app)
MODIFIERS = {"cmd"}

-- =============================================================================
-- App Shortcuts
-- Each entry binds a key combo to focus/launch an application.
-- Uses MODIFIERS by default, or a custom `modifiers` field if specified.
-- =============================================================================
APPS = {
    {shortcut = "0", name = "Obsidian"},
    {shortcut = "0", name = "Obsidian", modifiers = {"cmd", "shift"}},
    -- {shortcut = "1", name = "Ghostty"},
    -- {shortcut = "1", name = "Solo"},
    {shortcut = "1", name = "Muxy"},
    -- {shortcut = "1", name = "iTerm"},
	{shortcut = "2", name = "Google Chrome"},
    -- {shortcut = "w", name = "WebStorm", modifiers = {"cmd", "shift"}}, -- cmd+shift+w
    {shortcut = "8", name = "Visual Studio Code"},
    -- {shortcut = "5", name = "WebStorm"},
    -- {shortcut = "6", name = "Cursor"},
	{shortcut = "g", name = "Github Desktop"},
    -- {shortcut = "§", name = "TablePlus"},
	{shortcut = "§", name = "TablePlus"},
	-- {shortcut = "t", name = "TablePlus"},
	-- {shortcut = "9", name = "Postman"},
    {shortcut = "l", name = "Slack"},
	{shortcut = "e", name = "Tinkerwell", modifiers = {"cmd", "shift"}},
    -- {shortcut = "p", name = "Spotify"},
    -- {shortcut = "i", name = "IntelliJ IDEA"},
    -- {shortcut = "i", name = "IntelliJ IDEA", modifiers = {"cmd", "shift"}}, -- cmd+shift+i
    -- {shortcut = "i", name = "Finder", modifiers = {"cmd", "shift"}}, -- cmd+shift+i
    {shortcut = "/", name = "Claude", modifiers = {"cmd", "shift"}} -- cmd+shift+/
}

local function bindHotkey(modifiers, key, action)
    local ok, hotkey = pcall(hs.hotkey.bind, modifiers, key, action)
    if ok then return hotkey end

    hs.printf("Skipping invalid hotkey %s+%s: %s",
              table.concat(modifiers, "+"), key, hotkey)
    return nil
end

-- Bind each app shortcut; focuses the app if already open, launches it if not
for _, app in ipairs(APPS) do
    bindHotkey(app.modifiers or MODIFIERS, app.shortcut,
               function() hs.application.launchOrFocus(app.name) end)
end

-- =============================================================================
-- Active IDE Shortcut
-- cmd+3 opens the currently selected IDE.
-- cmd+shift+3 opens a chooser to change the current IDE.
-- =============================================================================

local IDE_SETTING_KEY = "cmd3ActiveIde"
local DEFAULT_IDE = "PhpStorm"
local IDES = {
    {name = "PhpStorm", subText = "Laravel / PHP"},
    {name = "IntelliJ IDEA", subText = "Java / Kotlin"},
    {name = "WebStorm", subText = "JavaScript / TypeScript"},
    {name = "Cursor", subText = "AI editor"},
    {name = "Visual Studio Code", subText = "General editor"}
}

local function isKnownIde(name)
    for _, ide in ipairs(IDES) do
        if ide.name == name then return true end
    end
    return false
end

local activeIde = hs.settings.get(IDE_SETTING_KEY)
if not isKnownIde(activeIde) then activeIde = DEFAULT_IDE end

local ideMenubar = hs.menubar.new()

local function openActiveIde()
    hs.application.launchOrFocus(activeIde)
end

local function setActiveIde(name, quiet)
    if not isKnownIde(name) then return end

    activeIde = name
    hs.settings.set(IDE_SETTING_KEY, activeIde)

    if ideMenubar then
        ideMenubar:setTitle("IDE")
    end

    if not quiet then
        hs.alert.show("cmd+3 -> " .. activeIde)
    end
end

local ideChooser = hs.chooser.new(function(choice)
    if choice then setActiveIde(choice.ideName) end
end)

local function showIdeChooser()
    local choices = {}

    for _, ide in ipairs(IDES) do
        local prefix = ide.name == activeIde and "* " or "  "
        table.insert(choices, {
            text = prefix .. ide.name,
            subText = ide.subText,
            ideName = ide.name
        })
    end

    ideChooser:choices(choices)
    ideChooser:show()
end

local function activeIdeMenu()
    local menu = {
        {title = "Open " .. activeIde, fn = openActiveIde},
        {title = "Choose IDE...", fn = showIdeChooser},
        {title = "-"}
    }

    for _, ide in ipairs(IDES) do
        local ideName = ide.name
        local prefix = ideName == activeIde and "* " or "  "
        table.insert(menu, {
            title = prefix .. ideName,
            fn = function() setActiveIde(ideName) end
        })
    end

    return menu
end

if ideMenubar then
    ideMenubar:setMenu(activeIdeMenu)
end
setActiveIde(activeIde, true)

hs.hotkey.bind({"cmd"}, "3", openActiveIde)
hs.hotkey.bind({"cmd", "shift"}, "3", showIdeChooser)

-- =============================================================================
-- Double Tap Shortcuts
-- Fires a custom action only when a key combo is pressed twice quickly.
-- On a single tap the original OS keystroke is passed through unchanged,
-- so existing system shortcuts (e.g. cmd+shift+. to toggle hidden files)
-- continue to work normally.
-- =============================================================================

-- Maximum seconds between two taps to count as a double tap
DOUBLE_TAP_DELAY = 0.5

local lastTapTime = {} -- stores the timestamp of the last tap per key combo

local function doubleTap(modifiers, key, action, hotkeyRef)
    local now = hs.timer.secondsSinceEpoch()
    -- Build a unique string identifier for this key combo, e.g. "cmd+shift+."
    local tapKey = table.concat(modifiers, "+") .. "+" .. key

    if lastTapTime[tapKey] and (now - lastTapTime[tapKey]) < DOUBLE_TAP_DELAY then
        -- Second tap detected within the delay window → run the custom action
        lastTapTime[tapKey] = nil
        action()
    else
        -- First tap → record the time and pass the keystroke through to the OS.
        -- We temporarily disable the hotkey so Hammerspoon doesn't intercept
        -- the re-sent keystroke, then re-enable it immediately after.
        lastTapTime[tapKey] = now
        hotkeyRef:disable()
        hs.eventtap.keyStroke(modifiers, key, 0)
        hotkeyRef:enable()
    end
end

DOUBLE_TAPS = {
    {
        key = ",",
        modifiers = {"cmd", "shift"}, -- cmd+shift+. (double tap)
        action = function()
            -- Open the dotfiles folder in VS Code
            hs.execute("open -a 'Visual Studio Code' /Users/mac/dev/dotfiles")
        end
    }
	-- {
    --     key = "w",
    --     modifiers = {"cmd", "shift"}, -- cmd+shift+. (double tap)
    --     action = function()
    --         -- Open the dotfiles folder in VS Code
    --         hs.application.launchOrFocus('WebStorm')
    --     end
    -- }
}

-- Bind each double-tap shortcut, passing a reference to itself so it can
-- temporarily disable/re-enable the hotkey during pass-through
for _, item in ipairs(DOUBLE_TAPS) do
    local ref
    ref = hs.hotkey.bind(item.modifiers, item.key, function()
        doubleTap(item.modifiers, item.key, item.action, ref)
    end)
end
