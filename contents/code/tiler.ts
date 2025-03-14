import {Config} from './config';
import {LogLevel} from './logLevel';
import {Console} from './logger';
import {
    clientProperties,
    clientToString,
    debounce,
    isSameActivityAndDesktop,
    isSupportedClient,
    point,
    tileToString
} from './clientHelper';

import {ShortcutManager} from './shortcuts';

export class Tiler{
    config: Config;
    logger: Console;
    shortcuts: ShortcutManager;
    interactiveMoveResizeFinished: () => void;
    interactiveMoveResizeStepped: () => void;
    clientScreenChangedListener: () => void;
    minimizedChanged: (myClient: AbstractClient) => void;
    retileOtherDeferred: (myClient: AbstractClient|null, affectedTile: Tile|null) => void;
    lastWindowActivated: AbstractClient|null = null
    isMoving: boolean = false; // True if the user is moving a window (set by interactiveMoveResizeStepped/interactiveMoveResizeFinished)
    minimizedChangedHandlers: Map<AbstractClient, () => void>;
    constructor(config: Config){
        this.config = config;
        this.minimizedChangedHandlers = new Map<AbstractClient, () => void>();
        this.logger = new Console(LogLevel.DEBUG)
        this.shortcuts = new ShortcutManager();
        this.shortcuts.apply()

        this.interactiveMoveResizeFinished = () => {
            this.event( `interactiveMoveResizeFinished ${clientToString(workspace.activeWindow)}`)
            this.isMoving = false;
            if(workspace.activeWindow === null){
                return;
            }
            this.tileClient(workspace.activeWindow, 'interactiveMoveResizeFinished', workspace.cursorPos)
        };

        this.clientScreenChangedListener = () => {
            // When the used is moving a window (clientStepUserMovedResized) to another screen, the screenChanged event is triggered.
            // We need to skip it, otherwise the window will be re-tiled even if the user did not complete the move (clientFinishUserMovedResizedListener)
            if(this.isMoving){
                return;
            }
            this.event('clientScreenChangedListener')
            if(workspace.activeWindow === null){
                this.logger.warn('clientScreenChangedListener: workspace.activeWindow is null');
                return;
            }
            this.retileOtherDeferred(workspace.activeWindow, null)
        };

        this.retileOtherDeferred = debounce((myClient: AbstractClient|null, affectedTile: Tile|null = null) => {
            this.retileOther(myClient, affectedTile);
        }, 50);

        /**
         * Show a window outline while moving a window (as when the user is pressing shift)
         */
        this.interactiveMoveResizeStepped = () => {
            // This event is triggered when the user is moving a window
            this.isMoving = true;

            if(!this.config.doShowOutline || workspace.activeWindow === null){
                return
            }
            const client: AbstractClient = workspace.activeWindow

            // Calculate the outline geometry
            const position = workspace.cursorPos;

            // If you drag to another screen, client.output is not always updated. So we do the calculation instead.
            const currentScreen = workspace.screens.filter((screen) => {
                return screen.geometry.x <= position.x &&
                    position.x <= screen.geometry.x + screen.geometry.width &&
                    screen.geometry.y <= position.y &&
                    position.y <= screen.geometry.y + screen.geometry.height;
            }).pop() ?? client.output;
            const tile = workspace.tilingForScreen(currentScreen.name)?.bestTileForPosition(position.x, position.y)
            let outlineGeometry = tile ? tile.absoluteGeometry : null;

            // If we have more than one window on the screen, show the outline maximized
            const numberOfOtherTiledWindows = this.getTiledClientsOnScreen(currentScreen.name).filter((otherClient: AbstractClient) => otherClient !== client).length;
            const numberOfOtherUnTiledWindows = this.getUntiledClientOnScreen(currentScreen.name).filter((otherClient: AbstractClient) => otherClient !== client).length;

            if(numberOfOtherTiledWindows + numberOfOtherUnTiledWindows === 0 && this.config.doMaximizeSingleWindow){
                outlineGeometry = this.padGeometry(workspace.clientArea(KWin.MaximizeArea, currentScreen, workspace.currentDesktop), currentScreen.name);
            }

            if(outlineGeometry !== null){
                // Show the outline, note that we have no way to set the "outline visualParentGeometry" so no animation is shown
                // A "TypeError exception" is thrown if the outlineGeometry object is altered, so the padding is not supported.
                workspace.showOutline(outlineGeometry);
            }
        };

        this.minimizedChanged = (client: AbstractClient) => {
            this.event( `minimizedChanged: ${clientToString(client)} ${client.minimized ? 'minimized' : 'unminimized'}`)


            if(client.minimized){
                this.rearrangeLayout(null)
                this.handleMaximizeMinimize(client.output.name, 'minimized')
                return
            }

            // We retile window when we un-minimize one
            this.rearrangeLayout(client)
            this.tileClient(client, 'Unminimized')
        }

        // Log properties at startup
        workspace.windowList().forEach((oneClient: AbstractClient) => {
            this.logWindowProperties(oneClient)
        });

        // Attach all existing windows at startup
        workspace.windowList().filter(this.isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        // Attach new client
        workspace.windowAdded.connect((client: AbstractClient) => {
            this.logWindowProperties(client)

            if(! this.isSupportedClient(client)){
                return;
            }

            this.event( `clientAdded: ${clientToString(client)}`)
            this.attachClient(client)
        });

        workspace.windowActivated.connect(client => {
            if(client === null || ! this.isSupportedClient(client)){
                return;
            }
            this.event(`windowActivated: ${clientToString(client)}`)
            this.lastWindowActivated = client
        })

        // Detach old client
        workspace.windowRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }

            this.event(`windowRemoved: ${clientToString(client)}`)
            this.detachClient(client)
        });

        // Listen for layout change on each screen's root tile
        this.getAllScreensNames(workspace.activeScreen.name).forEach((screen: string) => {
            const tileManager = workspace.tilingForScreen(screen);
            if(tileManager === null){
                this.logger.warn(`No tileManager for screen ${screen} ??`);
                return
            }
            if(tileManager.rootTile === null){
                this.logger.warn(`No root tile for screen ${screen} ??`);
                return
            }
            workspace.tilingForScreen(screen).rootTile.layoutModified.connect(debounce(() => {
                    this.event(`layoutModified on screen: ${screen}`)
                    this.handleMaximizeMinimize(screen, 'layoutModified')
            }, 50));
        });
    }
    /**
     * Filter client to be on the same activity and desktop
     */
    private isSameActivityAndDesktop(client: AbstractClient): boolean{
        return isSameActivityAndDesktop(client);
    }

    /**
     * Log window properties, useful to tweak the supported client list. Must be enabled via config
     */
    private logWindowProperties(client: AbstractClient): void{
        if(!this.config.logWindowProperties){
            return;
        }
        // we use console debug here, so we can log properties without enabling the debug mode
        console.debug(`${clientProperties(client)}\n---> Supported? ${this.isSupportedClient(client)}`);
    }

    /**
     * Add listeners and tile new client
     */
    private attachClient(client: AbstractClient){
        this.doLogIf(this.config.logEvents, LogLevel.INFO, `> attachClient: ${clientToString(client)}`);
        this.rearrangeLayout(client);

        client.interactiveMoveResizeFinished.connect(this.interactiveMoveResizeFinished);
        client.interactiveMoveResizeStepped.connect(this.interactiveMoveResizeStepped);
        client.outputChanged.connect(this.clientScreenChangedListener);

        const minimizedChangedHandler = () => this.minimizedChanged(client);
        this.minimizedChangedHandlers.set(client, minimizedChangedHandler);
        client.minimizedChanged.connect(minimizedChangedHandler);

        this.tileClient(client, 'attachClient');
    }

    /**
     * Remove listeners and re-tile other windows
     */
    private detachClient(client: AbstractClient){
        this.doLogIf(this.config.logEvents, LogLevel.INFO, `> detachClient ${clientToString(client)}`);
        client.interactiveMoveResizeFinished.disconnect(this.interactiveMoveResizeFinished);
        client.interactiveMoveResizeStepped.disconnect(this.interactiveMoveResizeStepped);
        client.outputChanged.disconnect(this.clientScreenChangedListener);
        client.minimizedChanged.disconnect(this.minimizedChangedHandlers.get(client) ?? (() => {}));
        this.minimizedChangedHandlers.delete(client)

        if(this.lastWindowActivated === client){
            this.lastWindowActivated = null;
        }

        client.tile = null;
        this.rearrangeLayout(null);
        this.retileOtherDeferred(client, null);
    }

    /**
     * Return the coordinate used to find the best tile for a window.
     * Either the cursor's position or the center of the window.
     */
    private getWindowCenter(client: AbstractClient|null): QPoint{
        const geometry = client?.clientGeometry ?? null
        if(!geometry){
            console.warn('No geometry provided')
            return {x: 0, y: 0}
        }

        // Use the center of the window (Not sure if we even need this)
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y}
    }

    /**
     * Tile a client and retile other client.
     */
    private tileClient(client: AbstractClient, reason: string = '', cursor: QPoint|null = null){

        this.doLogIf(this.config.logEvents, LogLevel.DEBUG, `> tileClient ${clientToString(client)} (${reason})`);

        this.doTile(client, 'tileClient', cursor);

        // Re-tile other windows on the same screen
        this.retileOtherDeferred(client, client.tile);
    }

    /**
     * Tile a client
     * @internal
     */
    private doTile(client: AbstractClient, reason: string = '', cursor: QPoint|null = null){

        // Take the current position to find the best tile
        const position = cursor ?? this.getWindowCenter(client);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.output.name);

        // Ask where is the best location for this current window and assign it to the client.
        const bestTileForPosition = tileManager.bestTileForPosition(position.x, position.y);
        if(bestTileForPosition === null && this.config.doMaximizeWhenNoLayoutExists){
            this.doLogIf(this.config.logMaximize, LogLevel.INFO, `No tile exists for ${clientToString(client)}, maximize it instead`);
            client.frameGeometry = this.padGeometry(workspace.clientArea(KWin.MaximizeArea, client.output, workspace.currentDesktop), client.output.name);
        }
        this.doLogIf(this.config.logEvents, LogLevel.INFO, `doTile: ${clientToString(client)} to ${bestTileForPosition?.toString()} (${reason}) screen ${client.output.name}. Current tile ${client.tile}`);

        // The user dragged the window at the same tile as before, we need to re-tile it.
        if(client.tile == bestTileForPosition){
            client.tile = null;
        }

        client.tile = bestTileForPosition
    }

    /**
     * Return all available tiles for the given screens (except the root tiles)
     */
    private getAllTiles(screens: string[], removeRoot: boolean = true): Tile[]{
        let tiles: Tile[] = [];
        screens.forEach((screen: string) => {
            const tileManager = workspace.tilingForScreen(screen);
            if(tileManager === null){
                this.logger.notice(`no tileManager for screen ${screen} ??`);
                return []
            }
            const root = tileManager.rootTile;
            if(root === null){
                this.logger.notice(`no root tile for screen ${screen} ??`);
                return [];
            }
            const toHandle: Tile[] = [root];
            // Get all tiles
            while(toHandle.length > 0){
                const tile = toHandle.pop();
                if(tile === null || tile === undefined){
                    continue;
                }
                if(! tiles.includes(tile)){
                    tiles.push(tile);
                }
                (tile.tiles ?? []).forEach((subTile: Tile) => {
                    toHandle.push(subTile);
                });
            }

            // Remove duplicates https://stackoverflow.com/a/9229821
            tiles = tiles.filter(function(item, pos) {
                return tiles.indexOf(item) == pos;
            })

            // Remove root tile
            tiles = tiles.filter((tile: Tile) => {
                return tile !== root || ! removeRoot;
            })

            // Keep only tiles without sub-tiles
            tiles = tiles.filter((tile: Tile) => {
                return tile.tiles.length ===  0 || tile === root;
            })

        });

        // Take the leaves at first
        tiles.sort((a: Tile, b: Tile) => {
            if((a.parent !== null || b.parent !== null) && a.parent !== b.parent){
                return -1;
            }
            return 0;
        });

        return tiles;
    }

    /**
     * Return all screen names available.
     * @param favoriteScreenName will be the first screen number returned.
     */
    private getAllScreensNames(favoriteScreenName: string|null): string[]{
        const screens: string[] = [];
        screens.push(favoriteScreenName ?? '');
        workspace.screens.forEach(output  => {
            if(!screens.includes(output.name)) {
                screens.push(output.name);
            }
        })
        if(this.config.logDebugScreens){
            this.logger.debug(`screens: ${screens.join(', ')} (favorite: ${favoriteScreenName}, total: ${workspace.screens.length})`)
        }

        return screens.filter((screen: string) => screen !== '');
    }


    /**
     * Check if the client is supported by the tiler.
     * We ignore splash screen, dialogs, etc.
     */
    private isSupportedClient(client: AbstractClient){
       return isSupportedClient(client);
    }

    /**
     * Return all supported clients on the given tile that could be tiled.
     */
    private getClientOnTile(tile: Tile) {
        return tile.windows.filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((otherClient: AbstractClient) => !otherClient.minimized)
    }

    /**
     * Maximize a client
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    private maximize(client: AbstractClient) {

        if(this.config.logMaximize){
            this.logger.info( `> maximize ${clientToString(client)} ${client.tile?.toString()}`);

        }

        client.tile = null;

        client.frameGeometry = this.padGeometry(workspace.clientArea(KWin.MaximizeArea, client.output, workspace.currentDesktop), client.output.name);
    }

    /**
     * Re-tile other windows (so they can fit a better position due to the change of the given client)
     */
    private retileOther(myClient: AbstractClient|null, affectedTile: Tile|null = null){
        const client = myClient ?? workspace.windowList().filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((client: AbstractClient) => !client.minimized)[0] ?? null;
        if(!this.config.doRearrangeWindows){
            // Minimize/maximize all windows on the screen
            this.getAllScreensNames(client?.output?.name).forEach((screen: string) => {
                this.handleMaximizeMinimize(screen, `finished retileOther: Screen: ${screen}`);
            });
            return;
        }
        const output = client ? client.output : workspace.activeScreen

        this.doLogIf(this.config.logEvents, LogLevel.DEBUG, 're-tile other windows');

        const justRetiled: AbstractClient[] = [];
        // Tile all clients (this will un-maximize maximized window)
        workspace.windowList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((otherClient) => !otherClient.minimized)
            .filter((otherClient: AbstractClient) => otherClient.tile === null)
            .forEach((otherClient: AbstractClient) => {
                this.doTile(otherClient, 'retileOther: Untiled windows'); // We skip the client that changed
                justRetiled.push(otherClient);
            })


        // Build the list of free tiles "per screen" and "overall"
        const freeTileOnScreens: Map<string, Tile[]> = new Map();
        let freeTilesOverall: Tile[] = []
        this.getAllScreensNames(output.name).forEach((screen: string) => {
            const currentFreeTiles : Tile[] = []
            freeTileOnScreens.set(screen, currentFreeTiles);
            this.getAllTiles([screen]).forEach((tile: Tile) => {
                if (tile.windows.filter(this.isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    currentFreeTiles.push(tile);
                    freeTilesOverall.push(tile);
                }
            });

            // Update the list of free tiles on the screen, given that justRetiled windows are not yet pushed to the tile's windows list.
            justRetiled.forEach((retiledClient: AbstractClient) => {
                // Remove retiledClient's tile from the free titles.
                if (retiledClient.tile) {
                    if(currentFreeTiles.indexOf(retiledClient.tile) !== -1)
                        currentFreeTiles.splice(currentFreeTiles.indexOf(retiledClient.tile), 1);

                    if(freeTilesOverall.indexOf(retiledClient.tile) !== -1)
                        freeTilesOverall.splice(freeTilesOverall.indexOf(retiledClient.tile), 1);
                }
            });
            freeTileOnScreens.set(screen,currentFreeTiles)
        });

        // Now we have a list of all free titles, we can re-tile some window.
        // For each screen
        this.getAllScreensNames(output.name).forEach((screen: string) =>
        {
            const freeTileOnScreen = freeTileOnScreens.get(screen) ?? [];
            // Move stacked window to a free tile if any
            this.getAllTiles([screen]).every((tile: Tile) => {
                const otherClientsOnTile = this.getClientOnTile(tile);
                // Re-tiled clients are not detected by getClientOnTile, so we need to add them manually.
                // I don't know why Kwin doesn't update the tile's windows list on the fly.
                justRetiled.forEach((client: AbstractClient) => {
                     if(client.tile === tile && client.output.name === screen && !otherClientsOnTile.includes(client)){
                         otherClientsOnTile.push(client);
                    }
                 });

                // As the tile is used by more than one client, move one of them to a free tile on the same screen.
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    this.doLogIf(this.config.logDebugScreens, LogLevel.DEBUG, 'Check crowded tile on same screen..')
                    const usedTile =  this.moveClientToFreeTile(client, otherClientsOnTile, freeTileOnScreen,  justRetiled, affectedTile,'otherClientsOnTile');
                    if(usedTile){
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false;
                    }
                }

                // Move untiled client to a free tile if any, as we try to have all the clients tiled
                const untiledClientsOnScreen = this.getUntiledClientOnScreen(screen);
                if(untiledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    this.logger.debug('Check untiled clients on same screen..')
                    const usedTile = this.moveClientToFreeTile( client, untiledClientsOnScreen, freeTileOnScreen, justRetiled, affectedTile,'un-tiled client');
                    if(usedTile){
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false
                    }
                }

                // As the tile is used by more than one client, move one of them to a free tile on another screen.
                // But only when you are not dragging a window.
                if(!this.isMoving && this.config.rearrangeBetweenMonitors && otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    this.logger.debug('Move one client to a free tile on another screen');
                    this.logger.debug(`Free tiles: ${freeTilesOverall.map((tile: Tile) => tileToString(tile)).join('\n- ')}`)

                    let oneClient: AbstractClient|null = null;
                    do {
                        oneClient = otherClientsOnTile.pop() ?? null;
                    }while(oneClient === client)

                    if(oneClient !== null) {
                        const oneTile = freeTilesOverall.shift() || null
                        this.logger.debug(`Move ${clientToString(oneClient)} to ${oneTile}`)
                        oneClient.tile = oneTile;
                        this.forceRedraw(oneTile);
                        return false;
                    }
                }
                return true;
            });
        })

        // Minimize/maximize all windows on the screen
        this.getAllScreensNames(client?.output?.name).forEach((screen: string) => {
            this.handleMaximizeMinimize(screen, `finished retileOther: Screen: ${screen}`);
        });
    }

    /**
     * Tile all clients on a given screen
     */
    private tileScreen(screen: string,reason: string) {
        this.getUntiledClientOnScreen(screen).forEach((client: AbstractClient) => {
            this.logger.debug(`re-tile ${clientToString(client)} for screen ${screen} - reorganization (${reason})`);
            this.doTile(client, reason);
        });
    }

    /**
     * List all untiled clients on a given screen
     */
    private getUntiledClientOnScreen(screen: string) {
        return workspace.windowList().filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((client: AbstractClient) => {
            return client.output.name === screen && client.tile === null && !client.minimized;
        })
    }

    /**
     * Un-maximize a client as it share the same screen with other clients
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.logger.info(`> un-maximize ${clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile === null){
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            this.doTile(client, 'unmaximize without tile');
        }

        // Change a tile setting, so all windows in it got repositioned
        if(client.tile !== null){
            this.forceRedraw(client.tile)
        }else{
            // Sometimes, the client is not tiled as doMaximizeWhenNoLayoutExists is off, so we do not have any tile.
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            client.setMaximize(false,false)
        }
    }

    /**
     * Output information about the current screen, list the tiles and clients.
     */
    private debugTree(currentScreenOnly: boolean = false){
        if(!this.config.logDebugTree){
            return;
        }
        let output = `> debugTree (activity: ${workspace.currentActivity})\n`;
        const tab= ' '
        const tab2 = tab + tab;
        const tab3 = tab2 + tab;
        const tab4 = tab3 + tab;
        const screens = currentScreenOnly ? [workspace.activeScreen.name] : this.getAllScreensNames(workspace.activeScreen.name);
        screens.forEach((screen: string) => {
            output += `screen ${screen} - tiled: ${this.getTiledClientsOnScreen(screen).length} untiled: ${this.getUntiledClientOnScreen(screen).length} number of tiles: ${this.getAllTiles([screen]).length} \n`;
            if(this.getUntiledClientOnScreen(screen).length > 0) {
                output += `${tab2} - untiled:\n${this.getUntiledClientOnScreen(screen).map((client: AbstractClient) => `${tab4} - ${clientToString(client)}`).join(', ')}\n`;
            }
            this.getAllTiles([screen], false).forEach((tile: Tile) => {
                output += (`${tab2} -  ${tileToString(tile)} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
                this.getClientOnTile(tile).forEach((client: AbstractClient) => {
                    output += (`${tab4} * ${clientToString(client)}\n`);
                })
            })
        });
        this.logger.debug(output);
    }

    /**
     * Log an event if the option is enabled
     */
    private event(message: string) {
        this.doLogIf(this.config.logEvents, LogLevel.ERROR, `> Event ${message}`);
    }

    /**
     * Maximize or un-Maximize all windows on the given screen
     */
    private handleMaximizeMinimize(screen: string, reason: string) {

        // Make sure all client are tiled
        this.tileScreen(screen, 'handleMaximizeMinimize');

        const clientsOnThisScreen = this.getTiledClientsOnScreen(screen);

        // If there is un-tilled clients, take them into account
        this.getUntiledClientOnScreen(screen).forEach((client: AbstractClient) => {
            clientsOnThisScreen.push(client);
        });

        this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `> handleMaximizeMinimize ${clientsOnThisScreen.length} clients on screen ${screen} (${reason})`);
        switch (clientsOnThisScreen.length) {
            case 1: // Only one client on this screen, maximize it if allowed
                if(!this.config.doMaximizeSingleWindow){
                    this.unmaximize(clientsOnThisScreen[0])
                    break;
                }
                this.maximize(clientsOnThisScreen[0]);
                break;
            default: // Multiple clients on this screen, un-maximize them
                clientsOnThisScreen.forEach((clientOnThisScreen: AbstractClient) => {
                    this.unmaximize(clientOnThisScreen)
                });
                break;
        }
    }

    /**
     * Move client to a free tile and return the used tile if any
     */
    private moveClientToFreeTile(client: AbstractClient, otherClientsOnTile: AbstractClient[], freeTileOnScreen: Tile[], recentlyTiledClients: AbstractClient[], tile: Tile|null, reason: string): Tile|null {
        this.logger.debug(`Move one client from tile to a free one (${reason})`);
        let clientToMove = null
        do{
            const bestCandidates = recentlyTiledClients
                .filter((recentlyTiledClient: AbstractClient) => otherClientsOnTile.includes(recentlyTiledClient) && recentlyTiledClient !== client)
                .sort((a: AbstractClient, b: AbstractClient) => {
                // The client is on the same tile as the window that was just re-tiled. We prioritize it
                if(tile !== null && a.tile == tile){
                    return -1;
                }
                return otherClientsOnTile.indexOf(a) - otherClientsOnTile.indexOf(b);
            });
            clientToMove = bestCandidates.length > 0 ? bestCandidates.pop() : otherClientsOnTile.pop();
        }while(clientToMove === client)

        const freeTile = freeTileOnScreen[0] ?? null;
        if (clientToMove && freeTile) {
            this.logger.debug(`Move ${clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTile.toString()}`);
            clientToMove.tile = freeTile;
            this.forceRedraw(freeTile);
            return freeTile
        }

        this.logger.debug(`No candidate found to free tile to a free one (${freeTile?.toString() ?? 'No free titles'})`);
        return null;
    }

    /**
     * Log a message if the `enabled` condition is true
     */
    private doLogIf(enabled: boolean, level: LogLevel, message: string) {
        if(!enabled){
            return;
        }
        this.logger.log(level, message);
    }

    /**
     * Get all tiled clients on the given screen
     */
    private getTiledClientsOnScreen(screen: string) {
        return workspace.windowList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((client: AbstractClient) => client.output.name === screen )
            .filter((client: AbstractClient) => !client.minimized)
            .filter((client: AbstractClient) => client.tile !== null)
            ;
    }

    public toString(){
        return 'Tiler'
    }

    private forceRedraw(tile: Tile|null) {
        if(tile === null || !this.config.doForceRedraw) {
            return;
        }

        this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `Force redraw tile ${tile.toString()}`)
        tile.moveByPixels(point(1, 0));
        tile.moveByPixels(point(-1, 0));
        //  tile.padding += 1;
        //  tile.padding -= 1;
    }

    private padGeometry(geometry: QRect, currentScreen: string) {
        const padding = this.config.maximizeWithPadding ? (workspace.tilingForScreen(currentScreen)?.rootTile?.padding ?? 0) : 0;
        return {
            x: geometry.x + padding,
            y: geometry.y + padding,
            width: geometry.width - 2 * padding,
            height: geometry.height - 2 * padding
        }
    }

    private rearrangeLayout(client: AbstractClient|null) {
        if(!this.config.getRearrangeLayout()){
            return
        }

        const maxNumberOfTiles = 4; // TODO move to config
        const direction = 1 // Vertical split

        // statistics
        const currentOutputName = client?.output.name ?? workspace.activeScreen.name
        this.doLogIf(this.config.logEvents, LogLevel.INFO, '> rearrangeLayout')
        const emptyTiles: Tile[] = []
        let numberOfTiles = 0
        let numberOfTiledClients = 0
        for (const tile of this.getAllTiles([currentOutputName], true)) {
            numberOfTiles++
            numberOfTiledClients += this.getClientOnTile(tile).length
            if (this.getClientOnTile(tile).length === 0) {
                emptyTiles.push(tile)
            }
        }
        numberOfTiledClients += this.getClientOnTile(workspace.tilingForScreen(currentOutputName)!.rootTile).length
        const numberOfUntiledClients = this.getUntiledClientOnScreen(currentOutputName).length;
        let numberOfTilesToCreate = numberOfUntiledClients + numberOfTiledClients - numberOfTiles
        this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, 'rearrangeLayout...' + `${emptyTiles.length} empty tiles found, \n${numberOfUntiledClients} untiled client, \n${numberOfTiledClients} tiled clients. \nNeeds to create ${numberOfTilesToCreate} tiles\nNumber of tiles ${numberOfTiles}`)
        this.debugTree(true)

        // Remove a client (null) => Remove 1 tile
        if(client === null && numberOfTilesToCreate < 0 && emptyTiles.length > 0) {
            let candidate = emptyTiles[0]
            for (const tile of emptyTiles) {
                if (direction == 1 && tile.absoluteGeometryInScreen.width > candidate.absoluteGeometryInScreen.width) {
                    candidate = tile
                }
                if (direction != 1 && tile.absoluteGeometryInScreen.height > candidate.absoluteGeometryInScreen.height) {
                    candidate = tile
                }
            }
            this.doLogIf(this.config.logRearrangeLayout,LogLevel.DEBUG, 'rearrangeLayout...' + `Remove one empty tile ${tileToString(emptyTiles[0])}`)
            emptyTiles.splice(emptyTiles.indexOf(candidate), 1)
            candidate.remove()
        }


        if(numberOfTiles + numberOfTilesToCreate > maxNumberOfTiles) {
            this.doLogIf(this.config.logRearrangeLayout,LogLevel.DEBUG, `rearrangeLayout: too many tiles to create ${direction} : ${numberOfTiles + numberOfTilesToCreate}`)
            numberOfTilesToCreate = Math.max(0, maxNumberOfTiles - numberOfTiles);
        }
        // Add a client => Create X tiles for it
        if(client !== null && numberOfTilesToCreate > 0){
            this.doLogIf(this.config.logRearrangeLayout,LogLevel.DEBUG, `rearrangeLayout: no empty tile, create ${numberOfTilesToCreate} tiles `)
            const root = workspace.tilingForScreen(client.output.name)!.rootTile
            for(let i = 0 ; i < numberOfTilesToCreate; i++) {
                let toSplit: Tile = root
                if(toSplit.tiles.length > 0) {
                    let candidate = toSplit.tiles[0]
                    for(const tile of toSplit.tiles) {
                        if (direction == 1 && tile.absoluteGeometryInScreen.width > candidate.absoluteGeometryInScreen.width) {
                            candidate = tile
                        }
                        if (direction != 1 && tile.absoluteGeometryInScreen.height > candidate.absoluteGeometryInScreen.height) {
                            candidate = tile
                        }
                    }
                    toSplit = candidate
                }
                this.doLogIf(this.config.logRearrangeLayout,LogLevel.DEBUG, `rearrangeLayout: split ${tileToString(toSplit)}`)
                toSplit.split(direction == 1 ? 1 : 2)
                if(toSplit == root){
                    i++ // Split root create 2 tiles from zero, so we need one less iteration
                }
            }
            this.retileOther(client)
        }
    }
}
