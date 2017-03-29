/**
 * nexPOS Integration Library, set of useful functions in use by the userevents to keep the Algolia and Firebase DB's updated.
 */
define([
  'N/runtime',
  'N/search',
  'N/record',
  'N/https',
  'N/url',
  'N/format', //format
  './underscore.js',
], function(runtime, search, record, https, url, format, _) {

  var INTEGRATOR_URL = 'https://nexpos-integrator.herokuapp.com'
  // var INTEGRATOR_URL = 'https://9c95703e.ngrok.io'

  /*
    This method builds the filters by which determine whether or not we do any integration
    with algolia or firebase.
   */
  var __CreateFilters = function(itemids) {
    /*
      Only collecting minimum pricing levels at this stage, keeping the complexity down.
    */
    var filters = [
      ['pricing.minimumquantity', 'equalto', 0]
      //,'and',['formulanumeric:LENGTH({upccode})', 'greaterthan', 0]
      //,'and',['formulanumeric:LENGTH({storedisplayimage})', 'greaterthan', 0]
      //, 'and', ['custitem_brands', 'noneof', '@NONE@']
    ]
    if (itemids) filters.push('and', ['internalid', 'anyof', itemids])
    return filters
  }

  //Refactored from __UpdateFirebaseItems for getting the quantity available per items
  var __RetrieveItems = function(recordType, items) {
    // build the data object we're going to submit
    var DATA_OBJ = {
      companycode:  runtime.accountId, //segmentation of firebase data
      data:         []
    }
    // now use the search (and filters above) to see whether we want to update the qty
    search.create({
      type: recordType, filters: __CreateFilters(items), columns: [
        search.createColumn({ name: 'quantityavailable' })
      ]
    }).run().each(function(result) { // build the object for each item that matches criteria
      DATA_OBJ.data.push({
        recordtype:   result.recordType,
        id:           result.id,
        data: {
          qty:        (function(value) { // ensures we always have a integer value
            if (value) return parseInt(value)
            return 0
          })(result.getValue({ name: 'quantityavailable' }))
        }
      })
      return true;
    })

    // at this stage we've done a validation search, and collected quantities,
    // make sure we actually have some data to submit, then pass the data on to the integrator
    if (!DATA_OBJ.data.length) return // nothing to do

    return DATA_OBJ;
  }

  // receives a list of item id's passed in by some trasactions
  // applies filters to make sure we actually care enough about them to bother integrating
  // then collects the qty data, and passes the object to firebase for update
  var __UpdateFirebaseItems = function(recordType, items) {
    var DATA_OBJ = __RetrieveItems(recordType, items);

    if (!DATA_OBJ.data.length) return

    // send to the integrator
    return JSON.parse(https.post({
      url:    [INTEGRATOR_URL, 'firebase', 'items'].join('/'),
      body:   JSON.stringify(DATA_OBJ),
      headers: {
        'Content-Type': 'application/json' //shouldn't have to do this, but do....
      }
    }).body)
  }

  /*
    When running the local app, collect all the data on all of the items, and pass back a massive object
  */
  var __CollectItemData = function(recordType) {
    var DATA = []
    var pageResults = search.create({ // use the search to collect all of the data
      type: recordType, filters: __CreateFilters(null), columns: [
        search.createColumn({ name: 'itemid' }),
        search.createColumn({ name: 'displayname' }),
        search.createColumn({ name: 'storedescription' }), // store description
        search.createColumn({ name: 'upccode' }),
        search.createColumn({ name: 'class' }),
        search.createColumn({ name: 'custitem_collect' }), // collections
        search.createColumn({ name: 'custitem_stones' }), // stones
        search.createColumn({ name: 'custitem_brands' }), // brand
        search.createColumn({ name: 'custitem_appeal' }), // appeal
        search.createColumn({ name: 'custitemcategory' }), // category
        search.createColumn({ name: 'storedisplayimage' }), // image
        search.createColumn({ name: 'pricelevel', join: 'pricing' }),
        search.createColumn({ name: 'unitprice', join: 'pricing' }),
      ]
    }).runPaged()
    pageResults.pageRanges.forEach(function(pageRange) {
      log.debug("working on pagerange", pageRange)
      pageResults.fetch({
        index: pageRange.index
      }).data.forEach(function(result) {
        var foundItem = _.find(DATA, function(d) {
          return d.id == [recordType, result.id].join('_')
        })
        if (!foundItem) var foundItem = {
          id: [recordType, result.id].join('_'),
          name: result.getValue({ name: 'itemid' }),
          description: result.getValue({ name: 'storedescription' }),
          displayname: result.getValue({ name: 'displayname' }) || result.getValue({ name: 'itemid' }),
          upccode: result.getValue({ name: 'upccode' }),
          url: result.getText({ name: 'storedisplayimage' }),
          class: result.getText({ name: 'class' }),
          collection: result.getText({ name: 'custitem_collect' }),
          stones: result.getText({ name: 'custitem_stones' }),
          brand: result.getText({ name: 'custitem_brands' }),
          appeal: result.getValue({ name: 'custitem_appeal' }),
          category: result.getText({ name: 'custitemcategory' }),
          pricelevels: []
        }
        if (result.getValue({ name: 'pricelevel', join: 'pricing' }) == "1")
          foundItem.defaultprice = parseFloat(result.getValue({ name: 'unitprice', join: 'pricing' }))
        foundItem.pricelevels.push({
          id:     result.getValue({ name: 'pricelevel', join: 'pricing' }),
          name:   result.getText({ name: 'pricelevel', join: 'pricing' }),
          price:  result.getValue({ name: 'unitprice', join: 'pricing' })
        })
        return DATA.push(foundItem)
      })
    })
    // respond with the actual object
    return DATA
  }

  // collects the item data, and tells algolia about a single type
  var __UpdateAlgoliaItem = function(recordType, event, itemId) {
    // build the data object for this item, then send to the integrator
    var DATA = {
      type:       event,
      objectID:   [recordType, itemId].join('_')
    }
    search.create({ // use the search to collect all of the data
      type: recordType, filters: __CreateFilters([itemId]), columns: [
        search.createColumn({ name: 'itemid' }),
        search.createColumn({ name: 'displayname' }),
        search.createColumn({ name: 'storedescription' }), // store description
        search.createColumn({ name: 'upccode' }),
        search.createColumn({ name: 'class' }),
        search.createColumn({ name: 'custitem_collect' }), // collections
        search.createColumn({ name: 'custitem_stones' }), // stones
        search.createColumn({ name: 'custitem_brands' }), // brand
        search.createColumn({ name: 'custitem_appeal' }), // appeal
        search.createColumn({ name: 'custitemcategory' }), // category
        search.createColumn({ name: 'storedisplayimage' }), // image
        search.createColumn({ name: 'pricelevel', join: 'pricing' }),
        search.createColumn({ name: 'unitprice', join: 'pricing' }),
      ]
    }).run().each(function(result) {
      if (!DATA.name) {
        DATA.id = [recordType, itemId].join('_')
        DATA.name = result.getValue({ name: 'itemid' })
        DATA.description = result.getValue({ name: 'storedescription' })
        DATA.displayname = result.getValue({ name: 'displayname' }) || result.getValue({ name: 'itemid' })
        DATA.upccode = result.getValue({ name: 'upccode' })
        DATA.url = result.getText({ name: 'storedisplayimage' })
        DATA.class = result.getText({ name: 'class' })
        DATA.collection = result.getText({ name: 'custitem_collect' })
        DATA.stones = result.getText({ name: 'custitem_stones' })
        DATA.brand = result.getText({ name: 'custitem_brands' })
        DATA.appeal = result.getValue({ name: 'custitem_appeal' })
        DATA.category = result.getText({ name: 'custitemcategory' })
      }
      if (!DATA.pricelevels) DATA.pricelevels = []
      if (result.getValue({ name: 'pricelevel', join: 'pricing' }) == "1")
        DATA.defaultprice = parseFloat(result.getValue({ name: 'unitprice', join: 'pricing' }))
      return DATA.pricelevels.push({
        id:     result.getValue({ name: 'pricelevel', join: 'pricing' }),
        name:   result.getText({ name: 'pricelevel', join: 'pricing' }),
        price:  result.getValue({ name: 'unitprice', join: 'pricing' })
      })
    })

    // because of the filters, if we received no data then just bow out gracefully
    if (!DATA.name) return

    // change the pricelevels object to a string becuase we never need it for search, and
    // algolia has a problem with nested objects in the data
    DATA.pricelevels = JSON.stringify(DATA.pricelevels)

    // send to the integrator
    var algoliaResponse = https.post({
      url:    [INTEGRATOR_URL, 'algolia', 'item'].join('/'),
      body:   DATA
    }).body
    // log.debug('request', DATA)
    // log.debug('response', algoliaResponse)
    return JSON.parse(algoliaResponse)
  }

  /*
   * Collects data on the nexPOS Customers marked by the nexPOS Customer checkbox
   */
  var __GetNexPosCustomers = function() {
    var customers = []
    search.create({
      type: search.Type.CUSTOMER, filters: [
        ['isinactive', 'is', 'F'], 'and',
        ['custentity_nexpos_customer', 'is', 'T']
      ], columns: [
        search.createColumn({ name: 'entityid' })
      ]
    }).run().each(function(result) {
      return customers.push({
        id:     result.id,
        name:   result.getValue({ name: 'entityid' })
      })
    })
    return customers
  }

  /*
   * Dependant upon Customer selected, collect data on the pricing levels for item discounting
   */
  var __GetPriceLevelByCustomer = function(customerid) {
    // load up the customer record, then create an object containing the pricing rules.
    try {
      var thisCustomer = record.load({
        type: record.Type.CUSTOMER, id: customerid
      })
    } catch(e) {
      return {
        success:    false,
        error:      'Could not find customer.'
      }
    }
    // build the data object to return
    var customerObj = {
      id:     customerid,
      name:   thisCustomer.getValue({ fieldId: 'entityid' }),
      pricing: []
    }

    var messages = [];
    // if there is customer pricing, then add it to the object
    if (thisCustomer.getLineCount({
      sublistId: 'itempricing'
    }) > 0) { // got to be at least one pricing element to apply
      // let's build the list of items that are specific to this store instance, no need to collect if they aren't

      var storeItems = [],
          searchPaged = search.create({ // do a paged search in case items is greater than 4000
        type: search.Type.INVENTORY_ITEM, filters: __CreateFilters()
      }).runPaged()
      searchPaged.pageRanges.forEach(function(pageRange) {
        searchPaged.fetch({ index: pageRange.index }).data.forEach(function(result) {
          return storeItems.push(result.id) // build the array of acceptable items
        })
      })
      // now we have a list of item id's that we like to enforce pricing on, let's grab them.
      for (var i=0; i<thisCustomer.getLineCount({
        sublistId: 'itempricing'
      }); i++) { // go though each of the pricing elements
        if (storeItems.indexOf(thisCustomer.getSublistValue({
          sublistId: 'itempricing', line: i, fieldId: 'item'
        })) > -1) { // then we have a matching item
          customerObj.pricing.push({
            itemid:     thisCustomer.getSublistValue({
              sublistId: 'itempricing', line: i, fieldId: 'item'
            }),
            pricelevel: thisCustomer.getSublistValue({
              sublistId: 'itempricing', line: i, fieldId: 'level'
            }),
            price:      thisCustomer.getSublistValue({
              sublistId: 'itempricing', line: i, fieldId: 'price'
            }) || undefined
          })
        }
      }
    }

    // respond back to the user
    return customerObj
  }

  /*
   * Actually Submits the transaction.
   * NOTE: This defaults the location to Warehouse-1, a temporary measure at best.
   */
  var __SubmitTransaction = function(transaction) {
    log.debug({title:'from nexSale', details: JSON.stringify(transaction)});
    transaction = JSON.parse(transaction) // converted to object, now create the salesorder
    var thisOrder = record.create({
      type: record.Type.SALES_ORDER,
      defaultValues: {
        entity:   transaction.entity
      }
    }) // go through each of the items and add as line items
    Object.keys(transaction.otherFields).forEach(function(iden){
      if(transaction.otherFields[iden]) {
        var valueIs = transaction.otherFields[iden];

        if(iden == 'trandate'){
          var valueIs = new Date(valueIs);
        }

        if(iden == 'custbodydelivery_dt'){
          var valueIs = new Date(valueIs);
        }
        if(iden == 'custbody_delivery_date') {
          var valueIs = new Date(valueIs);
        }

        thisOrder.setValue({
          fieldId: iden,
          value: valueIs
        });

      }
    });
    transaction.items.map(function(item, index) {
      thisOrder.setSublistValue({
        sublistId: 'item', line: index, fieldId: 'item', value: item.id.toString()//.match(/\d+/)[0].toString()
      }).setSublistValue({
        sublistId: 'item', line: index, fieldId: 'quantity', value: parseFloat(item.qty)
      }).setSublistValue({
        sublistId: 'item', line: index, fieldId: 'amount', value: parseFloat(item.grossAmount)
      }).setSublistValue({
        sublistId: 'item', line: index, fieldId: 'price', value: item.priceLevel
      }).setSublistValue({
        sublistId: 'item', line: index, fieldId: 'rate', value: item.rate
      })
      /*.setSublistValue({
        sublistId: 'item', line: index, fieldId: 'location', value: transaction.otherFields.location
      })*/
      .setSublistValue({
        sublistId: 'item', line: index, fieldId: 'custcol_nexsale_memo', value: item.memoVal
      })
      //.setSublistValue({ sublistId: 'item', line: index, fieldId: 'taxcode', value: item.taxCode})

    })
    // save the transaction
    var tid = thisOrder.save()

    return {
      id:             tid,
      type:           thisOrder.type,
      url:            url.resolveRecord({
        recordType:   thisOrder.type, recordId: tid
      }),
      transaction:    transaction,

    }
  }

  return {
    UpdateAlgoliaItem: __UpdateAlgoliaItem,
    UpdateFirebaseItems: __UpdateFirebaseItems,
    GetNexPosCustomers: __GetNexPosCustomers,
    GetPriceLevelByCustomer: __GetPriceLevelByCustomer,
    SubmitTransaction: __SubmitTransaction,
    CollectItemData: __CollectItemData
  }
})
