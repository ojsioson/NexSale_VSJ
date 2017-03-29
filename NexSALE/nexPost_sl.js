/**
 * Suitelet containing the header of the nexPOS platform
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define([
  'N/runtime',
  'N/file',
  'N/https',
  'N/render',
  'N/url',
  'N/record',
  './nexPos_integration_lib'
], function(runtime, file, https, render, url, record, lib) {

  var __BuildForm = function(context) {

    // build the data for teh page source object, specifically the linked files
    var PAGESOURCE = { // where the template page source content will come from
      files: {
        styles: {
          materialkit:  'SuiteScripts/nexPOS/web/material-kit.css',
          source:       'SuiteScripts/nexPOS/web/styles.css'
        },
        js: {
          materialmin:  'SuiteScripts/nexPOS/web/material.min.js',
          knockback:    'SuiteScripts/nexPOS/web/knockback-full-stack.min.js',
          materialkit:  'SuiteScripts/nexPOS/web/material-kit.js',
          run:          'SuiteScripts/nexPOS/web/run.js'
        }
      },
      connections:      JSON.stringify({
        algolia: {
          app:          'UAIAUQ4AD0',
          key:          '0ac3c7bda933bc9a60717d72c1392a32',
          index:        'nexPOS'
        },
        firebase: {
          url:          ['https://nexpos-ac325.firebaseio.com', runtime.accountId].join('/')
        }
      }),
      templates:        JSON.stringify({
        'NO_DESCRIPTION': 'No Description Available',
        'FACETS':         ['brand', 'category', 'collection', 'stones'],
        'HITS_PER_PAGE':  10, // number of results shown per page
        'PAGINATION_SIZE':10, //number of pages available within group
        'ITEM_URL':       url.resolveRecord({
          recordType:     record.Type.INVENTORY_ITEM
        })
      }),
      data:             JSON.stringify({
        customers:      lib.GetNexPosCustomers(),
        pricelevels:    []
      })
    }
    // convert the page source references to actual URL's
    ;[
      PAGESOURCE.files.styles, PAGESOURCE.files.js
    ].map(function(set) {
      Object.keys(set).map(function(f) {
        set[f] = file.load({ id: set[f] }).url
      })
    })

    //create a renderer object, and use that to populate sections of the site based upon the htmlfile
    var renderer = render.create()
    renderer.templateContent = file.load({
      id: 'SuiteScripts/nexPOS/web/store.html'
    }).getContents()
    renderer.addCustomDataSource({
      alias:    'data',
      format:   render.DataSource.OBJECT,
      data:     PAGESOURCE
    })

    // respond back to the user
    context.response.write({
      output: renderer.renderAsString()
    })

  }


  /*
    Director - handles the responses based upon mehod type
  */
  var onRequest = function(context) {
    if (context.request.method == https.Method.GET) {
      switch(context.request.parameters.action) {
        case 'getitems':
          context.response.write({
            output: JSON.stringify(lib.CollectItemData(record.Type.INVENTORY_ITEM))
          })
          break;
        case 'getcustomer':
          return context.response.write({
            output: JSON.stringify(lib.GetPriceLevelByCustomer(context.request.parameters.customerid))
          })
          break;
        default: return __BuildForm(context)
      }
    } else { // must be attempting to submit a transaction
      return context.response.write({
        output: JSON.stringify(lib.SubmitTransaction(context.request.parameters.transaction))
      })
    }
  }

  return {
    onRequest: onRequest
  }
})
