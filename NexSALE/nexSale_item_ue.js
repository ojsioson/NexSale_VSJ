/**
 * As item records are updated (Inventory only ATM), fire off an update to Algolia to keep it in sync
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define([
  'N/runtime',
  'N/search',
  'N/https',
  'N/record',
  './nexPos_integration_lib.js',
  './nexSale_config.js'
], function(runtime, search, https, record, lib, nexSale_config) {

  function getDomain(mode) {
    return '.algolia.net';
  }

  var findItem = function(internalId) {
    var OBJ = {};

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
    OBJ['Inventory Location'] = JSON.stringify(OBJ['Inventory Location']);
    OBJ['Price Level'] = JSON.stringify(OBJ['Price Level']);
    delete OBJ['Algolia Object Id'];
    return OBJ;
  };

  var UpdateAlgoliaItem = function(recordType, mode, recordId) {
    switch (mode) {
        //Remove it also on Algolia
        case 'delete':
          var algolia_item_id = search.lookupFields({
            type:recordType,
            id:recordId,
            columns: nexSale_config.field.ALGOLIA_ITEM
          });

          log.debug('DELETING', algolia_item_id);

          var post_config = {
            url: 'https://'+nexSale_config.ALGOLIA.APPLICATION_ID+getDomain()+'/1/indexes/'+nexSale_config.ALGOLIA.INDEX+'/'+algolia_item_id[nexSale_config.field.ALGOLIA_ITEM],
        	  headers: {
              'X-Algolia-API-Key' : nexSale_config.ALGOLIA.API_KEY,
              'X-Algolia-Application-Id' : nexSale_config.ALGOLIA.APPLICATION_ID
            },
            method: https.Method.DELETE
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

          if(!resp['deletedAt']) {
            log.error('ERROR', 'Error occurred on deleting object!');
          }
          break;

        //Create it also in Algolia
        case 'create': {
          //Find the Item matching the internal id
          var ITEM = findItem(recordId);

          //Prepare for Algolia posting
          var post_config = {
            url: 'https://'+nexSale_config.ALGOLIA.APPLICATION_ID+getDomain()+'/1/indexes/'+nexSale_config.ALGOLIA.INDEX+'/',
            headers: {
              'X-Algolia-API-Key' : nexSale_config.ALGOLIA.API_KEY,
              'X-Algolia-Application-Id' : nexSale_config.ALGOLIA.APPLICATION_ID
            },
            method: https.Method.POST,
            body: JSON.stringify(ITEM)
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

          if(resp['objectID']) {
            var saveRecord = {
              type: recordType,
              id: recordId,
              values: {}
            };

            saveRecord['values'][nexSale_config.field.ALGOLIA_ITEM] = resp['objectID'];
            var id = record.submitFields(saveRecord);
            //log.debug('ITEM ID', id);
          }
          break;
        }

        //Edit mode
        default: {
          //Find the Item matching the internal id
          var ITEM = findItem(recordId);

          //If having an Algolia Object Id
          if(ITEM['Algolia Object Id']) {

            //Prepare for Algolia posting
            var post_config = {
              url: 'https://'+nexSale_config.ALGOLIA.APPLICATION_ID+getDomain()+'/1/indexes/'+nexSale_config.ALGOLIA.INDEX+'/'+ITEM['Algolia Object Id']+'/partial',
              headers: {
                'X-Algolia-API-Key' : nexSale_config.ALGOLIA.API_KEY,
                'X-Algolia-Application-Id' : nexSale_config.ALGOLIA.APPLICATION_ID
              },
              method: https.Method.POST,
              body: JSON.stringify(ITEM)
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

            if(resp['objectID']) {
              var saveRecord = {
                type: recordType,
                id: recordId,
                values: {}
              };

              saveRecord['values'][nexSale_config.field.ALGOLIA_ITEM] = resp['objectID'];
              var id = record.submitFields(saveRecord);
              //log.debug('ITEM ID', id);
            }
          }
          break;
        }
    }
  };

  var beforeSubmit = function(context) {
    if ([
      context.UserEventType.DELETE
    ].indexOf(context.type) == -1) return

    try {
      UpdateAlgoliaItem(context.newRecord.type, context.type, context.newRecord.id);
    } catch(e) {
      log.error("Problem Deleting Item", e);
    }
  };

  /*
    Updates Algolia, verifies a change in fields necessary
  */
  var afterSubmit = function(context) {

    // verify that we're dealing with the correct initiators
    if ([
      context.UserEventType.CREATE,
      context.UserEventType.EDIT
    ].indexOf(context.type) == -1) return // nothing more to do

    // fire off a single item request, wrap in try catch to ensure user is not impacted
    try {
      log.debug({title:'', details: {
        typeis: context.newRecord.type,
        type_is: context.type,
        id_is: context.newRecord.id}});


      UpdateAlgoliaItem(context.newRecord.type, context.type, context.newRecord.id)
    } catch(e) { // If it doesn't work, then log it only.
      log.error("Problem updating Item", e);
    }
  };
  return {
    afterSubmit: afterSubmit,
      beforeSubmit: beforeSubmit
  }
})
