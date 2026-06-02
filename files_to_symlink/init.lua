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
    {shortcut = "3", name = "PhpStorm"},
    -- {shortcut = "w", name = "WebStorm", modifiers = {"cmd", "shift"}}, -- cmd+shift+w
    {shortcut = "4", name = "Visual Studio Code"},
    {shortcut = "5", name = "WebStorm"},
    {shortcut = "6", name = "Cursor"},
	{shortcut = "g", name = "Github Desktop"},
    {shortcut = "§", name = "TablePlus"},
	{shortcut = "7", name = "TablePlus"},
	{shortcut = "9", name = "Postman"},
    {shortcut = "l", name = "Slack"},
	{shortcut = "e", name = "Tinkerwell", modifiers = {"cmd", "shift"}},
    -- {shortcut = "p", name = "Spotify"},
    -- {shortcut = "i", name = "IntelliJ IDEA"},
    {shortcut = "i", name = "IntelliJ IDEA", modifiers = {"cmd", "shift"}}, -- cmd+shift+i
    -- {shortcut = "i", name = "Finder", modifiers = {"cmd", "shift"}}, -- cmd+shift+i
    {shortcut = "/", name = "Claude", modifiers = {"cmd", "shift"}} -- cmd+shift+/
}

-- Bind each app shortcut; focuses the app if already open, launches it if not
for _, app in ipairs(APPS) do
    hs.hotkey.bind(app.modifiers or MODIFIERS, app.shortcut,
                   function() hs.application.launchOrFocus(app.name) end)
end

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
