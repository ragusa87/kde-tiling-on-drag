import {Config} from "./config";
import {Tiler} from "./tiler";

const isDebug = readConfig("isDebug", false);
const config = new Config(isDebug);
config
    .setLogWindowProperties(readConfig("logWindowProperties", false))
    .setShowOutline(readConfig("showOutline", true))
    .setRearrangeBetweenMonitors(readConfig("rearrangeBetweenMonitors", false))
    .setMaximizeSingleWindow(readConfig("maximizeSingleWindow", true))

console.log(`Tiling started with debug: ${isDebug}`)
new Tiler(config);
