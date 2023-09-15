"use strict";
class Tiler {
    constructor() {
        workspace.clientList().filter(this.isSupportedClient).forEach((d) => {
            this.detachClient(d);
            this.attachClient(d);
        });
        workspace.clientAdded.connect(this.attachClient);
        workspace.clientRemoved.connect(this.detachClient);
    }
    ;
    log(...values) {
        print(...values);
    }
    attachClient(client) {
        this.log(`attachClient ${client.resourceName}`);
        client.clientFinishUserMovedResized.connect(this.tileClient);
        this.tileClient(client);
    }
    detachClient(client) {
        this.log(`detachClient  ${client.resourceName}`);
        client.clientFinishUserMovedResized.disconnect(this.tileClient);
    }
    getCenter(geomerty) {
        const x = geomerty.x + (geomerty.width / 2);
        const y = geomerty.y + (geomerty.height / 2);
        return { x: x, y: y };
    }
    tileClient(client) {
        if (false === this.isSupportedClient(client)) {
            return;
        }
        const center = this.getCenter(client.geometry);
        const tileManager = workspace.tilingForScreen(client.screen);
        client.tile = tileManager.bestTileForPosition(center.x, center.y);
    }
    isSupportedClient(client) {
        return client.normalWindow;
    }
}
new Tiler();