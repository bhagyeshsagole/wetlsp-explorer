# Install WetLSP Explorer

Download the app, install it, and open your data. **No Terminal, coding tools,
Node.js, or browser installation is needed.**

## 1. Download

Open **[Download WetLSP Explorer](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest)**
and expand **Assets**. Choose the file for your computer:

| Your computer | Download ending in |
| --- | --- |
| Mac with Apple M1, M2, M3, M4 or newer chip | `mac-arm64.dmg` |
| Mac with Intel processor | `mac-x64.dmg` |
| Windows 10 or 11, Intel/AMD 64-bit | `win-x64.exe` |

On Mac, **Apple menu → About This Mac** tells you which chip you have.

This is a private lab repository. Sign into GitHub with an account the owner
has invited. If the page says **404**, ask the owner for access or for the
installer file directly. You do not need a GitHub account when someone gives
you the installer file. Do not download **Source code**: that is for developers.

## 2. Install on Mac

1. Double-click the downloaded **.dmg** file.
2. Drag **WetLSP Explorer** onto the **Applications** folder in that window.
3. Open **Applications**, then double-click **WetLSP Explorer**.
4. Eject the installer disk when you are done. You can delete the downloaded DMG.
5. To keep the app handy, right-click its Dock icon → **Options → Keep in Dock**.

**First-launch warning:** These initial lab builds are not signed or notarized
by Apple. If macOS blocks the app, attempt to open it once, then go to
**System Settings → Privacy & Security**, scroll to the security message for
WetLSP Explorer, and choose **Open Anyway**. Confirm **Open** when asked.
Only do this for the installer provided by your lab. If the button is unavailable
on a managed computer, contact your IT team; do not disable system security.

## 2. Install on Windows

1. Double-click the downloaded **.exe** installer.
2. The app installs for your account and opens automatically.
3. Next time, open **WetLSP Explorer** from the Start menu or desktop shortcut.

**First-launch warning:** These initial lab builds are unsigned. If Windows
shows **Windows protected your PC**, select **More info**, check that this is the
WetLSP installer you downloaded, then select **Run anyway**. Your institution
may require IT approval. An administrator password is normally not needed.

## 3. Open your data

1. Select **Upload folder** in WetLSP Explorer.
2. Choose one complete WetLSP site folder, such as **CA-DB2**. You can also drag
   the folder into the app.
3. Wait until it appears in **Loaded sites**.
4. Explore **Overview**, **Time Series**, **Pixel Map**, **Phenometrics**, and
   **Catalog** using the tabs.

Choose the site folder itself, not a parent folder containing many sites.
Keep its parquet files, any batch subfolders, and annual `.nc` files together.
The first import may take a while for large datasets. Keep the app open until
it finishes. Imported data stays on your computer.

## Working offline

The installer includes the app, site catalog, and scientific readers. You can
start it and import local datasets without internet, including the first launch.
There is no separate browser installation or preparation step.

Basemap imagery needs an internet connection unless those tiles were previously
cached. Without imagery, your pixel positions, charts, and saved datasets remain
available.

## Updates and saved data

Updates are currently manual. Close the app, download the latest installer from
the same link, and install it over the old version. On Mac choose **Replace**
when copying into Applications. On Windows run the new installer.

Imported datasets are kept separately from the application:

- Mac: `~/Library/Application Support/WetLSP Explorer`
- Windows: `%APPDATA%\WetLSP Explorer`

Do not delete this folder if you want to keep imported sites and preferences.
Always keep the original dataset folders as your permanent copy. Data imported
into the earlier browser version is separate; import it once into this app.

## If something goes wrong

- **Download page says 404:** ask the owner for repository access or the installer file.
- **App is blocked:** follow the first-launch note for your OS, or contact institutional IT.
- **Mac says the app is damaged:** download it again from the official release; if it
  still fails, send the exact message to the owner. Do not remove security checks.
- **A folder does not load:** choose a single complete site folder containing parquet
  and/or NetCDF data, and wait for the import to finish.
- **Local port 47831 is in use:** close another copy of WetLSP Explorer. If the message
  remains, restart the computer or ask IT which program is using that port.
- **Plain map while offline:** expected; imagery is online content, while the analysis is local.
