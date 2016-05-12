/*!
 * leaflet.wms.js
 * A collection of Leaflet utilities for working with Web Mapping services.
 * (c) 2014, Houston Engineering, Inc.
 * MIT License
 */

(function (factory) {
    // Module systems magic dance, Leaflet edition
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['leaflet'], factory);
    } else if (typeof module !== 'undefined') {
        // Node/CommonJS
        module.exports = factory(require('leaflet'));
    } else {
        // Browser globals
        if (typeof this.L === 'undefined')
            throw 'Leaflet must be loaded first!';
        // Namespace
        this.L.WMS = this.L.wms = factory(this.L);
    }
}(function (L) {

// Module object
var wms = {};

/*
 * wms.Source
 * The Source object manages a single WMS connection.  Multiple "layers" can be
 * created with the getLayer function, but a single request will be sent for
 * each image update.  Can be used in non-tiled "overlay" mode (default), or
 * tiled mode, via an internal wms.Overlay or wms.TileLayer, respectively.
 */
wms.Source = L.Layer.extend({
    'options': {
        'tiled': false,
        'identify': false ,
        'legend': true, // onclick layer event is getLegendGraphics
        'autowms': true, // loads layers from wms service. Exception in case of CORS restriction
        'info_format': 'text/html',
        'legend_format': 'image/png',
        'feature_count': 10
    },

    'initialize': function(url, options) {
        L.setOptions(this, options);
        this._url = url;
        this._subLayers = {};
        this._overlay = this.createOverlay(this.options.tiled);
        
        // Auto WMS loading
        this.loadFromWMS();
    },

    'createOverlay': function(tiled) {
        // Create overlay with all options other than tiled & identify
        var overlayOptions = {};
        for (var opt in this.options) {
            if (opt != 'tiled' && opt != 'identify' && opt != 'info_format'
                && opt != 'legend' && opt != 'legend_format' && opt != 'autowms' 
                && opt != 'feature_count') {
                overlayOptions[opt] = this.options[opt];
            }
        }
        if (tiled) {
            return wms.tileLayer(this._url, overlayOptions);
        } else {
            return wms.overlay(this._url, overlayOptions);
        }
    },

    'onAdd': function() {
        this.refreshOverlay();
        console.log();
    },

    'getEvents': function() {
        if (this.options.identify) {
            return {'click': this.identify};
        } else if (this.options.legend) {
            return {'click': this.legend};
        } else {
            return {};
        }
    },

    'setOpacity': function(opacity) {
         this.options.opacity = opacity;
         if (this._overlay) {
             this._overlay.setOpacity(opacity);
         }
    },

    'getLayer': function(name) {
        return wms.layer(this, name);
    },
    
    'getLayerIcon': function(name) {
        // returns URL icon for this layer: the layer image, reduced to icon size.
        // get layer bbox if any in getCapabilities
        var u = '';
        if (this._capabilities) {
            u = this._wmsLayers[name].iconURL;
            console.log(u);
        } else {
            // todo: factorize WMS url building from params
            var uppercase = this.options.uppercase || false;
            var params = L.extend({}, this._overlay.wmsParams);
            // changes size
            params.width = 80;
            params.height = 80;
            console.log(params);
            var pstr = L.Util.getParamString(params, this._url, uppercase);
            u = this._url + pstr;
            console.log(u);
        }
        
        return u;
    },
    
    'getLayerLegendURL': function(name) {
        // returns URL legend for this layer
        var params = this.getLegendGraphicsParams([name], true);
        // change image image
        return this._url + L.Util.getParamString(params, this._url);
    },
    
    'getLayersForControl' : function () {
        // returns array of sublayers object suitable for iconLayers control:
        // option, title, layer
        var ret = [];
        if (this._subLayers) {
            console.log('getLayersForControl: sublayers to build: ');
            for (var ln in this._subLayers) {
                var obj = {
                    'title': ln,
                    'icon': this.getLayerIcon(ln), 
                    'layer': this.getLayer(ln),
                    'options' : {
                        'info': '',
                        'legend': this.getLayerLegendURL(ln)
                    }
                };
                ret.push(obj);
            }
        }
        return ret;
    },

    'addSubLayer': function(name) {
//        console.log('addSubLayer, param: ' + name);
        this._subLayers[name] = true;
        this.refreshOverlay();
    },

    'removeSubLayer': function(name) {
//        console.log('deleteSubLayer, param: ' + name);
        delete this._subLayers[name];
        this.refreshOverlay();
    },

    'refreshOverlay': function() {
        var subLayers = Object.keys(this._subLayers).join(",");
        if (!this._map) {
            return;
        }
        if (!subLayers) {
            this._overlay.remove();
        } else {
            this._overlay.setParams({'layers': subLayers});
            this._overlay.addTo(this._map);
        }
    },

    'identify': function(evt) {
        // Identify map features in response to map clicks. To customize this
        // behavior, create a class extending wms.Source and override one or
        // more of the following hook functions.

        var layers = this.getIdentifyLayers();
        if (!layers.length) {
            return;
        }
        this.getFeatureInfo(
            evt.containerPoint, evt.latlng, layers,
            this.showFeatureInfo
        );
    },

    'legend': function(evt) {
        // shows layers legends in response to map clicks. To customize this
        // behavior, create a class extending wms.Source and override one or
        // more of the following hook functions.

        var layers = this.getLegendLayers();
        if (!layers.length) {
            return;
        }
        this.getLegendGraphics(evt.latlng, layers,
            this.showLegendGraphics
        );
    },

    'getFeatureInfo': function(point, latlng, layers, callback) {
        // Request WMS GetFeatureInfo and call callback with results
        // (split from identify() to faciliate use outside of map events)
        var params = this.getFeatureInfoParams(point, layers), 
                url = this._url + L.Util.getParamString(params, this._url);

        this.showWaiting();
        this.ajax(url, done);

        function done(result) {
            this.hideWaiting();
            var text = this.parseFeatureInfo(result, url);
            callback.call(this, latlng, text);
        }
    },

    'getLegendGraphics': function(latlng, layers, callback) {
        // Request WMS GetLegendGraphics and call callback with Image URL 
        // (split from legend() to faciliate use outside of map events)
        // 
        var url = [];
        if (this._capabilities) {
            for (var l in this._wmsLayers) {
                url.push(this._wmsLayers[l].legendURL);
            }
        } else {
            var params = this.getLegendGraphicsParams(layers, false);
            url = [this._url + L.Util.getParamString(params, this._url)];
        }

        callback.call(this, latlng, url);
    },

    'getCapabilities': function(layers, callback) {
        // Request WMS GetCapabilities and call callback with results capa jSON object
        // (split to faciliate use outside of map events)
                // returns URL icone for this layer: the layer image, reduced to icon size
        var uppercase = this.options.uppercase || false;
        // TODO: 
        var params = {
            request : 'GetCapabilities',
            service: 'WMS',
            version: this._overlay.wmsParams.version
        };
        console.log(params);
        var url = this._url + L.Util.getParamString(params, this._url, uppercase);
//        console.log(url);

        this.showWaiting();
        this.ajax(url, done);

        function done(result) {
            this.hideWaiting();
            var capa = this.parseCapabilities(result, url);
            callback.call(this, capa);
        }
    },

    'ajax': function(url, callback) {
        ajax.call(this, url, callback);
    },

    'getIdentifyLayers': function() {
        // Hook to determine which layers to identify
        if (this.options.identifyLayers)
            return this.options.identifyLayers;
        return Object.keys(this._subLayers);
     },

    'getLegendLayers': function() {
        // Hook to determine which layers to legend
        if (this.options.legendLayers)
            return this.options.legendLayers;
        return Object.keys(this._subLayers);
     },

    'getFeatureInfoParams': function(point, layers) {
        // Hook to generate parameters for WMS service GetFeatureInfo request
        var wmsParams, overlay;
        if (this.options.tiled) {
            // Create overlay instance to leverage updateWmsParams
            overlay = this.createOverlay();
            overlay.updateWmsParams(this._map);
            wmsParams = overlay.wmsParams;
            wmsParams.layers = layers.join(',');
        } else {
            // Use existing overlay
            wmsParams = this._overlay.wmsParams;
        }
        // replaces format with info_format parameter
        var infoParams = {
            'request': 'GetFeatureInfo',
            'info_format': this.options.info_format,
            'query_layers': layers.join(','),
            'X': Math.round(point.x),
            'Y': Math.round(point.y)
        };
        return L.extend({}, wmsParams, infoParams);
    },

    // TODO: factorize once auto mode is hooked in
    'getLegendGraphicsParams': function(layers, filter) {
        // Hook to generate parameters for WMS service GetLegendGraphics request
        var wmsParams, overlay;
        if (this.options.tiled) {
            // Create overlay instance to leverage updateWmsParams
            overlay = this.createOverlay();
            overlay.updateWmsParams(this._map);
            wmsParams = overlay.wmsParams;
            wmsParams.layers = layers.join(',');
        } else {
            // Use existing overlay
            wmsParams = this._overlay.wmsParams;
        }
        //filters list of layers if requested, based on current list of layers
        // TODO: check
        if (filter) {
            wmsParams.layers = layers.join(',');
        }
        // replaces format with info_format parameter
        var legendParams = {
            'request': 'GetLegendGraphics',
            'format': this.options.legend_format
        };
        return L.extend({}, wmsParams, legendParams);
    },

    'parseFeatureInfo': function(result, url) {
        // Hook to handle parsing AJAX response
        if (result == "error") {
            // AJAX failed, possibly due to CORS issues.
            // Try loading content in <iframe>.
            result = "<iframe id='fiframe'  src='" + url + "' style='border:none'>";
        }
        return result;
    },

    'parseCapabilities': function(result, url) {
        // Hook to handle parsing AJAX response
        if (result == "error") {
            // AJAX failed, possibly due to CORS issues.
            // Try loading content in <iframe>.
            result = "<iframe id='fiframe'  src='" + url + "' style='border:none'>";
            alert('Cannot get capabilities from: ' + url + '\nresult: ' + result);
            if (this._map) {
                this._map.openPopup(result);
            }
        }
        return result;
    },

    'showFeatureInfo': function(latlng, info) {
        // Hook to handle displaying parsed AJAX response to the user
        if (!this._map) {
            return;
        }
        this._map.openPopup(info, latlng);
    },

    'showLegendGraphics': function(latlng, legendURL) {
        // Hook to handle displaying parsed AJAX response to the user
        if (!this._map) {
            return;
        }
        // creates images for the legend url array
        var divLegend = L.DomUtil.create('div', 'leaflet-wms-legend');
        for (var i = 0; i < legendURL.length; i++) {
            var div = L.DomUtil.create('div', '', divLegend);
            var img = L.DomUtil.create('img', 'leaflet-wms-legend', div);
            img.src = legendURL[i];
        }
        
        this._map.openPopup(divLegend, latlng, {
            maxHeight: 100,
            autoPan: false,
            keepInView: true
        });
    },

    'showWaiting': function() {
        // Hook to customize AJAX wait animation
        if (!this._map)
            return;
        this._map._container.style.cursor = "progress";
    },

    'hideWaiting': function() {
        // Hook to remove AJAX wait animation
        if (!this._map)
            return;
        this._map._container.style.cursor = "default";
    },
    // tries to load a getCapabilities document to read layers info from.
    'loadFromWMS': function () {
        console.log(this.options);
        if (this.options.autowms !== true) {
            console.log('autowms NOT enabled...');
            return;
        }
        console.log('autowms enabled !');
        var WMSCapabilities = require('wms-capabilities');
        this.getCapabilities(null, done);
        
        function done(capa) {
//            console.log(capa);
            var uppercase = this.options.uppercase || false;
            var crs = this.options.crs || this._map.options.crs;
            
            this._capabilities = new WMSCapabilities().parse(capa);
            console.log(this._capabilities);
            // adds a list of wmslayers with useful properties
            this._wmsLayers = {};
            // copies the overlay options to be able to build custom URL for found wmslayers:
            var params = this.wmsParams = L.extend({}, this._overlay.wmsParams);
            // sets main WMS params now we can read them from server:
            console.log(params);
            this._overlay.wmsParams.version = this._capabilities.version;
            
            // reads image format: takes first available format in array
            // TODO: bug with qgis WMS server advertized image/jpeg but crashes with it
            // uses user-defined option if available
            if (!this.options.format) {
                this._overlay.wmsParams.format = this._capabilities.Capability.Request.GetMap.Format[0];
            } else {
                console.log('user format to user:' + this.options.format);
                this._overlay.wmsParams.format = this.options.format;
            }
            
            // reads legend_format: takes first found
            // TODO: one legend_format per legendGraphics available or getXXX methods to access the _capabilities object ?
            this.legend_format = this._capabilities.Capability.Layer.Layer[0].Style[0].LegendURL[0].Format;

            // reads info_format: 
            if (this._capabilities.Capability.Request.GetFeatureInfo.Format.indexOf('text/html') >= 0) {
                this.legend_format = 'text/html';
            } else {
                //takes first available
                this.legend_format = this._capabilities.Capability.Request.GetFeatureInfo.Format[0];
            }
            
            for (i = 0; i < this._capabilities.Capability.Layer.Layer.length; i++) {
                var l = this._capabilities.Capability.Layer.Layer[i];
                // TODO: stores legendURL and iconURL built from capa
                this._subLayers[l.Name]= true;
                params.layers = l.Name;
                // find layers bbox for configured srs and sets it to overload params
                for (var j = 0; j < l.BoundingBox.length; j++) {
                    if (l.BoundingBox[j].crs === crs.code) {
                        console.log('found');
                        params.bbox = l.BoundingBox[j].extent.join(',');
                        break;
                    }
                }
                // builds MapURL for icon, with custom bbox if any
                // TODO: from config/factorize.
                params.width = 80;
                params.height = 80;
                var url = this._url + L.Util.getParamString(params, this._url, uppercase);
                
                var props = {
                    'legendURL': l.Style[0].LegendURL[0].OnlineResource,
                    'iconURL': url
                };
                
                this._wmsLayers[l.Name] = props;
//                console.log(l);
            }
            this.refreshOverlay();
//            console.log('Done getcapa');
        };
    }
});

wms.source = function(url, options) {
    return new wms.Source(url, options);
};

/*
 * Layer
 * Leaflet "layer" with all actual rendering handled via an underlying Source
 * object.  Can be called directly with a URL to automatically create or reuse
 * an existing Source.  Note that the auto-source feature doesn't work well in
 * multi-map environments; so for best results, create a Source first and use
 * getLayer() to retrieve wms.Layer instances.
 */

wms.Layer = L.Layer.extend({
    'initialize': function(source, layerName, options) {
        if (!source.addSubLayer) {
            // Assume source is a URL
            source = wms.getSourceForUrl(source, options);
        }
        this._source = source;
        this._name = layerName;
    },
    'onAdd': function() {
        if (!this._source._map)
            this._source.addTo(this._map);
        this._source.addSubLayer(this._name);
    },
    'onRemove': function() {
        this._source.removeSubLayer(this._name);
    },
    'setOpacity': function(opacity) {
        this._source.setOpacity(opacity);
    }
});

wms.layer = function(source, options) {
    return new wms.Layer(source, options);
};

// Cache of sources for use with wms.Layer auto-source option
var sources = {};
wms.getSourceForUrl = function(url, options) {
    if (!sources[url]) {
        sources[url] = wms.source(url, options);
    }
    return sources[url];
};


// Copy tiled WMS layer from leaflet core, in case we need to subclass it later
wms.TileLayer = L.TileLayer.WMS;
wms.tileLayer = L.tileLayer.wms;

/*
 * wms.Overlay:
 * "Single Tile" WMS image overlay that updates with map changes.
 * Portions of wms.Overlay are directly extracted from L.TileLayer.WMS.
 * See Leaflet license.
 */
wms.Overlay = L.Layer.extend({
    'defaultWmsParams': {
        'service': 'WMS',
        'request': 'GetMap',
        'version': '1.1.1',
        'layers': '',
        'styles': '',
        'format': 'image/jpeg',
        'transparent': true
    },

    'options': {
        'crs': null,
        'uppercase': false,
        'attribution': '',
        'opacity': 1
    },

    'initialize': function(url, options) {
        this._url = url;

        // Move WMS parameters to params object
        var params = {};
        for (var opt in options) {
             if (!(opt in this.options)) {
                 params[opt] = options[opt];
                 delete options[opt];
             }
        }
        L.setOptions(this, options);
        this.wmsParams = L.extend({}, this.defaultWmsParams, params);
    },

    'setParams': function(params) {
        L.extend(this.wmsParams, params);
        this.update();
    },

    'getAttribution': function() {
        return this.options.attribution;
    },

    'onAdd': function() {
        this.update();
    },

    'onRemove': function(map) {
        if (this._currentOverlay) {
            map.removeLayer(this._currentOverlay);
            delete this._currentOverlay;
        }
        if (this._currentUrl) {
            delete this._currentUrl;
        }
    },

    'getEvents': function() {
        return {
            'moveend': this.update
        };
    },

    'update': function() {
        if (!this._map) {
            return;
        }
        // Determine image URL and whether it has changed since last update
        this.updateWmsParams();
        var url = this.getImageUrl();
        if (this._currentUrl == url) {
            return;
        }
        this._currentUrl = url;

        // Keep current image overlay in place until new one loads
        // (inspired by esri.leaflet)
        var bounds = this._map.getBounds();
        var overlay = L.imageOverlay(url, bounds, {'opacity': 0});
        overlay.addTo(this._map);
        overlay.once('load', _swap, this);
        function _swap() {
            if (!this._map) {
                return;
            }
            if (overlay._url != this._currentUrl) {
                this._map.removeLayer(overlay);
                return;
            } else if (this._currentOverlay) {
                this._map.removeLayer(this._currentOverlay);
            }
            this._currentOverlay = overlay;
            overlay.setOpacity(
                this.options.opacity ? this.options.opacity : 1
            );
        }
    },

    'setOpacity': function(opacity) {
         this.options.opacity = opacity;
         if (this._currentOverlay) {
             this._currentOverlay.setOpacity(opacity);
         }
    },

    // See L.TileLayer.WMS: onAdd() & getTileUrl()
    'updateWmsParams': function(map) {
        if (!map) {
            map = this._map;
        }
        // Compute WMS options
        var bounds = map.getBounds();
        var size = map.getSize();
        var wmsVersion = parseFloat(this.wmsParams.version);
        var crs = this.options.crs || map.options.crs;
        var projectionKey = wmsVersion >= 1.3 ? 'crs' : 'srs';
        var nw = crs.project(bounds.getNorthWest());
        var se = crs.project(bounds.getSouthEast());

        // Assemble WMS parameter string
        var params = {
            'width': size.x,
            'height': size.y
        };
        params[projectionKey] = crs.code;
        params.bbox = (
            wmsVersion >= 1.3 && crs === L.CRS.EPSG4326 ?
            [se.y, nw.x, nw.y, se.x] :
            [nw.x, se.y, se.x, nw.y]
        ).join(',');

        L.extend(this.wmsParams, params);
    },

    'getImageUrl': function() {
        var uppercase = this.options.uppercase || false;
        var pstr = L.Util.getParamString(this.wmsParams, this._url, uppercase);
        return this._url + pstr;
    }
});

wms.overlay = function(url, options) {
    return new wms.Overlay(url, options);
};

// Simple AJAX helper (since we can't assume jQuery etc. are present)
function ajax(url, callback) {
    var context = this,
        request = new XMLHttpRequest();
    request.onreadystatechange = change;
    request.open('GET', url);
    request.send();

    function change() {
        if (request.readyState === 4) {
            if (request.status === 200) {
                callback.call(context, request.responseText);
            } else {
                callback.call(context, "error");
            }
        }
    }
}

return wms;

}));

