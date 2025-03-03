import {LogLevel} from './logLevel';
export class Config {

    logLevel: LogLevel;
    logMaximize: boolean;
    logEvents: boolean;
    logEventsInteractiveResize: boolean;
    logWindowProperties: boolean = false;
    logDebugTree: boolean;
    logDebugScreens: boolean = false;
    doMaximizeSingleWindow: boolean = true;
    doMaximizeWhenNoLayoutExists: boolean = true;
    doMaximizeUsingRootTile: boolean = true;
    doShowOutline: boolean = true;
    rearrangeBetweenMonitors: boolean = false;
    rearrangeLayout: boolean = false;
    doForceRedraw: boolean = false;
    doRearrangeWindows: boolean = true;
    maximizeWithPadding: boolean = true;
    logRearrangeLayout: boolean = true;
    logRearrangeLayoutCount: boolean = false;
    maxNumberOfTiles: number|null = null;

    constructor() {
        const isDebug = readConfig('isDebug', false);
        this.logLevel = isDebug ? LogLevel.DEBUG: LogLevel.NOTICE;
        this.logMaximize = false
        this.logDebugTree = isDebug
        this.logEvents = true
        this.logEventsInteractiveResize = false
        this.logRearrangeLayout = true

        this.logWindowProperties = readConfig('logWindowProperties', false)
        this.doShowOutline = readConfig('showOutline', true) && false
        this.rearrangeBetweenMonitors = readConfig('rearrangeBetweenMonitors', false)
        this.doMaximizeSingleWindow = readConfig('maximizeSingleWindow', true)
        this.doMaximizeWhenNoLayoutExists = false // We now use the root tile instead.
        this.doRearrangeWindows = readConfig('rearrangeWindows', true)
        this.maximizeWithPadding = readConfig('maximizeWithPadding', true)
        this.rearrangeLayout = readConfig('rearrangeLayout', false)
    }


    getRearrangeLayout(): boolean {
        return this.rearrangeLayout;
    }

    isDebug(): boolean {
        return this.logLevel === LogLevel.DEBUG;
    }
}
