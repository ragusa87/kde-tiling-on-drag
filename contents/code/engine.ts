import {Console} from './logger';
import {Config} from './config';
import {
    clientToString,
    isSameActivityAndDesktop,
    isSupportedClient,
    point,
    getUntiledClientOnOutput,
    tileToString,
    padGeometry,
    getTileCenter,
    getClientOnTile,
    maximize,
    getAllTiles,
    getWindowCenter,
    getAllOutputs,
    getClientsOnOutput,
    getEmptyTilesByOutput,
    getClientsOnRootTile,
    debugTree, debounce,
} from './clientHelper';

import {LogLevel} from './logLevel';

export interface EngineInterface{
    attachClient(client: AbstractClient): void;
    detachClient(client: AbstractClient): void;
    doTile(client: AbstractClient, reason: string, cursor: QPoint|null): Tile;
    minimizedChanged(client: AbstractClient): void
    retileOther(client: AbstractClient|null, affectedTile: Tile|null): void;
    layoutModified(output: Output): void;
    interactiveMoveResizeFinished(client: AbstractClient, cursPos: QPoint): void;
    workspaceChanged(): void;
}

export class Engine implements EngineInterface {
    config: Config
    logger: Console

    constructor(config: Config, logger: Console) {
        this.config = config
        this.logger = logger
    }

    public doRearrangeAndTile(client: AbstractClient, reason: string, point: QPoint|null = null ): void{
        const tile = this.rearrangeLayout(client.output, false)
        const affectedTile = this.doTile(client, reason, point ? point : (tile == null ? null :getTileCenter(tile)))
        debounce(() => {
        this.retileOther(client, affectedTile)
        this.handleMaximizeMinimize(workspace.activeScreen, reason)
            }, 500)
    }
    public doRearrangeAndTileOutput(output: Output, reason: string): void{
        this.rearrangeLayout(output, false)
        debounce(() => {
            this.retileUntiled(output, 'workspaceChanged');
            this.handleMaximizeMinimize(output, reason)
        }, 500)
    }

    public workspaceChanged(): void {
        this.doRearrangeAndTileOutput(workspace.activeScreen, 'workspaceChanged')
    }
    public attachClient(client: AbstractClient): void {
        this.doRearrangeAndTile(client, 'attachClient');
    }

   public interactiveMoveResizeFinished(client: AbstractClient, point: QPoint){
       this.doRearrangeAndTile(client, 'interactiveMoveResizeFinished', point)
       // TODO resizeStep" is sometimes not called, so we don't know from witch output the client was moved.
        debounce(() => {
               getAllOutputs(null).filter((output: Output) => output !== client.output).forEach((output: Output) => {
                   this.doRearrangeAndTileOutput(output, 'interactiveMoveResizeFinished')
               })
       }, 500)
   }


    public detachClient(client: AbstractClient): void {
        client.tile = null
        this.rearrangeLayout(client.output, true)
    }

    /**
     * Move a client to a free tile
     * @param client
     * @param otherClientsOnTile list of clients on the same tiles
     * @param freeTileOnScreen list of tiles on the same screen that are empty
     * @param recentlyTiledClients list of tiles that just changed
     * @param tile
     * @param reason
     * @protected
     */
    protected moveClientToFreeTile(client: AbstractClient, otherClientsOnTile: AbstractClient[], freeTileOnScreen: Tile[], recentlyTiledClients: AbstractClient[], tile: Tile|null, reason: string): Tile|null {
        this.logger.debug(`Move one client from tile to a free one (${reason})`, {});
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
            this.logger.debug(`Move ${clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTile.toString()}`, {});
            clientToMove.tile = freeTile

            return freeTile
        }

