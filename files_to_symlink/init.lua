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
    {shortcut = "1", name = "Ghostty"},
    -- {shortcut = "1", name = "Solo"},
    -- {shortcut = "1", name = "Muxy"},
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
	-- {shortcut = "e", name = "Tinkerwell", modifiers = {"cmd", "shift"}},
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

-- =============================================================================
-- VS Code: quit once its last window closes
-- macOS keeps an application running without windows. VS Code's Cmd+W closes a
-- window that has no editors open (see the keybindings in this repository), so
-- this makes the last such close quit the application instead of leaving it
-- idle in the Dock.
-- =============================================================================
VSCODE_BUNDLE_ID = "com.microsoft.VSCode"
VSCODE_APP_NAME = "Code"
VSCODE_QUIT_DELAY = 1.2

local vscodeQuitTimer = nil

local function quitVSCodeWhenWindowless()
    if vscodeQuitTimer then
        vscodeQuitTimer:stop()
    end

    -- The delay lets a replacement window register first. Opening a project from an
    -- empty window can destroy the old window before the new one appears, and that
    -- gap must not be read as "no windows left".
    vscodeQuitTimer = hs.timer.doAfter(VSCODE_QUIT_DELAY, function()
        local app = hs.application.get(VSCODE_BUNDLE_ID)

        if app and #app:allWindows() == 0 then
            app:kill()
        end
    end)
end

-- Held in a global so the filter is not garbage collected.
VSCODE_WINDOW_FILTER = hs.window.filter.new(false):setAppFilter(VSCODE_APP_NAME, {})
VSCODE_WINDOW_FILTER:subscribe(hs.window.filter.windowDestroyed, quitVSCodeWhenWindowless)

-- =============================================================================
-- macOS Appearance Cache
-- Automatic appearance keeps AppleInterfaceStyle at the preferred base value,
-- so shells cannot use `defaults read` to discover the effective light/dark
-- appearance. Cache AppKit's effective appearance when macOS announces a
-- change; zsh reads this tiny file before rendering the next prompt.
-- =============================================================================

GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty"

local APPEARANCE_CACHE_PATH = os.getenv("HOME") ..
                                  "/.cache/macos-effective-appearance"
local APPEARANCE_JAVASCRIPT = [[
ObjC.import("AppKit");
$.NSApplication.sharedApplication.effectiveAppearance.name.js;
]]

local function cacheEffectiveAppearance()
    local ok, appearanceName = hs.osascript.javascript(APPEARANCE_JAVASCRIPT)
    if not ok then
        hs.printf("Could not detect effective macOS appearance")
        return
    end

    local appearance = appearanceName == "NSAppearanceNameDarkAqua" and "dark" or
                           "light"
    local temporaryPath = APPEARANCE_CACHE_PATH .. ".tmp"
    local file, openError = io.open(temporaryPath, "w")

    if not file then
        hs.printf("Could not write macOS appearance cache: %s", openError)
        return
    end

    file:write(appearance, "\n")
    file:close()

    local renamed, renameError = os.rename(temporaryPath, APPEARANCE_CACHE_PATH)
    if not renamed then
        hs.printf("Could not replace macOS appearance cache: %s", renameError)
    end
end

local appearanceRefreshTimer = nil

local function reloadGhosttyConfigForAppearance()
    local ghostty = hs.application.get(GHOSTTY_BUNDLE_ID)
    if ghostty and not ghostty:selectMenuItem("Reload Configuration") then
        hs.printf("Could not reload Ghostty after macOS appearance changed")
    end
end

local function scheduleAppearanceRefresh()
    if appearanceRefreshTimer then appearanceRefreshTimer:stop() end
    appearanceRefreshTimer = hs.timer.doAfter(0.1, function()
        cacheEffectiveAppearance()
        -- Ghostty 1.3.1 can leave existing surfaces on the previous palette
        -- even though a fresh config load resolves the new system appearance.
        reloadGhosttyConfigForAppearance()
    end)
end

-- Held globally so the notification watcher is not garbage collected.
MACOS_APPEARANCE_WATCHER = hs.distributednotifications.new(
                               scheduleAppearanceRefresh,
                               "AppleInterfaceThemeChangedNotification"):start()

cacheEffectiveAppearance()

-- =============================================================================
-- Ghostty Window Geometry
-- Ghostty can only place new windows at fixed pixel coordinates
-- (`window-position-x` / `window-position-y`), so a window stops being centered
-- as soon as its size or the display changes. It also cannot remember a
-- manually resized window without `window-save-state = always`, which restores
-- the whole previous session -- tabs, splits and working directories included.
--
-- Hammerspoon owns Ghostty's geometry instead: a new window opens at the last
-- size used on that display and is centered, and finishing a manual resize
-- updates the remembered size and re-centers. Moving a window is left alone, so
-- a deliberate drag is never undone.
-- =============================================================================

GHOSTTY_SIZE_SETTING_KEY = "ghosttyWindowSizes"

-- Re-center once a resize finishes, so the window is centered at any size.
GHOSTTY_RECENTER_AFTER_RESIZE = true

-- Seconds of stillness before a drag counts as finished.
GHOSTTY_RESIZE_SETTLE_DELAY = 0.35

-- Ghostty can adjust a new window's frame just after it appears, so the centered
-- frame is applied a second time once that has settled.
GHOSTTY_CREATE_REAPPLY_DELAY = 0.12

-- Sizes below this are treated as a window mid-teardown rather than a resize.
GHOSTTY_MIN_SIZE = 120

local function ghosttyScreenKey(screen)
    return screen:getUUID() or screen:name() or "default"
end

local function ghosttyStoredSizes()
    return hs.settings.get(GHOSTTY_SIZE_SETTING_KEY) or {}
