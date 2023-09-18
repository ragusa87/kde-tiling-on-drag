class Tiler{

    constructor() {
         workspace.clientList().filter(this.isSupportedClient).forEach((d: AbstractClient) => {
            this.detachClient(d);
            this.attachClient(d);
        });

        workspace.clientAdded.connect((client: AbstractClient) => this.attachClient(client));
        workspace.clientRemoved.connect((client: AbstractClient) => this.detachClient(client));
    };

    log(value: any){
        console.log(value);
    }


    attachClient(client: AbstractClient){
        this.log(`attachClient ${client.resourceName}`);
        client.clientFinishUserMovedResized.connect((client: AbstractClient) => this.tileClient(client));
        this.tileClient(client);
    }

    detachClient(client: AbstractClient){
        this.log(`detachClient  ${client.resourceName}`);
        client.clientFinishUserMovedResized.disconnect((client: AbstractClient) => this.tileClient(client));
    }

    getCenter(geomerty: QRect){
        const x: number = geomerty.x + (geomerty.width/2)
        const y: number = geomerty.y + (geomerty.height/2)
        return {x:x,y:y};

    }

    tileClient(client: AbstractClient){
        if(! this.isSupportedClient(client)){
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
// Starting...
new Tiler();