        this.logger.debug(`No candidate found to free tile to a free one (${freeTile?.toString() ?? 'No free titles'})`, {});
        return null;
    }


    public doTile(client: AbstractClient, reason: string = '', cursor: QPoint | null = null): Tile {
        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.output.name);

        // Take the current position to find the best tile
        const position = cursor ?? getWindowCenter(client);

        // Ask where is the best location for this current window and assign it to the client.
        let bestTileForPosition = tileManager.bestTileForPosition(position.x, position.y);
        if (bestTileForPosition === null && this.config.doMaximizeWhenNoLayoutExists) {
            this.doLogIf(this.config.logMaximize, LogLevel.INFO, `No tile exists for ${clientToString(client)}, maximize it instead`);
            client.frameGeometry = padGeometry(this.config, workspace.clientArea(KWin.MaximizeArea, client.output, workspace.currentDesktop), client.output.name);
            return tileManager.rootTile
        }
        if (bestTileForPosition === null && this.config.doMaximizeUsingRootTile) {
            bestTileForPosition = tileManager.rootTile
        }
        this.doLogIf(this.config.logEvents, LogLevel.INFO, `doTile: ${clientToString(client)} to ${bestTileForPosition?.toString()} (${reason}) screen ${client.output.name}. Current tile ${client.tile}`);

        // The user dragged the window at the same tile as before, we need to re-tile it.
        if (client.tile == bestTileForPosition) {
            client.tile = null;
        }

        client.tile = bestTileForPosition

        return bestTileForPosition ?? tileManager.rootTile
    }

    /**
     * Log a message if the `enabled` condition is true
     */
    private doLogIf(enabled: boolean, level: LogLevel, message: string) {
        if (!enabled) {
            return;
        }
        this.logger.log(level, message);
    }

    public minimizedChanged(client: AbstractClient): void {
        this.doRearrangeAndTile(client, 'minimized')
    }

    public layoutModified(output: Output): void{
        this.handleMaximizeMinimize(output, 'layoutModified')
    }
    public getNumberOfTilesToCreate(output: Output): number {

        this.doLogIf(this.config.logEvents, LogLevel.INFO, '> rearrangeLayout')
        debugTree(this.config, this.logger)
        const emptyTiles: Tile[] = getEmptyTilesByOutput(output)
        const numberOfTiles = Math.max(1, getAllTiles([output.name], true).length); // The root tile always exists but is taken into account only if there is no other tile
        const numberOfTiledClients = getClientsOnOutput(output).filter((client: AbstractClient) => client.tile !== null).length // root is counted
        const numberOfUntiledClients = getUntiledClientOnOutput(output).length
        const numberOfClients = numberOfTiledClients + numberOfUntiledClients
        let numberOfTilesToCreate = numberOfUntiledClients + numberOfTiledClients - numberOfTiles // Root tile always exists
        if(numberOfClients <= 1 && numberOfTiles === 1){
            numberOfTilesToCreate = 0 // We can not remove the root Title anyway.
        }
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${output.name}`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${emptyTiles.length} empty tiles found`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${numberOfUntiledClients} untiled client`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${numberOfTiledClients} tiled clients`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${numberOfClients} clients`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${numberOfTiles} tiles`)
        this.doLogIf(this.config.logRearrangeLayoutCount, LogLevel.DEBUG, 'rearrangeLayoutCount...' + `${numberOfTilesToCreate} tiles to create`)
        if (this.config.maxNumberOfTiles !== null && numberOfTiles + numberOfTilesToCreate > this.config.maxNumberOfTiles) {
            this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, `rearrangeLayout: too many tiles to create : ${numberOfTiles + numberOfTilesToCreate}`)
            numberOfTilesToCreate = Math.max(0, this.config.maxNumberOfTiles - numberOfTiles);
        }

        return numberOfTilesToCreate
    }
    public rearrangeLayout(output: Output, isDeletion: boolean = false): Tile|null {
        if (!this.config.rearrangeLayout) {
            return null;
        }

        const numberOfTilesToCreate = this.getNumberOfTilesToCreate(output)
        isDeletion = isDeletion || numberOfTilesToCreate < 0
        this.doLogIf(this.config.logRearrangeLayout, LogLevel.ERROR, `rearrangeLayout: ${numberOfTilesToCreate} tile(s) to ${(numberOfTilesToCreate < 0 ? 'delete' : 'add')} on ${output.name}`)

        const direction: LayoutDirection = 1 // Horizontal split
        const emptyTiles = getEmptyTilesByOutput(output)
        this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, `rearrangeLayout: ${emptyTiles.length} empty tile(s)`)


        const tiledClients = getClientsOnOutput(output).filter((client: AbstractClient) => client.tile !== null) // root is counted
        if(tiledClients.length === 1 && numberOfTilesToCreate === 0 && this.config.doMaximizeUsingRootTile){
            const root = workspace.tilingForScreen(output.name)!.rootTile
            this.logger.debug(`Tile client ${clientToString(tiledClients[0])} to root ${tileToString(root)}`)
            this.doTile(tiledClients.pop()!, 'Retile client on root tile', getTileCenter(root))
            return root
        }

        if(isDeletion && numberOfTilesToCreate < 0 && emptyTiles.length > 0) {
            for(let i = numberOfTilesToCreate; i < 0 && emptyTiles.length > 0; i++) {
                let candidate = emptyTiles[0]
                for (const tile of emptyTiles) {
                    if (tile.canBeRemoved && direction == 1 && tile.absoluteGeometryInScreen.width > candidate.absoluteGeometryInScreen.width) {
                        candidate = tile
                    }
                    if (tile.canBeRemoved && direction != 1 && tile.absoluteGeometryInScreen.height > candidate.absoluteGeometryInScreen.height) {
                        candidate = tile
                    }
                }
                this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, 'rearrangeLayout...' + `Remove empty tile ${tileToString(emptyTiles[0])}`)
                if (!candidate.canBeRemoved) {
                    this.logger.error(`Can not remove tile ${tileToString(candidate)}`)
                    return null
                }
                emptyTiles.splice(emptyTiles.indexOf(candidate), 1)
                candidate.remove()
            }
            return null
        }

        if(! isDeletion && getClientsOnRootTile(output).length === 1 && numberOfTilesToCreate === 0){
            return workspace.tilingForScreen(output.name)!.rootTile
        }
        if(! isDeletion && numberOfTilesToCreate > 0) {

            this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, `rearrangeLayout: no empty tile, create ${numberOfTilesToCreate} tiles `)
            const root = workspace.tilingForScreen(output.name)!.rootTile
            if(root.layoutDirection === 0){
                root.layoutDirection = direction
            }
            for (let i = 0; i < numberOfTilesToCreate; i++) {
                let toSplit: Tile = root

                if (toSplit.tiles.length > 0) {
                    let candidate = toSplit.tiles[0]
                    for (const tile of toSplit.tiles) {
                        if (direction == 1 && tile.absoluteGeometryInScreen.width > candidate.absoluteGeometryInScreen.width) {
                            candidate = tile
                        }
                        // if (direction == 2 && tile.absoluteGeometryInScreen.height > candidate.absoluteGeometryInScreen.height) {
                        //     candidate = tile
                        // }
                    }
                    toSplit = candidate
                }
                this.doLogIf(this.config.logRearrangeLayout, LogLevel.DEBUG, `rearrangeLayout: split ${tileToString(toSplit)}`)
                toSplit.split(direction == 1 ? 1 : 2)
                debugTree(this.config, this.logger)

                if (toSplit == root) {
                    i++ // Split root create 2 tiles from zero, so we need one less iteration
                }

                if (numberOfTilesToCreate === 1) {
                    for (const tile of toSplit.tiles) {
                        if (getClientOnTile(tile).length === 0) {
                            return tile
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Re-tile other windows (so they can fit a better position due to the change of the given client)
     */
    public retileOther(client: AbstractClient, affectedTile: Tile | null = null) {
        if(!this.config.doRearrangeWindows){
            // Minimize/maximize all windows on the screen
            getAllOutputs(client?.output ?? null).forEach((output: Output) => {
                this.handleMaximizeMinimize(output, `finished retileOther: Screen: ${output.name}`);
            });
            return;
        }

        const emptyTiles = getEmptyTilesByOutput(client.output)
        if(affectedTile !== null && emptyTiles.length > 0){
            const candidate = getClientOnTile(affectedTile).filter(myClient => myClient !== client).pop()
            if(candidate){
                this.doTile(client, 'Retiler other on free tile', getTileCenter(emptyTiles[0]))
                candidate.tile = emptyTiles[0]
                return
            }
        }

        const output = client.output

        this.doLogIf(this.config.logEvents, LogLevel.DEBUG, 're-tile other windows');

        const justRetiled: AbstractClient[] = [];
        // Tile all clients (this will un-maximize maximized window)
        workspace.windowList()
            .filter(isSupportedClient)
            .filter(isSameActivityAndDesktop)
            .filter((otherClient) => !otherClient.minimized)
            .filter((otherClient: AbstractClient) => otherClient.tile === null)
            .forEach((otherClient: AbstractClient) => {
                this.doTile(otherClient, 'retileOther: Untiled windows'); // We skip the client that changed
                justRetiled.push(otherClient);
            })


        // Build the list of free tiles "per screen" and "overall"
        const freeTileOnScreens: Map<string, Tile[]> = new Map();
        let freeTilesOverall: Tile[] = []
        getAllOutputs(output).forEach((output: Output) => {
            const currentFreeTiles: Tile[] = []
            freeTileOnScreens.set(output.name, currentFreeTiles);
            getAllTiles([output.name]).forEach((tile: Tile) => {
                if (tile.windows.filter(isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    currentFreeTiles.push(tile);
                    freeTilesOverall.push(tile);
                }
            });

            // Update the list of free tiles on the screen, given that justRetiled windows are not yet pushed to the tile's windows list.
            justRetiled.forEach((retiledClient: AbstractClient) => {
                // Remove retiledClient's tile from the free titles.
                if (retiledClient.tile) {
                    if (currentFreeTiles.indexOf(retiledClient.tile) !== -1)
                        currentFreeTiles.splice(currentFreeTiles.indexOf(retiledClient.tile), 1);

                    if (freeTilesOverall.indexOf(retiledClient.tile) !== -1)
                        freeTilesOverall.splice(freeTilesOverall.indexOf(retiledClient.tile), 1);
                }
            });
            freeTileOnScreens.set(output.name, currentFreeTiles)
        });

        // Now we have a list of all free titles, we can re-tile some window.
        // For each screen
        getAllOutputs(output).forEach((output: Output) => {
            const freeTileOnScreen = freeTileOnScreens.get(output.name) ?? [];
            // Move stacked window to a free tile if any
            getAllTiles([output.name]).every((tile: Tile) => {
                const otherClientsOnTile = getClientOnTile(tile);
                // Re-tiled clients are not detected by getClientOnTile, so we need to add them manually.
                // I don't know why Kwin doesn't update the tile's windows list on the fly.
                justRetiled.forEach((client: AbstractClient) => {
                    if (client.tile === tile && client.output.name === output.name && !otherClientsOnTile.includes(client)) {
                        otherClientsOnTile.push(client);
                    }
                });

                // As the tile is used by more than one client, move one of them to a free tile on the same screen.
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    this.doLogIf(this.config.logDebugScreens, LogLevel.DEBUG, 'Check crowded tile on same screen..')
                    const usedTile = this.moveClientToFreeTile(client, otherClientsOnTile, freeTileOnScreen, justRetiled, affectedTile, 'otherClientsOnTile');
                    if (usedTile) {
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false;
                    }
                }

                // Move untiled client to a free tile if any, as we try to have all the clients tiled
                const untiledClientsOnScreen = getUntiledClientOnOutput(output);
                if (untiledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0) {
                    this.logger.debug('Check untiled clients on same screen..')
                    const usedTile = this.moveClientToFreeTile(client, untiledClientsOnScreen, freeTileOnScreen, justRetiled, affectedTile, 'un-tiled client');
                    if (usedTile) {
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false
                    }
                }

                // As the tile is used by more than one client, move one of them to a free tile on another screen.
                // But only when you are not dragging a window.
                if (this.config.rearrangeBetweenMonitors && otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    this.logger.debug('Move one client to a free tile on another screen');
                    this.logger.debug(`Free tiles: ${freeTilesOverall.map((tile: Tile) => tileToString(tile)).join('\n- ')}`)

                    let oneClient: AbstractClient | null = null;
                    do {
                        oneClient = otherClientsOnTile.pop() ?? null;
                    } while (oneClient === client)

                    if (oneClient !== null) {
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
        getAllOutputs(client?.output).forEach((output: Output) => {
            this.handleMaximizeMinimize(output, `finished retileOther: Screen: ${output.name}`);
        });
    }

    /**
     * Un-maximize a client as it share the same screen with other clients
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    private unmaximize(client: AbstractClient) {
        if (this.config.logMaximize) {
            this.logger.info(`> un-maximize ${clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if (client.tile === null) {
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            this.doTile(client, 'unmaximize without tile');
        }

        // Change a tile setting, so all windows in it got repositioned
        if (client.tile !== null) {
            this.forceRedraw(client.tile)
        } else {
            // Sometimes, the client is not tiled as doMaximizeWhenNoLayoutExists is off, so we do not have any tile.
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            client.setMaximize(false, false)
        }
    }

    /**
     * Maximize or un-Maximize all windows on the given screen
     */
    private handleMaximizeMinimize(output: Output, reason: string) {

        const clientsOnThisScreen = getClientsOnOutput(output);
        this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `> handleMaximizeMinimize ${clientsOnThisScreen.length} clients on screen ${output.name} (${reason})`);
        switch (clientsOnThisScreen.length) {
            case 1: // Only one client on this screen, maximize it if allowed
                if (!this.config.doMaximizeSingleWindow) {
                    this.unmaximize(clientsOnThisScreen[0])
                    break;
                }
                maximize(this.config, clientsOnThisScreen[0]);
                break;
            default: // Multiple clients on this screen, un-maximize them
                clientsOnThisScreen.forEach((clientOnThisScreen: AbstractClient) => {
                    this.unmaximize(clientOnThisScreen)
                });
                break;
        }
    }

    private forceRedraw(tile: Tile | null) {
        if (tile === null || !this.config.doForceRedraw) {
            return;
        }

        this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `Force redraw tile ${tile.toString()}`)
        tile.moveByPixels(point(1, 0));
        tile.moveByPixels(point(-1, 0));
    }

    /**
     * Tile all clients on a given screen
     */
    private retileUntiled(output: Output,reason: string) {
        getUntiledClientOnOutput(output).forEach((client: AbstractClient) => {
            this.logger.debug(`re-tile ${clientToString(client)} for screen ${output.name} - reorganization (${reason})`);
            this.doTile(client, reason, null);
        });
    }
}