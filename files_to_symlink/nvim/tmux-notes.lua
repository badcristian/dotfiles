return {
  {
    "saghen/blink.cmp",
    dependencies = { "ribru17/blink-cmp-spell" },
    opts = function(_, opts)
      opts.sources = opts.sources or {}
      opts.sources.providers = opts.sources.providers or {}

      local inherited = opts.sources.default or { "lsp", "path", "snippets", "buffer" }
      opts.sources.default = function()
        local sources = type(inherited) == "function" and inherited() or vim.deepcopy(inherited)
        if vim.b.tmux_notes and not vim.tbl_contains(sources, "spell") then
          sources[#sources + 1] = "spell"
        end
        return sources
      end

      opts.sources.providers.spell = {
        name = "Spell",
        module = "blink-cmp-spell",
        enabled = function()
          return vim.b.tmux_notes == true
        end,
        min_keyword_length = 3,
        max_items = 5,
        opts = {
          max_entries = 5,
          use_cmp_spell_sorting = true,
          enable_in_context = function()
            local cursor = vim.api.nvim_win_get_cursor(0)
            local captures = vim.treesitter.get_captures_at_pos(0, cursor[1] - 1, math.max(cursor[2] - 1, 0))
            for _, capture in ipairs(captures) do
              if capture.capture == "nospell" then
                return false
              end
            end
            return true
          end,
        },
      }
    end,
  },
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = { "markdown" },
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-mini/mini.icons",
    },
    opts = {
      preset = "lazy",
      render_modes = { "n", "c" },
      ignore = function(buf)
        return vim.b[buf].tmux_notes ~= true
      end,
    },
  },
}
