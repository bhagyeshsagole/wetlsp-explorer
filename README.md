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

Expected — these lab builds are not yet signed by Apple or Microsoft.

**Mac:** try to open it once, then **System Settings → Privacy & Security →
Open Anyway**.
**Windows:** **More info → Run anyway**.

Only do this for installers from this repository or your lab.
[Full details in SETUP.md](SETUP.md).
</details>

---

## Open your first site

1. Click **Upload folder**.
2. Choose one site folder, such as **CA-DB2** — the site folder itself, not a
   parent folder holding many sites.
3. Wait for the import to finish, then pick a view.

You can also drag a folder onto the window or select individual files. Keep each
site's parquet files, batch subfolders, and annual `.nc` files together. Both
single-file and batched `_ds` datasets work.

---

## The five views

| View | Use it to |
| --- | --- |
| **Overview** | Locate a site; check its dates, pixel coverage, years, and metadata. |
| **Time Series** | Compare raw and spline curves, read daily means and interquartile ranges, export results. |
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

---

## Updates

Manual for now: close the app, download the new installer from
[Releases](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest),
and install it over your existing copy. [Details](SETUP.md#updates-and-saved-data).
