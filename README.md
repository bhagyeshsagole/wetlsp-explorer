# WetLSP Explorer

Explore wetland vegetation through the seasons. Open a WetLSP site folder to
view EVI time series, select pixels on a map, and compare annual phenology.

A desktop app for **Mac** and **Windows**. Your data stays on your computer.

| I want to… | Go to |
| --- | --- |
| Install the app | [Download](#download) below |
| Follow step-by-step instructions | **[SETUP.md](SETUP.md)** |
| Fix a problem | [Troubleshooting](SETUP.md#if-something-goes-wrong) |
| See what the app does | [The five views](#the-five-views) |

---

## Download

**[→ Get the latest release](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest)**

Open **Assets** on that page and pick the file for your computer:

| Your computer | File ending in |
| --- | --- |
| Mac, Apple silicon (M1/M2/M3/M4 or newer) | `mac-arm64.dmg` |
| Mac, Intel processor | `mac-x64.dmg` |
| Windows 10 or 11 | `win-x64.exe` |

Not sure which Mac you have? **Apple menu → About This Mac**.

Skip the **Source code** archives — those are for developers, not installation.

<details>
<summary><strong>The download page shows 404</strong></summary>

The repository is private. Sign in with a GitHub account the lab has invited,
or ask the lab to send you the installer file directly. You do not need a
GitHub account to use a file someone shares with you.
</details>

<details>
<summary><strong>My computer warns me not to open it</strong></summary>

Expected — these lab builds are not signed with a paid Apple or Microsoft
certificate. You confirm once, then it never asks again.

**Mac:** double-click the app, click **Done** on the warning, then go to
**System Settings → Privacy & Security → Open Anyway** and confirm **Open**.
**Windows:** **More info → Run anyway**.

If a Mac instead says the app is **damaged**, you have a release older than
v1.0.3 — download the latest one.

Only do this for installers from this repository or your lab.
[Full details in SETUP.md](SETUP.md).
</details>

---

## Open your first site

The desktop app opens with five sample sites already loaded (CA-DSM, FR-LGt,
BR-SM1, US-BZF, CZ-Wet). To add your own:

1. Click **Upload folder**.
2. Choose a site folder such as **CA-DB2**, a folder holding several sites, or
   a folder of the `.zip` files Google Drive downloads. Each site is found and
   imported separately.
3. Wait for the import to finish, then pick a view.

You can also drag folders or `.zip` files onto the window, or pick individual
files. Both single-file and batched `_ds` datasets work.

---

## The five views

| View | Use it to |
| --- | --- |
| **Overview** | Locate a site; check its dates, pixel coverage, years, and metadata. |
| **Time Series** | Line chart of daily mean EVI with its interquartile band and estimated green-up, peak and green-down dates; overlay years; show every pixel; export results. |
| **Pixel Map** | Select pixels or draw a region, then inspect that selection's time series. |
| **Phenometrics** | Examine timing, greenness, and quality layers; compare up to four site-years. |
| **Catalog** | Search the bundled 95-site catalog and export site information. |

---

## Your data

Everything is processed and stored on your own computer. Nothing is uploaded.

The installer bundles the app, the site catalog, and the scientific readers, so
you can import and analyze local files **without internet** — including on first
launch. Only basemap imagery needs a connection.

Keep your original dataset folders as your permanent copy. Imported sites and
preferences are stored separately from the app, so they survive updates.

Imported data can use up to **50 GB**, or less if your disk has less free
space. When an import would go over, the app asks you to delete a site first.
Manage sites in **Settings → Storage**. Deleted sample sites can be restored
from **Settings → Sample sites**.

### Figures

Every chart and map has **PNG** and **Copy** buttons. Copy puts the image on
the clipboard for slides or chat. Shortcuts: **⌘S** / **Ctrl+S** saves, and
**⌘⇧C** / **Ctrl+Shift+C** copies. Exports carry a title with the site, year
and sample size. The **⋯** menu adds a vector SVG, a 1920×1080 slide PNG, CSVs,
and a ready-to-paste figure caption that describes exactly what is plotted.

---

## Updates

Manual for now: close the app, download the new installer from
[Releases](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest),
and install it over your existing copy. [Details](SETUP.md#updates-and-saved-data).
