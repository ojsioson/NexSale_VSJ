/**
 * As item records are purchased, collected, or ordered, update firebase with stock quantity.
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define([
  'N/record',
  'N/search',
  'N/https',
  'N/task',
  './nexPos_integration_lib.js', './nexSale_config.js'
], function(record, search, https, task, lib, nexSale_config) {

  function getDomain(mode) {
    return '.algolia.net';
  }

  var processPerLine = function(items){
    items.forEach(function(internalId, i, a){
      var OBJ = {};

      var algo_id = null;

      var searchIt = search.load({
        id: nexSale_config.SEARCH_ID
      });

      var columns = searchIt.columns;
      var advFilters = searchIt.filters;

      advFilters.push(new search.createFilter({ name:'internalid', operator:'is', values: internalId }));

      var search_config = {
              type: searchIt.searchType,
              filters: advFilters,
              columns: searchIt.columns };

      var modSearch = search.create(search_config);
      modSearch.run().each(function(result) {
        columns.forEach(function(col) {
          switch (col.label) {
            case "Store Display Image":
              OBJ[col.label] = result.getText(col);
              break;
            case "Category":
              OBJ[col.label] = result.getText(col);
              break;
            case "Sub Category":
               OBJ[col.label] = result.getText(col);
               break;
            case "Price Level":
               var priceLevelId = result.getValue(columns[12]);

               if(!OBJ[col.label]) {
                 OBJ[col.label] = {};
               }

               if(!OBJ[col.label][priceLevelId]) {
                 OBJ[col.label][priceLevelId] = {
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
              OBJ[col.label] = parseFloatOrZero(result.getValue(col));
                break;
            case "Inventory Location":
              var locId = result.getValue(col);
              if(!OBJ[col.label]) {
                OBJ[col.label] = {};
              }

              if(!OBJ[col.label][locId]) {
                OBJ[col.label][locId] = {
                  'qty': parseFloatOrZero(result.getValue(columns[6])),
                  'name': result.getText(col),
                  'id': result.getValue(col)
                };
              }
              break;
            default:
              OBJ[col.label] = result.getValue(col);
              break;
           }
        });
        return true;
      });

      algo_id = OBJ['Algolia Object Id'];
      OBJ['Inventory Location'] = JSON.stringify(OBJ['Inventory Location']);
      OBJ['Price Level'] = JSON.stringify(OBJ['Price Level']);

      delete OBJ['Algolia Object Id'];

      var post_config = {
        url: 'https://'+nexSale_config.ALGOLIA.APPLICATION_ID+getDomain()+'/1/indexes/'+nexSale_config.ALGOLIA.INDEX+'/'+algo_id+'/partial',
        headers: {
          'X-Algolia-API-Key' : nexSale_config.ALGOLIA.API_KEY,
          'X-Algolia-Application-Id' : nexSale_config.ALGOLIA.APPLICATION_ID
        },
        method: https.Method.POST,
        body: JSON.stringify(OBJ)
      };

      var response = https.request(post_config);
      var resp = JSON.parse(response.body);

      log.debug({
        title: 'ALGOLIA POSTING',
        details: JSON.stringify({
          'post_config':post_config,
          'response':response,
        })
      });
    });
  }

  var afterSubmit = function(context) {

    // filter out to those records affecting stock quantities
    if ([
      record.Type.SALES_ORDER,
      record.Type.INVOICE,
      record.Type.CASH_SALE,
      record.Type.ITEM_RECEIPT,
      record.Type.ITEM_FULFILLMENT
    ].indexOf(context.newRecord.type) == -1) return // nothing to do

    // search through the items sublist to see if the items match the ones required
    var itemsPossible = []; // this will store the items in this record, then we'll pass it to the library
    var itemsHash = {}; //Items hash
    for (var i = 0; i<context.newRecord.getLineCount({
      sublistId: 'item'
    }); i++) {
      var itemId = context.newRecord.getSublistValue({
        sublistId: 'item', line: i, fieldId: 'item'
      });
      itemsHash[itemId]=1;
    }

    log.debug({
      title: 'ITEMS TO UPDATE',
      details: JSON.stringify({
        'itemsHash':itemsHash
      })
    });

    itemsPossible = Object.keys(itemsHash);

    if(itemsPossible.length) {
      //processPerLine(itemsPossible);
      var scriptTask = task.create({taskType: task.TaskType.SCHEDULED_SCRIPT});
      scriptTask.scriptId = 'customscript_nexsale_transactions_ss';
      scriptTask.deploymentId = 'customdeploy_nexsale_transactions_ss';
      scriptTask.params = {custscript_items: JSON.stringify(itemsPossible)};
      var tasked = scriptTask.submit();
      log.debug({
        title: 'tasked: '+tasked,
        details: tasked
      });
    }

    // ok, now we have the list of items by their internal id, pass this onto the library to figure out
    // if we care enough about it to update the qty, and update if we do.
    //if (itemsPossible.length) // only do if we have items, helpful if you add filters later on
    //  lib.UpdateFirebaseItems('inventoryitem', itemsPossible)
  }

  function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a}

  return {
    afterSubmit: afterSubmit,
    processPerLine: processPerLine
  }
})
