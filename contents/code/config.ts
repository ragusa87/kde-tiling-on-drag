import {LogLevel} from "./logLevel";
export class Config {
    constructor(debug: boolean = false) {
        this.logLevel = debug ? LogLevel.DEBUG: LogLevel.NOTICE;
        this.logMaximize = debug
        this.logDebugTree = debug
        this.logEvents = debug
    }

    setLogWindowProperties(value: boolean):Config{
        this.logWindowProperties = value;
        return this;
    }

    setShowOutline(value: boolean):Config{
        this.doShowOutline = value;
        return this;
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
}
