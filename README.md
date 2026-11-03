# ✦ Spotify-CLI

A minimalist, aesthetic Spotify CLI built strictly around the modern terminal design language.

Rather than hijacking your entire terminal with an outdated full-screen TUI (like `spotify-tui` or `cmus`), **Spotify-CLI** preserves the native feel of your terminal shell: scrolling stdout, subtle typographic dividers, sleek inline cards, braille spinners, interactive arrow-key selectors, and a dynamic real-time playback HUD.

---

## ✨ Features

- **Good Aesthetics**: Designed with truecolor ANSI gradients, thin curved unicode frames (`╭─`, `╰─`, `│`), spark glyphs (`✦`, `●`), and subtle muted secondary text.
- **Interactive REPL & Slash Commands**: Fast, autocompleting interactive shell with command history and slash commands (`/play`, `/pause`, `/next`, `/vol`, `/lyrics`, `/watch`, `/theme`).
- **Single-Shot CLI Mode**: Instant commands for terminal power-users, shell scripts, and tmux status bars (`spotify play "Starboy"`, `spotify pause`, `spotify vol +10`, `spotify ticker`).
- **Dynamic Live Player HUD (`/watch`)**: Real-time non-flickering interactive playback monitor with live-ticking progress bar and single-key controls (Space to toggle, `n`/`p` to skip, `+`/`-` volume, `q` to return).
- **Synced & Plain Lyrics**: Instant inline lyrics fetching via LRCLIB directly into your terminal.
- **Zero-Latency macOS Integration**: Operates local macOS Spotify client with sub-millisecond response and zero complex OAuth setup required.
- **Multiple Color Themes**: Switch dynamically between **Spotify** (Leaf & Bottle Green with Pure White), **Celestial** (Electric Sky & Indigo), **Amber** (Warm Terracotta & Stone), and **Cyber** (Neon Cyan & Pink).
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
  ███████╗██████╗  ██████╗ ████████╗██╗███████╗██╗   ██╗     ██████╗██╗     ██╗
  ██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝██║██╔════╝╚██╗ ██╔╝    ██╔════╝██║     ██║
  ███████╗██████╔╝██║   ██║   ██║   ██║█████╗   ╚████╔╝ ─── ██║     ██║     ██║
  ╚════██║██╔═══╝ ██║   ██║   ██║   ██║██╔══╝    ╚██╔╝      ██║     ██║     ██║
  ███████║██║     ╚██████╔╝   ██║   ██║██║        ██║       ╚██████╗███████╗██║
  ╚══════╝╚═╝      ╚═════╝    ╚═╝   ╚═╝╚═╝        ╚═╝        ╚═════╝╚══════╝╚═╝

  ✦ SPOTIFY-CLI v1.0.0 ─ macOS Native ─ Theme: SPOTIFY
  Operate Spotify seamlessly from terminal. Type /help for commands, /watch for live monitor.

  ▶ Matargashti · Mohit Chauhan  ━━━━━━━━━━●───── [03:39/05:28]  🔊 73%

  ✦ spotify ❯ /
```

### Slash Commands Cheat Sheet

| Command | Description |
| :--- | :--- |
| `/play [query]` | Resume playback or search & play top track immediately |
| `/search <query>` | Interactive suggestions picker: **Hold Space to Preview**, **Enter to Play** |
| `/pause` | Pause active playback |
| `/toggle` or `<space>` | Toggle play/pause |
| `/next`, `/n` | Skip to next track |
| `/prev`, `/p` | Return to previous track |
| `/now`, `/status` | Render detailed track card |
| `/watch`, `/live` | Launch real-time dynamic player HUD |
| `/vol` [0-100, +10, -10, ++, --, mute] | Set or adjust volume (supports `++`, `--`, `up`, `mute`, `max`) |
| `/seek` [+sec, -sec, +mm:ss, mm:ss] | Jump to timestamp or push forward/rewind (`+30`, `+1:30`, `02:00`) |
| `/shuffle` | Toggle shuffle mode on/off |
| `/repeat` | Toggle repeat mode on/off |
| `/lyrics` | Fetch & stream synced/plain lyrics |
| `/auth`, `/config` | Configure free Spotify Developer credentials |
| `/theme [spotify\|celestial\|amber\|cyber]` | Switch active aesthetic theme |
| `/clear` | Clear screen and redraw banner |
| `/exit`, `/quit` | Exit Spotify CLI |

---

## 🎧 Interactive Search & Audio Preview

When you search for music (`search kabira` or `spotify search "Kabira"`):
- **Current music keeps playing**: Your ongoing Spotify playback is not interrupted.
- **Top suggestions list**: Navigate suggestions with `↑` / `↓` arrow keys.
- **Hold Space to Preview**: Press and hold `Space` to stream a 30-second studio audio preview. Release `Space` to stop preview immediately!
- **Enter to Play**: Press `Enter` to commit and play the full song in Spotify!
- **Esc / q**: Cancel search and return without modifying playback.

---

## ⚡ Direct CLI Usage

Every command can also be run directly from your shell:

```bash
# Search and play top track immediately
spotify play "Kabira"

# Interactive search with audio preview (hold Space to preview, Enter to play)
spotify search "Kabira"

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

### Spotify Theme (Default)
Harmonizes with the title gradient: **Leaf Green** (`#4ade80`), **Bottle Green** borders (`#065f46`), soft pine muted tones (`#52796f`), and **Pure White** text & headings.

```text
╭─ ✦ Spotify Player  [PLAYING] ───────────────────────────────────────╮
│ Track      Matargashti                                             │
│ Artist     Mohit Chauhan                                           │
│ Album      Tamasha                                                 │
│ Progress   ━━━━━━━━━━●───── 03:39 / 05:28                          │
│ Volume     ■■■■■■□□ 75%                                            │
│ State      ▶ PLAYING  │  🔀 ON  🔁 OFF                             │
│ Link       https://open.spotify.com/track/5GeBgck1MU2tlIkMpsn8uT   │
╰────────────────────────────────────────────────────────────────────╯
```

### Celestial Theme
Electric Sky (`#38bdf8`), Celestial Blue spark (`✦`), Slate borders, and Emerald badges.

```bash
spotify --celestial status
```

### Amber Theme
Terracotta / Amber (`#d97706`), Warm Coral (`#fb923c`), Stone borders, and minimal bullets (`●`).

```bash
spotify --amber status
```

### Cyber Theme
Electric Cyan (`#06b6d4`), Neon Pink (`#ec4899`), Neon Purple accents, and diamond glyphs (`◆`).

```bash
spotify --cyber status
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

