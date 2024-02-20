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


declare interface KWinEnums{
    PlacementArea: number;
    MovementArea: number;
    MaximizeArea: number;
    MaximizeFullArea: number;
    FullScreenArea: number;
    WorkArea: number;
    FullArea: number;
    ScreenAre: number;
    ElectricTop: number;
    ElectricTopRight: number;
    ElectricRight: number;
    ElectricBottomRight: number;
    ElectricBottom: number;
    ElectricBottomLeft: number;
    ElectricLeft: number;
    ElectricTopLeft: number;
    ElectricNone: number;
}
declare interface Toplevel {
    readonly popupWindow: boolean;
    readonly frameGeometry: QRect;
    desktop: number;
    frameGeometryChanged: Signal<(client: AbstractClient, oldGeometry: QRect) => void>;
    clientGeometryChanged: Signal<(client: AbstractClient, oldGeometry: QRect) => void>;
    windowClosed: Signal<(client: AbstractClient, deleted: object) => void>;
    screenChanged: Signal<() => void>;
}

// See https://invent.kde.org/plasma/kwin/-/blob/master/src/window.h
declare interface AbstractClient extends Toplevel {
    // objectName
    // bufferGeometry: QRectF
    readonly pos: QPoint
    readonly size: QSize
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    // opacity: number
    screen: number;
    // output: number; Unable to handle unregistered datatype 'KWin::Output*'
    // rect: QRectF
    readonly resourceName: string;
    resourceClass: string;
    windowRole: string;
    // minimizedChanged: Signal
    readonly desktopWindow: boolean;
    readonly dock: boolean;
    readonly toolbar: boolean;
    readonly menu: boolean;
    readonly normalWindow: boolean;
    readonly dialog: boolean;
    readonly splash: boolean;
    readonly utility: boolean;
    readonly dropDownMenu: boolean;
    readonly popupMenu: boolean;
    readonly tooltip: boolean;
    readonly notification: boolean;
    readonly criticalNotification: boolean;
    readonly appletPopup: boolean;
    readonly onScreenDisplay: boolean;
    readonly comboBox: boolean;
    readonly dndIcon: boolean;
    readonly windowType: Number;
    readonly managed: boolean;
    readonly deleted: boolean;
    readonly shaped: boolean;
    readonly skipsCloseAnimation: boolean;
    readonly popupWindow: boolean;
    readonly outline: boolean;
    internalId: string;
    pid: Number;
    stackingOrder: Number;
    fullScreen: boolean;
    fullScreenable: boolean;
    active: boolean;
    //desktops: Array Unable to handle unregistered datatype 'QVector<KWin::VirtualDesktop*>
    onAllDesktops: boolean;
    activities: Array<string>;
    x11DesktopIds: Number;
    skipTaskbar: boolean;
    skipPager: boolean;
    skipSwitcher: boolean;
    closeable: boolean;
    // icon: QVariant
    keepAbove: boolean,
    keepBelow: boolean;
    shadeable: boolean;
    shade: boolean;
    readonly minimizable: boolean;
    minimized: boolean;
    readonly iconGeometry: QRect
    readonly specialWindow: boolean;
    readonly demandsAttention: boolean;
    caption: string;
    minSize: QRect;
    maxSize: QRect;
    readonly wantsInput: boolean;
    readonly transient: boolean;
    // transientFor
    readonly modal: boolean;
    geometry: QRect;
    frameGeometry: QRect; //  is read/write for abstractclient
    readonly move: boolean;
    //readonly resize: boolean;
    readonly decorationHasAlpha: boolean;
    noBorder: boolean;
    readonly providesContextHelp: boolean;
    readonly maximizable: boolean;
    readonly moveable: boolean;
    readonly moveableAcrossScreens: boolean;
    readonly resizeable: boolean;
    //readonly desktopFileName: string
    readonly hasApplicationMenu: boolean;
    readonly unresponsive: boolean;
    //readonly colorScheme: kdeglobals;
    readonly layer: number
    readonly hidden: boolean;
    tile: Tile | null;
    // basicUnit: ??
    readonly blocksCompositing: boolean;
    readonly clientSideDecorated: boolean;
    readonly frameId: number;
    readonly windowId: number;

    /// Not found while dumping properties
    // readonly isComboBox: boolean;
    // readonly isClient: boolean;
    // output: number;

