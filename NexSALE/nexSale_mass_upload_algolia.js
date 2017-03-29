/**
 * @NApiVersion 2.x
 * @NScriptType MassUpdateScript
 *
 */
define(['N/record', 'N/https', 'N/search', './nexSale_config.js'],
function(record, https, search, nexSale_config) {

//TODO: For DSN
  function getDomain(mode) {
    return '.algolia.net';
  }

  /**
   * Definition of Mass Update trigger point.
   *
   * @param {Object} params
   * @param {string} params.type - Record type of the record being processed by the mass update
   * @param {number} params.id - ID of the record being processed by the mass update
   *
   * @since 2016.1
   */
  function each(params) {
    var ALGOLIA_OBJ = {};

    //if(params.type == record.Type.INVENTORY_ITEM) {

      var searchIt = search.load({
        id: nexSale_config.SEARCH_ID
      });

      var columns = searchIt.columns;
      var advFilters = searchIt.filters;
        advFilters.push(new search.createFilter({ name:'internalid', operator:'is', values: params.id }));

      var search_config = {
    	        type: searchIt.searchType,
    	        filters: advFilters,
    	        columns: searchIt.columns
    	      };
      var modSearch = search.create(search_config);

      modSearch.run().each(function(result) {
         columns.forEach(function(col) {
           switch (col.label) {
             case "Store Display Image":
               ALGOLIA_OBJ[col.label] = result.getText(col);
               break;
             case "Category":
               ALGOLIA_OBJ[col.label] = result.getText(col);
               break;
             case "Sub Category":
                ALGOLIA_OBJ[col.label] = result.getText(col);
                break;
             case "Price Level":
                var priceLevelId = result.getValue(columns[12]);

                if(!ALGOLIA_OBJ[col.label]) {
                  ALGOLIA_OBJ[col.label] = {};
                }

                if(!ALGOLIA_OBJ[col.label][priceLevelId]) {
                  ALGOLIA_OBJ[col.label][priceLevelId] = {
                    id: result.getValue(col),
                    name: result.getText(columns[13]),
                    price: result.getValue(columns[14])
                  };
                }
                break;
             case "Pricing Internal ID":
              break;
             case "Qty Available":
               break;
             case "Is Lot Numbered Item":
              break;
             case "Unit Price":
              break;
             case "Available":
            	 ALGOLIA_OBJ[col.label] = parseFloatOrZero(result.getValue(col));
                 break;
             case "Inventory Location":
               var locId = result.getValue(col);
               if(!ALGOLIA_OBJ[col.label]) {
                 ALGOLIA_OBJ[col.label] = {};
               }

               if(!ALGOLIA_OBJ[col.label][locId]) {
                 ALGOLIA_OBJ[col.label][locId] = {
                   'qty': parseFloatOrZero(result.getValue(columns[6])),
                   'name': result.getText(col),
                   'id': result.getValue(col)
                 };
               }
               break;
             default:
               ALGOLIA_OBJ[col.label] = result.getValue(col);
               break;
            }
			  });
        return true;
      });
      ALGOLIA_OBJ['Inventory Location'] = JSON.stringify(ALGOLIA_OBJ['Inventory Location']);
      ALGOLIA_OBJ['Price Level'] = JSON.stringify(ALGOLIA_OBJ['Price Level']);
      //delete ALGOLIA_OBJ['Algolia Object Id'];

      log.debug('PARAM ID: '+params.id+' ITEMID: '+ALGOLIA_OBJ["Internal ID"]+' '+(Object.keys(ALGOLIA_OBJ).length), JSON.stringify(ALGOLIA_OBJ));

      if(Object.keys(ALGOLIA_OBJ).length) {
      //if(ALGOLIA_OBJ['Name']) {
        var post_config = {
          url: 'https://'+nexSale_config.ALGOLIA.APPLICATION_ID+getDomain()+'/1/indexes/'+nexSale_config.ALGOLIA.INDEX+'/',
          headers: {
            'X-Algolia-API-Key' : nexSale_config.ALGOLIA.API_KEY,
            'X-Algolia-Application-Id' : nexSale_config.ALGOLIA.APPLICATION_ID
          },
          body: JSON.stringify(ALGOLIA_OBJ),
          method: https.Method.POST
        };

        var response = https.post(post_config);
        var resp = JSON.parse(response.body);
        log.debug({
          title: 'ALGOLIA POSTING',
          details: JSON.stringify({
            'post_config':post_config,
            'response':response,
          })
        });

        if(resp['objectID']) {
          var saveRecord = {
            type: 'inventoryitem',
            id: params.id,
            values: {}
          };
          saveRecord['values'][nexSale_config.field.ALGOLIA_ITEM] = resp['objectID'];
          var id = record.submitFields(saveRecord);
          //log.debug('ITEM ID', id);
        }
	    }
  }

  function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a}

  return {
      each: each
  };
});
