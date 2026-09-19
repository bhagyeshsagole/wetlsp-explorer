# Install WetLSP Explorer

WetLSP Explorer works like a normal desktop app, but it is installed from a
web link. You do **not** need Terminal, GitHub, Node.js, or programming tools.

> **App link:** The project owner will place the official WetLSP Explorer link
> here after the first deployment.

## Before you start

You need:

- a Mac or Windows computer;
- Google Chrome or Microsoft Edge;
- an internet connection for the first launch; and
- a WetLSP site folder if you want to explore your own data.

The app processes your data on your computer. Uploading a local folder does not
send it to a WetLSP server.

## Mac

1. Open the official app link in **Google Chrome** or **Microsoft Edge**.
2. Look for the **Install** icon at the right side of the address bar.
3. Select **Install**.
4. WetLSP Explorer opens in its own window. Keep it in the Dock if you want
   one-click access later.

If the Install icon is hidden in Chrome, open the **⋮** menu, choose
**Cast, save, and share**, then **Install page as app**. In Edge, open the
**…** menu, choose **Apps**, then **Install WetLSP Explorer**.

## Windows

1. Open the official app link in **Google Chrome** or **Microsoft Edge**.
2. Select the **Install** icon at the right side of the address bar.
3. Select **Install** when asked.
4. WetLSP Explorer appears in the Start menu and opens in its own window. You
   can pin it to the taskbar like any other app.

If the icon is hidden, use Chrome's **⋮ → Cast, save, and share → Install page
as app**, or Edge's **… → Apps → Install WetLSP Explorer**.

## Open your first dataset

1. Start WetLSP Explorer.
2. Select **Upload folder**.
3. Choose one complete WetLSP site folder, such as `CA-DB2`.
4. Wait until the site appears under **Loaded sites**.
5. Use the tabs across the top to open Overview, Time Series, Pixel Map,
   Phenometrics, or Catalog.

The first import can take a little while because a site may contain hundreds of
megabytes of observations. Keep the app window open until the import finishes.

## Make the site available offline

1. Import the site while connected to the internet.
2. Open **Settings** in the lower-left corner.
3. Select **Prepare for offline use**.
4. Wait for the app to confirm that the engine is cached.

You can then reopen the installed app without a network connection. Map imagery
may be unavailable offline, but saved site data and visualizations still work.

## Google Drive

If your organization has enabled Google Drive import, select **Import Drive
folder** or **Import Drive files** and sign in with an approved Google account.
If the button is disabled, Drive has not been configured for that deployment;
use **Upload folder** instead.

## Updates

There is nothing to download manually. WetLSP Explorer checks for an updated
version when it is online and applies it on a future launch.

## Common problems

### There is no Install button

Use current Google Chrome or Microsoft Edge. Safari and Firefox can open the
site but do not provide the supported desktop installation flow.

### A folder does not load

Choose the whole site folder rather than a parent folder containing many sites.
The folder should contain the pixel geometry, metadata and time-series parquet
files, plus any annual `.nc` files.

### My saved sites disappeared

The app stores imported data in the browser profile. Clearing site data,
using a private/incognito window, or uninstalling the browser can remove it.
Keep the original WetLSP folders as your permanent copy.

### The map is plain while offline

That is expected when map tiles were not viewed and cached while online. Pixel
locations and the scientific data remain available.

## Why there is no DMG or EXE

The browser installation above already creates a desktop-style application on
both macOS and Windows and keeps it updated automatically. A DMG or Windows
installer would require a second desktop wrapper, Apple notarization, Windows
code signing, separate releases, and additional compatibility testing. That can
be added later if institutional IT requires signed installers.
