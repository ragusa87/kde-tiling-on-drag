# kde-tiling-on-drag
Use KDE 6+ Tiling manager and "tile" all windows at the best positon without having to press the `shift` key.
It will not split or add areas on the fly, the window is only resized to an existing area that you can define with `Meta+T` using KDE's tiling editor.

Single windows are maximized automatically.

*This extension is unstable.*

Requirements :
- Since version `v1.0.0`, KDE/Plasma 6 is required, for Plasma 5.27 use release `v0.1.6`.

Demo:

 ![demo](https://github.com/ragusa87/kde-tiling-on-drag/assets/1695207/c99ce67c-e9c4-4117-9141-9f37bf9c4e0d)

Resources :

* KWin documentation <https://develop.kde.org/docs/plasma/kwin/api/>
* Plasma's MR that adds Tiling support <https://invent.kde.org/plasma/kwin/-/merge_requests/2560/diffs>
* KDE's Scripting support <https://invent.kde.org/plasma/kwin/-/blame/master/src/scripting/scripting.cpp#L210>

Inspired by :

* <https://github.com/esjeon/krohnkite>
* <https://github.com/Bismuth-Forge/bismuth>
* <https://github.com/zeroxoneafour/polonium>

How to install :

1. Download a release from <https://github.com/ragusa87/kde-tiling-on-drag/releases> (file `kde-tiling-on-drag.kwinscript`).
2. Open Plasma setting and search for "KWin" (Windows Management -> KWin Script).
3. Click on "Install from file" and select the `kde-tiling-on-drag.kwinscript` file.
4. Enable this extension (kde-tiling-on-drag).
5. Click on Apply.

How to use it :

1. Make sure your enabled the tiling editor in the "Desktop effect" settings.
2. Press "Meta+T" to open the tiling Editor.
3. Setup a layout.
4. Drag or open any window, it will be tiled automatically.

How to compile and install from source :

1. Install requirements (`makefile`, `7z`, `npm`, `plasmapkg2` or `plasma-framework`)
2. Edit the source file
3. Run `make reload` to build the package and reload it in Plasma

Limitations :

* It's buggy
* You need to set at least a layout with 2 areas.
* There is no feature such as "switch layout", etc.
* If you need more, stick to a more advanced script. This one is only an [MVP](https://en.wikipedia.org/wiki/Minimum_viable_product).
* You can of course submit MR or fork.


