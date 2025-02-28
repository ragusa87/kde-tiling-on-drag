import {Config} from './config';
import {Tiler} from './tiler';

const config = new Config();
console.log(`Tiling started with debug: ${config.isDebug()}`)
new Tiler(config);
