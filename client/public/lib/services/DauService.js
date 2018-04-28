const BaseService = require('@ucd-lib/cork-app-utils').BaseService;
const DauStore = require('../stores/DauStore');
const config = require('../config')

class DauService extends BaseService {

  constructor() {
    super();
    this.store = DauStore;
  }

  getGeometry(model) {
    return this.request({
      url : `${config.host}/dauco.json`,
      checkCached : () => this.store.data.geometry,
      onLoading : request => this.store.setGeometryLoading(request),
      onError : e => this.store.setGeometryError(e),
      onSuccess : body => this.store.setGeometryLoaded(body)
    });
  }

  getData(dauZoneId) {
    return this.request({
      url : `${config.getHost}/cimis/region/DAU${dauZoneId}`,
      checkCached : () => this.store.data.byId[dauZoneId],
      onLoading : request => this.store.setDauLoading(request),
      onError : error => this.store.setDauError(dauZoneId, error),
      onSuccess : body => this.store.setDauLoaded(dauZoneId, body)
    });
  }

}

module.exports = new DauService();