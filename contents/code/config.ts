import {LogLevel} from './logLevel';
export class Config {
    set setForceRedraw(value: boolean) {
        this.doForceRedraw = value;
    }
    constructor(debug: boolean = false) {
        this.logLevel = debug ? LogLevel.DEBUG: LogLevel.NOTICE;
        this.logMaximize = false
        this.logDebugTree = debug
        this.logEvents = false
        this.logRearrangeLayout = debug
    }

    setLogWindowProperties(value: boolean):Config{
        this.logWindowProperties = value;
        return this;
    }

    setShowOutline(value: boolean):Config{
        this.doShowOutline = value;
        return this;
    }

    setRearrangeBetweenMonitors(value: boolean):Config {
        this.rearrangeBetweenMonitors = value
        return this;
    }

    setMaximizeSingleWindow(value: boolean):Config{
        this.doMaximizeSingleWindow = value;
        return this;
    }

    setRearrangeWindows(value: boolean):Config{
        this.doRearrangeWindows = value;
        return this;
    }

    setMaximizeWithPadding(value: boolean):Config{
        this.maximizeWithPadding = value;
        return this
    }

    getRearrangeLayout(): boolean {
        return this.rearrangeLayout;
    }

    setRearrangeLayout(value: boolean):Config {
        this.rearrangeLayout = value;
        return this
    }

    logLevel: LogLevel;
    logMaximize: boolean;
    logEvents: boolean;
    logWindowProperties: boolean = false;
    logDebugTree: boolean;
    logDebugScreens: boolean = false;
    doMaximizeSingleWindow: boolean = true;
    doMaximizeWhenNoLayoutExists: boolean = true;
    doShowOutline: boolean = true;
    rearrangeBetweenMonitors: boolean = false;
    rearrangeLayout: boolean = false;
    doForceRedraw: boolean = false;
    doRearrangeWindows: boolean = true;
    maximizeWithPadding: boolean = true;
    logRearrangeLayout: boolean = true;

}
