leaflet.wms.js
==============

A fork of leaflet.wms plugin to add extra features
-----------------------------------------------------

[Leaflet.wms](https://github.com/heigeo/leaflet.wms) is a great plugin to manange WMS sources.
This fork adds some new features

## [Demo] TODO...

## Features 

 * "Single-tile" auto-updating WMS overlay
 * Use single server-composited image for layers coming from the same source
 * Layer identify via `GetFeatureInfo`
 * Pull requests welcome!

## Usage

```javascript

// Default usage (uses L.WMS.Overlay)
var source = L.WMS.source("http://example.com/mapserv", {
    'transparent': true
});
source.getLayer("layer1").addTo(map);
source.getLayer("layer2").addTo(map);

// Tile mode (Uses L.WMS.TileLayer)
var s = L.WMS.source("http://example.com/mapserv", {
    'transparent': true,
    'tiled': true
});
source.getLayer("layer1").addTo(map);
source.getLayer("layer2").addTo(map);

```

leaflet.wms can be loaded via AMD, CommonJS/Node, and browser global environments.

```javascript
// AMD example
define(['leaflet', 'leaflet.wms'],
function(L, wms) {

// L.WMS === wms;
var source = wms.source("http://example.com/mapserv");

});
```

## API

this leaflet.wms fork provides additional methods: TODO

The following hooks are available:

Name | Description
-----|-------------
`getIdentifyLayers()` | Determine which layers to identify (default is all visible layers)
`getFeatureInfoParams(point, layers)` | Generate parameters for WMS `GetFeatureInfo` request
`ajax(url, callback)` | Actual AJAX call.  The default implementation is a rudimentary `XMLHttpRequest` wrapper.  Override this if you want to use jQuery or something with more robust support for older browsers.  If you override this, be sure to preserve the value of `this` when calling the callback function (e.g. `callback.call(this, result)`).
`parseFeatureInfo(result, url)` | Parse the AJAX response into HTML
`showFeatureInfo(latlng, info)` | Display parsed AJAX response to the user (e.g in a popup)
`showWaiting()` | Start AJAX wait animation (spinner, etc.)
`hideWaiting()` | Stop AJAX wait animation

[Leaflet]: http://leafletjs.com
[esri-leaflet]: https://github.com/Esri/esri-leaflet
[L.TileLayer.WMS]: http://leafletjs.com/reference.html#tilelayer-wms
[L.ImageOverlay]: http://leafletjs.com/reference.html#imageoverlay
[L.WMS.Source]: https://github.com/heigeo/leaflet.wms#lwmssource
