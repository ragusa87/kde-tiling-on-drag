export function clientToString(client: AbstractClient|undefined|null):string{
    if(!client){
        return `null`
    }
    return `${client.resourceName} ${client.internalId} ${client.screen}, ${client.desktop} ${client.activities.join(", ")}`;
}

export function tileToString(tile: Tile|undefined|null):string{
    if(!tile){
        return `null`
    }
    return `${tile.toString()} - ${tile.parent ? tile.parent.toString() : "no parent"}`
}


export function isSupportedClient(client: AbstractClient):boolean{
    return client.normalWindow && !client.deleted &&
        // Ignore Konsole's confirm dialogs
        !(client.caption.startsWith("Confirm ") && ["org.kde.konsole", "konsole"].includes(client.resourceClass)) &&
        // Ignore Spectacle's dialogs (spectacle on X11, org.kde.spectacle on wayland)
        !(["org.kde.spectacle","spectacle"].includes(client.resourceClass)) &&
        // Ignore Klipper's "Action Popup menu"
        !(["org.kde.plasmashell", "plasmashell"].includes(client.resourceClass) && client.caption === "Plasma") &&
        // Ignore jetbrains's "Splash screen"
        !(client.resourceClass.includes("jetbrains") && client.caption === "splash") &&
        // Ignore "Steam apps"
        !(client.resourceClass.startsWith("steam_app_")) &&
        // Ignore ktorrent
        !(client.resourceClass.startsWith("org.kde.ktorrent") || client.resourceClass.startsWith("ktorrent")) &&
        // Ignore Eclipse windows
        !(client.resourceClass.startsWith("Eclipse") || client.resourceClass.startsWith("eclipse"))
}

export function isSameActivityAndDesktop(client: AbstractClient):boolean{
    return (client.onAllDesktops || client.desktop === workspace.currentDesktop) &&
        (client.activities.length === 0 || client.activities.includes(workspace.currentActivity));
}


export function clientProperties (client: AbstractClient):string{
       return `> properties for ${clientToString(client)}
                normalWindow? ${client.normalWindow}
                clientSideDecorated? ${client.clientSideDecorated}
                dialog ? ${client.dialog}
                splash ? ${client.splash}
                utility ? ${client.utility}
                dropDownMenu ? ${client.dropDownMenu}
                popupMenu ? ${client.popupMenu}
                tooltip ? ${client.tooltip}
                notification ? ${client.notification}
                criticalNotification ? ${client.criticalNotification}
                appletPopup ? ${client.appletPopup}
                onScreenDisplay ? ${client.onScreenDisplay}
                comboBox ? ${client.comboBox}
                dndIcon ? ${client.dndIcon}
                resourceClass ? ${client.resourceClass}
                caption ? ${client.caption}
                windowRole ? ${client.windowRole}
                windowType ? ${client.windowType}
            `
    }

