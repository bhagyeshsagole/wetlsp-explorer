# WetLSP Explorer

Explore wetland vegetation through the seasons. Open a WetLSP site folder to
view EVI time series, select pixels on a map, and compare annual phenology.

WetLSP Explorer brings the web app to your desktop as a **Mac app** or
**Windows app**. Download an installer, open it, and start exploring.

## Download

**[Get the latest release](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest)**

Under **Assets**, choose the installer for your computer:

| Computer | File to download |
| --- | --- |
| Mac with Apple silicon — M1, M2, M3, M4 or newer | `WetLSP-Explorer-…-mac-arm64.dmg` |
| Mac with an Intel processor | `WetLSP-Explorer-…-mac-x64.dmg` |
| Windows 10 or 11 — Intel/AMD 64-bit | `WetLSP-Explorer-…-win-x64.exe` |

On a Mac, **Apple menu → About This Mac** shows your chip type.
Choose a **DMG** or **EXE** under Assets; the **Source code** archives are not installers.

This repository is private. If the download page shows **404**, sign in with an
invited GitHub account or ask the lab for the installer file directly.

## Install and open

**Mac:** Double-click the DMG. In the window that opens, drag the **WetLSP
Explorer app icon** into **Applications**. Open the app from Applications.
The DMG is the installer; you do not need to move the DMG itself into Applications.

**Windows:** Double-click the EXE. It installs for your account and opens the
app. Next time, use **WetLSP Explorer** in the Start menu or the desktop shortcut.

The current lab builds are unsigned, so your operating system may show a
first-launch warning. See **[the setup guide](SETUP.md)** for the exact steps,
updates, and troubleshooting.

## Open your first site

1. Click **Upload folder** and choose a single site folder, such as **CA-DB2**.
2. Wait for the import to finish. Large sites may take a little while.
3. Choose a view and explore your data.

You can also drag a site folder into the app or select individual files.
Keep each site's parquet files, batch subfolders, and annual NetCDF (`.nc`)
files together. Both single-file and batched `_ds` datasets are supported.

## What you can explore

| View | Use it to |
| --- | --- |
| **Overview** | Locate a site and review its observation dates, pixel coverage, available years, and metadata. |
| **Time Series** | Compare raw observations and spline curves, inspect daily means and interquartile ranges, and export filtered results. |
| **Pixel Map** | Select individual pixels or draw a region, then inspect the selection's time series. |
| **Phenometrics** | Examine seasonal timing, greenness, and quality layers; compare up to four site-year rasters. |
| **Catalog** | Search the bundled 95-site catalog and export site information. |

## Your data and offline use

Local datasets are processed and saved on your computer. The installer includes
the app, catalog, and scientific readers, so you can import local files and
analyze them without internet. Basemap imagery needs a connection unless its
tiles have already been cached.

Keep your original dataset folders as your permanent copy. Imported sites and
preferences are stored separately from the app and are retained when you
replace it with a newer version.

## Updates

Close the app, download the new DMG or EXE from
**[Releases](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest)**,
and install it over your existing copy. On Mac, choose **Replace** when copying
the app into Applications. On Windows, run the new installer.

For help getting started, see **[SETUP.md](SETUP.md)**.
