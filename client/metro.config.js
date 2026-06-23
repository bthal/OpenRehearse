const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Allow .mxl (compressed MusicXML) files to be bundled as static assets
config.resolver.assetExts.push('mxl');

module.exports = withNativeWind(config, { input: './global.css' });
