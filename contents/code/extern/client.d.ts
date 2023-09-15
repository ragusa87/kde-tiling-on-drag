// Copyright (c) 2018-2019 Eon S. Jeon <esjeon@hyunmu.am>
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// API Reference:
//     https://techbase.kde.org/Development/Tutorials/KWin/Scripting/API_4.9


declare interface Api {
    readConfig(key: string, defaultValue?: any): any;
    registerShortcut(id: string, desc: string, keybind: string, callback: Function): void;
    callDBus(): void;
}
declare interface Toplevel {
    readonly popupWindow: boolean;
    readonly frameGeometry: QRect;
    readonly desktop: number;
    frameGeometryChanged: Signal<(client: AbstractClient, oldGeometry: QRect) => void>;
    windowClosed: Signal<(client: AbstractClient, deleted: object) => void>;
    screenChanged: Signal<() => void>;
}
declare interface AbstractClient extends Toplevel {
    readonly resizeable: boolean;
    readonly moveable: boolean;
    readonly transient: boolean;
    // added these three after looking at bismuth, lets see if they work
    readonly dialog: boolean;
    readonly splash: boolean;
    readonly utility: boolean;
    readonly specialWindow: boolean;
    readonly normalWindow: boolean;
    readonly geometry: QRect;
    readonly resourceName: string;
    tile: Tile | null;
    keepAbove: boolean;
    keepBelow: boolean;
    noBorder: boolean;
    fullScreen: boolean;
    minimized: boolean;
    activities: Array<string>;
    resourceClass: QByteArray;
    caption: string;
    minSize: QRect;
    // frameGeometry is read/write for abstractclient
    frameGeometry: QRect;
    screen: number;
    // custom tiling stuff that isnt in base kwin but we need it
    // has been tiled at least once
    hasBeenTiled: boolean | undefined;
    // was just tiled
    wasTiled: boolean | undefined;
    lastTileCenter: QPoint | undefined;
    // stuff to keep tabs on changes between locations
    oldActivities: Array<string> | undefined;
    oldDesktop: number | undefined;
    oldScreen: number | undefined;
    // for some reason, kwin doesn't include whether the window is maximized, so we add it ourselves
    maximized: boolean | undefined;
    // whether the client is the only tile on their screen or not
    isSingleTile: boolean | undefined;
    // a client to refullscreen when this client is untiled
    refullscreen: AbstractClient | undefined;
    // signals
    desktopPresenceChanged: Signal<(client: AbstractClient, desktop: number) => void>;
    desktopChanged: Signal<() => void>;
    fullScreenChanged: Signal<() => void>;
    activitiesChanged: Signal<(client: AbstractClient) => void>;
    clientMaximizedStateChanged: Signal<(client: AbstractClient, horizontal: boolean, vertical: boolean) => void>;
    clientFinishUserMovedResized: Signal<(client: AbstractClient) => void>;
    quickTileModeChanged: Signal<() => void>;
    minimizedChanged: Signal<() => void>;
    // functions
    setMaximize(vertically: boolean, horizontally: boolean): void;
}
declare interface Tile {
    tiles: Array<Tile>;
    windows: AbstractClient[];
    absoluteGeometry: QRect;
    relativeGeometry: QRect;
    layoutDirection: LayoutDirection;
    oldRelativeGeometry: QRect | undefined;
    // null for root tile
    parent: Tile | null;
    padding: number;
    split(direction: LayoutDirection): void;
    remove(): void;
    // whether the engine generated the tile or not
    generated: boolean | undefined;
}
declare enum LayoutDirection {
    Floating = 0,
    Horizontal,
    Vertical,
}
declare enum ClientAreaOption {
    PlacementArea = 0,
    MovementArea,
    MaximizeArea,
    MaximizeFullArea,
    FullScreenArea,
    WorkArea,
    FullArea,
    ScreenArea,
}
declare interface RootTile extends Tile {
    parent: null;
    layoutModified: Signal<() => void>;
    // extra thing used in engine
    connected: boolean | undefined;
}
declare interface TileManager {
    rootTile: RootTile;
    bestTileForPosition(x: number, y: number): Tile | null;
}

declare interface WorkspaceWrapper {
    readonly virtualScreenGeometry: QRect;
    activeClient: AbstractClient | null;
    activeScreen: number;
    currentActivity: string;
    currentDesktop: number;
    desktops: number;
    numScreens: number;
    // found it
    cursorPos: QPoint;
    tilingForScreen(desktop: number): TileManager;
    supportInformation(): string;
    clientList(): AbstractClient[];
    clientArea(option: ClientAreaOption, screen: number, desktop: number): QRect;
    clientArea(option: ClientAreaOption, client: AbstractClient): QRect;
    // doesnt actually exist in api but convenient place to keep state
    tmpLastActiveClient: AbstractClient | null | undefined;
    previousActiveClient: AbstractClient | null | undefined;
    lastActiveScreen: number | undefined;
    lastActivity: string | undefined;
    lastDesktop: number | undefined;
    // signals
    clientAdded: Signal<(client: AbstractClient) => void>;
    clientRemoved: Signal<(client: AbstractClient) => void>;
    clientActivated: Signal<(client: AbstractClient) => void>;
    clientMinimized: Signal<(client: AbstractClient) => void>;
    clientUnminimized: Signal<(client: AbstractClient) => void>;
    // idk what user does
    clientFullScreenSet: Signal<(client: AbstractClient, fullscreen: boolean, user: any) => void>;
    // signals for workspace
    currentDesktopChanged: Signal<(desktop: number, client: AbstractClient) => void>;
    currentActivityChanged: Signal<(activity: string) => void>;
}
declare interface Options {
    configChanged: Signal<() => void>;
}
declare interface DBusCall {
    service: string,
    path: string,
    dbusInterface: string,
    method: string,
    arguments: any[],
    finished: Signal<(returnValues: any[]) => void>;
    call(): void;
}


/* KWin global objects */
declare var workspace: WorkspaceWrapper;
declare var options: Options;

declare var workspace: WorkspaceWrapper;
declare var options: Options;
declare var kwin: Api;
declare var createTimer: () => QTimer;
declare var createDBusCall: () => DBusCall;
declare var showDialog: (text: string) => void;
//export let settingsDialog: Qml.SettingsDialog;
declare var dbusClientInstalled: boolean;
