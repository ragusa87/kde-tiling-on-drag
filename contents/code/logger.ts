/* eslint-disable  @typescript-eslint/no-explicit-any */
import {LogLevel} from "./logLevel";

export function log(level: LogLevel, ...value: any){
    if(level === LogLevel.DEBUG) {
        console.log(value);
        return;
    }
    if(level === LogLevel.INFO) {
        console.info(value);
        return;
    }
    if(level === LogLevel.WARNING) {
        console.warn(value);
        return;
    }
    if(level === LogLevel.ALERT) {
        console.warn("Alert: ", value);
        return;
    }
    if(level === LogLevel.NOTICE) {
        console.warn("Notice: ", value);
        return;
    }
    if(level === LogLevel.EMERGENCY) {
        console.warn("EMERGENCY: ", value);
        return;
    }
    if(level === LogLevel.CRITICAL) {
        console.warn("CRITICAL: ", value);
        return;
    }
    if(level === LogLevel.ERROR) {
        console.error(value);
        return;
    }

    console.log("Unknown log level: ", level, value);
}
