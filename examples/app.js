requirejs.config({
    'baseUrl': '../lib',
    'paths': {
        'leaflet.wms': '../leaflet.wms',
        'iconlayers': '/leafleticonlayers/src/iconLayers',
        'wms-capabilities': '/leafletwms/wms-capabilities'
    }
});

define(['leaflet', 'leaflet.wms', 'iconlayers', 'wms-capabilities'],
function(L, wms) {

var autowmsMap = '';
var tiledMap = '';
var overlayMap = '';

autowmsMap = createMap('autowms-map', false, true);
//overlayMap = createMap('overlay-map', false, false);
//tiledMap = createMap('tiled-map', true, false);

function createMap(div, tiled, autowms) {
    // Map configuration
    var map = L.map(div);
//    map.setView([45, -93.2], 6);
    map.setView([44.0, 4.4], 8);

    var basemaps = {
        'Basemap': basemap().addTo(map),
        'Blank': blank()
    };
    
    if (autowms) {
        // Test autowms mode: Adds only a WMS service URL
        // Add WMS source/layers
        var source = wms.source(
            "http://localhost/qgis/qgis_mapserv.fcgi?map=/Users/nicolas/Projets/smage/demo/web/QGIS-Web-Client-master/projets_qgis/appli_smage.qgs",
            {
                'autowms': true,
                'format': 'image/png'
            }
        );

        // adds source to map
        source.addTo(map);
        // plug event onload to do things with layer
        source._overlay.on('add', function() {
            L.control.iconLayers(source.getLayersForControl()).addTo(map);
        } );
        
        // Opacity slider
        var slider = L.DomUtil.get('range-' + div);
        L.DomEvent.addListener(slider, 'change', function() {
            source.setOpacity(this.value);
        });

        
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
            'Sous Bassins': source.getLayer("Sous Bassins"),
            'Parcs Nationaux': source.getLayer("Parcs Nationaux")
//            ,'Lakes & Rivers': source.getLayer("lakesrivers"),
//            'Airports': source.getLayer("airports"),
//            'State Capitals': source.getLayer("statecap")
        };
        for (var name in layers) {
            layers[name].addTo(map);
        }

        // Create layer control
        //L.control.layers(basemaps, layers).addTo(map);
//        L.control.iconLayers(
//                IconLayersConfigBuilder.buildFromWMSSource(source)
//                ).addTo(map);
        L.control.iconLayers(source.getLayersForControl()
                ).addTo(map);

        // Opacity slider
        var slider = L.DomUtil.get('range-' + div);
        L.DomEvent.addListener(slider, 'change', function() {
            source.setOpacity(this.value);
        });

        // legend/info radio
        var r1 = L.DomUtil.get('info-' + div);
        L.DomEvent.addListener(r1, 'click', radioClick);
        var r2 = L.DomUtil.get('legend-' + div);
        L.DomEvent.addListener(r2, 'click', radioClick);
        
        function radioClick(evt) {
            if (this.value === '1') {
                source.options.identify = true;
                source.options.legend = false;
                L.DomUtil.get('imglegend').src = '';
            } else if (this.value === '2') {
                source.options.identify = false;
                source.options.legend = true;
                console.log(source.options);
                L.DomUtil.get('imglegend').src = source.getLayerLegendURL('Sous Bassins');
            }
            source.getEvents();
        };
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

