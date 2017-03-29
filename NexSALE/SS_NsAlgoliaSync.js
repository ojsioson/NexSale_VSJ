/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/https', 'N/search', './nexSale_config.js'],

function(record, https, search, nexSale_config) {

    //TODO: For DSN
    function getDomain(mode) {
      return '.algolia.net';
    }

    /**
     * Definition of the Scheduled script trigger point.
     *
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed. It is one of the values from the scriptContext.InvocationType enum.
     * @Since 2015.2
     */
    function execute(scriptContext) {

      var ALGOLIA_OBJ = {};

      //Copy search
      var searchIt = search.load({
        id: nexSale_config.SEARCH_ID
      });

      //Columns
      var columns = searchIt.columns;

      //Configure new search from  the old one
      var search_config = {
              type: searchIt.searchType,
              columns: searchIt.columns
            };
      var modSearch = search.create(search_config);

      //Iterating through search
      modSearch.run().each(function(result) {
         columns.forEach(function(col) {
           switch (col.name) {
            case "storedisplayimage":
              ALGOLIA_OBJ[col.label] = result.getText(col);
              break;
            case "inventorylocation":
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
              case "locationquantityavailable":break;
            default:
              ALGOLIA_OBJ[col.label] = result.getValue(col);
              break;
          }
        });
        return true;
      });

      ALGOLIA_OBJ['Inventory Location'] = JSON.stringify(ALGOLIA_OBJ['Inventory Location']);
      //Avoiding to add algolia object to itself
      delete ALGOLIA_OBJ['Algolia Object Id'];

      if(ALGOLIA_OBJ['Name']) {
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
            type: params.type,
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
        execute: execute
    };

});