    // signals
    //desktopPresenceChanged: Signal<(client: AbstractClient, desktop: number) => void>; => Removed by https://invent.kde.org/plasma/kwin/-/merge_requests/3677
    desktopChanged: Signal<() => void>;
    fullScreenChanged: Signal<() => void>;
    activitiesChanged: Signal<(client: AbstractClient) => void>;
    clientMaximizedStateChanged: Signal<(client: AbstractClient, horizontal: boolean, vertical: boolean) => void>;
    clientFinishUserMovedResized: Signal<(client: AbstractClient) => void>;
    clientStepUserMovedResized: Signal<(client: AbstractClient, geometry: QRect) => void>;
    moveResizedChanged: Signal<() => void>;
    quickTileModeChanged: Signal<() => void>;
    minimizedChanged: Signal<() => void>;
    outputChanged: Signal<() => void>;
    geometryChanged: Signal<() => void>;
// Other signals:
// objectNameChanged
// stackingOrderChanged: Signal
// shadeChanged: Signal
// opacityChanged: Signal
// damaged: Signal
// inputTransformationChanged: Signal
// geometryChanged: Signal
// geometryShapeChanged: Signal
// windowShown: Signal
// windowHidden: Signal
// shapedChanged: Signal
// skipCloseAnimationChanged: Signal
// windowRoleChanged: Signal
// windowClassChanged: Signal
// hasAlphaChanged: Signal
// surfaceChanged: Signal
// shadowChanged: Signal
// bufferGeometryChanged: Signal
// frameGeometryChanged: Signal
// clientGeometryChanged: Signal
// frameGeometryAboutToChange: Signal
// visibleGeometryChanged: Signal
// tileChanged: Signal
// skipTaskbarChanged: Signal
// skipPagerChanged: Signal
// skipSwitcherChanged: Signal
// iconChanged: Signal
// activeChanged: Signal
// keepAboveChanged: Signal
// keepBelowChanged: Signal
// demandsAttentionChanged: Signal
// x11DesktopIdsChanged: Signal
// clientMinimized: Signal
// clientUnminimized: Signal
// paletteChanged: Signal
// colorSchemeChanged: Signal
// captionChanged: Signal
// clientMaximizedStateAboutToChange: Signal
// transientChanged: Signal
// modalChanged: Signal
// moveResizedChanged: Signal
// moveResizeCursorChanged: Signal
// clientStartUserMovedResized: Signal
// clientStepUserMovedResized: Signal
// closeableChanged: Signal
// minimizeableChanged: Signal
// shadeableChanged: Signal
// maximizeableChanged: Signal
// desktopFileNameChanged: Signal
// applicationMenuChanged: Signal
// hasApplicationMenuChanged: Signal
// applicationMenuActiveChanged: Signal
// unresponsiveChanged: Signal
// decorationChanged: Signal
// hiddenChanged: Signal
// lockScreenOverlayChanged: Signal
// closeWindow: Signal
// setReadyForPainting: Signal
// setMaximize: Signal
// clientManaging: Signal
// clientFullScreenSet: Signal
// showRequest: Signal
// menuHidden: Signal
// appMenuAvailable: Signal
// appMenuUnavailable: Signal
// blockingCompositingChanged: Signal
// clientSideDecoratedChanged: Signal
// updateCaption: Signal

// functions
    setMaximize(vertically: boolean, horizontally: boolean): void;
}
declare interface Tile {
    tiles: Array<Tile>;
    windows: AbstractClient[];
    absoluteGeometry: QRect;
    relativeGeometry: QRect;
    absoluteGeometryInScreen: QRect;
    layoutDirection: LayoutDirection;
    oldRelativeGeometry: QRect | undefined;
    // null for root tile
    parent: Tile | null;
    padding: number;
    split(direction: LayoutDirection): void;
    remove(): void;
    moveByPixels(point: QPoint): void; // not supported on horizontal and vertical layouts
    positionInLayout: number;
    canBeRemoved: boolean;
    isLayout: boolean;
    isLayoutChanged(): boolean;
    layoutModified: Signal<() => void>;
    layoutDirectionChanged: Signal<() => LayoutDirection>;
    // windowRemoved: Signal<any>;
    // windowAdded: Signal<any>;
    // childTilesChanged: Signal<any>;
    // rowChanged: Signal<any>;
    // paddingChanged: Signal<any>;
    // windowGeometryChanged: Signal<() => void>;
    // objectNameChanged: Signal<any>;
    // absoluteGeometryChanged: Signal<() => void>;
    // relativeGeometryChanged: Signal<() => void>;
}
declare enum LayoutDirection {
    Floating = 0,
    Horizontal,
    Vertical,
}

declare interface CustomTile extends Tile {
    parent: null;
    layoutModified: Signal<() => void>;
    // extra thing used in engine
    connected: boolean | undefined;
}

declare enum QuickTileFlag {
    None = 0,
    Left = 1 << 0,
    Right = 1 << 1,
    Top = 1 << 2,
    Bottom = 1 << 3,
    Custom = 1 << 4,
    Horizontal = Left | Right,
    Vertical = Top | Bottom,
    Maximize = 15,
}

declare interface TileManager {
    rootTile: CustomTile;
    quickTile(int: QuickTileFlag): Tile|null;
    model: string
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
    clientArea(option: number, screen: number, desktop: number): QRect;
    clientArea(option: number, client: AbstractClient): QRect;
    hideOutline(): void;
    showOutline(geometry: QRect): void;
    showOutline(x: number,  y:number,  width:number,  height:number): void;
    sendClientToScreen(client: AbstractClient, screen: number): void;
    screenAt(point: QPoint): number|undefined;
    slotWindowMaximize: () => void
    slotWindowQuickTileLeft: () => void;
    slotWindowQuickTileRight: () => void;
    slotWindowQuickTileTop: () => void;
    slotWindowQuickTileBottom: () => void;

    // signals
    clientAdded: Signal<(client: AbstractClient) => void>;
    clientRemoved: Signal<(client: AbstractClient) => void>;
    clientActivated: Signal<(client: AbstractClient) => void>;
    clientMinimized: Signal<(client: AbstractClient) => void>;
    clientUnminimized: Signal<(client: AbstractClient) => void>;
    // idk what user does
    clientFullScreenSet: Signal<(client: AbstractClient, fullscreen: boolean, user: any) => void>;
    // signals for workspace
    currentDesktopChanged: Signal<(oldDesktop: number, client: AbstractClient) => void>;
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
