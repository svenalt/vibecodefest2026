const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The pinned YAMNet model ships as an app asset (assets/model/yamnet.tflite).
config.resolver.assetExts.push('tflite');

module.exports = config;
