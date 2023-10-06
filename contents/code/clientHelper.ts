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

