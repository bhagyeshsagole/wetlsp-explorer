**Fixed in v1.0.3 — macOS "app is damaged" error.** Earlier Mac builds shipped with
an invalid code signature, so macOS refused to open them and offered only *Move to
Trash*. These builds are signed correctly. If you hit that error before, download
the installer below; no Terminal commands are needed.

---

Download the installer for your computer under **Assets**:

- **Mac with Apple silicon (M1/M2/M3/M4 or newer):** `mac-arm64.dmg`
- **Mac with an Intel processor:** `mac-x64.dmg`
- **Windows 10/11, Intel or AMD 64-bit:** `win-x64.exe`

On Mac, open the DMG and drag WetLSP Explorer into Applications. On Windows,
open the EXE to install for your account. All scientific readers are bundled
for offline use. The DMG is the installer: drag the app inside it to Applications,
not the DMG file itself.

These lab builds are **not signed with a paid Apple or Microsoft certificate**, so
you approve them once. On macOS, double-click the app, click **Done** on the
"could not verify" warning, then go to **System Settings → Privacy & Security →
Open Anyway** and confirm **Open**; later launches open normally. Windows may show
SmartScreen → More info → Run anyway. Only approve installers you obtained from
this repository or your lab. Managed computers may require IT approval.

See [SETUP.md](https://github.com/bhagyeshsagole/wetlsp-explorer/blob/main/SETUP.md)
for step-by-step installation and dataset instructions. Repository
access is required to download here; the owner can also share the installer
files directly with colleagues.

Updates are manual: download and install the new version over the existing one.
Imported datasets are stored separately in the app's local profile.
