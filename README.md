# kde-tilling-on-drag
Use KDE 5.27 Tilling manager and "tile" all windows at the best positon without having to press the `shift` key.

It will not split or add areas on the fly, the window is only resized to an existing area that you can define with `Meta+T` using KDE's tiling editor.

*This extension is unstable.*

Resources:
* KWin documentation <https://develop.kde.org/docs/plasma/kwin/api/>
* Plasma's MR that adds Tiling support <https://invent.kde.org/plasma/kwin/-/merge_requests/2560/diffs>
* KDE's Scripting support <https://invent.kde.org/plasma/kwin/-/blame/master/src/scripting/scripting.cpp#L210>
Inspired by:
* <https://github.com/esjeon/krohnkite>
* <https://github.com/Bismuth-Forge/bismuth>
* <https://github.com/zeroxoneafour/polonium>

How to install:

1. run `make install` (you will need `7z` && `plasmapkg2` && `npm`).
2. Open Plasma setting and search for "KWin" (Windows Management -> KWin Script).
3. Enable this extension (kwintillingapi).
4. Click on Apply.

How to use it:

1. Make sure your enabled the tilling editor in the "Desktop effect" settings.
2. Press "Meta+T" to open the Tilling Editor.
3. Setup a layout.
4. Drag or unminimize any window, it will be tiled to the area you defined earilier.

Limitations:

* It's buggy
* You need to set at least a layout with 2 areas.
* There is not feature such as "maximize single window", "switch layout", etc.
* If you need more, stick to a more advanced script. This one is only a [MVP](https://en.wikipedia.org/wiki/Minimum_viable_product).
* You can of course submit MR or fork.