end

-- Returns nil when this display has no remembered size yet, which leaves the
-- window at whatever `window-width` / `window-height` produced.
local function ghosttyRememberedSize(screen)
    local stored = ghosttyStoredSizes()[ghosttyScreenKey(screen)]

    if stored and stored.w and stored.h then
        return {w = stored.w, h = stored.h}
    end

    return nil
end

local function ghosttyRememberSize(screen, size)
    local sizes = ghosttyStoredSizes()
    sizes[ghosttyScreenKey(screen)] = {w = size.w, h = size.h}
    hs.settings.set(GHOSTTY_SIZE_SETTING_KEY, sizes)
end

local function ghosttyIsAdjustable(win)
    return win ~= nil and win:isStandard() and not win:isFullScreen() and
               win:screen() ~= nil
end

-- Centers the window on its screen. `size` defaults to the window's current
-- size, and is clamped so an oversized remembered size cannot push a window off
-- a smaller display.
local function ghosttyCenter(win, size)
    if not ghosttyIsAdjustable(win) then return end

    local usable = win:screen():frame()
    local target = size or win:frame()
    local width = math.min(target.w, usable.w)
    local height = math.min(target.h, usable.h)

    win:setFrame({
        x = usable.x + (usable.w - width) / 2,
        y = usable.y + (usable.h - height) / 2,
        w = width,
        h = height
    }, 0)
end

-- No event suppression is needed here: centering leaves the window at exactly
-- the remembered size, so Hammerspoon's own frame changes fall into the
-- "size unchanged" branch below and stop there.
local function ghosttySyncSize(win)
    if not ghosttyIsAdjustable(win) then return end

    local screen = win:screen()
    local frame = win:frame()

    if frame.w < GHOSTTY_MIN_SIZE or frame.h < GHOSTTY_MIN_SIZE then return end

    local remembered = ghosttyRememberedSize(screen)

    -- Sub-pixel differences are rounding noise from the accessibility API, not
    -- the user resizing the window.
    if remembered and math.abs(frame.w - remembered.w) < 1 and
        math.abs(frame.h - remembered.h) < 1 then return end

    ghosttyRememberSize(screen, frame)

    if GHOSTTY_RECENTER_AFTER_RESIZE then
        ghosttyCenter(win, {w = frame.w, h = frame.h})
    end
end

-- One settle timer per window, so a resize drag is handled once it ends rather
-- than on every intermediate frame.
local ghosttySettleTimers = {}

local function ghosttyCancelSettleTimer(id)
    if id and ghosttySettleTimers[id] then
        ghosttySettleTimers[id]:stop()
        ghosttySettleTimers[id] = nil
    end
end

local function ghosttyOnWindowMoved(win)
    if not ghosttyIsAdjustable(win) then return end

    local id = win:id()
    if not id then return end

    ghosttyCancelSettleTimer(id)
    ghosttySettleTimers[id] = hs.timer.doAfter(GHOSTTY_RESIZE_SETTLE_DELAY,
                                               function()
        ghosttySettleTimers[id] = nil
        ghosttySyncSize(win)
    end)
end

local function ghosttyOnWindowCreated(win)
    if not ghosttyIsAdjustable(win) then return end

    local remembered = ghosttyRememberedSize(win:screen())
    ghosttyCenter(win, remembered)

    hs.timer.doAfter(GHOSTTY_CREATE_REAPPLY_DELAY, function()
        ghosttyCenter(win, remembered or ghosttyRememberedSize(win:screen()))
    end)
end

local function ghosttyOnWindowDestroyed(win)
    if win then ghosttyCancelSettleTimer(win:id()) end
end

-- Matching on the bundle identifier avoids depending on the application name,
-- which macOS reports as "ghostty" in some APIs and "Ghostty" in others.
GHOSTTY_WINDOW_FILTER = hs.window.filter.new(function(win)
    local app = win:application()
    return app ~= nil and app:bundleID() == GHOSTTY_BUNDLE_ID
end)

GHOSTTY_WINDOW_FILTER:subscribe(hs.window.filter.windowCreated,
                                ghosttyOnWindowCreated)
GHOSTTY_WINDOW_FILTER:subscribe(hs.window.filter.windowMoved,
                                ghosttyOnWindowMoved)
GHOSTTY_WINDOW_FILTER:subscribe(hs.window.filter.windowDestroyed,
                                ghosttyOnWindowDestroyed)

-- Global so it can be driven from a shell via `hs -c 'centerGhosttyWindows()'`.
-- Centers every Ghostty window at its remembered size, creating that memory
-- from the current size when a display has none yet.
function centerGhosttyWindows()
    local centered = 0

    for _, win in ipairs(GHOSTTY_WINDOW_FILTER:getWindows()) do
        if ghosttyIsAdjustable(win) then
            local screen = win:screen()
            local remembered = ghosttyRememberedSize(screen)

            if not remembered then
                remembered = win:frame()
                ghosttyRememberSize(screen, remembered)
            end

            ghosttyCenter(win, remembered)
            centered = centered + 1
        end
    end

    return centered
end

-- Forgets every remembered size, so the next window opens at the size from
-- Ghostty's own `window-width` / `window-height`.
function resetGhosttyWindowSizes()
    hs.settings.clear(GHOSTTY_SIZE_SETTING_KEY)
end

hs.hotkey.bind({"cmd", "alt", "ctrl"}, "c", centerGhosttyWindows)

-- =============================================================================
-- Command Line Access
-- Loads the IPC module that the `hs` binary talks to, making the functions above
-- callable from a shell, e.g. `hs -c 'centerGhosttyWindows()'`.
-- =============================================================================
require("hs.ipc")
