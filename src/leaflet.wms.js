/*!
 * leaflet.wms.js
 * A collection of Leaflet utilities for working with Web Mapping services.
 * (c) 2014-2016, Houston Engineering, Inc.
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

// Quick shim for Object.keys()
if (!('keys' in Object)) {
    Object.keys = function(obj) {
        var result = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                result.push(i);
            }
        }
        return result;
    };
}

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
        'identify': true ,
        'legend': false, // onclick overlay layer event is getLegendGraphics
        'info_format': 'text/html',
        'legend_format': 'image/png',
        'feature_count': 10
    },

    'initialize': function(url, options) {
        L.setOptions(this, options);
        if (this.options.tiled) {
            this.options.untiled = false;
        }
        this._url = url;
        this._subLayers = {}; // now a more complex object storing layer visibility, order, and wms paras
        this._overlay = this.createOverlay(this.options.tiled);
    },

    'createOverlay': function(untiled) {
        // Create overlay with all options other than untiled & identify
        var overlayOptions = {};
        for (var opt in this.options) {
            if (opt !== 'tiled' && opt !== 'identify' && opt !== 'info_format'
                && opt !== 'legend' && opt !== 'legend_format'
                && opt !== 'feature_count') {
                overlayOptions[opt] = this.options[opt];
            }
        }
        if (untiled) {
            return wms.overlay(this._url, overlayOptions);
        } else {
            return wms.tileLayer(this._url, overlayOptions);
        }
    },

    'onAdd': function() {
        this.refreshOverlay();
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
    
    'bringToBack': function() {
         this.options.isBack = true;
         if (this._overlay) {
             this._overlay.bringToBack();
         }
    },

    'bringToFront': function() {
         this.options.isBack = false;
         if (this._overlay) {
             this._overlay.bringToFront();
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
            u = this._subLayers[name].wms.iconURL;
        } else {
            // todo: factorize WMS url building from params
            var uppercase = this.options.uppercase || false;
            var params = L.extend({}, this._overlay.wmsParams);
            // changes size
            params.width = 80;
            params.height = 80;
            var pstr = L.Util.getParamString(params, this._url, uppercase);
            u = this._url + pstr;
        }
        
        return u;
    },
    // returns layer title, or name if no title found
    'getLayerTitle': function(name) {
        return this._subLayers ? this._subLayers[name].wms.title : name;
    },
    
    'getLayerLegendURL': function(name) {
        // returns URL legend for this layer
        // TODO: only one container for subLayers
        var ret = '';
        if (this._subLayers[name]) {
            ret = this._subLayers[name].wms.legendURL;
//                console.log(ret);
        } else {
            var params = this.getLegendGraphicsParams([name], true);
            ret = this._url + L.Util.getParamString(params, this._url);
        }
        // change image image
        return ret;
    },
    
    'getLayersForControl' : function () {
        // returns array of sublayers object suitable for iconLayers control:
        // option, title, layer
        var ret = [];
        if (this._subLayers) {
//            console.log('getLayersForControl: sublayers to build: ');
            for (var ln in this._subLayers) {
                var obj = {
                    'multi': true,
                    'title': this.getLayerTitle(ln),
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
        if (this._subLayers[name]) {
            this._subLayers[name].showed = true;
        } else {
            // new layer
            this._subLayers[name] = {showed: true, order: 0, wms: {}};
        }
        this.refreshOverlay();
    },

    'removeSubLayer': function(name) {
        this._subLayers[name].showed = false;
        this.refreshOverlay();
    },

    'refreshOverlay': function() {
//        var subLayers = Object.keys(this._subLayers).join(",");
        var subLayers = this.getShowedLayers(this._subLayers);
        
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
        if (this.options.legend) {
            return this.legend(evt);
        }

        var layers = this.getIdentifyLayers();
        if (!layers) {
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
//            console.log(layers);
        if (!layers) {
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
            for (var l in layers) {
                url.push(layers[l].wms.legendURL);
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
//        console.log(params);
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
        return this._subLayers;
     },

    'getLegendLayers': function() {
        // Hook to determine which layers to legend
        if (this.options.legendLayers)
            return this.options.legendLayers;
        return this._subLayers;
     },

    'getFeatureInfoParams': function(point, layers) {
        // Hook to generate parameters for WMS service GetFeatureInfo request
        var wmsParams, overlay;
        // list of layers to process:
        var layersList = this.getShowedLayers(layers);
        if (this.options.tiled) {
            // Create overlay instance to leverage updateWmsParams
            overlay = this.createOverlay(true);
            overlay.updateWmsParams(this._map);
            wmsParams = overlay.wmsParams;
            wmsParams.layers = layersList;
        } else {
            // Use existing overlay
            wmsParams = this._overlay.wmsParams;
        }
        // replaces format with info_format parameter
        var infoParams = {
            'request': 'GetFeatureInfo',
            'info_format': this.options.info_format,
            'query_layers': layersList,
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
            wmsParams.layers = this.getShowedLayers(layers);
        } else {
            // Use existing overlay
            wmsParams = this._overlay.wmsParams;
        }
        //filters list of layers if requested, based on current list of layers
        // TODO: check
        if (filter) {
            wmsParams.layers = this.getShowedLayers(layers);
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
        if (result === 'error') {
            // AJAX failed, possibly due to CORS issues.
            // Try loading content in <iframe>.
            result = '<iframe id="fiframe" src="' + url + '" style="border:none">';
        }
        return result;
    },

    'parseCapabilities': function(result, url) {
        // Hook to handle parsing AJAX response
        if (result === 'error') {
            // AJAX failed, possibly due to CORS issues.
            // Try loading content in <iframe>.
            result = '<iframe id="fiframe"  src="' + url + '" style="border:none">';
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
        this._map._container.style.cursor = 'progress';
    },

    'hideWaiting': function() {
        // Hook to remove AJAX wait animation
        if (!this._map)
            return;
        this._map._container.style.cursor = 'default';
    },
    // tries to load a getCapabilities document to read layers info from.
    'loadFromWMS': function (callback) {
        console.log('autowms called. Trying to load layers list from: '+ this._url);
        this.getCapabilities(null, done);
        
        function done(capa) {
//            console.log(capa);
            // TODO: factorize
            var projKey = parseFloat(this._overlay.wmsParams.version) >= 1.3 ? 'srs' : 'crs';

            var uppercase = this.options.uppercase || false;
            var crs = this.options.crs || this._map.options.crs;
            
            this._capabilities = new WMSCapabilities().parse(capa);
//            this._capabilities = new WMSCapabilities(capa).toJSON();;
//            console.log(this._capabilities);
            // sets main WMS params now we can read them from server:
//            console.log(params);
            this._overlay.wmsParams.version = this._capabilities.version;

            // reads image format: takes first available format in array
            // TODO: bug with qgis WMS server advertized image/jpeg but crashes with it
            // uses user-defined option if available
            if (!this.options.format) {
                this._overlay.wmsParams.format = this._capabilities.Capability.Request.GetMap.Format[0];
            } else {
                console.log('user-defined image format to use:' + this.options.format);
                this._overlay.wmsParams.format = this.options.format;
            }
            // handy trick to build a custom object formatter
//            console.log('list of advertised SRS: ' + 
//                    this._capabilities.Capability.Layer.BoundingBox.map(function(elem){
//                        return elem[projKey];
//                    }).join(','));

            console.log('list of advertised SRS: ' + 
                    this._capabilities.Capability.Layer.SRS.join(', '));

            // reads legend_format: takes first found
            // TODO: one legend_format per legendGraphics available or getXXX methods to access the _capabilities object ?
            if (this._capabilities.Capability.Layer.Layer[0].Style) {
                this.legend_format = this._capabilities.Capability.Layer.Layer[0].Style[0].LegendURL[0].Format;
            }

            // reads info_format: 
            if (this._capabilities.Capability.Request.GetFeatureInfo.Format.indexOf('text/html') >= 0) {
                this.legend_format = 'text/html';
            } else {
                //takes first available
                this.legend_format = this._capabilities.Capability.Request.GetFeatureInfo.Format[0];
            }
            
            // reads layers: flatten them as nested structure is supported in WMS, but
            // not here yet
            // TODO: tree struct for layers ?
            var layers = [];
            //TODO: clean
            layers = this.flattenLayers(this._capabilities.Capability.Layer.Layer, projKey, crs, uppercase, layers);
            
            this.refreshOverlay();
            callback.call(this);
        };
    },
    // returns capabilities layers flattened in the given ret array.
    // based on layer.Name property:
    // TODO: clean management based on OGC specs
    'flattenLayers': function (arr, projKey, crs, uppercase, ret) {
        var that = this;
        var i = 0;
        arr.forEach(function (l) {
            // copies the overlay options to be able to build custom URL for found wmslayers:
            var params = that.wmsParams = L.extend({}, that._overlay.wmsParams);

            if (l.Name) { 
                // Layer with name found: built it
                that._subLayers[l.Name]= {showed: true, order: (i++), wms: {}};
                params.layers = l.Name;
                // find layers bbox for configured srs and sets it
                if (l.BoundingBox) {
                    for (var j = 0; j < l.BoundingBox.length; j++) {
                        if (l.BoundingBox[j][projKey] === crs.code) {
                            params.bbox = l.BoundingBox[j].extent.join(',');
                            params.srs = l.BoundingBox[j][projKey];
                            break;
                        }
                    }
                    // Forces default layer srs:
                    if (! params.bbox) {
                        params.bbox = l.BoundingBox[0].extent.join(',');
                        params.srs = l.BoundingBox[0][projKey];
    //                    console.log('forcing bbox for this layer: ' + params.bbox);
                    }
                } else {
                    console.log('no BoundinBox for layer : ' + l.Name + '. Using parent BoundingBox');
                    if (parentBbox && parentSrs) {
                        params.bbox = parentBbox;
                        params.srs = parentSrs;
                    }
                }
                //
                // builds MapURL for icon, with custom bbox if any
                // TODO: from config/factorize.
                params.width = 80;
                params.height = 80;
                var url = that._url + L.Util.getParamString(params, that._url, uppercase);
//                console.log('iconURL: ' + l.Name + ' :' + url);

                // wmsLayers options used for iconLayers
                var props = {
                    'title': l.Title, 
                    'iconURL': url
                };
                if (l.Style && l.Style[0].LegendURL) {
                    props['legendURL'] = l.Style[0].LegendURL[0].OnlineResource;
//                    console.log('legendURL: ' + l.Style[0].LegendURL[0].OnlineResource);
                } else {
                    console.log('no OnlineResource (legend) for layer ' + l.Name);
                }

                that._subLayers[l.Name].wms = props;
                    console.log(that);
                // stores current bbox params for this layer, as its children may not have a BoundingBox object
                // will use the parent
                parentBbox = params.bbox;
                parentSrs = params.srs;
            }
            if (l.Layer) {
                that.flattenLayers(l.Layer, projKey, crs, uppercase, ret);
            }
        });
        return ret;
    },
    // gets the list of showed layers separated by a comma:
    // suitable for wms layers parameter
    // TODO: manage order ?
    'getShowedLayers': function (layers) {
        var ret = '';
        if (layers) {
            ret = Object.keys(layers).filter(function(key) {
                return layers[key].showed === true;
            }.bind(this)).join(',');
        } 
        return ret;
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
        L.setOptions(this, options);
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
            console.log('adding' + this._name);
        this._source.addSubLayer(this._name);
    },
    'onRemove': function() {
        this._source.removeSubLayer(this._name);
    },
    'setOpacity': function(opacity) {
        this._source.setOpacity(opacity);
    },
    'bringToBack': function() {
        this._source.bringToBack();
    },
    'bringToFront': function() {
        this._source.bringToFront();
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
        'opacity': 1,
        'isBack': false,
        'minZoom': 0,
        'maxZoom': 18
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
        
        if (this._currentUrl === url) {
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
            if (overlay._url !== this._currentUrl) {
                this._map.removeLayer(overlay);
                return;
            } else if (this._currentOverlay) {
                this._map.removeLayer(this._currentOverlay);
            }
            this._currentOverlay = overlay;
            overlay.setOpacity(
                this.options.opacity ? this.options.opacity : 1
            );
            if (this.options.isBack === true) {
                overlay.bringToBack();
            }
            if (this.options.isBack === false) {
                overlay.bringToFront();
            }
        }
        if ((this._map.getZoom() < this.options.minZoom) ||
            (this._map.getZoom() > this.options.maxZoom)){
            this._map.removeLayer(overlay);
        }
    },

    'setOpacity': function(opacity) {
         this.options.opacity = opacity;
         if (this._currentOverlay) {
             this._currentOverlay.setOpacity(opacity);
         }
    },

    'bringToBack': function() {
        this.options.isBack = true;
        if (this._currentOverlay) {
            this._currentOverlay.bringToBack();
        }
    },

    'bringToFront': function() {
        this.options.isBack = false;
        if (this._currentOverlay) {
            this._currentOverlay.bringToFront();
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
                callback.call(context, 'error');
            }
        }
    }
}

return wms;

}));
