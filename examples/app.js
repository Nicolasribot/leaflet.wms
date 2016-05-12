requirejs.config({
    'baseUrl': '../lib',
    'paths': {
        'leaflet.wms': '../leaflet.wms' //.js'
    }
});

define(['leaflet', 'leaflet.wms'],
function(L, wms) {

var autowmsMap = '';
var tiledMap = '';
var overlayMap = '';

//autowmsMap = createMap('autowms-map', false, true);
overlayMap = createMap('overlay-map', false, false);
//tiledMap = createMap('tiled-map', true, false);

function createMap(div, tiled, autowms) {
    // Map configuration
    var map = L.map(div);
//    map.setView([45, -93.2], 6);
    map.setView([44.0, 4.4], 8);

    var basemaps = {
        'Basemap': basemap().addTo(map) ,
        'Blank': blank()
    };
    
    if (autowms) {
        // Test autowms mode: Adds only a WMS service URL
        // Add WMS source/layers
        var source = wms.source(
            "http://localhost/qgis/qgis_mapserv.fcgi?map=/Users/nicolas/Projets/smage/demo/web/QGIS-Web-Client-master/projets_qgis/appli_smage.qgs",
            {
                "tiled": tiled,
                // new options
                'automws': true, // loads layers from wms service
                'layersControl': true, // display a forked leaflet-iconLayers control
                'info_format': 'text/html',
                'legend_format': 'image/png',
                'feature_count': 10
            }        
        );

        // adds source to map
        source.addTo(map);
        
    } else {
        var source = wms.source(
//            "http://webservices.nationalatlas.gov/wms",
            "http://localhost/qgis/qgis_mapserv.fcgi?map=/Users/nicolas/Projets/smage/demo/web/QGIS-Web-Client-master/projets_qgis/appli_smage.qgs",
            {
                "format": "image/png",
                "transparent": "true",
                "attribution": "<a href='#'>Nico wms</a>",
                "tiled": tiled
            }        
        );

        var layers = {
            'Time Zones': source.getLayer("Sous Bassins")
//            ,'Lakes & Rivers': source.getLayer("lakesrivers"),
//            'Airports': source.getLayer("airports"),
//            'State Capitals': source.getLayer("statecap")
        };
        for (var name in layers) {
            layers[name].addTo(map);
        }

        // Create layer control
        L.control.layers(basemaps, layers).addTo(map);

        // Opacity slider
        var slider = L.DomUtil.get('range-' + div);
        L.DomEvent.addListener(slider, 'change', function() {
            source.setOpacity(this.value);
        });

    }
    return map;
}

function basemap() {
    // Attribution (https://gist.github.com/mourner/1804938)
    var mqcdn = "http://otile{s}.mqcdn.com/tiles/1.0.0/{type}/{z}/{x}/{y}.png";
    var osmAttr = 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>';
    var mqTilesAttr = 'Tiles &copy; <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png" />';
    return L.tileLayer(mqcdn, {
        'subdomains': '1234',
        'type': 'map',
        'attribution': osmAttr + ', ' + mqTilesAttr
    });
    
//    return L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//        maxZoom: 19,
//        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
//    });
}

function blank() {
    var layer = new L.Layer();
    layer.onAdd = layer.onRemove = function() {};
    return layer;
}

// Export maps for console experimentation
return {
    'maps': {
        'overlay': overlayMap,
        'tiled': tiledMap,
        'autowms': autowmsMap
    }
};

});

