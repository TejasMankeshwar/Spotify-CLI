# ✦ Spotify-CLI

A minimalist, aesthetic Spotify CLI built strictly around the modern terminal design language of **Gemini-CLI** and **Claude Code**.

Rather than hijacking your entire terminal with an outdated full-screen TUI (like `spotify-tui` or `cmus`), **Spotify-CLI** preserves the native feel of your terminal shell: scrolling stdout, subtle typographic dividers, sleek inline cards, braille spinners, interactive arrow-key selectors, and a dynamic real-time playback HUD.

---

## ✨ Features

- **Gemini-CLI & Claude Code Aesthetics**: Designed with truecolor ANSI gradients, thin curved unicode frames (`╭─`, `╰─`, `│`), spark glyphs (`✦`, `●`), and subtle muted secondary text.
- **Interactive REPL & Slash Commands**: Fast, autocompleting interactive shell with command history and slash commands (`/play`, `/pause`, `/next`, `/vol`, `/lyrics`, `/watch`, `/theme`).
- **Single-Shot CLI Mode**: Instant commands for terminal power-users, shell scripts, and tmux status bars (`spotify play "Starboy"`, `spotify pause`, `spotify vol +10`, `spotify ticker`).
- **Dynamic Live Player HUD (`/watch`)**: Real-time non-flickering interactive playback monitor with live-ticking progress bar and single-key controls (Space to toggle, `n`/`p` to skip, `+`/`-` volume, `q` to return).
- **Synced & Plain Lyrics**: Instant inline lyrics fetching via LRCLIB directly into your terminal.
- **Zero-Latency macOS Integration**: Operates local macOS Spotify client with sub-millisecond response and zero complex OAuth setup required.
- **Multiple Color Themes**: Switch dynamically between **Gemini** (Electric Sky & Indigo), **Claude** (Warm Terracotta & Stone), and **Cyber** (Neon Cyan & Purple).
- **Zero External Dependencies**: Pure Node.js & native TypeScript with instant 0ms startup time.

---

## 🚀 Quick Start

### Prerequisites
- macOS with [Spotify](https://www.spotify.com/) installed
- Node.js v22+ (v24 recommended for native TypeScript execution)

### Installation

Clone the repository and link the binary:

```bash
git clone https://github.com/TejasMankeshwar/Spotify-CLI.git
cd Spotify-CLI

# Make executable and link globally (optional)
npm link
```

Now you can invoke `spotify` from anywhere in your terminal!

---

## 🕹️ Interactive Mode (REPL)

Run `spotify` with no arguments to launch the interactive prompt:

```bash
spotify
```

```text
  ✦ Spotify CLI v1.0.0 ─ GEMINI
  Operate Spotify seamlessly from your terminal. Type /help or /watch.

  ▶ Starboy · The Weeknd, Daft Punk  ━━━━━━━●────── [02:14/03:50]  🔊 80%

  ✦ spotify ❯ /
```

### Slash Commands Cheat Sheet

| Command | Description |
| :--- | :--- |
| `/play [query]` | Resume playback or search & play instantly |
| `/pause` | Pause active playback |
| `/toggle` or `<space>` | Toggle play/pause |
| `/next`, `/n` | Skip to next track |
| `/prev`, `/p` | Return to previous track |
| `/now`, `/status` | Render detailed track card |
| `/watch`, `/live` | Launch real-time dynamic player HUD |
| `/vol [0-100|+10|-10|++|--|mute]` | Set or adjust volume (supports `++`, `--`, `up`, `mute`, `max`) |
| `/seek <sec\|mm:ss>` | Jump to position in current song |
| `/shuffle` | Toggle shuffle mode on/off |
| `/repeat` | Toggle repeat mode on/off |
| `/lyrics` | Fetch & stream synced/plain lyrics |
| `/theme [gemini\|claude]` | Switch active aesthetic theme |
| `/clear` | Clear screen and redraw banner |
| `/exit`, `/quit` | Exit Spotify CLI |

---

## ⚡ Direct CLI Usage

Every command can also be run directly from your shell:

```bash
# Search and play a track
spotify play "Bohemian Rhapsody"

# Toggle play/pause
spotify toggle

# Skip track
spotify next

# Adjust volume
spotify vol +15
spotify vol 75

# Display current track card
spotify status

# Display compact one-line status (great for tmux / scripts)
spotify ticker

# Fetch lyrics for current playing song
spotify lyrics

# Launch live HUD monitor directly
spotify watch
```

---

## 🎨 Themes

### Gemini CLI Theme (Default)
Electric Sky (`#38bdf8`), Celestial Blue spark (`✦`), Slate borders, and Emerald badges.

```text
╭─ ✦ Spotify Player  [PLAYING] ───────────────────────────────────────╮
│ Track      Starboy                                                 │
│ Artist     The Weeknd, Daft Punk                                   │
│ Album      Starboy                                                 │
│ Progress   ━━━━━━━━●─────── 02:14 / 03:50                          │
│ Volume     ■■■■■■□□ 80%                                            │
│ State      ▶ PLAYING  │  🔀 ON  🔁 OFF                             │
│ Link       https://open.spotify.com/track/7MXVkk9YM5zg0QbMuXC9Ah   │
╰────────────────────────────────────────────────────────────────────╯
```

### Claude Code Theme
Terracotta / Amber (`#d97706`), Warm Coral (`#fb923c`), Stone borders, and minimal bullets (`●`).

```bash
# Switch theme via flag or inside REPL (/theme claude)
spotify --claude status
```

---

## 🧪 Testing

Run the test suite:

```bash
npm test
```

---

## 📄 License

MIT © [Tejas Mankeshwar](https://github.com/TejasMankeshwar)

