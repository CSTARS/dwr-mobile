import {PolymerElement} from "@polymer/polymer/polymer-element"
import template from "./dwr-page-eto.html"

import AppStateInterface from "../../interfaces/AppStateInterface"
import EtoZonesInterface from "../../interfaces/EtoZonesInterface"
import ToggleStateInterace from "../../interfaces/ToggleStateInterace"

class DwrPageEto extends Mixin(PolymerElement)
  .with(EventInterface, AppStateInterface, EtoZonesInterface, ToggleStateInterace) {

  static get properties() {
    return {
      selected : {
        type : Object
      },
      geometry : {
        type : Object,
        value : function() {
            return {state: 'loading'}
        }
      },
      currentZoneData : {
        type : Object,
        value : function() {
          return {
            state : 'loading'
          }
        }
      }
    }
  }

  static get template() {
    return template;
  }

  ready() {
    super.ready();
    
    this.now = new Date();
    this.nowWeek = this.getWeekOfYear(0, this.now);

    this._getEtoZonesGeometry();
    this.toggleState('loading');

    this.months = ["Jan","Feb","Mar","Apr","May","June","July","Aug","Sept","Oct","Nov","Dec"];

    var mapOptions = {
        center: { lat: 38.033291, lng: -119.961762 },
        zoom: 5,
        scrollwheel : false,
        draggable : false,
        panControl:true,
        zoomControl:true,
        mapTypeControl:false,
        scaleControl:false,
        streetViewControl:false,
        overviewMapControl:false,
        rotateControl:false,
        zoomControlOptions : {
            position : google.maps.ControlPosition.RIGHT_CENTER
        },
        panControlOptions : {
            position : google.maps.ControlPosition.LEFT_TOP,
        },
        disableDefaultUI: true
    };

    this.map = new google.maps.Map(this.$.zoneMap, this.mapOptions);
    this.map.data.addListener('click', this._onRegionClick.bind(this));

    window.addEventListener('resize', this.redraw.bind(this));
  }

  _onActive() {
    if( !this.active ) return;

    var parts = window.location.hash.replace(/#/,'').split('/');
    if( parts.length >= 3 ) {
        this._selectZone(parts[2]);
    }
  }

  _onEtoZonesGeometryUpdate(e) {
    if( e.state !== 'loaded' ) return;

    this.geometry = e;
    this.map.data.addGeoJson(this.geometry.payload);
    this.redraw();
    this._renderData();
  }

  _onRegionClick(e) {
    if( !e.feature ) {
        return;
    }
    window.location.hash = '#data/etoZones/'+this.getRegionNumber(e.feature);
    this._onActive();
  }

  _onAppStateUpdate(e) {
    if( this.selected === e.selectedEtoZoneLocation ) return;
    this.selected = e.selectedEtoZoneLocation;

    if( !this.active ) return;
    
    this._getEtoZoneData(this.selected)
        .then(e => this._onEtoZonesDataUpdate(e));
  }

  _selectZone(id) {
    this._setAppState({
        selectedEtoZoneLocation : id
    });
  }

  _onEtoZonesDataUpdate(e) {
    this.currentZoneData = e;

    if( this.geometry.state !== 'loaded' ) {
        return;
    }

    this._renderData();
  }

  _renderData() {
    this.debounce('_renderData', () => this._renderDataAsync(), 50);
  }

  _renderDataAsync() {
    this.toggleState(this.currentZoneData.state);

    if( this.currentZoneData.state !== 'loaded' ) {
        return;
    }

    this.map.data.setStyle((feature) => {
        var label = this.getRegionNumber(feature);
        if( label+'' === this.selected ){
            this.feature = feature;
            return {
                fillColor: this._getEtoZoneGeometry(label).properties.color,
                strokeColor: '#fff',
                fillOpacity : .6,
                strokeWeight: 1
            };
        } else {
            return {
                fillColor: '#333',
                strokeColor: '#fff',
                fillOpacity : .2,
                strokeWeight: 1
            };
        }
    });

    var data = this._getEtoZoneGeometry(this.selected);
    this.$.average.innerHTML = data.properties.avg.toFixed(1);
    this.$.delta.innerHTML = data.properties.delta.toFixed(1);

    this.sortedDates = this._sortDates(this.currentZoneData.payload.data);

    var p = [data.properties.p0, data.properties.p1, data.properties.p2]; 
    var h = [0, data.properties.h1, data.properties.h2];
    var signature = this.AppUtils.fft.ifft(p, h, 52);

    var cumSignature = [], prev = 0;
    for( var i = 0; i < signature.length; i++ ) {
        prev += signature[i]*7;
        cumSignature.push(prev);
    }

    // eto chart
    this.dt = new google.visualization.DataTable();
    this.dt.addColumn('string', 'Date');
    this.dt.addColumn('number', 'Avg ETo');
    this.dt.addColumn('number', 'Expected ETo');

    var weeks = [this.getWeekOfYear(2), this.getWeekOfYear(1), this.getWeekOfYear(0)];

    var mid = Math.floor(this.sortedDates.length / 2);
    var end = this.sortedDates.length-1;

    this.sortedDates.forEach((date, index) => {
        var d = this.currentZoneData.payload.data[date];
        arr = [date];

        arr.push(parseFloat(d) || 0);

        if( index === 0 ) {
            arr.push(signature[this.weekOffsetHelperCurrent(weeks[0])]);
        } else if( index === mid ) {
            arr.push(signature[this.weekOffsetHelperCurrent(weeks[1])]);
        } else if( index === end ) {
            arr.push(signature[this.weekOffsetHelperCurrent(weeks[2])]);
        } else {
            arr.push(null);
        }

        this.dt.addRow(arr);
    });

    if( !this.chart ) {
        this.chart = new google.visualization.LineChart(this.$.chart);
        this.options = {
            title : 'ETo - Evapotranspiration (mm)',
            curveType: 'function',
            height : 550,
            interpolateNulls : true,
            animation : {
                easing : 'out',
                startup : true
            },
            series: {
                1: { 
                    lineDashStyle: [4, 4] 
                }
            }
        }
    }

    this.dt2 = new google.visualization.DataTable();
    this.dt2.addColumn('string', 'Week');
    this.dt2.addColumn('number', 'Eto');
    this.dt2.addColumn('number', 'Two Weeks Ago');
    this.dt2.addColumn('number', 'This Week');

    for( var i = 0; i < signature.length; i++ ) {
    var actualWeek = this.getChartWeekLabel(i);
    var arr = [actualWeek.label, signature[i]];
    
    if( actualWeek.week === weeks[0] ) {
        arr.push(signature[i]);
    } else {
        arr.push(null);
    }
    if( actualWeek.week === weeks[2] ) {
        arr.push(signature[i]);
    } else {
        arr.push(null);
    }

    this.dt2.addRow(arr);
    }

    if( !this.chart2 ) {
        this.chart2 = new google.visualization.ComboChart(this.$.chart2);
        this.options2 = {
            title : 'Weekly Expected Evapotranspiration (mm)',
            curveType: 'function',
            height : 550,
            legend : {
                position : 'none'
            },
            hAxis : {
                title : 'Week'
            },
            seriesType : 'bars',
            series: {
                0: { 
                    type : 'line',
                    targetAxisIndex : 0
                }
            }
        }
    }

    this.dt3 = new google.visualization.DataTable();
    this.dt3.addColumn('string', 'Week');
    this.dt3.addColumn('number', 'Cumulative ETo');
    this.dt3.addColumn('number', 'Two Weeks Ago');
    this.dt3.addColumn('number', 'This Week');

    for( var i = 0; i < cumSignature.length; i++ ) {
        var actualWeek = this.getChartWeekLabel(i);
        var arr = [actualWeek.label, cumSignature[i]];
        
        if( actualWeek.week === weeks[0] ) {
            arr.push(cumSignature[i]);
        } else {
            arr.push(null);
        }
        if( actualWeek.week === weeks[2] ) {
            arr.push(cumSignature[i]);
        } else {
            arr.push(null);
        }

        this.dt3.addRow(arr);
    }

    if( !this.chart3 ) {
        this.chart3 = new google.visualization.ComboChart(this.$.chart3);
        this.options3 = {
            title : 'Expected Cumulative Weekly Evapotranspiration (mm)',
            curveType: 'function',
            height : 550,
            legend : {
                position : 'none'
            },
            hAxis : {
                title : 'Week'
            },
            seriesType : 'bars',
            series: {
                0: { 
                    type : 'line',
                    targetAxisIndex : 0
                }
            }
        }
    }

    this.redraw();
  }

  redraw() {
    this.debounce('redraw', () => {
      google.maps.event.trigger(this.map, "resize");
      this.fitToFeature(this.selected);

      if( !this.chart ) return;
      this.chart.draw(this.dt, this.options);
      this.chart2.draw(this.dt2, this.options2);
      this.chart3.draw(this.dt3, this.options3);
    }, 50);
  }

  getDayOfYear(offset, now) {
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = now - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.ceil(diff / oneDay) - (offset || 0);
    if( day < 1 ) 356 + day;
    return day;
  }

  getWeekOfYear(offset, date) {
    if( !date ) date = new Date();
    return Math.floor(this.getDayOfYear(7*offset, date) / 7);
  }

  getRegionNumber(feature) {
    return feature.getProperty('zone');
  }

  getDateOfWeek(w) {
    var y = this.now.getFullYear();
    
    if( this.nowWeek >= 40 ) {
        if( w < 40 ) y++;
    } else {
        if( w >= 40 ) y--;
    }

    var d = (1 + (w - 1) * 7); // 1st of January + 7 days for each week
    d = new Date(y, 0, d);

    return this.months[d.getMonth()]+' '+d.getDate()+', '+y;
  }

  getChartWeekLabel(w) {
    w = this.weekOffsetHelper(w);
    return {
        week : w,
        label : this.getDateOfWeek(w)
    }
  }

  weekOffsetHelper(w) {
    w = w-12;
    if( w < 0 ) w = w+52; 
    return w;
  }

  weekOffsetHelperCurrent(w) {
    w = w+12;
    if( w > 52 ) w = w-52; 
    return w;
  }
}

window.customElements.define('dwr-page-eto', DwrPageEto);