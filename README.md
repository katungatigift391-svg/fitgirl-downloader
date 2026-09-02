# ⚡ FitGirl Downloader

<p align="center">
  <strong>The High-Performance Standalone Repack Downloader & Selective Component Manager.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-ISC-06b6d4?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Protocol-WebTorrent%20P2P-10b981?style=for-the-badge" alt="WebTorrent">
  <img src="https://img.shields.io/badge/Status-Active%20Release-f59e0b?style=for-the-badge" alt="Status">
</p>

---

## 💡 Why FitGirl Downloader? (Direct Repacks vs Multi-Part RAR Hell)

Downloading FitGirl Repacks through browser filehosters (Rapidgator, Datanodes, MultiUp, Gofile) usually means dealing with:
* ❌ **30 to 60 Fragile Multi-Part Archives**: 60GB games are broken into dozens of 500MB `.part01.rar`, `.part02.rar` chunks. If a single part is corrupted or fails to download, the entire WinRAR/7-Zip extraction fails.
* ❌ **Slow Speed Caps & Hourly Quotas**: Aggressive filehoster bandwidth throttling, countdown timers, and captcha walls.
* ❌ **Dead or Expired Mirrors**: Missing parts that permanently break your ability to extract the game.
### 🌟 The FitGirl Downloader Advantage:
* ✅ **Direct `.bin` Archives & `setup.exe` Streaming**: Downloads the exact unfragmented repack files directly to your disk via multi-tracker WebTorrent P2P. No multi-part RAR combining, no extraction errors, and no corrupted archive extraction loops.
* ✅ **Unrestricted Component Picking**: Every file in the repack is fully toggleable. Select or deselect main chunks, bonus soundtracks, 4K videos, or specific language voiceover packs before starting.
* ✅ **Automatic Fault-Tolerant Resuming**: State is saved periodically every 10 seconds. Network drops, laptop sleep, or server restarts resume seamlessly without losing downloaded data.


---

## ⚡ Key Capabilities

* **🔍 Live FitGirl Catalog & Instant Search**  
  Browse and search releases scraped directly from the official FitGirl Repacks catalog with cover art, repack size, original size, genres, release dates, and mirror links. Non-game announcements and digest posts are automatically filtered out.

* **📦 Granular Selective File Picker**  
  Inspect the contents of any repack before downloading. Toggle individual files on or off, view exact byte sizes, and use quick "Select All" or "Required Only" presets.

* **📥 Multi-Tracker Swarm Engine**  
  Auto-injects tier-1 DHT and tracker swarms (RuTor, OpenTrackr, Opentor, Qu.ax, OpenBittorrent) to ensure maximum peer availability and saturation speeds.

* **📊 Live WebSockets Telemetry Dashboard**  
  Monitor real-time global download/upload speeds, active transfer progress percentages, peer counts, and dynamic ETA calculations.

---

## 🚀 Projected Roadmap: Launcher & Installer Integration

> 💡 **Community Driven**: Future capabilities are actively prioritized based on user ratings, GitHub stars, and community feedback!

* [ ] **Automated Cloaked Installer Engine**: Optional background execution of `setup.exe` in silent unattended mode with automatic Lolz/SRep 2GB RAM limit toggles.
* [ ] **Integrated Game Library & Launcher**: Automatic game executable discovery, launch tracking, play time metrics, and desktop shortcut generation.
* [ ] **Direct Filehoster (DDL) De-Multiplexer**: Automatic multi-part DDL scraper and combiner for users on ISP-restricted torrent networks.

---

## 🛠️ Quickstart Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or higher)
* Git

### Installation & Launch

```bash
# 1. Clone the repository
git clone https://github.com/katungatigift391-svg/fitgirl-downloader.git
cd fitgirl-downloader

# 2. Install dependencies
npm install

# 3. Start the downloader
npm start
```

*On Windows, you can simply double-click `start.bat`.*

The app will immediately open in your default browser at **`http://localhost:3333`**.

---

## ⚙️ Configuration

Open the **Settings** tab in the top navigation bar to configure:
* **Downloads Directory**: Set any custom folder or external storage drive for downloaded archives.
* **Component Defaults**: Choose whether optional bonus content (soundtracks, extra language packs) should be enabled by default.

---

## 💬 Community Feedback & Contributions

Your feedback directly shapes upcoming releases and roadmap priorities!

* 🐛 **Report Bugs or Broken Releases**: Open a ticket on [GitHub Issues](https://github.com/katungatigift391-svg/fitgirl-downloader/issues).
* 💡 **Feature Proposals**: Submit ideas on [GitHub Discussions](https://github.com/katungatigift391-svg/fitgirl-downloader/discussions) or file an Issue labeled `enhancement`.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
