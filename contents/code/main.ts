class Tiler{

    constructor() {
         workspace.clientList().filter(this.isSupportedClient).forEach((d: AbstractClient) => {
            this.detachClient(d);
            this.attachClient(d);
        });

        workspace.clientAdded.connect(this.attachClient);
        workspace.clientRemoved.connect(this.detachClient);
    };

    log(...values: any[]){
        print(...values);
    }


    attachClient(client: AbstractClient){
        this.log(`attachClient ${client.resourceName}`);
        client.clientFinishUserMovedResized.connect(this.tileClient);
        this.tileClient(client);
    }

    detachClient(client: AbstractClient){
        this.log(`detachClient  ${client.resourceName}`);
        client.clientFinishUserMovedResized.disconnect(this.tileClient);
    }

    getCenter(geomerty: QRect){
        const x: number = geomerty.x + (geomerty.width/2)
        const y: number = geomerty.y + (geomerty.height/2)
        return {x:x,y:y};

    }

    tileClient(client: AbstractClient){
        if(false === this.isSupportedClient(client)){
            return;
        }

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        client.tile = tileManager.bestTileForPosition(center.x, center.y);
    }

    isSupportedClient(client: AbstractClient){
        return client.normalWindow;
    }
}

new Tiler();
