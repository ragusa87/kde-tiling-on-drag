var Tiler = (function () {
    function Tiler() {
        var _this = this;
        workspace.clientList().filter(this.isSupportedClient).forEach(function (d) {
            _this.detachClient(d);
            _this.attachClient(d);
        });
        workspace.clientAdded.connect(function (client) { return _this.attachClient(client); });
        workspace.clientRemoved.connect(function (client) { return _this.detachClient(client); });
    }
    ;
    Tiler.prototype.log = function (value) {
        console.log(value);
    };
    Tiler.prototype.attachClient = function (client) {
        var _this = this;
        this.log("attachClient ".concat(client.resourceName));
        client.clientFinishUserMovedResized.connect(function (client) { return _this.tileClient(client); });
        this.tileClient(client);
    };
    Tiler.prototype.detachClient = function (client) {
        var _this = this;
        this.log("detachClient  ".concat(client.resourceName));
        client.clientFinishUserMovedResized.disconnect(function (client) { return _this.tileClient(client); });
    };
    Tiler.prototype.getCenter = function (geomerty) {
        var x = geomerty.x + (geomerty.width / 2);
        var y = geomerty.y + (geomerty.height / 2);
        return { x: x, y: y };
    };
    Tiler.prototype.tileClient = function (client) {
        if (!this.isSupportedClient(client)) {
            return;
        }
        var center = this.getCenter(client.geometry);
        var tileManager = workspace.tilingForScreen(client.screen);
        client.tile = tileManager.bestTileForPosition(center.x, center.y);
    };
    Tiler.prototype.isSupportedClient = function (client) {
        return client.normalWindow;
    };
    return Tiler;
}());
new Tiler();
