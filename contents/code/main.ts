class Tiler{
    constructor() {
         workspace.clientList().filter(this.isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        workspace.clientAdded.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.attachClient(client)
        });
        workspace.clientRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.detachClient(client)
        });

        workspace.clientUnminimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.log(`event: clientUnminimized: ${client.resourceName}`)
            this.tileClient(client)
        });

        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.log(`event: clientMinimized: ${client.resourceName}`)
            this.tileClient(client)
        });
    };

    log(value: any){
        console.log(value);
    }

    attachClient(client: AbstractClient){
        this.log(`> attachClient ${client.resourceName}`);
        client.clientFinishUserMovedResized.connect((client2: AbstractClient) => this.tileClient(client2));
        client.clientFinishUserMovedResized.connect((client2: AbstractClient) => this.tileClient(client2));
        this.tileClient(client);
    }

    detachClient(client: AbstractClient){
        this.log(`> detachClient  ${client.resourceName}`);
        client.clientFinishUserMovedResized.disconnect((client2: AbstractClient) => this.tileClient(client2));

        this.retileOther(client);
    }

    getCenter(geometry: QRect){
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y};
    }

    tileClient(client: AbstractClient){
        this.log(`> tileClient ${this.clientToString(client)}`);

        // Un-maximize all windows on the same screen (maximized is not available on AbstractClient)
        this.getOtherClientsOnSameScreen(client).filter((localClient: AbstractClient) => !localClient.minimized).forEach((notMinimizedClient: AbstractClient) => {
            this.log(`unmaximize ${this.clientToString(notMinimizedClient)}`);
            notMinimizedClient.setMaximize(false,false)
            notMinimizedClient.tile = null;
        });

        // If this is the only not-minimized window on the screen, maximize it.
        if(this.shouldMaximize(client)){
            this.maximize(client)
            return;
        }else {
            this.doTile(client);
        }

        // Re-tile other windows on the same screen
        this.retileOther(client);
    }

    doTile(client: AbstractClient){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        client.tile = tileManager.bestTileForPosition(center.x, center.y);

    }
    // Get all clients on the same screen
    getOtherClientsOnSameScreen(client: AbstractClient) {
        return workspace.clientList().filter(this.isSupportedClient).filter((otherClient: AbstractClient) => {
            const sameWindowId = client.internalId === otherClient.internalId; // Using internalId because it is working, unlike windowId that might be undefined.
            const sameScreen = client.screen === otherClient.screen;
            const sameActivity = this.isSameActivity(client, otherClient);
            const sameDesktop = client.desktop === otherClient.desktop || client.onAllDesktops || otherClient.onAllDesktops;
            return (!sameWindowId) && sameScreen && sameActivity && sameDesktop;
        })
    }

    // Get all tiles on the same screen
    getTilesInSameScreen(client: AbstractClient): Tile[]{
        const tileManager = workspace.tilingForScreen(client.screen);
        const root = tileManager.rootTile;
        if(root === null){
            console.debug(`no root tile for screen ${client.screen} ??`);
            return [];
        }
        let tiles = (root.tiles || []);
        tiles.forEach((tile2) => {

            tiles.push(tile2);
            if(tile2.tiles !== null)
            {
                tile2.tiles.forEach((tile3: Tile) => {
                    tiles.push(tile3);
                });
            }
        });

        // Remove duplicates
        tiles = tiles.filter(function(item, pos) {
            return tiles.indexOf(item) == pos;
        })

        return tiles.filter((tile: Tile) => {
            return tile.canBeRemoved; // Skipp the root tile
        });
    }

    // Check if the client is supported
    isSupportedClient(client: AbstractClient){
        return client.normalWindow; // client.isClient; //&& client.normalWindow && !client.isComboBox;
    }

    // Used for logging
    clientToString(client: AbstractClient){
        return `${client.resourceName} ${client.internalId}`;
    }

    // If there is only one window on the screen (no other window), maximize it
    private shouldMaximize(client: AbstractClient): boolean {
        // We do not have any other clients on the same screen that are not minimized
        const otherClients = this.getOtherClientsOnSameScreen(client).filter((client2: AbstractClient) =>  !client2.minimized);
        const answer =  otherClients.length === 0 && client.maximizable && ! client.minimized
        console.debug(`shouldMaximize ${this.clientToString(client)} - minimized ? ${client.minimized} maximizable ? ${client.maximizable}, other windows ? ${otherClients.length} => ${answer}`)
        console.debug(otherClients.map((client2: AbstractClient) => `${this.clientToString(client2)}`));
        return answer

    }

    private maximize(client: AbstractClient) {
        client.tile = null // Remove the tile, so it will be maximized full screen
        // Fixme: Sometimes maximize does not work, find why
        client.setMaximize(true,true);
    }

    // Find a tile that is empty if any
    private getFreeTile(client: AbstractClient) : Tile|null {
        // Browse all tiles on the same screen
        // FIXME: Avoid getting the root tile and blacklist the tile you want to move from
        const freeTiles = this.getTilesInSameScreen(client).filter(tile => {
            return tile.windows.length === 0
        })

        return freeTiles[0] ?? null;
    }

    private retileOther(client: AbstractClient) {
        // Re-tile other windows on the same screen
        const otherClients = this.getOtherClientsOnSameScreen(client).filter((localClient: AbstractClient) =>  !localClient.minimized);
        otherClients.forEach((otherClient: AbstractClient) => {

            // If the client can be maximized, just do that.
            if(this.shouldMaximize(otherClient)){
                this.maximize(otherClient);
                return false; // end the loop
            }

            // Re-tile client that are not tiled
            if (otherClient.tile == null) {
                this.doTile(otherClient);
            }
        })

        // Make sure client are not sharing a tile with another client when possible
        otherClients.forEach((otherClient: AbstractClient) => {

            if(this.getTilesInSameScreen(otherClient).length === 0){
                console.debug("no tiles in current screen ??");
            }

            if(! this.sameTile(client,otherClient)){
                    console.debug(`no other client sharing the same tile ${client.tile} with ${this.clientToString(otherClient)} ${otherClient.tile}`);

                    return true; // continue the loop, this tile is okay
            }

            console.debug(`${this.clientToString(client)} and ${this.clientToString(otherClient)} share the same tile`)

            // Search for an empty tile and use it
            const bestEmptyTile = this.getFreeTile(otherClient);
            if(bestEmptyTile !== null){
                this.log(`re-tile ${this.clientToString(otherClient)} to another tile ${bestEmptyTile}`);
                otherClient.tile = bestEmptyTile
                return false; // end the loop
            }

            // We do not know what to do, just tile it on top of another client
            this.log(`re-tile ${this.clientToString(otherClient)} somewhere`);
            this.doTile(otherClient);
            return false; // end the loop

        });
    }

    private sameGeometry(one: QRect, two: QRect) {
        const result =  one.x === two.x && one.y === two.y && one.height === two.height && one.width === two.height;
        console.debug(`x: ${one.x}-${two.x} y: ${one.y}-${two.y} h: ${one.height}-${two.height} w: ${one.width}-${two.width} => ${result}`)
        return result;
    }

    private isSameActivity(client: AbstractClient, otherClient: AbstractClient) : boolean {
        // empty activities means all activities
        // TODO Maybe we need to sort the activities list before comparing ?
        return client.activities.length === 0 || otherClient.activities.length === 0 || client.activities.join(",") === otherClient.activities.join(",");
    }

    private sameTile(client: AbstractClient, otherClient: AbstractClient) {
        // If there is a client already using the same tile, move it to another tile
        if(otherClient.tile === null || client.tile === null){
            return false;
        }

        return otherClient.tile === client.tile || this.sameGeometry(otherClient.tile.absoluteGeometry, client.tile.absoluteGeometry);
     }
}

(new Tiler()).log("Starting");
