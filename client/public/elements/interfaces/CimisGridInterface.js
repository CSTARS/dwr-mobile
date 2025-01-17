module.exports = subclass => 
  class CimisGridInterface extends subclass {
    constructor() {
      super();
      this._injectModel('CimisGridModel');
    }

    _llToGrid(lng, lat) {
      return this.CimisGridModel.llToGrid(lng, lat);
    }

    _gridToBounds(row, col) {
      return this.CimisGridModel.gridToBounds(row, col);
    }
    
    _getCimisGridDates() {
      return this.CimisGridModel.getDates();
    }

    _getCimisGridData(id) {
      return this.CimisGridModel.getData(id);
    }
  }