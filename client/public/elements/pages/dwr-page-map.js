import {PolymerElement} from "@polymer/polymer/polymer-element"
import template from "./dwr-page-map.html"

import AppStateInterface from "../interfaces/AppStateInterface"
import DauInterface from "../interfaces/DauInterface"
import EtoZonesInterface from "../interfaces/EtoZonesInterface"
import StationInterface from "../interfaces/StationInterface"
import CimisGridInterface from "../interfaces/CimisGridInterface"

class DwrPageMap extends Mixin(PolymerElement)
    .with(EventInterface, AppStateInterface, CimisGridInterface, 
        StationInterface, DauInterface, EtoZonesInterface) {
  
  static get properties() {
    return {
      mapState: {
        type: String,
        value : 'cimisGrid'
      },
      
      dauGeometry: {
        type: Object,
        value : function() {
          return {state: 'loading'}
        }
      },
      etoGeometry: {
        type: Object,
        value : function() {
          return {state: 'loading'}
        }
      },

      dates: {
        type: Object
      },
      selectedCimisGrid : {
        type: String
      },
      selectedCimisGridData : {
        type : Object
      }
    }
  }

  static get template() {
    return template;
  }

  ready() {
    super.ready();

    this.first = true;

    this.latLng = new google.maps.LatLng(38.033291, -119.961762);
    var mapOptions = {
      center: { lat: 38.033291, lng: -119.961762 },
      zoom: 5,
      mapTypeControl : false,
      streetViewControl : false,
      panControl : false,
      zoomControlOptions : {
        style : 'LARGE'
      }
    };
    this.map = new google.maps.Map(this.$.map, mapOptions);

    this.map.data.setStyle({visible: false});

    google.maps.event.addListener(this.map, 'click', this._onMapClick.bind(this));
    this.map.data.addListener('click', this._onRegionClick.bind(this));

    this.MasterController().on('select-location', (e) => {
      var ll = {
        lat : e.location.latitude,
        lng : e.location.longitude
      }
      setTimeout(() => this.map.setCenter(ll), 200);
    });

    this._getCimisGridDates();
    this._getCimisStations();
  }

  _onActive() {
    if( !window.google || !this.active ) return;
    
    this._render();

    this.debounce('resizeMap', () => {
      google.maps.event.trigger(this.map, 'resize');
      this.map.setCenter(this.latLng);
    }, 50);
  }

  _onDauGeometryUpdate(e) {
    this.dauGeometry = e;
    if( e.state === 'loaded' && this.mapState === 'dauZones' ) {
      this._render();
    }
  }

  _onEtoZonesGeometryUpdate(e) {
    this.etoGeometry = e;
    if( this.mapState === 'etoZones' ) {
      this._render();
    }
  }

  _onAppStateUpdate(e) {
    if( e.mapState === 'cimisGrid' && this.location !== e.selectedCimisLocation ) {
      this.location = e.selectedCimisLocation;
      
      if( this.location ) {
        var parts = this.location.split('-').map(p => parseInt(p));
        var location = this._gridToBounds(parts[0], parts[1])[0];

        setTimeout(() => {
          if( !this.map ) return;
          this.map.setCenter({
            lat: location[1], 
            lng: location[0]
          });
        }, 300);
      }
    }
    
    if( this.mapState === e.mapState ) return;
    
    this.mapState = e.mapState || 'cimisGrid';
    this._render();
  }

  _render() {
    this.debounce('_render', this._render, 50);
  }

  _render() {
    if( !this.map || !this.active ) return;

    // we only need to render a map state once
    if( this.renderedMapState === this.mapState ) return;

    // if we are showing etoZones and they are not loaded, return
    if( this.mapState === 'etoZones' && this.etoGeometry.state !== 'loaded' ) {
      return;
    }

    // if we are showing dauZones and they are not loaded, return
    if( this.mapState === 'dauZones' && this.dauGeometry.state !== 'loaded' ) {
      return;
    }

    this.debounce('_renderAsync', () => this._renderAsync(), 50);
  }

  _renderAsync() {
    if( this.renderedMapState === this.mapState ) return;

    // clear current data layer
    this.map.data.forEach((feature) => {
      this.map.data.remove(feature);
    });
    this.map.data.setStyle({visible: false});

    // remove a cimis grid if one exists
    this._clearCurrentGrid();

    if( this.mapState === 'etoZones' || this.mapState === 'dauZones' ) {

      if( this.mapState === 'etoZones' ) this.map.data.addGeoJson(this.etoGeometry.payload);
      else this.map.data.addGeoJson(this.dauGeometry.payload);

      this.map.data.setStyle((feature) => {
        if( this.mapState === 'dauZones' ) {
          return {
            fillColor: '#aaaaaa',
            strokeColor: '#ffffff',
            fillOpacity : .6,
            strokeWeight: 1
          };
        }

        var label = this._getRegionNumber(feature);

        return {
          fillColor: this._getEtoZoneGeometry(label).properties.color,
          strokeColor: '#ffffff',
          fillOpacity : .6,
          strokeWeight: 1
        };
      });

      this._clearCurrentGrid();
    } else {
      this.map.data.setStyle({visible: false});
    }

    if( this.mapState === 'cimisStations' ) {
      this.showStationMarks();
    } else {
      this.hideStationMarks();
    }

    this.renderedMapState = this.mapState;
  }

  _getRegionNumber(feature) {
    var zone = feature.getProperty('zone');
    if( zone ) return zone;
    return feature.getProperty('dau_code');
  }

  _onRegionClick(e) {
    if( !e.feature ) {
      return;
    }

    this.latLng = e.latLng;

    if( e.feature.getProperty('dauco') ) {
      window.location.hash = '#data/'+this.mapState+'/'+this._getRegionNumber(e.feature);
    } else{
      window.location.hash = '#data/'+this.mapState+'/'+this._getRegionNumber(e.feature);
    }
  }

  _onMapClick(e){
    if( !this.active || this.mapState !== 'cimisGrid' ) {
      return;
    }

    var storage = {
      latitude : e.latLng.lat(),
      longitude : e.latLng.lng()
    }

    if( window.localStorage ) {
      window.localStorage.setItem('cimis-location', JSON.stringify(storage));
    }

    this.latLng = e.latLng;
    this.grid = this._llToGrid(this.latLng);

    var id = this.grid.row+'-'+this.grid.col;
    this._renderGrid(this.grid.bottomLeft[1], this.grid.bottomLeft[0], 
                    this.grid.topRight[1], this.grid.topRight[0], id);

    this._setAppState({
      selectedCimisLocation : id
    });

    this._getCimisGridData(id)
        .then(e => this._onCimisDataUpdate(e));
  }

  _onCimisDataUpdate(e) {
    if( e.state === 'loading' && this.overlay ) {
      return this.overlay.setValue('<iron-icon icon="cached" set-size></iron-icon>');
    }
      
    if( e.state !== 'loaded') return;

    this.debounce('_onCimisDataUpdate', function() {
      this._onGridDataUpdateAsync(e);
    }, 50);
  }

  _onGridDataUpdateAsync(e) {
    this.selectedCimisGridData = e;

    this.ga('gridview', window.userType || 'unknown', this.selectedCimisGrid);

    var payload = this.selectedCimisGridData.payload;

    var html;
    if( payload.data[this.yesterday] && payload.data[this.yesterday].ETo !== undefined ) {
      html = '<div>'+payload.data[this.yesterday].ETo.toFixed(1)+'</div><div>mm</div>';
    } else {
      return this.overlay.setValue('<iron-icon icon="error" set-size style="color: red"></iron-icon>');
    }

    if( !this.overlay ) {
      var id = payload.location.row+'-'+payload.location.col;
      var bounds = payload.location.bounds;
      this._renderGrid(bounds[1][1], bounds[0][0], bounds[0][1], bounds[1][0]);
    }

    this.overlay.setValue(html);
  }

  _renderGrid(bottom, left, top, right, id) {
    this.bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(bottom, left),
        new google.maps.LatLng(top, right)
    );

    var polygon = [
      {lat: bottom, lng: left},
      {lat: top, lng: left},
      {lat: top, lng: right},
      {lat: bottom, lng: right},
      {lat: bottom, lng: left}
    ];

    this._clearCurrentGrid();

    this.rectangle = new google.maps.Polygon({paths: polygon});
    this.rectangle.setMap(this.map);

    this.overlay = new EtoOverlay(this.bounds, this.map);
    if( this.overlay.div_ ) {
      this.overlay.setValue('<iron-icon icon="cached" set-size></iron-icon>');
    }

    google.maps.event.addListener(this.rectangle, 'click', function(){
      window.location = '#data/cimisGrid/'+id;
    });
  }

  _clearCurrentGrid() {
    if( this.rectangle ) this.rectangle.setMap(null);
    if( this.overlay ) this.overlay.setMap(null);
  }

  // zoomToBounds() {
  //   if( !this.bounds ) return;
  //   this.map.fitBounds(this.bounds);
  // }


  // get the latest date
  _onCimisDatesUpdate(e) {
    if( e.state !== 'loaded' ) return;

    this.dates = e;

    // TODO: add mixin for this
    var dates = this._sortDates(this.dates.payload);
    this.yesterday = dates[dates.length-1];
  }

  showStationMarks() {
    for( var key in this.stations ) {
      this.stations[key].marker.setMap(this.map);
    }
  }

  hideStationMarks() {
    for( var key in this.stations ) {
      this.stations[key].marker.setMap(null);
    }
  }

  _onStationsUpdate(e) {
    if( e.state !== 'loaded' ) return;
    this.stations = e.payload;

    for( var key in this.stations ) {
      this.stations[key].marker = this._createMarker(key, this.stations[key]);
    }
  }

  _createMarker(key, latlng) {
    var marker = new google.maps.Marker({
      position: Object.assign({}, this.stations[key]),
      station_id : key,
      title: 'Cimis Station: '+key
    });

    marker.addListener('click', function(e) {
      window.location.hash = 'data/cimisStations/'+key;
    });

    return marker;
  }

  ga(name, type, value) {
    if( !window.ga ) return;
    ga('send', 'event', name, type, value, 1);
  }
}

window.customElements.define('dwr-page-map', DwrPageMap);